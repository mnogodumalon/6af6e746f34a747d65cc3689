import { useEffect, useMemo, useState } from 'react';
import { IconLoader2 } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Bound } from '@/components/blocks/Bound';
import { useStepForm, type FormValues } from '@/lib/journey/useStepForm';
import { FIELD_RULES, entityLabel, type EntityKey, type FieldKind } from '@/lib/journey/rules';
import type { JourneyPort, JourneyRecord } from '@/lib/journey/port';
import { t } from '@/i18n';

/**
 * InlineCreate — the "Neu anlegen" mini-form of a pick step, rendered by the
 * layer from the entity's generated rules instead of written by hand.
 *
 * A pick step that offered only existing records was a dead end the moment
 * the right record did not exist yet (280 flow pages in the field: one in
 * five had a create path — the other four ended at "Keine Ergebnisse").
 * The form was agent code, so it was skipped whenever the brief did not ask
 * for it. Here it costs nothing: EntitySelectStep shows this panel whenever
 * the step comes from useRecordSearch on the internal door and the entity's
 * required fields are plain inputs.
 *
 * Which fields: the entity's required writable fields (`FIELD_RULES`), or
 * the first text field when nothing is required — a record needs a name. A
 * page may say `fields` itself. Records, files, geo and multi-lookups are not
 * plain inputs: an entity that REQUIRES one of them gets no inline create
 * (`canInlineCreate` → false) rather than a form that cannot be sent.
 *
 * The write goes through the page's port (a prop — blocks never import a
 * door), the created record is handed back and the step adopts and picks it.
 */
const INLINE_KINDS: ReadonlySet<FieldKind> = new Set<FieldKind>([
  'text', 'textarea', 'email', 'tel', 'url', 'number', 'bool', 'date', 'datetime', 'lookup',
]);

/** The fields the mini-form asks for: required + writable, else the first text field. */
export function inlineCreateFields(entity: EntityKey): string[] {
  const rules = Object.values(FIELD_RULES[entity] ?? {});
  const required = rules.filter(r => r.required && r.writable).map(r => r.key);
  if (required.length > 0) return required;
  const first = rules.find(r => r.writable && r.kind === 'text');
  return first ? [first.key] : [];
}

/** Can the layer render a sendable mini-form for this entity (and these fields)? */
export function canInlineCreate(entity: EntityKey, fields: string[] = inlineCreateFields(entity)): boolean {
  if (fields.length === 0) return false;
  const rules = FIELD_RULES[entity] ?? {};
  return fields.every(key => {
    const rule = rules[key];
    return rule !== undefined && rule.writable && INLINE_KINDS.has(rule.kind);
  });
}

export interface InlineCreateProps {
  entity: EntityKey;
  /** The page's door — the same port the pick step's useRecordSearch uses. */
  port: JourneyPort;
  /** Fields of the mini-form. Default: `inlineCreateFields(entity)`. */
  fields?: string[];
  initial?: FormValues;
  /** Panel heading. Default: "Neuer Eintrag: {entity}". */
  title?: string;
  onCreated: (record: JourneyRecord) => void;
  onCancel: () => void;
}

export function InlineCreate({ entity, port, fields, initial, title, onCreated, onCancel }: InlineCreateProps) {
  const keys = useMemo(() => fields ?? inlineCreateFields(entity), [entity, fields]);
  const form = useStepForm(entity, { fields: keys, initial, id: `neu-${entity}` });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingId = `${form.id}-title`;

  // The panel opens on a click — the first field takes the focus so typing
  // can start at once (and a screen reader lands inside the group).
  useEffect(() => {
    const first = keys[0];
    if (first) document.getElementById(form.fieldId(first))?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  async function submit(): Promise<void> {
    if (!form.validate()) return;
    setPending(true);
    setError(null);
    try {
      onCreated(await port.create(entity, form.payload()));
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t('sel_create_failed'));
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      role="group"
      aria-labelledby={headingId}
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
      onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}
    >
      <h3 id={headingId} className="text-sm font-medium">
        {title ?? t('sel_create_title', { entity: entityLabel(entity) })}
      </h3>
      {keys.map(key => <Bound key={key} form={form} name={key} />)}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          {t('cancel')}
        </Button>
        <Button type="button" onClick={() => void submit()} disabled={pending} className="gap-1.5">
          {pending && <IconLoader2 size={15} className="animate-spin" aria-hidden="true" />}
          {t('sel_create_submit')}
        </Button>
      </div>
    </section>
  );
}
