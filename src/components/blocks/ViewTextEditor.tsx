/**
 * blocks/ViewTextEditor.tsx — a big text a person edits IN FRONT OF the room (generated, presentational).
 *
 *   <ViewTextEditor field="<field>" recordId={rec.record_id}
 *     value={String(rec.fields.<field> ?? '')}
 *     save={text => <the entity's update method>(rec.record_id, { <field>: text })} />
 *
 * A view's `edits` (plan.dashboard.views[].edits): Bau 10 of Meet-the-Member showed the
 * merged text read-only and sent the moderator to a small dialog, while the owner wrote
 * „Dieses Textfeld öffne ich bildschirmfüllend, gehe es durch und ändere den Text
 * beliebig; er bleibt gespeichert … kopiere ich mit einem Klick“. Mechanics fixed here:
 * typing saves by itself after a short pause; the state is always on screen —
 * „Gespeichert“, „Speichert …“ or „Nicht gespeichert — erneut versuchen“ (a button that
 * sends the SAME text again); „Text kopieren“ copies what is in the field. A poll of the
 * view never overwrites what the person is typing: the platform's value is taken only
 * while nothing is pending, and only when it really changed.
 */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';

export interface ViewTextEditorProps {
  /** The plan field this editor writes (the gate matches it against the view's `edits`). */
  field: string;
  /** The record the text belongs to — a new record resets the editor. */
  recordId: string;
  /** The value the platform has now (from the view's live read). */
  value: string | null | undefined;
  /** Writes the text to the record; a rejected promise is shown as „Nicht gespeichert“. */
  save: (text: string) => Promise<unknown>;
  /** Pause after the last keystroke before saving, in ms (default 800). */
  delayMs?: number;
  /** The view COMPOSES the text itself (N2, Denys 06.11.2026: „Zusammenfassen“ opens this view
   *  in a new tab, the view merges): returns the composed text, or null while its sources are not
   *  loaded. Called once when the field is empty; „Neu zusammenführen“ calls it again after a
   *  second click (it overwrites). */
  compose?: () => string | null;
  /** A sentence while a source failed to load — no compose, no save (EF-19), the sentence shows. */
  blocked?: string | null;
  /** The text field's minimum height (default 50vh; with several editors on one view the
   *  placeholder passes a smaller one — EF-28: two at 50vh overlapped the first one's buttons). */
  minHeight?: string;
  /** Text size; the default is read from across a room. */
  style?: React.CSSProperties;
  className?: string;
}

type Phase = 'saved' | 'saving' | 'failed' | 'dirty';

export function ViewTextEditor({ field, recordId, value, save, delayMs = 800, compose, blocked, minHeight = '50vh', style, className }: ViewTextEditorProps) {
  const [text, setText] = useState(value ?? '');
  const [phase, setPhase] = useState<Phase>('saved');
  // a className can add spacing, never make the block grow or shrink again (EF-28: flex-1 + min-h-0
  // let two editors overlap) — the height is the textarea's minHeight
  const safeClass = (className ?? '').split(/\s+/).filter(c => c && !/^(?:flex-1|flex-auto|grow|flex-grow|shrink|min-h-|max-h-|h-|basis-)/.test(c)).join(' ');
  const [copied, setCopied] = useState(false);
  const [copyManual, setCopyManual] = useState(false);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef(value ?? '');
  const record = useRef(recordId);

  // another record → its text, nothing pending
  useEffect(() => {
    if (record.current === recordId) return;
    record.current = recordId;
    if (timer.current) clearTimeout(timer.current);
    pending.current = false;
    last.current = value ?? '';
    setText(value ?? '');
    setPhase('saved');
  }, [recordId, value]);

  // the platform's value — only while the person has nothing unsaved
  useEffect(() => {
    const v = value ?? '';
    if (pending.current || v === last.current) return;
    last.current = v;
    setText(v);
  }, [value]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // compose once when the stored text is empty and the sources are there
  const composed = useRef<string | null>(null);
  const [confirmRecompose, setConfirmRecompose] = useState(false);
  useEffect(() => {
    if (!compose || blocked || composed.current === recordId || (value ?? '').trim()) return;
    const next = compose();
    if (next === null || !next.trim()) return;
    composed.current = recordId;
    setText(next);
    pending.current = true;
    void send(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per record, when its sources are ready
  }, [compose, blocked, recordId, value]);
  const recompose = () => {
    if (!compose || blocked) return;
    if (!confirmRecompose) { setConfirmRecompose(true); return; }
    setConfirmRecompose(false);
    const next = compose();
    if (next === null) return;
    setText(next);
    pending.current = true;
    void send(next);
  };

  const send = async (next: string) => {
    setPhase('saving');
    try {
      await save(next);
      last.current = next;
      pending.current = false;
      setPhase('saved');
    } catch (err) {
      console.error(`[ViewTextEditor] ${field}:`, err);
      setPhase('failed');
    }
  };

  const onChange = (next: string) => {
    if (blocked) return;
    setText(next);
    pending.current = true;
    setPhase('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void send(next); }, delayMs);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyManual(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // no clipboard access (http, an old browser, a denied permission) — never silent (EF-28):
      // the text is selected and the person is told to copy it
      area.current?.focus();
      area.current?.select();
      setCopyManual(true);
    }
  };

  return (
    <div className={`flex shrink-0 flex-col gap-3 ${safeClass}`} data-view-edit={field}>
      <textarea
        ref={area}
        value={text}
        onChange={e => onChange(e.target.value)}
        className="w-full resize-y rounded-2xl border border-input bg-card p-6 leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ minHeight, ...(style ?? { fontSize: 'clamp(1.25rem, 2.6vh, 2.75rem)' }) }}
        aria-label={field}
      />
      {blocked && (
        <p role="alert" data-view-blocked className="text-destructive" style={{ fontSize: 'clamp(1rem, 1.8vh, 1.75rem)' }}>{blocked}</p>
      )}
      <div className="flex flex-wrap items-center gap-3" style={{ fontSize: 'clamp(1rem, 1.8vh, 1.75rem)' }}>
        {compose && (
          <Button type="button" variant={confirmRecompose ? 'destructive' : 'outline'} disabled={!!blocked}
            onClick={recompose} onBlur={() => setConfirmRecompose(false)} data-view-recompose>
            {confirmRecompose ? t('vte_recompose_confirm') : t('vte_recompose')}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={() => { void copy(); }} data-view-copy>
          {copied ? t('vte_copied') : t('vte_copy')}
        </Button>
        {copyManual && <span role="status" data-view-copy-manual>{t('vte_copy_manual')}</span>}
        <span role="status" aria-live="polite" data-view-save={phase}
          className={phase === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>
          {phase === 'failed' ? (
            <button type="button" className="underline" onClick={() => { void send(text); }}>{t('vte_failed')}</button>
          ) : phase === 'saved' ? t('vte_saved') : t('vte_saving')}
        </span>
      </div>
    </div>
  );
}

export default ViewTextEditor;
