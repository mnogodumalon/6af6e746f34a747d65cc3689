import { useRef, type KeyboardEvent } from 'react';

/**
 * ChoiceGroup — a lookup with few options as an accessible radiogroup of
 * pills with a radio indicator (so they read as "pick one", not as chips).
 * Pair it with `useStepForm`: `<ChoiceGroup {...f.choice('status')} />`.
 * Arrow keys move the selection (WAI-ARIA radiogroup pattern); the group
 * itself is focusable so a validation error can land on it.
 */
export interface ChoiceOption {
  key: string;
  label: string;
}

export interface ChoiceGroupProps {
  id: string;
  value: string | null;
  onChange: (key: string | null) => void;
  options: ChoiceOption[];
  required?: boolean;
  invalid?: boolean;
  /** Clicking the selected pill again clears it (default: false — a required choice cannot be unset). */
  allowClear?: boolean;
  'aria-describedby'?: string;
  'aria-labelledby'?: string;
  className?: string;
}

export function ChoiceGroup({
  id,
  value,
  onChange,
  options,
  required,
  invalid,
  allowClear = false,
  className = '',
  ...aria
}: ChoiceGroupProps) {
  const groupRef = useRef<HTMLDivElement>(null);

  const moveSelection = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta || options.length === 0) return;
    e.preventDefault();
    const idx = options.findIndex(o => o.key === value);
    const next = options[(idx + delta + options.length) % options.length];
    onChange(next.key);
    const btn = groupRef.current?.querySelector<HTMLButtonElement>(`button[data-key="${next.key}"]`);
    btn?.focus();
  };

  return (
    <div
      ref={groupRef}
      id={id}
      role="radiogroup"
      tabIndex={-1}
      aria-required={required || undefined}
      aria-invalid={invalid || undefined}
      aria-describedby={aria['aria-describedby']}
      aria-labelledby={aria['aria-labelledby']}
      onKeyDown={moveSelection}
      className={`flex flex-wrap gap-2 outline-none rounded-xl ${invalid ? 'ring-2 ring-destructive/40 ring-offset-2 ring-offset-background' : ''} ${className}`}
    >
      {options.map(o => {
        const selected = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            data-key={o.key}
            aria-checked={selected}
            tabIndex={selected || (value === null && o === options[0]) ? 0 : -1}
            onClick={() => onChange(selected && allowClear ? null : o.key)}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full border pl-2.5 pr-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              selected
                ? 'border-primary bg-accent text-accent-foreground'
                : 'border-input bg-muted/40 text-foreground hover:border-foreground/30 hover:bg-card'
            }`}
          >
            {/* min-h-11 = 44 px: a thumb's target (K8 — hand-made vote buttons were 30 px high) */}
            {/* Radio indicator — what tells this apart from an answer chip or a button. */}
            <span
              className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                selected ? 'border-primary bg-primary' : 'border-muted-foreground/60 bg-card'
              }`}
              aria-hidden="true"
            >
              {selected && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
            </span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
