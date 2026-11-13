import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  IconArrowLeft, IconExternalLink, IconLoader2, IconAlertTriangle, IconCheck,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PolicyCatalog, PagePolicy, PolicyRow, ListFilter, FilterCondition, FilterField, FilterOp } from '@/lib/publicPagesAdmin';
import { t } from '@/i18n';

// The owner's field table — one editor for a public page (PublicPageFields)
// and for a flow (IntentFields). Every field is one row with a SENTENCE that
// says what applies, one switch for the decision most owners make (visible
// or not) and the rest behind "Mehr". A bar at the bottom stays: unsaved
// count, open the page, discard, save. The caller says where the catalog
// comes from and where it goes; the rows are the same in both worlds.

type Rule = { hidden?: boolean; required?: boolean; fixed?: unknown; label?: string };

const TEXT_KEYS = ['title', 'description', 'thank_you_title', 'thank_you_message'] as const;
const TEXT_LABELS: Record<(typeof TEXT_KEYS)[number], string> = {
  title: 'ppa_text_title',
  description: 'ppa_text_description',
  thank_you_title: 'ppa_text_thanks_title',
  thank_you_message: 'ppa_text_thanks_message',
};

function clone(p: PagePolicy): PagePolicy {
  return JSON.parse(JSON.stringify({ fields: p.fields || {}, lists: p.lists || {}, texts: p.texts || {} }));
}

function isFixed(rule: Rule): boolean {
  return rule.fixed !== undefined && rule.fixed !== null && rule.fixed !== '';
}

function fixedLabel(row: PolicyRow, rule: Rule): string {
  const v = rule.fixed;
  if (row.options) return row.options.find(o => o.key === String(v))?.label ?? String(v);
  if (typeof v === 'boolean') return v ? t('ppa_yes') : t('ppa_no');
  return String(v ?? '');
}

/** The one sentence under a field name — what applies right now. */
function sentence(row: PolicyRow, rule: Rule, who: string): string {
  if (row.pick) return row.exposes ? `${t('ppa_s_pick', { who })} · ${t('ppa_s_exposes', { who, target: row.exposes })}` : t('ppa_s_pick', { who });
  if (isFixed(rule)) return t('ppa_s_fixed', { value: fixedLabel(row, rule), who });
  if (!row.declared) return t('ppa_s_never');
  if (rule.hidden) return t('ppa_s_hidden', { who });
  const parts = [t('ppa_s_visitor_enters', { who }), (rule.required ?? row.required_platform) ? t('ppa_s_required') : t('ppa_s_optional')];
  if (rule.label) parts.push(t('ppa_s_labelled', { label: rule.label }));
  return parts.join(' · ');
}

export interface FieldPolicyEditorProps {
  /** Fetch the catalog (rows + stored policy). */
  load: () => Promise<PolicyCatalog>;
  /** Persist the policy; returns the fresh catalog. */
  save: (policy: PagePolicy) => Promise<PolicyCatalog>;
  onLoaded?: (catalog: PolicyCatalog) => void;
  /** Rendered after "Felder anpassen · ". */
  heading: ReactNode;
  intro: string;
  /** One sentence on who the rules apply to (flows: the team, not visitors). */
  note?: string;
  badge?: ReactNode;
  backTo: string;
  backLabel: string;
  /** "Seite ansehen" / "Ablauf öffnen": an in-app route (`to`) or an external URL (`href`). */
  view?: { to?: string; href?: string; label: string };
  /** Shown instead of the sections when the catalog has nothing to adjust. */
  emptyText?: string;
  /** Rendered between the header and the sections (the flow's plan card). */
  above?: ReactNode;
  showTexts?: boolean;
  savedText: string;
  /** Who fills the fields — "Besucher" for a page, "dein Team" for a flow. */
  who: string;
}

export function FieldPolicyEditor(props: FieldPolicyEditorProps) {
  const { load, save, onLoaded, heading, intro, note, badge, backTo, backLabel, view, emptyText, above, showTexts = false, savedText, who } = props;
  const [cat, setCat] = useState<PolicyCatalog | null>(null);
  const [draft, setDraft] = useState<PagePolicy>({ fields: {}, lists: {}, texts: {} });
  const [saved, setSaved] = useState<PagePolicy>({ fields: {}, lists: {}, texts: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [openEntities, setOpenEntities] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load().then(catalog => {
      if (cancelled) return;
      setCat(catalog);
      setDraft(clone(catalog.policy));
      setSaved(clone(catalog.policy));
      // Entities with rules start open; untouched ones show their summary line.
      setOpenEntities(new Set(Object.keys(catalog.policy.fields || {})));
      setError(null);
      onLoaded?.(catalog);
    }).catch(e => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const ruleOf = (entity: string, key: string): Rule => draft.fields[entity]?.[key] ?? {};
  const setRule = (entity: string, key: string, patch: Record<string, unknown>) => {
    setDraft(prev => {
      const rules = { ...(prev.fields[entity] ?? {}) };
      const next: Record<string, unknown> = { ...(rules[key] ?? {}), ...patch };
      for (const k of Object.keys(next)) {
        if (next[k] === undefined || next[k] === null || next[k] === '' || next[k] === false) delete next[k];
      }
      if (Object.keys(next).length === 0) delete rules[key]; else rules[key] = next;
      return { ...prev, fields: { ...prev.fields, [entity]: rules } };
    });
  };
  const listHidden = (entity: string) => draft.lists[entity]?.hidden ?? [];
  const setListVisible = (entity: string, key: string, visible: boolean) => {
    setDraft(prev => {
      const hidden = new Set(prev.lists[entity]?.hidden ?? []);
      if (visible) hidden.delete(key); else hidden.add(key);
      return { ...prev, lists: { ...prev.lists, [entity]: { ...(prev.lists[entity] ?? {}), hidden: Array.from(hidden) } } };
    });
  };
  const setText = (key: string, value: string) => setDraft(prev => ({ ...prev, texts: { ...prev.texts, [key]: value } }));
  // The table shows ONE filter per list: the owner's, else the agent's own
  // narrowing when the grammar can express it. Editing writes an owner
  // filter (which replaces the agent's); removing every condition drops the
  // agent's. Back to exactly the agent's rule = no owner rule at all.
  const agentFilter = (entity: string): ListFilter | null => cat?.lists.find(l => l.entity === entity)?.agent_filter ?? null;
  const shownFilter = (entity: string): ListFilter | null => {
    const l = draft.lists[entity];
    if (l?.filter) return l.filter;
    if (l?.agent_scope === 'drop') return null;
    return agentFilter(entity);
  };
  const filterKey = (f: ListFilter | null) => f ? JSON.stringify({ mode: f.conditions.length > 1 ? f.mode : 'all', conditions: f.conditions }) : null;
  const writeFilter = (entity: string, filter: ListFilter | null) => {
    setDraft(prev => {
      const base = { hidden: prev.lists[entity]?.hidden ?? [], max_records: prev.lists[entity]?.max_records ?? null };
      const agent = agentFilter(entity);
      if (!filter || filter.conditions.length === 0) return { ...prev, lists: { ...prev.lists, [entity]: { ...base, filter: null, agent_scope: agent ? 'drop' : null } } };
      const sameAsAgent = filterKey(agent) === filterKey(filter);
      return { ...prev, lists: { ...prev.lists, [entity]: { ...base, filter: sameAsAgent ? null : { mode: filter.mode, conditions: filter.conditions }, agent_scope: null } } };
    });
  };
  const defaultOp = (ff?: FilterField): FilterOp => (ff?.ops[0] ?? 'eq');
  const setCondition = (entity: string, idx: number, patch: Partial<FilterCondition>) => {
    const f = shownFilter(entity) ?? { mode: 'all' as const, conditions: [] };
    // A list without a filter shows one placeholder row („kein Filter“) that is
    // NOT in `conditions` — picking a field there must CREATE the condition.
    // Live 23.10.2026 (Pension Gästehaus): the map over the empty array wrote
    // nothing, so a list the agent left unfiltered could never get a filter.
    const conditions = idx < f.conditions.length
      ? f.conditions.map((c, i) => (i === idx ? { ...c, ...patch } : c))
      : [...f.conditions, { field: '', op: 'eq' as FilterOp, ...patch }];
    writeFilter(entity, { mode: f.mode, conditions });
  };
  const addCondition = (entity: string, fields: FilterField[]) => {
    const f = shownFilter(entity) ?? { mode: 'all' as const, conditions: [] };
    const ff = fields[0];
    if (!ff) return;
    writeFilter(entity, { mode: f.mode, conditions: [...f.conditions, { field: ff.key, op: defaultOp(ff) }] });
  };
  const removeCondition = (entity: string, idx: number) => {
    const f = shownFilter(entity);
    if (!f) return;
    writeFilter(entity, { mode: f.mode, conditions: f.conditions.filter((_, i) => i !== idx) });
  };
  const setMode = (entity: string, mode: 'all' | 'any') => {
    const f = shownFilter(entity);
    if (f) writeFilter(entity, { ...f, mode });
  };
  const setListMax = (entity: string, raw: string) => {
    const n = raw.trim() === '' ? null : Math.max(1, Math.floor(Number(raw)));
    setDraft(prev => ({ ...prev, lists: { ...prev.lists, [entity]: { ...(prev.lists[entity] ?? { hidden: [] }), max_records: n === null || Number.isNaN(n) ? null : n } } }));
  };

  const changes = useMemo(() => {
    let n = 0;
    const a = draft, b = saved;
    const entities = new Set([...Object.keys(a.fields), ...Object.keys(b.fields)]);
    for (const e of entities) {
      const keys = new Set([...Object.keys(a.fields[e] ?? {}), ...Object.keys(b.fields[e] ?? {})]);
      for (const k of keys) if (JSON.stringify(a.fields[e]?.[k] ?? null) !== JSON.stringify(b.fields[e]?.[k] ?? null)) n++;
    }
    const lists = new Set([...Object.keys(a.lists), ...Object.keys(b.lists)]);
    const listKey = (l?: PagePolicy['lists'][string]) => JSON.stringify({
      hidden: [...(l?.hidden ?? [])].sort(),
      filter: l?.filter ? filterKey(l.filter) : null,
      max: l?.max_records ?? null,
      agent: l?.agent_scope === 'drop' ? 'drop' : 'keep',
    });
    for (const e of lists) if (listKey(a.lists[e]) !== listKey(b.lists[e])) n++;
    for (const k of TEXT_KEYS) if ((a.texts[k] ?? '') !== (b.texts[k] ?? '')) n++;
    return n;
  }, [draft, saved]);

  const doSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = await save(draft);
      setCat(next);
      setDraft(clone(next.policy));
      setSaved(clone(next.policy));
      onLoaded?.(next);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  const discard = () => setDraft(clone(saved));

  const toggleOpen = (id: string) => setOpen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleEntity = (id: string) => setOpenEntities(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const fixedControl = (entity: string, row: PolicyRow) => {
    const rule = ruleOf(entity, row.key);
    const fixed = rule.fixed;
    const cls = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';
    if (row.options) {
      return (
        <select className={cls} value={fixed === undefined || fixed === null ? '' : String(fixed)} aria-label={t('ppa_col_fixed')}
          onChange={e => setRule(entity, row.key, { fixed: e.target.value || undefined })}>
          <option value="">{t('ppa_fixed_none')}</option>
          {row.options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      );
    }
    if (row.fulltype.startsWith('bool')) {
      return (
        <select className={cls} value={fixed === true ? 'true' : fixed === false ? 'false' : ''} aria-label={t('ppa_col_fixed')}
          onChange={e => setRule(entity, row.key, { fixed: e.target.value === '' ? undefined : e.target.value === 'true' })}>
          <option value="">{t('ppa_fixed_none')}</option>
          <option value="true">{t('ppa_yes')}</option>
          <option value="false">{t('ppa_no')}</option>
        </select>
      );
    }
    if (row.pick || row.fulltype.startsWith('file')) return null;
    return (
      <Input value={fixed === undefined || fixed === null ? '' : String(fixed)} placeholder={t('ppa_fixed_none')} aria-label={t('ppa_col_fixed')}
        onChange={e => setRule(entity, row.key, { fixed: e.target.value || undefined })} />
    );
  };

  const summaryOf = (entity: string, rows: PolicyRow[]): string => {
    let visible = 0, required = 0, hidden = 0, fixed = 0;
    for (const row of rows) {
      const rule = ruleOf(entity, row.key);
      // A fixed value counts whether or not the page asks for the field —
      // the owner set it, the server writes it.
      if (isFixed(rule)) fixed++;
      else if (!row.declared) continue;
      else if (rule.hidden) hidden++;
      else { visible++; if (rule.required ?? row.required_platform) required++; }
    }
    return t('ppa_s_summary', { visible, required, hidden, fixed });
  };

  const fieldRow = (entity: string, row: PolicyRow) => {
    const rule = ruleOf(entity, row.key);
    const fixed = isFixed(rule);
    const visible = row.declared && !rule.hidden && !fixed;
    const id = `${entity}.${row.key}`;
    const expanded = open.has(id);
    const tone = fixed ? 'bg-primary/5 border-primary/20' : rule.hidden ? 'bg-muted/50' : 'bg-card';
    const canToggle = row.declared && !row.pick && !fixed;
    return (
      <div key={row.key} className={`rounded-xl border border-border ${tone} px-4 py-3`} data-field-row={id}>
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className={`font-medium ${visible ? '' : 'text-muted-foreground'}`}>{rule.label && visible ? rule.label : row.label}</div>
            <div className="text-sm text-muted-foreground">{sentence(row, rule, who)}</div>
          </div>
          {canToggle ? (
            <label className="flex shrink-0 items-center gap-2 text-sm">
              <span className="hidden sm:inline text-muted-foreground">{t('ppa_col_visible')}</span>
              <input type="checkbox" className="h-5 w-5" checked={visible} aria-label={`${t('ppa_col_visible')}: ${row.label}`}
                onChange={e => setRule(entity, row.key, { hidden: e.target.checked ? undefined : true })} />
            </label>
          ) : null}
          {row.pick || row.fulltype.startsWith('file') ? null : (
            <Button variant="ghost" size="sm" className="shrink-0" onClick={() => toggleOpen(id)} aria-expanded={expanded}>
              {expanded ? t('ppa_less') : t('ppa_more')}
            </Button>
          )}
        </div>
        {expanded ? (
          <div className="mt-3 grid gap-3 border-t border-dashed border-border pt-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">{t('ppa_col_fixed')}</span>
              {fixedControl(entity, row)}
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">{t('ppa_col_required')}</span>
              <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" disabled={!visible}
                value={(rule.required ?? row.required_platform) ? 'yes' : 'no'} aria-label={t('ppa_col_required')}
                onChange={e => setRule(entity, row.key, { required: (e.target.value === 'yes') === row.required_platform ? undefined : e.target.value === 'yes' })}>
                <option value="yes">{t('ppa_yes')}</option>
                <option value="no">{t('ppa_no')}</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">{t('ppa_col_label')}</span>
              <Input value={rule.label ?? ''} placeholder={row.label} disabled={!visible} aria-label={t('ppa_col_label')}
                onChange={e => setRule(entity, row.key, { label: e.target.value || undefined })} />
            </label>
            <p className="text-xs text-muted-foreground sm:col-span-3">{t('ppa_fixed_hint', { who })}</p>
          </div>
        ) : null}
      </div>
    );
  };

  const nothingToAdjust = !!cat && cat.entities.length === 0 && cat.lists.length === 0;

  return (
    <div className="space-y-6 pb-24">
      <div className="space-y-2">
        <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <IconArrowLeft size={16} stroke={1.5} /> {backLabel}
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-normal">{t('ppa_policy_title')}<span className="text-muted-foreground"> · {heading}</span></h1>
            <p className="mt-1 text-base text-foreground">{intro}</p>
            {note ? <p className="mt-1 text-sm text-muted-foreground">{note}</p> : null}
          </div>
          {badge ?? null}
        </div>
      </div>

      {above ?? null}

      {error ? (
        <p className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <IconAlertTriangle size={16} stroke={1.5} /> {error}
        </p>
      ) : null}

      {loading || !cat ? (
        <div className="flex justify-center py-16">
          <IconLoader2 size={24} stroke={1.5} className="animate-spin text-muted-foreground" />
        </div>
      ) : nothingToAdjust ? (
        <div className="rounded-[27px] bg-card shadow-lg p-8 text-center text-muted-foreground">{emptyText ?? t('ppa_nothing_to_adjust')}</div>
      ) : (
        <div className="space-y-8">
          {cat.entities.map(ent => {
            const declared = ent.fields.filter(f => f.declared);
            const more = ent.fields.filter(f => !f.declared && !f.pick && !f.fulltype.startsWith('file'));
            const isOpen = openEntities.has(ent.entity);
            return (
              <section key={ent.entity} className="space-y-3" data-entity={ent.entity}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-semibold">{t('ppa_policy_submit_section', { entity: ent.label, who })}</h2>
                    <p className="text-sm text-muted-foreground">{summaryOf(ent.entity, ent.fields)}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => toggleEntity(ent.entity)} aria-expanded={isOpen}>
                    {isOpen ? t('ppa_less') : t('ppa_open')}
                  </Button>
                </div>
                {isOpen ? (
                  <div className="space-y-2">
                    {declared.map(row => fieldRow(ent.entity, row))}
                    {more.length > 0 ? (
                      <details className="rounded-xl border border-dashed border-border px-4 py-3">
                        <summary className="cursor-pointer text-sm">{t('ppa_more_fields', { entity: ent.label })}</summary>
                        <p className="mt-1 text-xs text-muted-foreground">{t('ppa_more_fields_hint')}</p>
                        <div className="mt-3 space-y-2">{more.map(row => fieldRow(ent.entity, row))}</div>
                      </details>
                    ) : null}
                  </div>
                ) : null}
              </section>
            );
          })}

          {cat.lists.map(lst => {
            const flt = shownFilter(lst.entity);
            const fromAgent = !!flt && !draft.lists[lst.entity]?.filter;
            const filterFields = lst.filter_fields ?? [];
            const sel = 'h-9 rounded-md border border-input bg-background px-2 text-sm';
            const opLabel = (ff: FilterField | undefined, op: FilterOp) => {
              const dateish = ff && (ff.kind === 'date' || ff.kind === 'datetime');
              if (dateish && ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'].includes(op)) return t(`ppa_op_date_${op}`);
              return t(`ppa_op_${op}`);
            };
            const valueControl = (c: FilterCondition, idx: number) => {
              const ff = filterFields.find(f => f.key === c.field);
              if (!ff || c.op === 'empty' || c.op === 'not_empty') return null;
              const set = (value: unknown) => setCondition(lst.entity, idx, { value });
              const many = c.op === 'in' || c.op === 'not_in';
              if (ff.options) {
                if (many) {
                  const chosen = new Set((Array.isArray(c.value) ? c.value : []).map(String));
                  return (
                    <span className="flex flex-wrap gap-1">
                      {ff.options.map(o => (
                        <label key={o.key} className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${chosen.has(o.key) ? 'border-primary/40 bg-primary/10' : 'border-border'}`}>
                          <input type="checkbox" className="h-3.5 w-3.5" checked={chosen.has(o.key)}
                            onChange={e => { const n = new Set(chosen); if (e.target.checked) n.add(o.key); else n.delete(o.key); set(Array.from(n)); }} />
                          {o.label}
                        </label>
                      ))}
                    </span>
                  );
                }
                return (
                  <select className={sel} value={String(c.value ?? '')} aria-label={t('ppa_value')} onChange={e => set(e.target.value)}>
                    <option value="">{t('ppa_value')}</option>
                    {ff.options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                );
              }
              if (ff.kind === 'bool') {
                return (
                  <select className={sel} value={c.value === true ? 'true' : c.value === false ? 'false' : ''} aria-label={t('ppa_value')}
                    onChange={e => set(e.target.value === '' ? undefined : e.target.value === 'true')}>
                    <option value="">{t('ppa_value')}</option>
                    <option value="true">{t('ppa_yes')}</option>
                    <option value="false">{t('ppa_no')}</option>
                  </select>
                );
              }
              if (ff.kind === 'date' || ff.kind === 'datetime') {
                const rel = c.value && typeof c.value === 'object' ? (c.value as { rel: string; days?: number }) : null;
                const relKey = ff.kind === 'datetime' ? 'now' : 'today';
                return (
                  <span className="flex flex-wrap items-center gap-2">
                    <select className={sel} value={rel ? 'rel' : 'pick'} aria-label={t('ppa_value')}
                      onChange={e => set(e.target.value === 'rel' ? { rel: relKey } : '')}>
                      <option value="rel">{t(ff.kind === 'datetime' ? 'ppa_date_now' : 'ppa_date_today')}</option>
                      <option value="pick">{t('ppa_date_pick')}</option>
                    </select>
                    {rel ? (
                      <Input className="h-9 w-24" type="number" value={rel.days ?? 0} title={t('ppa_date_days')} aria-label={t('ppa_date_days')}
                        onChange={e => set({ rel: relKey, days: Number(e.target.value || 0) })} />
                    ) : (
                      <Input className="h-9 w-48" type={ff.kind === 'datetime' ? 'datetime-local' : 'date'} value={String(c.value ?? '')} aria-label={t('ppa_value')}
                        onChange={e => set(e.target.value)} />
                    )}
                  </span>
                );
              }
              const numeric = ff.kind === 'number';
              if (many) {
                const text = Array.isArray(c.value) ? c.value.join(', ') : String(c.value ?? '');
                return (
                  <Input className="h-9 w-56" value={text} placeholder={t('ppa_list_values_hint')} aria-label={t('ppa_value')}
                    onChange={e => set(e.target.value.split(',').map(x => x.trim()).filter(Boolean).map(x => (numeric && x !== '' && !Number.isNaN(Number(x)) ? Number(x) : x)))} />
                );
              }
              return (
                <Input className="h-9 w-44" type={numeric ? 'number' : 'text'} value={c.value === null || c.value === undefined ? '' : String(c.value)}
                  placeholder={t('ppa_value')} aria-label={t('ppa_value')}
                  onChange={e => set(numeric && e.target.value !== '' ? Number(e.target.value) : e.target.value)} />
              );
            };
            const conditionRow = (c: FilterCondition, idx: number, total: number) => {
              const ff = filterFields.find(f => f.key === c.field);
              return (
                <div key={idx} className="flex flex-wrap items-center gap-2 text-sm" data-condition={idx}>
                  {idx > 0 ? <span className="text-muted-foreground">{t('ppa_list_filter_join')}</span> : null}
                  <select className={sel} value={c.field} aria-label={t('ppa_col_field')}
                    onChange={e => {
                      if (!e.target.value) { removeCondition(lst.entity, idx); return; }
                      const nf = filterFields.find(f => f.key === e.target.value);
                      setCondition(lst.entity, idx, { field: e.target.value, op: nf && nf.ops.includes(c.op) ? c.op : defaultOp(nf), value: undefined });
                    }}>
                    {total === 1 ? <option value="">{t('ppa_filter_none')}</option> : null}
                    {filterFields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                  <select className={sel} value={c.op} aria-label={t('ppa_op')}
                    onChange={e => setCondition(lst.entity, idx, { op: e.target.value as FilterOp, value: ['in', 'not_in'].includes(e.target.value) ? [] : undefined })}>
                    {(ff?.ops ?? ['eq']).map(op => <option key={op} value={op}>{opLabel(ff, op)}</option>)}
                  </select>
                  {valueControl(c, idx)}
                  {total > 1 ? (
                    <button type="button" className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground" aria-label={t('ppa_remove_condition')}
                      onClick={() => removeCondition(lst.entity, idx)}>×</button>
                  ) : null}
                </div>
              );
            };
            return (
              <section key={`list-${lst.entity}`} className="space-y-3" data-list={lst.entity}>
                <h2 className="text-base font-semibold">{t('ppa_policy_list_section', { entity: lst.label, who })}</h2>
                <p className="text-sm text-muted-foreground">{t('ppa_list_hint')}</p>
                <div className="flex flex-wrap gap-2">
                  {lst.fields.map(col => {
                    const hidden = listHidden(lst.entity).includes(col.key);
                    return (
                      <label key={col.key} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm ${hidden ? 'border-border text-muted-foreground' : 'border-primary/40 bg-primary/5'}`}>
                        <input type="checkbox" className="h-4 w-4" checked={!hidden} onChange={e => setListVisible(lst.entity, col.key, e.target.checked)} />
                        {col.label}
                      </label>
                    );
                  })}
                </div>
                {filterFields.length > 0 ? (
                  <div className={`rounded-xl border px-4 py-3 ${flt ? 'border-primary/20 bg-primary/5' : 'border-border bg-card'}`} data-list-filter={lst.entity}>
                    <div className="space-y-2">
                      <div className="text-sm">{t('ppa_list_filter_intro', { who })}</div>
                      {(flt?.conditions.length ? flt.conditions : [{ field: '', op: 'eq' as FilterOp }]).map((c, idx, arr) => conditionRow(c, idx, arr.length))}
                      {flt && flt.conditions.length > 1 ? (
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="text-muted-foreground">…</span>
                          <select className={sel} value={flt.mode} aria-label={t('ppa_op')} onChange={e => setMode(lst.entity, e.target.value as 'all' | 'any')}>
                            <option value="all">{t('ppa_mode_all')}</option>
                            <option value="any">{t('ppa_mode_any')}</option>
                          </select>
                        </div>
                      ) : null}
                      {flt && flt.conditions.length > 0 ? (
                        <Button variant="ghost" size="sm" onClick={() => addCondition(lst.entity, filterFields)}>+ {t('ppa_add_condition')}</Button>
                      ) : null}
                    </div>
                    {fromAgent ? <p className="mt-2 text-xs text-muted-foreground">{t('ppa_agent_filter_hint')}</p> : null}
                    {lst.scope_description && !lst.agent_filter ? <p className="mt-2 text-xs text-muted-foreground">{t('ppa_agent_scope', { text: lst.scope_description })}</p> : null}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                      <span>{t('ppa_list_max_prefix')}</span>
                      <Input className="h-9 w-24" type="number" min={1} max={500} value={draft.lists[lst.entity]?.max_records ?? ''}
                        placeholder={String(lst.max_records ?? '')} aria-label={t('ppa_list_max_prefix')}
                        onChange={e => setListMax(lst.entity, e.target.value)} />
                      <span>{t('ppa_list_max_suffix')}</span>
                    </div>
                  </div>
                ) : null}
              </section>
            );
          })}

          {showTexts ? (
            <section className="space-y-3">
              <h2 className="text-base font-semibold">{t('ppa_policy_texts')}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {TEXT_KEYS.map(key => (
                  <label key={key} className="space-y-1 text-sm">
                    <span className="text-xs font-medium text-muted-foreground">{t(TEXT_LABELS[key])}</span>
                    <Input value={draft.texts[key] ?? ''} placeholder={cat.texts[key] ?? ''} onChange={e => setText(key, e.target.value)} />
                  </label>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-6 py-3">
          <span className="flex-1 text-sm text-muted-foreground">
            {justSaved ? (
              <span className="inline-flex items-center gap-1 text-primary"><IconCheck size={16} stroke={1.5} /> {savedText}</span>
            ) : changes > 0 ? t('ppa_unsaved', { n: changes }) : t('ppa_nothing_unsaved')}
          </span>
          {view?.href ? (
            <a href={view.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-sm hover:bg-accent">
              <IconExternalLink size={16} stroke={1.5} /> {view.label}
            </a>
          ) : view?.to ? (
            <Link to={view.to} className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-sm hover:bg-accent">
              <IconExternalLink size={16} stroke={1.5} /> {view.label}
            </Link>
          ) : null}
          <Button variant="outline" onClick={discard} disabled={changes === 0 || saving}>{t('ppa_discard')}</Button>
          <Button onClick={doSave} disabled={changes === 0 || saving || loading}>
            {saving ? <IconLoader2 size={16} stroke={1.5} className="animate-spin" /> : t('ppa_save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
