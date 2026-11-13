import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { IconCheck, IconQuestionMark, IconX, IconTrophy } from '@tabler/icons-react';
import { PublicShell } from '@/components/PublicShell';
import { Button } from '@/components/ui/button';
import { Bound } from '@/components/blocks/Bound';
import { FieldErrorSummary } from '@/components/blocks/FieldErrorSummary';
import { LoadProblem } from '@/components/blocks/LoadProblem';
import {
  loadPublicPagesConfig, prepareChallenge,
  type PublicPagesConfig, type PublicPageConfig,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import {
  useStepForm, useJourneySubmit, useLiveList, submissionsOf, topOne,
  fieldText, fieldDate, fieldRef, fieldLookup,
  type JourneyRecord, type PlanStep,
} from '@/lib/journey';
import { tx, dateFnsLocale } from '@/i18n';

const SLUG = 'termin-abstimmen';
type Vote = 'ja' | 'vielleicht' | 'nein';

interface Termin {
  id: string;
  beginn: string | null;
  ende: string | null;
}

function dayLabel(iso: string | null): string {
  if (!iso) return '';
  try { return format(parseISO(iso), 'EEE dd.MM.', { locale: dateFnsLocale() }); } catch { return ''; }
}

function timeLabel(a: string | null, b: string | null): string {
  if (!a) return '';
  try {
    const from = format(parseISO(a), 'HH:mm');
    return b ? `${from}–${format(parseISO(b), 'HH:mm')}` : from;
  } catch { return ''; }
}

function VoteMark({ vote }: { vote: string | undefined }) {
  if (vote === 'ja') return <span className="inline-flex items-center justify-center text-emerald-600"><IconCheck size={20} stroke={2.5} /><span className="sr-only">{tx('Ja')}</span></span>;
  if (vote === 'vielleicht') return <span className="inline-flex items-center justify-center text-amber-600"><IconQuestionMark size={20} stroke={2.5} /><span className="sr-only">{tx('Vielleicht')}</span></span>;
  if (vote === 'nein') return <span className="inline-flex items-center justify-center text-muted-foreground"><IconX size={18} /><span className="sr-only">{tx('Nein')}</span></span>;
  return <span className="text-muted-foreground">–</span>;
}

export default function TerminAbstimmen() {
  const [params] = useSearchParams();
  const umfrageId = params.get('umfrage');
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPublicPagesConfig(SLUG).then(c => {
      setCfg(c);
      setPage(c?.pages[SLUG] ?? null);
      setLoading(false);
    });
  }, []);

  if (loading || !cfg || !page) {
    return <PublicShell loading={loading} unavailable={!loading} />;
  }
  if (!umfrageId) {
    return (
      <PublicShell title={page.title}>
        <p className="text-sm text-muted-foreground">
          {tx('Dieser Link ist unvollständig. Öffne bitte den Link oder QR-Code, den du zu deiner Umfrage bekommen hast.')}
        </p>
      </PublicShell>
    );
  }
  return <Poll cfg={cfg} page={page} umfrageId={umfrageId} />;
}

function Poll({ cfg, page, umfrageId }: { cfg: PublicPagesConfig; page: PublicPageConfig; umfrageId: string }) {
  const port = useMemo(() => createPublicPort(cfg, page), [cfg, page]);
  const umfragen = useLiveList(port, 'umfragen', { intervalMs: 30000 });
  const terminRecs = useLiveList(port, 'terminvorschlaege', { intervalMs: 30000 });
  const antwortRecs = useLiveList(port, 'antworten', { intervalMs: 30000 });

  const [votes, setVotes] = useState<Record<string, Vote>>({});
  const [voteError, setVoteError] = useState<string | null>(null);
  const [mine, setMine] = useState<JourneyRecord[]>([]);
  const votesRef = useRef(votes);
  votesRef.current = votes;
  const warmed = useRef(false);

  const umfrage = umfragen.records.find(r => r.id === umfrageId) ?? null;
  const closed = fieldLookup(umfrage ?? { id: '', fields: {}, createdAt: null }, 'status')?.key === 'geschlossen';

  const termine: Termin[] = useMemo(
    () => terminRecs.records
      .filter(r => fieldRef(r, 'umfrage') === umfrageId)
      .map(r => ({ id: r.id, beginn: fieldDate(r, 'beginn'), ende: fieldDate(r, 'ende') }))
      .sort((a, b) => (a.beginn ?? '').localeCompare(b.beginn ?? '')),
    [terminRecs.records, umfrageId],
  );

  const antworten: JourneyRecord[] = useMemo(() => {
    const liveIds = new Set(antwortRecs.records.map(r => r.id));
    return [...antwortRecs.records, ...mine.filter(r => !liveIds.has(r.id))]
      .filter(r => fieldRef(r, 'umfrage') === umfrageId);
  }, [antwortRecs.records, mine, umfrageId]);

  const rows = useMemo(
    () => submissionsOf(antworten, { names: ['teilnehmer_vorname', 'teilnehmer_nachname'] }),
    [antworten],
  );

  const stats = useMemo(() => termine.map(t => {
    const recs = antworten.filter(r => fieldRef(r, 'terminvorschlag') === t.id);
    const count = (k: string) => recs.filter(r => fieldLookup(r, 'antwort')?.key === k).length;
    return { id: t.id, yes: count('ja'), maybe: count('vielleicht'), beginn: t.beginn };
  }), [termine, antworten]);

  const top = topOne(stats, [s => s.yes, s => s.maybe], s => s.beginn);

  const form = useStepForm('antworten', {
    fields: ['teilnehmer_vorname', 'teilnehmer_nachname'],
    autoComplete: true,
  });

  const plan: PlanStep[] = termine.map((t, i) => ({
    key: `t-${t.id}`,
    entity: 'antworten',
    form,
    primary: i === 0,
    values: () => ({
      umfrage: umfrageId,
      terminvorschlag: t.id,
      antwort: votesRef.current[t.id],
    }),
  }));

  const submit = useJourneySubmit(port, plan, {
    draftKey: `termin-abstimmen-${umfrageId}`,
    check: async () => {
      const u = await port.get('umfragen', umfrageId);
      if (u && fieldLookup(u, 'status')?.key === 'geschlossen') {
        return tx('Die Umfrage wurde inzwischen geschlossen — abstimmen ist nicht mehr möglich.');
      }
      return null;
    },
    onSuccess: result => {
      const first = String(form.get('teilnehmer_vorname') ?? '');
      const last = String(form.get('teilnehmer_nachname') ?? '');
      const snapshot = votesRef.current;
      const added: JourneyRecord[] = termine.flatMap(t => {
        const rec = result.records[`t-${t.id}`];
        if (!rec) return [];
        return [{
          id: rec.id,
          createdAt: rec.createdAt,
          fields: {
            umfrage: umfrageId,
            terminvorschlag: t.id,
            teilnehmer_vorname: first,
            teilnehmer_nachname: last,
            antwort: { key: snapshot[t.id], label: snapshot[t.id] },
          },
        }];
      });
      setMine(m => [...m, ...added]);
      void antwortRecs.reload();
    },
  });

  if (!umfragen.loaded && umfragen.error) return <PublicShell title={page.title}><LoadProblem onRetry={umfragen.reload} /></PublicShell>;
  if (!umfragen.loaded || !terminRecs.loaded || !antwortRecs.loaded) {
    if (terminRecs.error || antwortRecs.error) {
      return <PublicShell title={page.title}><LoadProblem onRetry={async () => { await umfragen.reload(); await terminRecs.reload(); await antwortRecs.reload(); }} /></PublicShell>;
    }
    return <PublicShell loading />;
  }
  if (!umfrage) {
    return (
      <PublicShell title={page.title}>
        <p className="text-sm text-muted-foreground">
          {tx('Dieser Link passt zu keiner Umfrage. Scanne bitte den QR-Code noch einmal.')}
        </p>
      </PublicShell>
    );
  }

  const finalId = fieldRef(umfrage, 'finaler_termin');
  const finalTermin = termine.find(t => t.id === finalId) ?? null;
  const ort = fieldText(umfrage, 'ort');
  const beschreibung = fieldText(umfrage, 'beschreibung');

  const warm = () => {
    if (warmed.current) return;
    warmed.current = true;
    const ep = page.endpoints?.find(e => e.op === 'create');
    if (ep) prepareChallenge(cfg, page, 'POST', `/apps/${ep.app_id}/records`);
  };

  const send = async () => {
    const namesOk = form.validate();
    const missing = termine.some(t => !votes[t.id]);
    setVoteError(missing ? tx('Bitte wähle für jeden Termin eine Antwort.') : null);
    if (!namesOk || missing) return;
    await submit.run();
  };

  const again = () => {
    submit.reset();
    form.reset();
    setVotes({});
    setVoteError(null);
  };

  const cell = 'px-2 py-2 text-center align-middle border-t';
  const stickyCell = 'sticky left-0 z-10 bg-card max-w-[40vw] px-2 py-2 text-left align-middle border-t break-words';

  return (
    <PublicShell title={fieldText(umfrage, 'titel') || page.title} description={beschreibung || undefined} wide>
      <div className="space-y-5" onFocusCapture={warm}>
        {ort && <p className="text-sm text-muted-foreground">{tx('Ort')}: {ort}</p>}

        {closed && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
            <p className="font-semibold">{tx('Die Umfrage ist geschlossen.')}</p>
            <p className="mt-1">
              {finalTermin
                ? tx`Finaler Termin: ${dayLabel(finalTermin.beginn)} ${timeLabel(finalTermin.beginn, finalTermin.ende)}`
                : tx('Es wurde noch kein finaler Termin festgelegt.')}
            </p>
          </div>
        )}

        {!closed && !submit.result && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Bound form={form} name="teilnehmer_vorname" />
            <Bound form={form} name="teilnehmer_nachname" />
          </div>
        )}

        {termine.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tx('Für diese Umfrage gibt es noch keine Termine.')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-card max-w-[40vw] px-2 py-2 text-left font-medium">{tx('Name')}</th>
                  {termine.map(t => {
                    const isTop = top?.id === t.id;
                    const isFinal = closed && finalId === t.id;
                    return (
                      <th key={t.id} className={`min-w-24 px-2 py-2 text-center font-medium ${isTop || isFinal ? 'bg-emerald-50' : ''}`}>
                        <div>{dayLabel(t.beginn)}</div>
                        <div className="text-xs font-normal text-muted-foreground">{timeLabel(t.beginn, t.ende)}</div>
                        {(isTop || isFinal) && (
                          <div className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <IconTrophy size={14} className="shrink-0" />
                            {isFinal ? tx('Final') : tx('Beliebtester')}
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map(s => (
                  <tr key={s.key}>
                    <td className={stickyCell}>{s.label}</td>
                    {termine.map(t => (
                      <td key={t.id} className={`${cell} ${top?.id === t.id ? 'bg-emerald-50/60' : ''}`}>
                        <VoteMark vote={fieldLookup(s.records.find(r => fieldRef(r, 'terminvorschlag') === t.id) ?? { id: '', fields: {}, createdAt: null }, 'antwort')?.key} />
                      </td>
                    ))}
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={termine.length + 1} className="border-t px-2 py-3 text-center text-muted-foreground">
                      {tx('Noch niemand hat abgestimmt.')}
                    </td>
                  </tr>
                )}
                <tr>
                  <td className={`${stickyCell} font-medium`}>{tx('Ja / Vielleicht')}</td>
                  {stats.map(s => (
                    <td key={s.id} className={`${cell} text-xs ${top?.id === s.id ? 'bg-emerald-50 font-semibold' : ''}`}>
                      <span className="text-emerald-700">{tx`${s.yes} Ja`}</span>
                      <br />
                      <span className="text-amber-700">{tx`${s.maybe} Vielleicht`}</span>
                    </td>
                  ))}
                </tr>
                {!closed && !submit.result && (
                  <tr className="bg-muted/30">
                    <td className={`${stickyCell} bg-muted font-medium`}>{tx('Deine Antwort')}</td>
                    {termine.map(t => (
                      <td key={t.id} className={cell}>
                        <div role="radiogroup" aria-label={dayLabel(t.beginn)} className="flex flex-col gap-1">
                          {([['ja', tx('Ja')], ['vielleicht', tx('Vielleicht')], ['nein', tx('Nein')]] as const).map(([key, label]) => {
                            const on = votes[t.id] === key;
                            const tone = on
                              ? key === 'ja' ? 'border-emerald-600 bg-emerald-600 text-white'
                                : key === 'vielleicht' ? 'border-amber-500 bg-amber-500 text-white'
                                  : 'border-foreground/70 bg-foreground/80 text-background'
                              : 'bg-background hover:bg-muted';
                            return (
                              <button
                                key={key}
                                type="button"
                                role="radio"
                                className={`min-h-11 min-w-11 rounded-md border px-2 text-xs font-medium ${tone}`}
                                aria-checked={on}
                                onClick={() => { setVotes(v => ({ ...v, [t.id]: key })); setVoteError(null); }}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!closed && termine.length > 0 && !submit.result && (
          <div className="space-y-3">
            <FieldErrorSummary forms={[form]} />
            {voteError && <p role="alert" className="text-sm text-destructive">{voteError}</p>}
            {submit.offline && <p className="text-sm text-amber-700">{tx('Keine Verbindung — deine Eingaben sind gesichert.')}</p>}
            {submit.error && !submit.offline && <p role="alert" className="text-sm text-destructive">{submit.error.message}</p>}
            <Button type="button" className="min-h-11 w-full" disabled={submit.submitting} onClick={send}>
              {submit.submitting ? tx('Wird gespeichert …') : tx('Antworten speichern')}
            </Button>
          </div>
        )}

        {!closed && submit.result && (
          <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
            <p className="font-semibold">{tx('Danke, deine Antworten sind gespeichert.')}</p>
            <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={again}>
              {tx('Weitere Person eintragen')}
            </Button>
          </div>
        )}
      </div>
    </PublicShell>
  );
}
