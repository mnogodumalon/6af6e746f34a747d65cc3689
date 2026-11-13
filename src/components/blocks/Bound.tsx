import { lazy, Suspense, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
// Lazy: the DatePicker (calendar, popover, date-fns locales — ~140 KB) loads only
// where a date field renders; a public page without one never pays for it (P-3).
const DatePicker = lazy(() => import('@/components/DatePicker').then(m => ({ default: m.DatePicker })));
import { ChoiceGroup } from '@/components/blocks/ChoiceGroup';
import { FileField } from '@/components/blocks/FileField';
import { Field, useEnclosingField } from '@/components/blocks/Field';
import { labelOf, type FieldKind } from '@/lib/journey/rules';
import type { StepForm } from '@/lib/journey/useStepForm';

/**
 * Bound — ONE labelled form control for ONE field, the control chosen from the
 * field's rule: text/email/tel/url/number → Input, textarea → Textarea,
 * date/datetime → DatePicker, lookup → ChoiceGroup pills, bool → Checkbox.
 * Label, required mark, hint and error come from <Field>; the binding
 * (`f.field/number/date/choice/checkbox`) from the form.
 *
 *   <Bound form={f} name="ausgabedatum" />
 *   <Bound form={f} name="notizen" rows={4} placeholder={tx('Optional')} />
 *   <Bound form={f} name="zustand" as="choice" allowClear />
 *
 * Why a block: a bound control without its label shipped three times in a
 * week — the binding and the wrapper were two things to remember, and the
 * skill's own example forgot one of them. Here they are one element, and the
 * control kind is the layer's decision (the same one the generated dialogs
 * make), not a memory test. Records (applookup) are NOT handled: a pick step
 * (EntitySelectStep + useRecordSearch) or an explicit
 * <Field><Combobox {...f.record(k)} items={…} /></Field> is the way — check-intents
 * rejects <Bound> on a record field.
 *
 * <Field name="x"><Bound name="x" /></Field> is harmless: Bound sees the
 * enclosing Field (context) and renders only the control. One label, always.
 */
export type BoundControl = 'input' | 'textarea' | 'date' | 'choice' | 'checkbox' | 'file';

export interface BoundProps {
  form: StepForm;
  name: string;
  /** Overrides the entity's field label. */
  label?: ReactNode;
  /** One short line under the control. Hidden while an error shows. */
  hint?: ReactNode;
  placeholder?: string;
  /** Textarea rows (default 3). */
  rows?: number;
  /** ChoiceGroup: clicking the selected pill again clears it. */
  allowClear?: boolean;
  /** Overrules the control the field's kind implies. */
  as?: BoundControl;
  className?: string;
}

export function controlFor(kind: FieldKind | undefined): BoundControl {
  switch (kind) {
    case 'textarea': return 'textarea';
    case 'date':
    case 'datetime': return 'date';
    case 'lookup': return 'choice';
    case 'bool': return 'checkbox';
    case 'file': return 'file';
    default: return 'input';
  }
}

export function Bound({ form, name, label, hint, placeholder, rows = 3, allowClear, as, className }: BoundProps) {
  const rule = form.rules[name];
  const control = as ?? controlFor(rule?.kind);
  // Inside <Field name={name}> the label, hint and error line are already
  // there — render the bare control, never a second labelled wrapper.
  const enclosed = useEnclosingField() === name;

  if (control === 'checkbox') {
    // The checkbox carries its own visible text; the Field label stays for screen readers.
    const cb = form.checkbox(name);
    const box = (
      <div className="flex items-center gap-2 pt-1">
        <Checkbox {...cb} />
        <Label htmlFor={cb.id} className="font-normal">{label ?? labelOf(form.entity, name)}</Label>
      </div>
    );
    if (enclosed) return box;
    return (
      <Field form={form} name={name} label={label} hint={hint} hideLabel className={className}>
        {box}
      </Field>
    );
  }

  let node: ReactNode;
  switch (control) {
    case 'textarea':
      node = <Textarea {...form.field(name)} rows={rows} placeholder={placeholder} />;
      break;
    case 'date':
      node = (
        <Suspense fallback={<Input id={form.fieldId(name)} placeholder={placeholder} disabled />}>
          <DatePicker {...form.date(name)} placeholder={placeholder} />
        </Suspense>
      );
      break;
    case 'choice':
      node = <ChoiceGroup {...form.choice(name)} allowClear={allowClear} />;
      break;
    case 'file':
      node = <FileField {...form.file(name)} />;
      break;
    default:
      node = <Input {...(rule?.kind === 'number' ? form.number(name) : form.field(name))} placeholder={placeholder} />;
  }
  if (enclosed) return node;
  return (
    <Field form={form} name={name} label={label} hint={hint} className={className}>
      {node}
    </Field>
  );
}
