import { useEffect, useMemo, useRef, useState } from 'react';
import { format, isValid, parse, parseISO } from 'date-fns';
import { IconCalendar, IconClock, IconX } from '@tabler/icons-react';
import { dateFnsLocale, t } from '@/i18n';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type Mode = 'date' | 'datetime';

interface DatePickerProps {
  value: string | null | undefined;
  onChange: (next: string | null) => void;
  mode?: Mode;
  id?: string;
  placeholder?: string;
  required?: boolean;
  invalid?: boolean;
  /** ISO yyyy-MM-dd lower bound */
  min?: string;
  /** ISO yyyy-MM-dd upper bound */
  max?: string;
}

const DATE_FMT = 'yyyy-MM-dd';
const DATETIME_FMT = "yyyy-MM-dd'T'HH:mm";

function parseValue(raw: string | null | undefined, mode: Mode): Date | null {
  if (!raw) return null;
  const parsed = parse(raw, mode === 'datetime' ? DATETIME_FMT : DATE_FMT, new Date());
  if (isValid(parsed)) return parsed;
  // what the platform stores is not always the input's form: a day without a time in a
  // date-time field, or seconds („2026-11-06T18:30:00“) — the edit dialog showed it EMPTY (Bau 14)
  const iso = parseISO(raw);
  return isValid(iso) ? iso : null;
}

function formatValue(date: Date, mode: Mode): string {
  return format(date, mode === 'datetime' ? DATETIME_FMT : DATE_FMT);
}

function formatLabel(date: Date, mode: Mode): string {
  // Kompakter Apple-/iOS-Style: Jahr nur wenn nicht laufendes Jahr,
  // Uhrzeit nur wenn nicht exakt 00:00 (sonst rauschende Default-Zeit).
  // Spart eine Zeile im engen Dialog-Trigger und wird ohne Wrap angezeigt.
  const showYear = date.getFullYear() !== new Date().getFullYear();
  const hasTime = mode === 'datetime' && (date.getHours() !== 0 || date.getMinutes() !== 0);
  const dateFmt = showYear ? "EEE, d. MMM yyyy" : "EEE, d. MMM";
  const datePart = format(date, dateFmt, { locale: dateFnsLocale() });
  return hasTime ? `${datePart} · ${format(date, "HH:mm")}` : datePart;
}

export function DatePicker({
  value,
  onChange,
  mode = 'date',
  id,
  placeholder,
  required,
  invalid,
  min,
  max,
}: DatePickerProps) {
  const date = useMemo(() => parseValue(value, mode), [value, mode]);
  const [open, setOpen] = useState(false);
  // Local time state for datetime mode; kept in sync with `date` when popover opens
  const [hours, setHours] = useState<string>(date ? format(date, 'HH') : '09');
  const [minutes, setMinutes] = useState<string>(date ? format(date, 'mm') : '00');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isTouchDevice = useMemo(() =>
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
  []);

  useEffect(() => {
    if (open && date) {
      setHours(format(date, 'HH'));
      setMinutes(format(date, 'mm'));
    }
  }, [open, date]);

  // On touch devices fall back to the native picker — iOS/Android open
  // the platform wheel/date pickers which are usually nicer than any web Popover.
  if (isTouchDevice) {
    // Empty string falls back to the format hint so the input never looks
    // blank before the AI sub-agent has filled the placeholder marker.
    const ph = placeholder || (mode === 'datetime' ? t('date_hint_datetime') : t('date_hint_date'));
    // iOS Safari sizes a native <input type=date> to the intrinsic width of its
    // ::-webkit-datetime-edit (~150px) and ignores width / max-width / min-width
    // entirely — the BOX itself grows, so in a narrow grid column the field
    // spills past the dialog (confirmed on a real device; `block` alone only
    // fixes Chrome). Fix is structural: a plain <div> wrapper (divs DO honour
    // width) owns the visible box (border, fill, height, rounded) AND clips with
    // overflow-hidden, so however wide iOS makes the input, it can never exceed
    // the column. The bare borderless input fills the wrapper. We also hide the
    // browser's native date indicator/spin chrome and give NO icon of our own:
    // at this column width (~130px) the value "15.06.2026" only fits at 16px if
    // it owns the full field — any trailing icon would clip the last digits.
    // Result: the date field reads as a plain value box, identical to the text
    // inputs around it. Tapping still opens the native picker on touch devices.
    return (
      <div className={`relative flex h-9 max-sm:h-11 w-full min-w-0 max-w-full items-center overflow-hidden rounded-md border bg-transparent dark:bg-input/30 shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px] ${invalid ? 'border-destructive' : 'border-input'}`}>
        <input
          id={id}
          type={mode === 'datetime' ? 'datetime-local' : 'date'}
          step={mode === 'datetime' ? 60 : undefined}
          value={date ? formatValue(date, mode) : (value ?? '')}
          min={min}
          max={max}
          required={required}
          placeholder={ph}
          onChange={e => onChange(e.target.value || null)}
          style={{ minWidth: 0 }}
          className="flex h-full w-full min-w-0 items-center border-0 bg-transparent px-3 py-1 text-base md:text-sm outline-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden [&::-webkit-date-and-time-value]:text-left"
          aria-invalid={invalid || undefined}
        />
      </div>
    );
  }

  function commitDate(picked: Date | undefined) {
    if (!picked) {
      onChange(null);
      return;
    }
    if (mode === 'datetime') {
      const h = Number(hours) || 0;
      const m = Number(minutes) || 0;
      picked.setHours(h, m, 0, 0);
    }
    onChange(formatValue(picked, mode));
    if (mode === 'date') setOpen(false);
  }

  function commitTime(nextH: string, nextM: string) {
    if (!date) return;
    const next = new Date(date);
    next.setHours(Number(nextH) || 0, Number(nextM) || 0, 0, 0);
    onChange(formatValue(next, mode));
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
  }

  function pickToday() {
    const now = new Date();
    if (mode === 'datetime') {
      now.setHours(Number(hours) || 9, Number(minutes) || 0, 0, 0);
    }
    onChange(formatValue(now, mode));
    if (mode === 'date') setOpen(false);
  }

  const minDate = min ? parseValue(min, 'date') ?? undefined : undefined;
  const maxDate = max ? parseValue(max, 'date') ?? undefined : undefined;
  // Month and year are dropdowns, not only prev/next arrows: a birth date or
  // a contract start decades back is otherwise hundreds of clicks away. The
  // year range follows min/max when given, else 1900 … ten years ahead.
  const startMonth = minDate ?? new Date(1900, 0, 1);
  const endMonth = maxDate ?? new Date(new Date().getFullYear() + 10, 11, 31);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          aria-invalid={invalid || undefined}
          style={{ minWidth: 0 }}
          className={`flex h-9 max-sm:h-11 w-full min-w-0 max-w-full items-center gap-2 rounded-md border bg-transparent dark:bg-input/30 px-3 py-1 text-base md:text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]
            ${invalid ? 'border-destructive' : 'border-input'}`}
        >
          {mode === 'datetime'
            ? <IconClock size={14} className="shrink-0 text-muted-foreground" />
            : <IconCalendar size={14} className="shrink-0 text-muted-foreground" />}
          <span className={`flex-1 text-left ${date ? '' : 'text-muted-foreground'}`}>
            {date ? formatLabel(date, mode) : (placeholder || (mode === 'datetime' ? t('date_pick_datetime') : t('date_pick_date')))}
          </span>
          {date && (
            <span
              role="button"
              tabIndex={0}
              onClick={clear}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(null); } }}
              className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t('date_clear')}
            >
              <IconX size={14} />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          locale={dateFnsLocale()}
          selected={date ?? undefined}
          defaultMonth={date ?? undefined}
          captionLayout="dropdown"
          startMonth={startMonth}
          endMonth={endMonth}
          onSelect={commitDate}
          disabled={
            minDate || maxDate
              ? (d: Date) => (minDate ? d < minDate : false) || (maxDate ? d > maxDate : false)
              : undefined
          }
          weekStartsOn={1}
          autoFocus
        />
        {mode === 'datetime' && (
          <div className="flex items-center gap-2 border-t px-3 py-2">
            <IconClock size={14} className="text-muted-foreground" />
            <input
              type="number"
              min={0}
              max={23}
              value={hours}
              onChange={e => {
                const v = e.target.value.padStart(2, '0').slice(-2);
                setHours(v);
                commitTime(v, minutes);
              }}
              className="h-8 w-14 rounded-md border border-input bg-background px-2 text-center text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label={t('date_hours')}
            />
            <span className="text-muted-foreground">:</span>
            <input
              type="number"
              min={0}
              max={59}
              value={minutes}
              onChange={e => {
                const v = e.target.value.padStart(2, '0').slice(-2);
                setMinutes(v);
                commitTime(hours, v);
              }}
              className="h-8 w-14 rounded-md border border-input bg-background px-2 text-center text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label={t('date_minutes')}
            />
            <div className="ml-auto flex gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={pickToday}>{t('date_now')}</Button>
              <Button type="button" variant="default" size="sm" onClick={() => setOpen(false)}>OK</Button>
            </div>
          </div>
        )}
        {mode === 'date' && (
          <div className="flex items-center justify-between border-t px-3 py-2">
            <Button type="button" variant="ghost" size="sm" onClick={pickToday}>{t('date_today')}</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { onChange(null); setOpen(false); }}>{t('date_reset')}</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
