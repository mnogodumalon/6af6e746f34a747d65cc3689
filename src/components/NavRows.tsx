import type { MouseEvent, ReactNode } from 'react';

/**
 * NavRows — the platform's sidebar list, rebuilt for dashboard content.
 *
 * The LivingApps chrome renders every sidebar list (Datenverwaltung, Aktionen,
 * Öffentliche Seiten) through one NavList inside its widgets' shadow roots:
 * a row is a pill (`rounded-full px-4 py-1`), an optional leading icon, the
 * title truncated; hover tints the pill, the current page is orange and bold,
 * a pending row pulses in grey. The Abläufe list is dashboard content and
 * cannot reach that component — but it has to look exactly like its
 * neighbours (the public pages widget right below it), so this is the same
 * markup with the same values. The colours are the widget library's literals
 * (`--colors-raspberry-100` #fff4ed, `--colors-orange-600` #d24601,
 * `--colors-grey-300` #767676) — they live only inside the widgets' shadow
 * roots, not on :root, so they are copied, not referenced. The font size does
 * follow the section: a dense `la-nav-section` sets `--la-nav-text-size` on its
 * slot and the rows inherit it.
 */
export interface NavRow {
  key: string;
  title: string;
  /** href for middle-click/copy; `onSelect` decides what a left click does. */
  url?: string;
  icon?: ReactNode;
  here?: boolean;
  pending?: boolean;
  /** small marker after the title, e.g. „Beta“ */
  badge?: string;
}

const ROW = 'flex items-center gap-2 rounded-full px-4 py-1 text-[length:var(--la-nav-text-size,1rem)] leading-none no-underline transition-colors';

export interface NavRowsProps {
  rows: NavRow[];
  ariaLabel: string;
  onSelect?: (row: NavRow, e: MouseEvent<HTMLAnchorElement>) => void;
}

export function NavRows({ rows, ariaLabel, onSelect }: NavRowsProps) {
  return (
    <nav aria-label={ariaLabel} className="flex flex-col gap-1 py-2">
      {rows.map(row => {
        const icon = row.icon == null ? null : (
          <span className="inline-flex shrink-0 text-base leading-none" aria-hidden="true">
            {row.icon}
          </span>
        );
        const title = <span className="min-w-0 truncate leading-normal">{row.title}</span>;
        if (row.pending) {
          return (
            <span key={row.key} title={row.title} aria-busy="true" className={`${ROW} animate-pulse cursor-default text-[#767676]`}>
              {icon}
              {title}
            </span>
          );
        }
        return (
          <a
            key={row.key}
            href={row.url ?? '#'}
            title={row.title}
            aria-current={row.here ? 'page' : undefined}
            className={`${ROW} ${row.here ? 'text-[#d24601] font-medium cursor-default' : 'text-black hover:bg-[#fff4ed] hover:text-[#d24601]'}`}
            onClick={e => onSelect?.(row, e)}
          >
            {icon}
            {title}
            {row.badge && <span className="shrink-0 rounded-full bg-[#fff4ed] px-1.5 py-0.5 text-[0.65rem] font-medium leading-none text-[#d24601]">{row.badge}</span>}
          </a>
        );
      })}
    </nav>
  );
}
