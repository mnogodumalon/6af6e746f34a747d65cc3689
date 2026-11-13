import { useState, useMemo, useEffect, useRef, useId, type ReactNode } from 'react';
import { IconSearch, IconChevronRight, IconCheck, IconPlus, IconLoader2 } from '@tabler/icons-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getStatusColor } from '@/components/blocks/StatusBadge';
import { resolveSelectMode, type SelectMode, COMPACT_MAX, SEARCH_MIN_CHARS, SEARCH_DEBOUNCE_MS } from '@/lib/journey/selectMode';
import { InlineCreate, canInlineCreate, inlineCreateFields } from '@/components/blocks/InlineCreate';
import { entityLabel, type EntityKey } from '@/lib/journey/rules';
import type { JourneyPort, JourneyRecord } from '@/lib/journey/port';
import type { FormValues } from '@/lib/journey/useStepForm';
import { t, tp } from '@/i18n';
import { formatDate, formatDateTime } from '@/lib/formatters';

// A card never shows a raw ISO date (J-10, Abnahme 6: event cards read
// „2026-11-07T18:30:00“) — a mapper that passed the field's stored value gets
// the formatted day/time, wherever it stands in title, subtitle or a stat.
const ISO_IN_TEXT = /\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g;
function readableDates<T>(v: T): T {
  if (typeof v !== 'string' || !ISO_IN_TEXT.test(v)) return v;
  ISO_IN_TEXT.lastIndex = 0;
  return v.replace(ISO_IN_TEXT, iso => (iso.length > 10 ? formatDateTime(iso) : formatDate(iso))) as T;
}
import { useWizard } from '@/components/blocks/IntentWizardShell';

/**
 * EntitySelectStep — "pick a record" as people expect it from a customer
 * picker (Stripe), a guest list (Airbnb host tools) or a triage list (Linear):
 * search on top, compact cards in a grid, each card recognisable at a glance —
 * an initials avatar (or your icon), the title, ONE secondary line, a status
 * pill and up to three facts. The current pick is highlighted, so returning
 * to the step ("Ändern") shows what was chosen.
 *
 * The step picks its FORM from the count, not from the caller's guess: up to
 * five records are roomy cards WITHOUT a search box (three rooms need no
 * search, but they deserve their facts), up to fifty the cards with search,
 * beyond that the search comes first — a card grid of 3.000 guests is a wall,
 * not a choice. Pills exist only as an explicit `mode="pills"`.
 *
 * Cards are only as good as their facts: pass `subtitle` and `stats` from the
 * fields users recognise a record by (the `^` fields of the entity summary),
 * not from bookkeeping columns.
 *
 * Two pick shapes, told apart by the props:
 *   single  — `onSelect(id)` + `selectedId`: the usual "which guest" step.
 *             Inside IntentWizardShell the pick moves the wizard on by itself
 *             when the step has no StepNav — the step IS the pick. Put a
 *             StepNav next to it only when the step holds more than the pick.
 *   multi   — `onToggle(id)` + `selectedIds`: a multipleapplookup ("which
 *             employees"). Spread `{...f.records('mitarbeiter', x.labelOf)}`
 *             from useStepForm: the pick then lives in the form, `required`
 *             means at least one, `validate(['mitarbeiter'])` shows the error
 *             under the step like any other field, the summary knows the names.
 *             A live page kept the ids in useState and highlighted only
 *             `selected[0]` — the second pick was invisible and "Weiter" stayed
 *             silent. That shape has no API here any more.
 *
 * No dead end: a step fed by useRecordSearch on the internal door offers
 * "Neu anlegen" by itself — the layer renders the entity's required fields
 * as a mini-form (InlineCreate), creates through the page's port, adopts
 * the record into the list and picks it. Nothing to write for it; `create`
 * narrows the fields or switches it off. An empty list says WHY it is empty
 * (no hits for the query · nothing meets the step's restriction · the entity
 * has no records yet) and always shows the way on.
 */
export interface SelectItem {
  id: string;
  title: string;
  subtitle?: string;
  status?: { key: string; label: string };
  stats?: { label: string; value: string | number }[];
  icon?: ReactNode;
}

interface SinglePickProps {
  onSelect: (id: string) => void;
  /** Highlights the current pick (e.g. `form.get('gast') as string`). */
  selectedId?: string | null;
  selectedIds?: never;
  onToggle?: never;
}

interface MultiPickProps {
  /** Toggles one id in/out of the pick — from `f.records(key)`. */
  onToggle: (id: string) => void;
  selectedIds: string[];
  selectedId?: never;
  onSelect?: never;
}

export type PickProps = SinglePickProps | MultiPickProps;

export interface EntitySelectStepBaseProps {
  items: SelectItem[];
  /** Element id of the step (from `f.records(key).id`) — what `validate()` focuses. */
  id?: string;
  /** Marks the step invalid (required pick missing) — from `f.records(key)`. */
  invalid?: boolean;
  'aria-describedby'?: string;
  /** The tile before the title when an item has no `icon`: two-letter initials
   *  (people) or nothing (rooms, tools, dates — "Zimmer 101" → "Z1" is noise). */
  avatar?: 'initials' | 'none';
  searchPlaceholder?: string;
  emptyIcon?: ReactNode;
  /** Overrides the layer's explanation of an empty list (e.g. what the step's restriction means: "Kein Zimmer ist im Zeitraum frei"). */
  emptyText?: string;
  /** Label for the "create new" button (default "Neu erstellen"). */
  createLabel?: string;
  /** The mechanical "Neu anlegen": ON whenever `entity`/`port`/`adopt` come
   *  from `{...x.select}` on the internal door and the entity's required
   *  fields are plain inputs. `false` switches it off (a step where creating
   *  makes no sense — picking a day, a fixed catalogue); an object narrows
   *  the fields or renames the button/panel. */
  create?: boolean | InlineCreateOptions;
  /** Hand-written alternative: reveal your own panel on click. Overrides the
   *  mechanical create. Never the generic {Entity}Dialog. */
  onCreateNew?: () => void;
  /** Your own mini-form panel, rendered above the list. */
  createDialog?: ReactNode;
  /** From `{...x.select}` (useRecordSearch) — what the mechanical create and
   *  the empty-state explanation need. Not meant to be passed by hand. */
  entity?: EntityKey;
  port?: JourneyPort;
  filtered?: boolean;
  adopt?: (record: JourneyRecord) => void;
  /** Card columns on wide screens. Default: 2 from four items on, else 1. */
  columns?: 1 | 2;
  /** Form of the step. 'auto' (default) follows the count: ≤5 roomy cards without search, ≤50 cards, more: search-first. 'pills' only on request. */
  mode?: SelectMode;
  /** Records the step could offer in total (server count). Drives 'auto' and the "n of m" line. Default: items.length. */
  totalCount?: number | null;
  /** Server-side search. When set, typing ≥2 chars replaces the list with its results (debounced, aborted on change).
   *  Comes from useRecordSearch — spread `{...search.select}`; never hand-roll it. */
  onSearch?: (query: string, signal: AbortSignal) => Promise<SelectItem[]>;
  /** Initial load pending (from useRecordSearch). */
  loading?: boolean;
  /** Load/search error to show (from useRecordSearch). */
  error?: string | null;
  /** The rule that narrows this pick, as a sentence ("Nur wo Status ist Aktiv"),
   *  with the link to the page that changes it — from the flow hook's `.select`. */
  hint?: { text: string; href?: string } | null;
}

export type EntitySelectStepProps = EntitySelectStepBaseProps & PickProps;

export interface InlineCreateOptions {
  /** Fields of the mini-form. Default: the entity's required fields (or its first text field). */
  fields?: string[];
  initial?: FormValues;
  /** Panel heading. Default "Neuer Eintrag: {entity}". */
  title?: string;
}

// Eight calm pastel pairs (background / ink) — a deterministic hue per record
// so the same guest always gets the same colour and neighbours differ.
const AVATAR_TONES: Array<[string, string]> = [
  ['#fbe9df', '#9a3a0f'],
  ['#e7f0fb', '#1f4d8f'],
  ['#e9f5ee', '#1a6b42'],
  ['#fdf3df', '#8a5a00'],
  ['#f1e9fb', '#5b2e9a'],
  ['#e6f5f7', '#13636f'],
  ['#fbe8ef', '#8f2447'],
  ['#eef1f5', '#3d4653'],
];

/** How many rows the search-first list shows at once. Beyond this the footer
 *  asks for a narrower query instead of growing the list — the point of the
 *  form is that you type, not that you scroll. */
const VISIBLE_MAX = 20;

function toneFor(id: string): [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

function initialsOf(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '·';
  const first = words[0].replace(/^[^\p{L}\p{N}]+/u, '');
  const last = words.length > 1 ? words[words.length - 1].replace(/^[^\p{L}\p{N}]+/u, '') : '';
  const a = first.charAt(0);
  const b = last.charAt(0) || first.charAt(1);
  return (a + b).toUpperCase() || '·';
}

/**
 * The server-search half of the step (same shape as AddressAutocomplete's
 * lookup): debounce, one in-flight request, abort the previous one on every
 * keystroke and on unmount. `results === null` means "no server answer in
 * play" — the caller then shows its own client-filtered list, so a step
 * without `onSearch` behaves exactly as it always did.
 */
function useServerSearch(onSearch: EntitySelectStepProps['onSearch'], query: string) {
  const [results, setResults] = useState<SelectItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!onSearch) return;
    const q = query.trim();
    if (q.length < SEARCH_MIN_CHARS) {
      abortRef.current?.abort();
      setResults(null);
      setSearching(false);
      setSearchError(null);
      return;
    }
    const handle = setTimeout(() => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setSearching(true);
      setSearchError(null);
      onSearch(q, ac.signal)
        .then(rows => { if (!ac.signal.aborted) setResults(rows); })
        .catch(err => {
          if (ac.signal.aborted || (err instanceof Error && err.name === 'AbortError')) return;
          setSearchError(t('sel_search_failed'));
        })
        .finally(() => { if (!ac.signal.aborted) setSearching(false); });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [onSearch, query]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { results, searching, searchError };
}

export function EntitySelectStep({
  items: rawItems,
  onSelect,
  selectedId,
  onToggle,
  selectedIds,
  id,
  invalid = false,
  'aria-describedby': describedBy,
  // Destructuring defaults are evaluated on every render, so these follow a
  // language switch without any extra wiring.
  searchPlaceholder = t('search'),
  emptyIcon,
  emptyText,
  createLabel,
  create = true,
  onCreateNew,
  createDialog,
  entity,
  port,
  // `filtered` is the hook's word for "a standing restriction is in play";
  // locally that name belongs to the client-filtered list.
  filtered: restricted = false,
  adopt,
  columns,
  mode = 'auto',
  totalCount,
  onSearch,
  loading = false,
  error = null,
  hint = null,
  avatar = 'initials',
}: EntitySelectStepProps) {
  const items = useMemo(() => rawItems.map(it => ({
    ...it,
    title: readableDates(it.title),
    subtitle: readableDates(it.subtitle),
    stats: it.stats?.map(st => ({ ...st, value: readableDates(st.value) })),
  })), [rawItems]);
  const [search, setSearch] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  // The keyboard cursor of the combobox list is only painted once the user
  // has actually moved it (arrow keys). Painted from the start, row 1 looked
  // "selected" while the real pick only carried a check mark — two rows with
  // opposite meaning, same colour. Enter still takes rows[activeIdx] (row 1
  // after typing), the cursor is just invisible until it is steered.
  const [cursorVisible, setCursorVisible] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const listId = useId();
  const wizard = useWizard();

  // One pick shape or the other — the union above makes mixing them a type error.
  const multi = Array.isArray(selectedIds);
  const isSelected = (itemId: string): boolean =>
    multi ? (selectedIds as string[]).includes(itemId) : selectedId != null && itemId === selectedId;
  // A single pick IS the step's answer: inside a wizard whose current step has
  // no StepNav it moves on by itself — the `setStep(2)` every page used to
  // write into onSelect, now owned here so a page that spreads `flow.pick()`
  // cannot lose it (five live flows dead-ended on step 1, inclou 24.09.2026).
  // With a StepNav on the step (pick plus other fields) the button decides.
  const pick = (itemId: string): void => {
    if (multi) {
      onToggle?.(itemId);
      return;
    }
    onSelect?.(itemId);
    if (wizard && !wizard.hasNav()) wizard.next();
  };
  // The root carries the form id so validate() can focus and scroll to the
  // step, and aria-invalid so the state is announced, not only coloured.
  const rootProps = {
    id,
    tabIndex: id ? -1 : undefined,
    'aria-invalid': invalid || undefined,
    'aria-describedby': describedBy,
    className: `space-y-3 rounded-2xl outline-none ${invalid ? 'ring-2 ring-destructive/40 ring-offset-2 ring-offset-background' : ''}`,
  };
  const selectedLine = multi && (selectedIds as string[]).length > 0 ? (
    <p className="text-xs text-muted-foreground" aria-live="polite">
      {tp('sel_selected', (selectedIds as string[]).length, { n: (selectedIds as string[]).length })}
    </p>
  ) : null;

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(item =>
      item.title.toLowerCase().includes(q) ||
      (item.subtitle ?? '').toLowerCase().includes(q) ||
      (item.stats ?? []).some(s => String(s.value).toLowerCase().includes(q))
    );
  }, [items, search]);

  // `totalCount` is what the SERVER holds; `items` may be one page of it.
  const total = totalCount ?? items.length;
  const resolved = resolveSelectMode(total, mode);

  const { results, searching, searchError } = useServerSearch(onSearch, search);
  // A server answer wins over the client filter; without one nothing changes.
  const shown = results ?? filtered;
  const message = searchError ?? error;

  useEffect(() => { setActiveIdx(0); }, [search]);

  const cols = columns ?? (items.length >= 4 ? 2 : 1);

  // ── "Neu anlegen": the page's own panel wins; else the layer's mini-form
  //    whenever the hook handed over an internal door and the entity's
  //    required fields are plain inputs (a public grant cannot create a
  //    second entity, and a required applookup has no inline form).
  const createOpts: InlineCreateOptions | null = create === false ? null : create === true ? {} : create;
  const createFields = createOpts && entity ? (createOpts.fields ?? inlineCreateFields(entity)) : [];
  const mechanicalCreate = Boolean(
    !onCreateNew && createOpts && entity && port && adopt && port.door === 'internal' && canInlineCreate(entity, createFields),
  );
  const openCreate: (() => void) | undefined = onCreateNew ?? (mechanicalCreate ? () => setShowCreate(true) : undefined);
  const createButton = openCreate ? (
    <Button type="button" variant="outline" onClick={openCreate} aria-expanded={onCreateNew ? undefined : showCreate} className="shrink-0 gap-1.5">
      <IconPlus size={15} aria-hidden="true" />
      {createLabel ?? t('step_create_new')}
    </Button>
  ) : null;
  const createPanel = createDialog ?? (mechanicalCreate && showCreate && entity && port && createOpts ? (
    <InlineCreate
      entity={entity}
      port={port}
      fields={createFields}
      initial={createOpts.initial}
      title={createOpts.title}
      onCancel={() => setShowCreate(false)}
      onCreated={record => {
        adopt?.(record);
        setShowCreate(false);
        setSearch('');
        pick(record.id);
      }}
    />
  ) : null);

  // ── The empty list explains itself and shows the way on. Three reasons,
  //    told apart mechanically: the query matched nothing (clear it), the
  //    step's restriction left nothing (say so — `emptyText` names the rule),
  //    the entity is empty (create the first one).
  const typedQuery = search.trim();
  const emptyReason = typedQuery.length >= SEARCH_MIN_CHARS || (typedQuery.length > 0 && !onSearch)
    ? t('sel_no_hits', { q: typedQuery })
    : emptyText ?? (restricted
      ? t('sel_empty_filtered')
      : entity
        ? t('sel_empty_entity', { entity: entityLabel(entity) })
        : t('no_results'));
  const emptyBlock = (
    <div className="text-center py-12 text-muted-foreground" role="status">
      {emptyIcon && <div className="mb-3 flex justify-center opacity-40">{emptyIcon}</div>}
      <p className="text-sm">{emptyReason}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {typedQuery.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setSearch('')}>
            {t('sel_clear_search')}
          </Button>
        )}
        {openCreate && !showCreate && (
          <Button type="button" variant="outline" size="sm" onClick={openCreate} className="gap-1.5">
            <IconPlus size={14} aria-hidden="true" />
            {createLabel ?? t('step_create_new')}
          </Button>
        )}
      </div>
    </div>
  );

  const loadingBlock = (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground" aria-live="polite">
      <IconLoader2 size={16} className="animate-spin" aria-hidden="true" />
      {t('sel_loading')}
    </div>
  );

  const errorLine = message ? (
    <p role="alert" className="text-xs text-destructive">{message}</p>
  ) : null;
  // why some records are not on offer — and where the owner changes that
  const hintLine = hint?.text ? (
    <p className="text-xs text-muted-foreground" data-journey-hint="">
      {hint.text}
      {hint.href && <> · <a href={hint.href} className="text-primary hover:underline">{t('am_change')}</a></>}
    </p>
  ) : null;

  function footer(shownCount: number) {
    if (shownCount >= total) return null;
    return (
      <p className="text-xs text-muted-foreground text-center pt-1" aria-live="polite">
        {t('sel_showing_of', { shown: shownCount, total })}
      </p>
    );
  }

  // ── pills: few enough that a search box would be noise ────────────
  if (resolved === 'pills') {
    return (
      <div {...rootProps}>
        {createButton && <div className="flex justify-end">{createButton}</div>}
        {hintLine}
        {createPanel}
        {errorLine}
        {loading ? loadingBlock : items.length === 0 ? emptyBlock : (
          <div role={multi ? 'group' : 'radiogroup'} aria-label={searchPlaceholder} className="flex flex-wrap gap-2">
            {items.map(item => {
              const selected = isSelected(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  role={multi ? 'checkbox' : 'radio'}
                  aria-checked={selected}
                  onClick={() => pick(item.id)}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                    selected
                      ? 'border-primary bg-accent text-foreground'
                      : 'border-input bg-muted/40 hover:bg-card text-foreground'
                  }`}
                >
                  {selected ? <IconCheck size={16} className="text-primary" aria-hidden="true" /> : null}
                  <span className="font-medium">{item.title}</span>
                  {item.subtitle ? <span className="text-muted-foreground">· {item.subtitle}</span> : null}
                </button>
              );
            })}
          </div>
        )}
        {selectedLine}
      </div>
    );
  }

  // ── search-first: the list is a result, not a catalogue ───────────
  if (resolved === 'combobox') {
    const typed = search.trim();
    const tooShort = typed.length > 0 && typed.length < SEARCH_MIN_CHARS;
    const rows = (typed.length === 0 ? items : shown).slice(0, VISIBLE_MAX);
    const candidates = typed.length === 0 ? items.length : shown.length;

    function handleKey(e: React.KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursorVisible(true);
        setActiveIdx(i => Math.min(i + 1, rows.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursorVisible(true);
        setActiveIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = rows[activeIdx];
        if (item) pick(item.id);
      } else if (e.key === 'Escape') {
        setSearch('');
      }
    }

    return (
      <div {...rootProps}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              role="combobox"
              aria-expanded={true}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={cursorVisible && rows[activeIdx] ? `${listId}-opt-${activeIdx}` : undefined}
              autoFocus
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              value={search}
              onChange={e => { setSearch(e.target.value); setActiveIdx(0); setCursorVisible(false); }}
              onKeyDown={handleKey}
              className="pl-9"
            />
            {searching && (
              <IconLoader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />
            )}
          </div>
          {createButton}
        </div>

        {hintLine}
        {createPanel}
        {errorLine}

        {loading ? loadingBlock : tooShort ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {t('sel_min_chars', { n: SEARCH_MIN_CHARS })}
          </p>
        ) : rows.length === 0 ? emptyBlock : (
          <>
            <ul id={listId} role="listbox" aria-multiselectable={multi || undefined} className="max-h-[22rem] overflow-y-auto rounded-2xl border border-border divide-y divide-border list-none m-0 p-0">
              {rows.map((item, idx) => {
                const selected = isSelected(item.id);
                const cursor = cursorVisible && idx === activeIdx;
                const [bg, ink] = toneFor(item.id);
                // Colour says "selected" (accent + check, as in the chip and
                // card modes); the keyboard cursor is a focus ring, never a fill.
                return (
                  <li key={item.id} className="min-w-0">
                    <button
                      type="button"
                      id={`${listId}-opt-${idx}`}
                      role="option"
                      aria-selected={selected}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { setActiveIdx(idx); setCursorVisible(false); pick(item.id); }}
                      className={`w-full text-left flex items-center gap-3 px-3.5 py-2.5 transition-colors focus-visible:outline-none ${
                        selected ? 'bg-accent' : 'bg-card hover:bg-muted/60'
                      } ${cursor ? 'ring-2 ring-inset ring-primary/40' : ''}`}
                    >
                      {item.icon ? (
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary">
                          {item.icon}
                        </div>
                      ) : avatar === 'none' ? null : (
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-semibold tracking-wide"
                          style={{ backgroundColor: bg, color: ink }}
                          aria-hidden="true"
                        >
                          {initialsOf(item.title)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm truncate block">{item.title}</span>
                        {item.subtitle && (
                          <span className="text-xs text-muted-foreground truncate block">{item.subtitle}</span>
                        )}
                      </div>
                      {item.status && (
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${getStatusColor(item.status.key)}`}>
                          {item.status.label}
                        </span>
                      )}
                      {selected && <IconCheck size={16} className="text-primary shrink-0" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
            {selectedLine}
            {typed.length === 0 && (
              <p className="text-xs text-muted-foreground text-center">{t('sel_type_to_search')}</p>
            )}
            {/* Without a query the list is a sample of everything; with one it is
                a sample of the hits. Both cases say so rather than pretending
                the twenty rows are all there is. */}
            {typed.length === 0
              ? footer(rows.length)
              : rows.length < candidates && (
                  <p className="text-xs text-muted-foreground text-center pt-1" aria-live="polite">
                    {t('sel_showing_of', { shown: rows.length, total: candidates })}
                  </p>
                )}
          </>
        )}
      </div>
    );
  }

  // ── cards: ≤ COMPACT_MAX roomy and without a search box, else with search ──
  const compact = !onSearch && items.length <= COMPACT_MAX;
  return (
    <div {...rootProps}>
      {/* Search + Create New row — a handful of records needs no search box */}
      {compact ? (createButton ? <div className="flex justify-end">{createButton}</div> : null) : (
      <div className="flex gap-2">
        <div className="relative flex-1">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
          {search && !searching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums" aria-live="polite">
              {shown.length}/{items.length}
            </span>
          )}
          {searching && (
            <IconLoader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        {createButton}
      </div>
      )}

      {/* the create panel — the layer's InlineCreate, or the page's own
          createDialog (never the generic {Entity}Dialog; check-intents fails
          the build on that import) */}
      {hintLine}
      {createPanel}
      {errorLine}

      {loading ? loadingBlock : shown.length === 0 ? emptyBlock : (
        <>
          <ul className={`grid gap-2 list-none m-0 p-0 ${cols === 2 ? 'sm:grid-cols-2' : ''}`}>
            {shown.map(item => {
              const selected = isSelected(item.id);
              const [bg, ink] = toneFor(item.id);
              return (
                <li key={item.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => pick(item.id)}
                    aria-pressed={selected}
                    className={`w-full h-full text-left flex items-start gap-3 ${compact ? 'p-5' : 'p-3.5'} rounded-2xl border transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:bg-accent hover:border-primary/40'
                    }`}
                  >
                    {item.icon ? (
                      <div className={`${compact ? 'w-12 h-12' : 'w-10 h-10'} rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary`}>
                        {item.icon}
                      </div>
                    ) : avatar === 'none' ? null : (
                      <div
                        className={`${compact ? 'w-12 h-12 text-base' : 'w-10 h-10 text-sm'} rounded-xl flex items-center justify-center shrink-0 font-semibold tracking-wide`}
                        style={{ backgroundColor: bg, color: ink }}
                        aria-hidden="true"
                      >
                        {initialsOf(item.title)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${compact ? 'text-base' : 'text-sm'} truncate group-hover:text-primary transition-colors`}>
                          {item.title}
                        </span>
                        {item.status && (
                          // Colours come from StatusBadge's single table (getStatusColor)
                          // so a status looks the same here as on its badge. Its classes
                          // include a border-* colour, which stays inert without a
                          // `border` width utility — this pill deliberately has none.
                          <span className={`ml-auto text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${getStatusColor(item.status.key)}`}>
                            {item.status.label}
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.subtitle}</p>
                      )}
                      {item.stats && item.stats.length > 0 && (
                        <div className="flex gap-x-3 gap-y-0.5 mt-1.5 text-xs text-muted-foreground flex-wrap">
                          {item.stats.slice(0, 3).map((s, i) => (
                            <span key={i} className="whitespace-nowrap">
                              {s.label}: <span className="font-medium text-foreground tabular-nums">{s.value}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {selected ? (
                      <IconCheck size={16} className="text-primary shrink-0 mt-2.5" aria-hidden="true" />
                    ) : (
                      <IconChevronRight size={16} className="text-muted-foreground shrink-0 mt-2.5 group-hover:text-primary transition-colors" aria-hidden="true" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {selectedLine}
          {footer(shown.length)}
        </>
      )}
    </div>
  );
}
