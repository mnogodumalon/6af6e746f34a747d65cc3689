import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { IconPlus, IconCopy, IconQrcode, IconCircleCheck, IconTrophy, IconMapPin } from '@tabler/icons-react';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { flowActionFor, countOf } from '@/config/plan';
import { extractRecordId } from '@/services/livingAppsService';
import { lookupKey } from '@/lib/formatters';
import { tx, tp, appLabel, dateFnsLocale } from '@/i18n';
import { useClock, gruss, undoToast } from '@/lib/polish';
import { submissionsOf } from '@/lib/journey';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { usePublicPageLink } from '@/components/widgets/PublicPageQr';
import { qrSvgString } from '@/components/widgets/QrCode';
import type { EnrichedUmfragen, EnrichedTerminvorschlaege, EnrichedAntworten } from '@/types/enriched';

function terminLabel(t: EnrichedTerminvorschlaege): string {
  const loc = { locale: dateFnsLocale() };
  try {
    const b = parseISO(t.fields.beginn ?? '');
    const e = t.fields.ende ? parseISO(t.fields.ende) : null;
    const day = format(b, 'EEE dd.MM.', loc);
    const from = format(b, 'HH:mm', loc);
    if (!e) return `${day} ${from}`;
    const sameDay = format(b, 'yyyy-MM-dd') === format(e, 'yyyy-MM-dd');
    return sameDay ? `${day} ${from}–${format(e, 'HH:mm', loc)}` : `${day} ${from} – ${format(e, 'dd.MM. HH:mm', loc)}`;
  } catch {
    return '—';
  }
}

interface PollCardProps {
  poll: EnrichedUmfragen;
  termine: EnrichedTerminvorschlaege[];
  antworten: EnrichedAntworten[];
  onOpenPoll: () => void;
  onOpenTermin: (t: EnrichedTerminvorschlaege) => void;
}

function PollCard({ poll, termine, antworten, onOpenPoll, onOpenTermin }: PollCardProps) {
  const { link } = usePublicPageLink('umfragen', poll.record_id);
  const closed = lookupKey(poll.fields.status) === 'geschlossen';
  const finalId = extractRecordId(poll.fields.finaler_termin);
  const rows = submissionsOf(antworten, { names: ['teilnehmer_vorname', 'teilnehmer_nachname'] });
  const stats = termine.map(t => {
    const mine = antworten.filter(a => extractRecordId(a.fields.terminvorschlag) === t.record_id);
    return {
      t,
      ja: mine.filter(a => lookupKey(a.fields.antwort) === 'ja').length,
      vielleicht: mine.filter(a => lookupKey(a.fields.antwort) === 'vielleicht').length,
    };
  });
  const maxJa = Math.max(0, ...stats.map(s => s.ja));
  const finish = flowActionFor('umfragen', 'finaler_termin', poll.record_id);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      undoToast(tx('Link kopiert'));
    } catch {
      undoToast(link);
    }
  };
  const openQr = () => {
    if (!link) return;
    const html = tx`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>QR</title><body style="margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;gap:16px;padding:16px;box-sizing:border-box"><div style="width:min(80vw,80vh)">${qrSvgString(link)}</div><p style="word-break:break-all;text-align:center">${link}</p></body>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank');
  };

  return (
    <div className="rounded-xl border bg-card overflow-hidden flex flex-col min-w-0">
      <div className="p-4 space-y-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={onOpenPoll} className="text-left font-semibold leading-snug min-w-0 truncate hover:underline">
            {poll.fields.titel}
          </button>
          <span className={`shrink-0 text-xs font-medium ${closed ? 'text-muted-foreground' : 'text-emerald-600'}`}>
            {closed ? tx('Geschlossen') : tx('Offen')}
          </span>
        </div>
        {poll.fields.ort && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
            <IconMapPin size={14} className="shrink-0" />{poll.fields.ort}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {countOf('antworten', rows.length, appLabel('antworten'))} · {countOf('terminvorschlaege', termine.length, appLabel('terminvorschlaege'))}
        </p>
      </div>

      <div className="px-4 pb-3 space-y-1.5 flex-1">
        {stats.length === 0 && <p className="text-sm text-muted-foreground">{tx('Noch keine Terminvorschläge.')}</p>}
        {stats.map(s => {
          const isFinal = finalId === s.t.record_id;
          const leads = !finalId && maxJa > 0 && s.ja === maxJa;
          return (
            <button
              key={s.t.record_id}
              type="button"
              onClick={() => onOpenTermin(s.t)}
              className={`w-full text-left rounded-lg border px-3 py-2 min-h-11 flex items-center justify-between gap-2 ${isFinal ? 'border-primary bg-primary/10' : leads ? 'border-emerald-500/60 bg-emerald-500/10' : 'hover:bg-muted/50'}`}
            >
              <span className="text-sm min-w-0 truncate flex items-center gap-1.5">
                {isFinal && <IconCircleCheck size={16} className="shrink-0 text-primary" />}
                {leads && <IconTrophy size={16} className="shrink-0 text-emerald-600" />}
                {terminLabel(s.t)}
              </span>
              <span className="text-xs shrink-0 tabular-nums">
                <b>{s.ja}</b> {tx('Ja')} · {s.vielleicht} {tx('Vielleicht')}
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-t p-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={copy} disabled={!link} className="min-h-10">
          <IconCopy size={16} className="shrink-0" />{tx('Link kopieren')}
        </Button>
        <Button variant="outline" size="sm" onClick={openQr} disabled={!link} className="min-h-10">
          <IconQrcode size={16} className="shrink-0" />{tx('QR-Code')}
        </Button>
        {!closed && finish && (
          <Button size="sm" onClick={finish} className="min-h-10 ml-auto">
            {tx('Termin festlegen & schließen')}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const { terminvorschlaege, antworten } = data;
  const clock = useClock();
  const [filter, setFilter] = useState<'all' | 'offen' | 'ohneFinal'>('all');

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type !== 'umfragen') return undefined;
      if (lookupKey(top.record.fields.status) === 'geschlossen') return undefined;
      const go = flowActionFor('umfragen', 'finaler_termin', top.record.record_id);
      return go ? { label: tx('Termin festlegen & schließen'), onClick: go } : undefined;
    },
  });
  const enrichedUmfragen = crud.enriched.umfragen;
  const enrichedTermine = crud.enriched.terminvorschlaege;
  const enrichedAntworten = crud.enriched.antworten;

  const isOpen = (u: EnrichedUmfragen) => lookupKey(u.fields.status) !== 'geschlossen';
  const openPolls = enrichedUmfragen.filter(isOpen);
  const noFinal = openPolls.filter(u => !extractRecordId(u.fields.finaler_termin));

  const visible = useMemo(() => {
    const list = filter === 'offen' ? openPolls : filter === 'ohneFinal' ? noFinal : enrichedUmfragen;
    return [...list].sort((a, b) => Number(!isOpen(a)) - Number(!isOpen(b)) || (b.createdat ?? '').localeCompare(a.createdat ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrichedUmfragen, filter]);

  const titles = openPolls.slice(0, 2).map(u => u.fields.titel).join(' & ');
  const context = openPolls.length === 0
    ? tx('Keine offene Umfrage — lege eine neue an und teile den Link.')
    : noFinal.length > 0
      ? tx`Es läuft: ${titles} — ein finaler Termin steht noch aus.`
      : tx`Es läuft: ${titles}.`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{gruss(clock)}</h1>
          <p className="text-muted-foreground">{context}</p>
        </div>
        {crud.umfragen.canWrite && (
          <Button onClick={() => crud.umfragen.openCreate({ status: 'offen' })} className="min-h-10">
            <IconPlus size={16} className="shrink-0" />{tx('Neue Umfrage')}
          </Button>
        )}
      </div>

      <DashboardGrid
        variant="wide"
        kpis={
          enrichedUmfragen.length > 0 ? (
            <StatStrip>
              <StatStripItem
                title={tx('Offene Umfragen')}
                value={openPolls.length}
                onClick={() => setFilter(f => (f === 'offen' ? 'all' : 'offen'))}
                active={filter === 'offen'}
              />
              <StatStripItem
                title={tx('Ohne finalen Termin')}
                value={noFinal.length}
                tone={noFinal.length > 0 ? 'warning' : 'default'}
                onClick={() => setFilter(f => (f === 'ohneFinal' ? 'all' : 'ohneFinal'))}
                active={filter === 'ohneFinal'}
              />
            </StatStrip>
          ) : undefined
        }
        primary={
          visible.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center space-y-3">
              <IconQrcode size={48} className="mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">
                {enrichedUmfragen.length === 0 ? tx('Starte deine erste Terminabstimmung.') : tx('Keine Umfrage in dieser Ansicht.')}
              </p>
              {crud.umfragen.canWrite && enrichedUmfragen.length === 0 && (
                <Button onClick={() => crud.umfragen.openCreate({ status: 'offen' })}>{tx('Erste Umfrage anlegen')}</Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {visible.map(u => {
                const raw = data.umfragen.find(r => r.record_id === u.record_id);
                return (
                  <PollCard
                    key={u.record_id}
                    poll={u}
                    termine={enrichedTermine
                      .filter(t => extractRecordId(t.fields.umfrage) === u.record_id)
                      .sort((a, b) => (a.fields.beginn ?? '').localeCompare(b.fields.beginn ?? ''))}
                    antworten={enrichedAntworten.filter(a => extractRecordId(a.fields.umfrage) === u.record_id)}
                    onOpenPoll={() => raw && crud.umfragen.openDetail(raw)}
                    onOpenTermin={t => {
                      const rt = terminvorschlaege.find(r => r.record_id === t.record_id);
                      if (rt) crud.terminvorschlaege.openDetail(rt);
                    }}
                  />
                );
              })}
            </div>
          )
        }
      />
      {crud.surfaces}
    </div>
  );
}
