const STATUS_COLOR_MAP: Record<string, string> = {
  // Event status
  in_planung: 'bg-blue-100 text-blue-700 border-blue-200',
  einladungen_versendet: 'bg-purple-100 text-purple-700 border-purple-200',
  bestaetigt: 'bg-green-100 text-green-700 border-green-200',
  abgeschlossen: 'bg-slate-100 text-slate-600 border-slate-200',
  abgesagt: 'bg-red-100 text-red-700 border-red-200',
  // RSVP status
  ausstehend: 'bg-gray-100 text-gray-600 border-gray-200',
  zugesagt: 'bg-green-100 text-green-700 border-green-200',
  vielleicht: 'bg-amber-100 text-amber-700 border-amber-200',
  // Booking status
  angefragt: 'bg-blue-100 text-blue-700 border-blue-200',
  angebot_erhalten: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  gebucht: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  storniert: 'bg-red-100 text-red-700 border-red-200',
  // Payment status
  offen: 'bg-amber-100 text-amber-700 border-amber-200',
  anzahlung: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  bezahlt: 'bg-green-100 text-green-700 border-green-200',
  // Generic
  aktiv: 'bg-green-100 text-green-700 border-green-200',
  inaktiv: 'bg-gray-100 text-gray-600 border-gray-200',
  pausiert: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  bestanden: 'bg-green-100 text-green-700 border-green-200',
  nicht_bestanden: 'bg-red-100 text-red-700 border-red-200',
  gut: 'bg-green-100 text-green-700 border-green-200',
  befriedigend: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  beschaedigt: 'bg-orange-100 text-orange-700 border-orange-200',
  defekt: 'bg-red-100 text-red-700 border-red-200',
  sehr_gut: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  verfuegbar: 'bg-green-100 text-green-700 border-green-200',
  in_wartung: 'bg-amber-100 text-amber-700 border-amber-200',
  ausgemustert: 'bg-gray-100 text-gray-600 border-gray-200',
};

const DEFAULT_COLOR = 'bg-gray-100 text-gray-600 border-gray-200';

/** The valence of a status, said by the page — wins over the word table above,
 *  whose guesses are German hotel/event/payment vocabulary ("offen" = warning
 *  there, but neutral for an open position). */
export type StatusTone = 'positive' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_COLOR: Record<StatusTone, string> = {
  positive: 'bg-green-100 text-green-700 border-green-200',
  warning: 'bg-amber-100 text-amber-700 border-amber-200',
  danger: 'bg-red-100 text-red-700 border-red-200',
  info: 'bg-blue-100 text-blue-700 border-blue-200',
  neutral: DEFAULT_COLOR,
};

interface StatusBadgeProps {
  statusKey: string | undefined;
  label?: string;
  /** Overrides the word table: `tone="neutral"` for a status whose colour the table guesses wrong. */
  tone?: StatusTone;
  className?: string;
}

export function StatusBadge({ statusKey, label, tone, className = '' }: StatusBadgeProps) {
  if (!statusKey) return null;
  const color = getStatusColor(statusKey, tone);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${color} ${className}`}>
      {label ?? statusKey}
    </span>
  );
}

/** Get the color classes for a status key (useful for custom rendering) */
export function getStatusColor(statusKey: string | undefined, tone?: StatusTone): string {
  if (tone) return TONE_COLOR[tone];
  if (!statusKey) return DEFAULT_COLOR;
  return STATUS_COLOR_MAP[statusKey] ?? DEFAULT_COLOR;
}
