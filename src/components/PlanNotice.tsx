import { useEffect, useState } from 'react';
import { IconChevronRight } from '@tabler/icons-react';
import { t } from '@/i18n';
import { getAppMap, openJobs, type AppMapState } from '@/lib/appMap';

/**
 * PlanNotice — the way INTO „Deine Anwendung“ from the overview, one concrete
 * thing at a time and never a number. Precedence: a failed job („… hat nicht
 * geklappt. Ansehen ›“) > a running job („Die Anwendung baut gerade um …“) > a ready structure
 * proposal („Neu in der Anwendung: … Ansehen ›“) > the first setup line that has a notice („Dein Logo fehlt noch … Einrichten ›“)
 * > nothing. Nothing when the application was never orchestrated.
 */
const MAP_PATH = '#/verwaltung/anwendung';

function lineLink(id: string): string {
  return `${MAP_PATH}?line=${encodeURIComponent(id)}`;
}

export function PlanNotice() {
  const [st, setSt] = useState<AppMapState | null>(null);
  useEffect(() => { getAppMap().then(setSt).catch(() => setSt(null)); }, []);
  if (!st?.map || !st.canChange) return null;   // the owner's to-do; a viewer without admin rights cannot act on it
  const jobs = openJobs(st.jobs);
  const failed = jobs.find(j => j.status === 'failed');
  const running = jobs.find(j => j.status === 'running');
  const setup = st.map.lines.find(l => l.group === 'setup' && !l.hidden && l.notice);
  const structure = st.proposal?.status === 'ready' && st.proposal.kind === 'structure' ? st.proposal : null;

  let text: string;
  let action: string | null;
  let href: string;
  if (failed) {
    text = t('pn_failed', { text: failed.text });
    action = t('pn_view');
    href = lineLink(failed.line_id);
  } else if (running) {
    text = t('pn_running', { text: running.text });
    action = null;
    href = lineLink(running.line_id);
  } else if (structure) {
    text = t('pn_structure', { text: structure.wish });
    action = t('pn_view');
    href = MAP_PATH;
  } else if (setup?.notice) {
    text = setup.notice;
    action = t('pn_setup');
    href = lineLink(setup.id);
  } else {
    return null;
  }
  return (
    <a href={href} className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-2.5 text-sm ${failed ? 'border-destructive/40 bg-destructive/5 hover:bg-destructive/10' : 'border-primary/30 bg-primary/5 hover:bg-primary/10'}`} data-plan-notice="" aria-live="polite">
      <span className="min-w-0 flex-1">{text}</span>
      {action && <span className="inline-flex items-center gap-1 font-semibold text-primary">{action}<IconChevronRight size={16} aria-hidden="true" /></span>}
    </a>
  );
}
