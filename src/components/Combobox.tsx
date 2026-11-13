import { useEffect, useMemo, useRef, useState } from 'react';
import { IconCheck, IconChevronDown, IconPlus, IconSearch, IconX } from '@tabler/icons-react';
import { t } from '@/i18n';

interface ComboboxItem {
  id: string;
  label: string;
  hint?: string;
  initials?: string;
  avatarColor?: string;
}

interface ComboboxProps {
  items: ComboboxItem[];
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
  /**
   * Inline-Create: when set, the dropdown shows an extra option at the bottom
   * ("+ Neuer X anlegen"). On zero-match search, the option becomes prominent
   * and adopts the search text. The callback receives the current search
   * query — useful to pre-fill the sub-dialog's primary name field.
   */
  onCreateNew?: (searchText: string) => void;
  /** Label for the inline-create option, e.g. "Neuer Kunde". */
  createLabel?: string;
}

const AVATAR_PALETTE = [
  '#1e3a8a', '#7c3aed', '#db2777', '#ea580c', '#16a34a',
  '#0891b2', '#4338ca', '#be123c', '#047857', '#9333ea',
];

function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

function initialsFor(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Combobox({
  items, value, onChange,
  placeholder,
  // Destructuring defaults run on every render — they follow a language switch.
  searchPlaceholder = t('combo_search'),
  emptyText = t('combo_no_match'),
  disabled = false,
  id,
  invalid = false,
  onCreateNew,
  createLabel,
}: ComboboxProps) {
  // Empty string falls back to the dash so the trigger never looks blank
  // before the AI sub-agent has filled the placeholder marker at build time.
  const triggerPlaceholder = placeholder || '—';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = items.find(i => i.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      i.label.toLowerCase().includes(q) ||
      (i.hint ?? '').toLowerCase().includes(q)
    );
  }, [items, query]);

  useEffect(() => { setActiveIdx(0); }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[activeIdx];
      if (item) { onChange(item.id); setOpen(false); setQuery(''); }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`flex h-10 max-sm:h-12 w-full items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm
          ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
          disabled:cursor-not-allowed disabled:opacity-50
          ${invalid ? 'border-destructive' : 'border-input'}`}
      >
        {selected ? (
          <>
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
              style={{ background: selected.avatarColor ?? colorFor(selected.id) }}
            >
              {selected.initials ?? initialsFor(selected.label)}
            </span>
            <span className="flex-1 min-w-0 truncate text-left">{selected.label}</span>
            {selected.hint && <span className="hidden sm:inline shrink-0 text-xs text-muted-foreground">{selected.hint}</span>}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onChange(null); }}
              className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t('combo_clear_selection')}
            >
              <IconX size={14} />
            </button>
          </>
        ) : (
          <span className="flex-1 truncate text-left text-muted-foreground">{triggerPlaceholder}</span>
        )}
        <IconChevronDown size={14} className="shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div
          ref={popRef}
          className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-hidden rounded-lg border bg-popover shadow-lg"
        >
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <IconSearch size={14} className="text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted"
                aria-label={t('combo_clear_search')}
              >
                <IconX size={12} />
              </button>
            )}
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              onCreateNew ? (
                <button
                  type="button"
                  onClick={() => { onCreateNew(query); setOpen(false); setQuery(''); }}
                  className="flex w-full items-center gap-2 rounded-md bg-primary/5 px-3 py-3 text-left text-sm hover:bg-primary/10"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <IconPlus size={14} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate font-medium text-primary">
                      {query.trim()
                        ? t('combo_create_named', { name: query.trim() })
                        : <>+ {createLabel ?? t('combo_create_new')}</>}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {query.trim() ? t('combo_create_prefill_hint') : (createLabel ?? t('combo_create_inline_hint'))}
                    </span>
                  </span>
                </button>
              ) : (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">{emptyText}</div>
              )
            ) : (
              <>
                {filtered.map((item, idx) => {
                  const active = idx === activeIdx;
                  const isSel = item.id === value;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => { onChange(item.id); setOpen(false); setQuery(''); }}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm
                        ${active ? 'bg-accent' : ''}`}
                    >
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                        style={{ background: item.avatarColor ?? colorFor(item.id) }}
                      >
                        {item.initials ?? initialsFor(item.label)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate font-medium">{item.label}</span>
                        {item.hint && <span className="block truncate text-[11px] text-muted-foreground">{item.hint}</span>}
                      </span>
                      {isSel && <IconCheck size={14} className="shrink-0 text-primary" />}
                    </button>
                  );
                })}
                {onCreateNew && (
                  <button
                    type="button"
                    onClick={() => { onCreateNew(query); setOpen(false); setQuery(''); }}
                    className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-border/60 px-2 py-2 text-left text-sm text-primary hover:bg-primary/5"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <IconPlus size={12} />
                    </span>
                    <span className="font-medium">+ {createLabel ? t('combo_create_labeled', { label: createLabel }) : t('combo_create_new')}</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MultiCombobox — Mehrfachauswahl mit Pills oberhalb des Trigger-Feldes.
//
// Renderiert für multipleapplookup/select-Felder (eine Bestellung enthält
// MEHRERE Speisen, ein Auftrag MEHRERE Materialien). Form-State ist hier ein
// Array von record_ids; Submit-Handler wandelt das in ein Array von URLs.
// Bereits ausgewählte Items werden im Dropdown mit Checkmark markiert, ein
// Klick darauf entfernt sie. Pills oberhalb des Triggers sind direkt
// entfernbar via X-Button.
// ============================================================================

interface MultiComboboxProps {
  items: ComboboxItem[];
  values: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
  onCreateNew?: (searchText: string) => void;
  createLabel?: string;
}

export function MultiCombobox({
  items, values, onChange,
  placeholder,
  searchPlaceholder = t('combo_search'),
  emptyText = t('combo_no_match'),
  disabled = false,
  id,
  invalid = false,
  onCreateNew,
  createLabel,
}: MultiComboboxProps) {
  const triggerPlaceholder = placeholder || '—';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedSet = useMemo(() => new Set(values), [values.join('|')]);
  const selected = useMemo(
    () => values.map(id => items.find(i => i.id === id)).filter(Boolean) as ComboboxItem[],
    [items, values.join('|')],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      i.label.toLowerCase().includes(q) ||
      (i.hint ?? '').toLowerCase().includes(q)
    );
  }, [items, query]);

  useEffect(() => { setActiveIdx(0); }, [query, open]);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  function toggle(itemId: string) {
    if (selectedSet.has(itemId)) {
      onChange(values.filter(v => v !== itemId));
    } else {
      onChange([...values, itemId]);
    }
    // Keep dropdown open for further additions — common Apple/iOS pattern
    // for tag-pickers. User closes explicitly with Escape or outside-click.
    setQuery('');
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[activeIdx];
      if (item) toggle(item.id);
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Backspace' && !query && values.length > 0) {
      // Backspace on empty search removes the last pill — common UX in
      // email-to fields and other tag pickers.
      onChange(values.slice(0, -1));
    }
  }

  return (
    <div className="relative">
      <div
        className={`min-h-10 w-full rounded-md border bg-background px-2 py-1.5 text-sm
          focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background
          ${invalid ? 'border-destructive' : 'border-input'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {selected.map(item => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 rounded-full bg-secondary border border-input pl-1 pr-0.5 py-0.5 text-xs"
            >
              <span
                className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                style={{ background: item.avatarColor ?? colorFor(item.id) }}
              >
                {item.initials ?? initialsFor(item.label)}
              </span>
              <span className="max-w-[140px] truncate">{item.label}</span>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onChange(values.filter(v => v !== item.id)); }}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t('combo_remove_item', { label: item.label })}
              >
                <IconX size={12} />
              </button>
            </span>
          ))}
          <button
            ref={triggerRef}
            id={id}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && setOpen(o => !o)}
            className="inline-flex flex-1 min-w-[120px] items-center gap-1 px-1 py-0.5 text-left text-muted-foreground"
          >
            <span className="flex-1 truncate text-left">
              {selected.length === 0 ? triggerPlaceholder : (open ? '' : t('combo_add_more'))}
            </span>
            <IconChevronDown size={14} className="shrink-0" />
          </button>
        </div>
      </div>

      {open && (
        <div
          ref={popRef}
          className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-hidden rounded-lg border bg-popover shadow-lg"
        >
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <IconSearch size={14} className="text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted"
                aria-label={t('combo_clear_search')}
              >
                <IconX size={12} />
              </button>
            )}
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              onCreateNew ? (
                <button
                  type="button"
                  onClick={() => { onCreateNew(query); setOpen(false); setQuery(''); }}
                  className="flex w-full items-center gap-2 rounded-md bg-primary/5 px-3 py-3 text-left text-sm hover:bg-primary/10"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <IconPlus size={14} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate font-medium text-primary">
                      {query.trim()
                        ? t('combo_create_named', { name: query.trim() })
                        : <>+ {createLabel ?? t('combo_create_new')}</>}
                    </span>
                  </span>
                </button>
              ) : (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">{emptyText}</div>
              )
            ) : (
              <>
                {filtered.map((item, idx) => {
                  const active = idx === activeIdx;
                  const isSel = selectedSet.has(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => toggle(item.id)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm
                        ${active ? 'bg-accent' : ''}`}
                    >
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                        style={{ background: item.avatarColor ?? colorFor(item.id) }}
                      >
                        {item.initials ?? initialsFor(item.label)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate font-medium">{item.label}</span>
                        {item.hint && <span className="block truncate text-[11px] text-muted-foreground">{item.hint}</span>}
                      </span>
                      {isSel && <IconCheck size={14} className="shrink-0 text-primary" />}
                    </button>
                  );
                })}
                {onCreateNew && (
                  <button
                    type="button"
                    onClick={() => { onCreateNew(query); setOpen(false); setQuery(''); }}
                    className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-border/60 px-2 py-2 text-left text-sm text-primary hover:bg-primary/5"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <IconPlus size={12} />
                    </span>
                    <span className="font-medium">+ {createLabel ? t('combo_create_labeled', { label: createLabel }) : t('combo_create_new')}</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
