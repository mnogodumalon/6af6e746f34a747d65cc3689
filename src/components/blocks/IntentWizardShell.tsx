import {
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePublicWizardColumn } from '@/lib/journey/publicColumn';
import { usePolicyVersion } from '@/lib/journey/usePolicy';
import { withRecordNames } from '@/lib/journey/recordLabels';
import { useSearchParams } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  IconAlertCircle,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconClipboardList,
  IconClock,
  IconHistory,
  IconInfoCircle,
  IconAdjustmentsHorizontal,
  IconX,
} from '@tabler/icons-react';
import { t, tp } from '@/i18n';
import {
  DRAFT_CLEARED_EVENT,
  clearJourneyDraft,
  readJourneyDraft,
  claimJourneyDraft,
  removeJourneyDraft,
  writeJourneyDraft,
} from '@/lib/journey/draft';
import { isEmptyValue, isUnfilled, labelOf } from '@/lib/journey/rules';
import { onWizardStepRequest, setActiveWizardStep, type StepForm } from '@/lib/journey/useStepForm';
import { FieldErrorSummary } from './FieldErrorSummary';

/**
 * IntentWizardShell — the frame of every journey (internal flow or public wizard).
 *
 * Owns what no page should write twice: the step indicator (a real <nav> of
 * buttons, aria-current, backwards always reachable), the progress text, the
 * live region and focus move on every step change, the draft in localStorage
 * (with "resumed from yesterday" + Discard), the answer chips of earlier
 * steps, the error summary of the current step, and the wizard context that
 * StepNav / SummaryStep use to move (including "back to the summary" after
 * Change). Conditional steps: `steps[i].enabledIf = false` hides a step and
 * renumbers the rest — the page keeps ONE constant steps array.
 *
 * Every prop beyond the original set is optional — pages built before this
 * version keep compiling and behaving as they did.
 */
export interface WizardStep {
  label: string;
  /** Stable id for a step (optional; used in aria labels and tests). */
  key?: string;
  /** `false` hides the step (branching). Default: enabled. */
  enabledIf?: boolean;
  /** Visible heading of the step's content (default: `label`). */
  heading?: string;
  /** One sentence under the heading: what to do here, in the user's words
   *  ("An- und Abreise wählen — belegte Nächte sind ausgegraut."). */
  description?: ReactNode;
  /** Field keys (of the shell's `forms`) this step needs filled. Arriving with
   *  one empty — a deep link, a skipped step — the shell renders the way back
   *  instead of the step's content ("Dieser Schritt braucht zuerst: Anreise").
   *  Pages used to write that panel by hand, or showed a blank body. */
  needs?: string[];
}

export interface WizardStepProps extends WizardStep {
  children?: ReactNode;
}

/**
 * One step as a CHILD of the shell — label, heading, description and
 * enabledIf on the element, its content inside. The shell derives the step
 * list from these children and renders only the current one, so the page no
 * longer keeps a `steps` array AND `{step === n && …}` branches in sync (a
 * live flow declared three steps and rendered a fourth: unreachable).
 *
 *   <IntentWizardShell currentStep={step} onStepChange={setStep} forms={[f]}>
 *     <WizardStep label={tx('Werkzeug')}><EntitySelectStep … /></WizardStep>
 *     <WizardStep label={tx('Prüfen')}><SummaryStep forms={[f]} submit={submit} /></WizardStep>
 *     {submit.result && <SuccessStep result={submit.result} … />}
 *   </IntentWizardShell>
 *
 * Children that are not <WizardStep> (the success screen) render after the
 * current step, always. The `steps` prop keeps working for pages written before.
 */
export function WizardStep(_props: WizardStepProps): null {
  return null;
}

export interface WizardIntro {
  /** One sentence: what this flow achieves. */
  description?: ReactNode;
  /** "Das brauchst du:" — what the user should have at hand. */
  needs?: string[];
  startLabel?: string;
  /** Rough duration shown as "ca. N Min." (default: half a minute per step). */
  estimatedMinutes?: number;
  /** How often the start screen opens on its own (default 1). After that it
   *  sits behind the "So funktioniert's" button in the header. */
  autoShow?: number;
}

export interface WizardContextValue {
  /** Current step as the PAGE numbers it (1-based index into `steps`). */
  step: number;
  /** Position among ENABLED steps (what the user sees: "Schritt 2 von 4"). */
  position: number;
  total: number;
  steps: WizardStep[];
  enabledSteps: number[];
  nextLabel?: string;
  /** Set by "Change" in the summary: Continue jumps back there. */
  returnTo: number | null;
  goTo(step: number, opts?: { focus?: string; returnTo?: number | null }): void;
  next(): void;
  prev(): void;
  /** The journey succeeded: drop the draft and stop saving until a restart. */
  markCompleted(): void;
  /** True after markCompleted(): the indicator shows every step as done and
   *  nothing navigates back into the finished journey (until step 1 again). */
  completed: boolean;
  /** Hide the answer chips while the caller is mounted — SummaryStep's rows
   *  ARE the answers, chips above them doubled every fact (live-seen).
   *  Returns the release; use it as an effect: `useEffect(() => suppressChips(), [suppressChips])`. */
  suppressChips(): () => void;
  /** Hide the shell's step heading while the caller is mounted — for blocks
   *  that bring their own (SummaryStep "Alles richtig?", SuccessStep). */
  suppressHeading(): () => void;
  /** A StepNav announces itself while mounted (the shell renders one step at
   *  a time, so this is "the current step has a Weiter"). Returns the release. */
  registerNav(): () => void;
  /** True while a StepNav is mounted on the current step. A single pick
   *  (EntitySelectStep) moves the wizard on by itself ONLY when this is false:
   *  five live flows dead-ended on step 1 because the hook's `pick()` hands
   *  over `onSelect` and nobody called next() any more (inclou 24.09.2026). */
  hasNav(): boolean;
}

const WizardContext = createContext<WizardContextValue | null>(null);

/** The shell's navigation API for blocks rendered inside it (null outside a shell). */
export function useWizard(): WizardContextValue | null {
  return useContext(WizardContext);
}

export { clearJourneyDraft };

interface IntentWizardShellProps {
  /** Omit inside a PublicShell that already carries the title — otherwise the
   *  page shows the same heading twice (both render an <h1>). */
  title?: string;
  subtitle?: string;
  /** The step list — or leave it out and pass <WizardStep> children instead. */
  steps?: WizardStep[];
  currentStep: number;
  onStepChange: (step: number) => void;
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  /** Header back link. Defaults to the dashboard; pass false to hide it
   *  (public pages have no dashboard to go back to). */
  back?: { href: string; label: string } | false;
  /** The step forms — enables the draft, the answer chips and the error summary. */
  forms?: StepForm[];
  /** Persist the forms + step in localStorage under this key (namespaced per dashboard by the shell). */
  draftKey?: string;
  /** Optional start card on step 1: what this flow does, its steps, what to have at hand. */
  intro?: WizardIntro;
  /** The step content's surface. `card` = the dashboard's hosted-page card
   *  (white, rounded, shadow) so calendars, pills and inputs never float on
   *  the grey page; `plain` = no wrapper (inside a PublicShell card, or pages
   *  that draw their own cards). Default: `card` when `forms` are given and
   *  the route is not public, else `plain` — pages built before this prop
   *  keep their look. */
  surface?: 'card' | 'plain';
  children: ReactNode;
}

function describeWhen(savedAt: number): string {
  if (!savedAt || Date.now() - savedAt < 5 * 60_000) return t('wz_draft_just_now');
  const days = Math.floor((Date.now() - savedAt) / 86_400_000);
  if (days <= 0) return t('wz_draft_today');
  if (days === 1) return t('wz_draft_yesterday');
  return t('wz_draft_days_ago', { n: days });
}

// The start screen is shown on its own only the first time(s); the count lives
// per dashboard and flow, next to the draft.
function introStorageKey(key: string): string {
  return `${window.location.pathname}#intro:${key}`;
}

function introSeenCount(key: string): number {
  try {
    return Number(window.localStorage.getItem(introStorageKey(key)) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function bumpIntroSeen(key: string): void {
  try {
    window.localStorage.setItem(introStorageKey(key), String(introSeenCount(key) + 1));
  } catch {
    /* ignore */
  }
}

function focusWhenMounted(id: string, fallback: () => void) {
  let tries = 0;
  const attempt = () => {
    const el = document.getElementById(id);
    if (el) {
      (el as HTMLElement).focus();
      el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      return;
    }
    if (tries++ < 20) window.requestAnimationFrame(attempt);
    else fallback();
  };
  window.requestAnimationFrame(attempt);
}

export function IntentWizardShell({
  title,
  subtitle,
  steps: stepsProp,
  currentStep,
  onStepChange,
  loading,
  error,
  onRetry,
  back,
  forms,
  draftKey,
  intro: introProp,
  surface,
  children,
}: IntentWizardShellProps) {
  // Forms learn a field's step from the step it was filled on (drives "Ändern"
  // in the review when the page gave no `steps` map).
  useEffect(() => {
    setActiveWizardStep(currentStep);
    return () => setActiveWizardStep(undefined);
  }, [currentStep]);
  // <WizardStep> children → the step list + one content node per step; every
  // other child (the success screen) renders after the current step.
  const fromChildren = useMemo(() => {
    const defs: WizardStep[] = [];
    const nodes: ReactNode[] = [];
    const rest: ReactNode[] = [];
    Children.forEach(children, child => {
      if (isValidElement(child) && child.type === WizardStep) {
        const p = child.props as WizardStepProps;
        defs.push({ label: p.label, key: p.key, enabledIf: p.enabledIf, heading: p.heading, description: p.description, needs: p.needs });
        nodes.push(p.children ?? null);
      } else if (child !== null && child !== undefined && child !== false) {
        rest.push(child);
      }
    });
    return { defs, nodes, rest };
  }, [children]);
  const steps = stepsProp ?? fromChildren.defs;
  // A step whose `needs` are not met yet renders the way back, not its body.
  const unmet = (steps[currentStep - 1]?.needs ?? []).filter(k => (forms ?? []).some(f => f.keys.includes(k) && isEmptyValue(f.values[k])));
  const unmetNode: ReactNode = unmet.length > 0 ? (() => {
    const owner = (k: string) => (forms ?? []).find(f => f.keys.includes(k));
    const labels = unmet.map(k => { const f = owner(k); return f ? labelOf(f.entity, k) : k; });
    const target = Math.max(1, Math.min(...unmet.map(k => owner(k)?.stepOf(k) ?? currentStep - 1)));
    return (
      <div className="rounded-2xl border border-border bg-card p-6 space-y-3" role="status">
        <p className="text-sm text-muted-foreground">{t('wz_needs', { fields: labels.join(', ') })}</p>
        <Button type="button" variant="outline" onClick={() => onStepChange(target)}>{t('wz_needs_back', { step: target })}</Button>
      </div>
    );
  })() : null;
  // The step body: by position among the <WizardStep> children — or, when a
  // page rendered its WizardSteps conditionally ({step === 2 && <WizardStep>})
  // next to a `steps` prop, by label, else as the sole child. Live: a public
  // page did exactly that, nodes[1] was undefined from step 2 on and the
  // visitor saw only the heading — no fields, no "Weiter", green through
  // every gate. check-intents/check-public now reject the pattern; the shell
  // renders the step anyway for pages already deployed.
  const currentDef = steps[currentStep - 1];
  const byIndex = fromChildren.nodes[currentStep - 1];
  const byLabel = currentDef ? fromChildren.defs.findIndex(d => d.label === currentDef.label) : -1;
  const stepBody: ReactNode = byIndex !== undefined
    ? byIndex
    : byLabel >= 0
      ? fromChildren.nodes[byLabel]
      : fromChildren.nodes.length === 1
        ? fromChildren.nodes[0]
        : null;
  const content: ReactNode = fromChildren.defs.length > 0
    ? <>{unmetNode ?? stepBody}{fromChildren.rest}</>
    : children;
  const [searchParams, setSearchParams] = useSearchParams();
  const [returnTo, setReturnTo] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [draftInfo, setDraftInfo] = useState<{ savedAt: number } | null>(null);
  // Public pages sit inside PublicShell's card already; pages without forms
  // predate the `surface` prop and draw their own surfaces.
  const onPublicRoute = window.location.hash.startsWith('#/public');
  // No start screen on a public page: the PublicShell's title and subtitle
  // already say what the page does, and a visitor came to fill it in, not to
  // read a card and click "Los geht's" first (live: the intro repeated the
  // subtitle in a 640px column). A lane may still pass `intro` — it is
  // ignored here, so the decision does not depend on every lane knowing it.
  const intro = onPublicRoute ? undefined : introProp;
  // The start screen opens on its own only `autoShow` times (default once);
  // afterwards it sits behind the header button and `introOpen` shows it.
  const introKey = draftKey ?? title ?? 'flow';
  const introAutoShow = intro?.autoShow ?? 1;
  const [started, setStarted] = useState(() => !intro || introSeenCount(introKey) >= introAutoShow);
  const [introOpen, setIntroOpen] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [chipSuppressors, setChipSuppressors] = useState(0);
  const [headingSuppressors, setHeadingSuppressors] = useState(0);
  // Inside a PublicShell: take the wizard column instead of the form column.
  usePublicWizardColumn();
  const suppressHeading = useCallback(() => {
    setHeadingSuppressors(c => c + 1);
    return () => setHeadingSuppressors(c => Math.max(0, c - 1));
  }, []);
  const suppressChips = useCallback(() => {
    setChipSuppressors(c => c + 1);
    return () => setChipSuppressors(c => Math.max(0, c - 1));
  }, []);
  const contentRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const suspendedRef = useRef(false);
  // the draft key this shell has READ — saving waits for it. A key that changes
  // after mount (a public page's `beitrag-${frage ?? 'none'}` once the question
  // loads) used to be read never and then OVERWRITTEN with the empty form, so a
  // reload lost the participant's text (P-14, Abnahme 5).
  const restoredKeyRef = useRef<string | null>(null);
  // set by a restore: the save effect of the same commit still sees the empty forms
  const justRestoredRef = useRef(false);
  const formsRef = useRef<StepForm[] | undefined>(forms);
  formsRef.current = forms;

  // A step whose fields the owner's policy hid entirely has nothing left to
  // ask — skip it like `enabledIf: false`, so the visitor never sees a step
  // with a heading and no control (the render-smoke would call that a bug).
  const policyVersion = usePolicyVersion();
  const emptiedSteps = useMemo(() => {
    const out = new Set<number>();
    if (!forms || forms.length === 0) return out;
    for (let n = 1; n <= steps.length; n++) {
      let visible = 0;
      let hidden = 0;
      for (const f of forms) {
        for (const k of f.keys) if (f.stepOf(k) === n) visible++;
        for (const k of f.hiddenKeys ?? []) if (f.stepOf(k) === n) hidden++;
      }
      if (visible === 0 && hidden > 0) out.add(n);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forms, steps, policyVersion]);
  const enabledSteps = useMemo(
    () => steps.map((s, i) => (s.enabledIf === false || emptiedSteps.has(i + 1) ? 0 : i + 1)).filter(n => n > 0),
    [steps, emptiedSteps],
  );
  const total = enabledSteps.length;
  const position = Math.max(1, enabledSteps.indexOf(currentStep) + 1);
  const nextEnabled = enabledSteps.find(n => n > currentStep);
  const prevEnabled = [...enabledSteps].reverse().find(n => n < currentStep);

  const goTo = useCallback(
    (step: number, opts?: { focus?: string; returnTo?: number | null }) => {
      if (opts?.focus) pendingFocusRef.current = opts.focus;
      if (opts && 'returnTo' in opts) setReturnTo(opts.returnTo ?? null);
      onStepChange(step);
    },
    [onStepChange],
  );

  // a flow opened for one record starts after the steps that pick it (requestWizardStep)
  const stepRef = useRef(currentStep);
  stepRef.current = currentStep;
  const enabledRef = useRef(enabledSteps);
  enabledRef.current = enabledSteps;
  useEffect(() => onWizardStepRequest(step => {
    if (stepRef.current !== 1) return;          // the person moved already
    const to = enabledRef.current.find(n => n >= step);
    if (!to || to === 1) return;
    setStarted(true);
    onStepChange(to);
  }), [onStepChange]);

  const next = useCallback(() => {
    if (returnTo !== null && returnTo !== currentStep) {
      setReturnTo(null);
      onStepChange(returnTo);
      return;
    }
    if (nextEnabled) onStepChange(nextEnabled);
  }, [returnTo, currentStep, nextEnabled, onStepChange]);

  const prev = useCallback(() => {
    if (prevEnabled) onStepChange(prevEnabled);
  }, [prevEnabled, onStepChange]);

  // Called by SuccessStep on mount. Owned here so completion never depends
  // on the page wiring the same draftKey into the runner as into the shell.
  const markCompleted = useCallback(() => {
    if (draftKey) clearJourneyDraft(draftKey);
    suspendedRef.current = true;
    setDraftInfo(null);
    setCompleted(true);
  }, [draftKey]);

  // Back on step 1 (a "one more" action restarted the journey): live again.
  useEffect(() => {
    if (currentStep === 1) setCompleted(false);
  }, [currentStep]);

  // A step that just became disabled while the user is on it: move on.
  useEffect(() => {
    if (steps[currentStep - 1]?.enabledIf === false || emptiedSteps.has(currentStep)) {
      const target = enabledSteps.find(n => n > currentStep) ?? enabledSteps[enabledSteps.length - 1] ?? 1;
      if (target !== currentStep) onStepChange(target);
    }
  }, [steps, currentStep, enabledSteps, emptiedSteps, onStepChange]);

  // Sync step to URL params
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (currentStep > 1) {
      params.set('step', String(currentStep));
    } else {
      params.delete('step');
    }
    setSearchParams(params, { replace: true });
  }, [currentStep, searchParams, setSearchParams]);

  // the shell keeps this key's form values — useJourneySubmit then leaves them alone
  useEffect(() => (draftKey ? claimJourneyDraft(draftKey) : undefined), [draftKey]);

  // Restore the draft (wins over ?step=) on mount AND whenever the key becomes
  // another one; else read the step from the URL (first mount only).
  useEffect(() => {
    const first = restoredKeyRef.current === null;
    if (draftKey && restoredKeyRef.current === draftKey) return;
    restoredKeyRef.current = draftKey ?? '';
    const draft = draftKey && formsRef.current ? readJourneyDraft(draftKey) : null;
    if (draft) {
      justRestoredRef.current = true;
      formsRef.current?.forEach((f, i) => {
        if (draft.data[i]) f.reset(draft.data[i], draft.labels?.[i]);
      });
      setDraftInfo({ savedAt: draft.savedAt });
      setStarted(true);
      // Resume where the work actually stands: the saved step — unless an
      // EARLIER step still has a required answer missing (page state the
      // forms never saw, a discarded pick). Landing on a later step with a
      // hole behind it showed an empty summary once; the hole is the step.
      let target = Math.min(Math.max(draft.step, 1), steps.length);
      formsRef.current?.forEach((f, i) => {
        const data = draft.data[i] ?? {};
        for (const key of f.keys) {
          const s = f.stepOf(key);
          if (s !== undefined && s < target && f.required(key) && isUnfilled(f.entity, key, data[key])) target = s;
        }
      });
      if (target !== currentStep) onStepChange(target);
      return;
    }
    if (!first) return;
    const urlStep = parseInt(searchParams.get('step') ?? '', 10);
    if (urlStep >= 1 && urlStep <= steps.length && urlStep !== currentStep) {
      setStarted(true);
      onStepChange(urlStep);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // Save the draft on every change — suspended after a success cleared it,
  // until the wizard is back on step 1 (a success step must not re-write the
  // draft it just removed; live-seen on the first run of an earlier version).
  const valuesSignature = forms ? JSON.stringify(forms.map(f => f.values)) : '';
  useEffect(() => {
    if (!draftKey || !forms) return;
    if (restoredKeyRef.current !== draftKey) return;   // not read yet — never overwrite it
    if (justRestoredRef.current) { justRestoredRef.current = false; return; }
    if (suspendedRef.current) {
      if (currentStep !== 1) return;
      suspendedRef.current = false;
    }
    // No answers → no draft. A step number alone is not worth resuming, and
    // saving one produced "Entwurf fortgesetzt" over an empty summary after a
    // reload on ?step=3 (live-seen). Whatever was stored before goes too.
    const anyValue = forms.some(f => Object.values(f.values).some(v => !isEmptyValue(v)));
    if (!anyValue) {
      removeJourneyDraft(draftKey);
      return;
    }
    writeJourneyDraft(draftKey, {
      step: currentStep,
      data: forms.map(f => f.values),
      labels: forms.map(f => f.labels),
      savedAt: Date.now(),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, currentStep, valuesSignature]);

  useEffect(() => {
    if (!draftKey) return;
    const onCleared = (e: Event) => {
      if ((e as CustomEvent<string>).detail === draftKey) {
        suspendedRef.current = true;
        setDraftInfo(null);
      }
    };
    window.addEventListener(DRAFT_CLEARED_EVENT, onCleared);
    return () => window.removeEventListener(DRAFT_CLEARED_EVENT, onCleared);
  }, [draftKey]);

  // Step change: announce it and move focus — into the field a "Change" link
  // asked for, otherwise onto the step content.
  useEffect(() => {
    const label = steps[currentStep - 1]?.label ?? '';
    setAnnouncement(t('wz_progress_label', { n: position, total, label }));
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const focusContent = () => contentRef.current?.focus({ preventScroll: true });
    const wanted = pendingFocusRef.current;
    pendingFocusRef.current = null;
    if (wanted) focusWhenMounted(wanted, focusContent);
    else focusContent();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  const discardDraft = () => {
    if (draftKey) clearJourneyDraft(draftKey);
    forms?.forEach(f => f.reset());
    setDraftInfo(null);
    setReturnTo(null);
    // NOT setStarted(false): the start screen shows once, then behind the
    // button. Re-opening it on every discard was the "shows every time"
    // live-seen on Pension Direkt (intro seen-count climbed to 3).
    onStepChange(1);
  };

  // StepNavs on the current step, counted — a ref, not state: the pick reads
  // it at click time and nothing needs to re-render when a nav mounts.
  const navCountRef = useRef(0);
  const registerNav = useCallback(() => {
    navCountRef.current += 1;
    return () => { navCountRef.current -= 1; };
  }, []);
  const hasNav = useCallback(() => navCountRef.current > 0, []);

  const ctx = useMemo<WizardContextValue>(
    () => ({
      step: currentStep,
      position,
      total,
      steps,
      enabledSteps,
      nextLabel: nextEnabled ? steps[nextEnabled - 1]?.label : undefined,
      returnTo,
      goTo,
      next,
      prev,
      markCompleted,
      completed,
      suppressChips,
      suppressHeading,
      registerNav,
      hasNav,
    }),
    [currentStep, position, total, steps, enabledSteps, nextEnabled, returnTo, goTo, next, prev, markCompleted, completed, suppressChips, suppressHeading, registerNav, hasNav],
  );

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="flex gap-2">
          {steps.map((_, i) => <Skeleton key={i} className="h-2 flex-1 rounded-full" />)}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col items-center justify-center py-24 gap-4" role="alert">
          <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <IconAlertCircle size={22} className="text-destructive" />
          </div>
          <div className="text-center">
            <h3 className="font-semibold text-foreground mb-1">{t('load_error_title')}</h3>
            <p className="text-sm text-muted-foreground max-w-xs">{error.message}</p>
          </div>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>{t('retry')}</Button>
          )}
        </div>
      </div>
    );
  }

  const chips = (forms ?? [])
    .flatMap(f => f.summary())
    .filter(r => r.step !== undefined && r.step < currentStep && r.value !== '—');
  const showIntro = Boolean(intro) && ((currentStep === 1 && !started) || introOpen);
  const currentLabel = steps[currentStep - 1]?.label ?? '';
  const introMinutes = intro?.estimatedMinutes ?? Math.max(1, Math.ceil(enabledSteps.length * 0.5));
  const introNeeds = intro?.needs ?? [];
  const startFlow = () => {
    if (!started) bumpIntroSeen(introKey);
    setStarted(true);
    setIntroOpen(false);
  };
  const resolvedSurface: 'card' | 'plain' =
    surface ?? (forms && forms.length > 0 && !onPublicRoute ? 'card' : 'plain');
  const contentClass =
    resolvedSurface === 'card'
      ? 'rounded-[27px] bg-card shadow-lg p-5 sm:p-8 outline-none space-y-4'
      : 'outline-none space-y-4';

  return (
    <WizardContext.Provider value={ctx}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>

        {/* Header */}
        <div>
          {/* The default back target is the DASHBOARD — on a public route an
              anonymous visitor has no session there, so the shell suppresses
              its default itself instead of relying on every public page to
              remember `back={false}`. An explicit `back` object still wins. */}
          {back !== false && (back || !window.location.hash.startsWith('#/public')) && (
            <a href={back?.href ?? '#/'} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2">
              <IconArrowLeft size={14} className="shrink-0" />
              {back?.label ?? t('wizard_back_to_dashboard')}
            </a>
          )}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {title && <h1 className="text-2xl font-bold tracking-tight">{title}</h1>}
              {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
            {/* „Anpassen“ — the owner's way from the flow to where it is
                described and changed („Deine Anwendung“, deep-linked to this
                flow's group). Never on a public route: a visitor owns nothing. */}
            {draftKey && !onPublicRoute && (
              <a
                href={`#/verwaltung/anwendung?line=${encodeURIComponent(`intent:${draftKey}`)}`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <IconAdjustmentsHorizontal size={16} aria-hidden="true" />
                {t('wz_adjust')}
              </a>
            )}
            {intro && !showIntro && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIntroOpen(true)}
                className="shrink-0 gap-1.5 text-muted-foreground"
                aria-expanded={false}
              >
                <IconInfoCircle size={16} aria-hidden="true" />
                {t('wz_intro_button')}
              </Button>
            )}
            </div>
          </div>
        </div>

        {draftInfo && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-2.5 text-sm" role="status">
            <IconHistory size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-0">{t('wz_draft_resumed', { when: describeWhen(draftInfo.savedAt) })}</span>
            <Button type="button" variant="ghost" size="sm" onClick={discardDraft}>{t('wz_draft_discard')}</Button>
          </div>
        )}

        {/* Step indicator — a symmetric META element, so it centers as a
            compact group (fixed connectors, no stretching). The CONTENT column
            around it (title, description, fields) stays on the left reading
            axis — do not center those. */}
        <nav aria-label={t('wz_steps_nav')} className="space-y-2">
          <ol className="flex items-start justify-center list-none m-0 p-0">
            {steps.map((step, idx) => {
              const n = idx + 1;
              if (step.enabledIf === false || !enabledSteps.includes(n)) return null;
              const pos = enabledSteps.indexOf(n) + 1;
              const isDone = completed || n < currentStep;
              const isCurrent = !completed && n === currentStep;
              const navigable = isDone && !completed;
              const isLast = pos === total;
              return (
                <li key={step.key ?? idx} className="flex items-start min-w-0">
                  <button
                    type="button"
                    onClick={navigable ? () => goTo(n) : undefined}
                    disabled={completed || n > currentStep}
                    aria-current={isCurrent ? 'step' : undefined}
                    aria-label={`${step.label} (${pos}/${total})${isDone ? ` – ${t('wz_step_done')}` : ''}`}
                    className={`flex flex-col items-center gap-1 min-w-0 rounded-xl px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                      navigable ? 'cursor-pointer' : 'cursor-default'
                    } disabled:cursor-default`}
                  >
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 transition-colors ${
                        isDone
                          ? 'bg-primary text-primary-foreground'
                          : isCurrent
                            ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                            : 'bg-muted text-muted-foreground'
                      }`}
                      aria-hidden="true"
                    >
                      {isDone ? <IconCheck size={14} stroke={2.5} /> : pos}
                    </span>
                    <span
                      className={`text-[11px] sm:text-xs font-medium leading-tight text-center max-w-[4.5rem] sm:max-w-[7rem] ${
                        isCurrent ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    >
                      {step.label}
                    </span>
                  </button>
                  {!isLast && (
                    /* h-0.5 line vertically centered on the 32px dot: (32-2)/2 + the button padding */
                    <div
                      className={`h-0.5 w-4 sm:w-12 mt-[17px] mx-1 sm:mx-1.5 shrink-0 transition-colors ${isDone ? 'bg-primary' : 'bg-muted'}`}
                      aria-hidden="true"
                    />
                  )}
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-muted-foreground text-center">
            {completed ? t('wz_completed') : t('wz_progress', { n: position, total })}
          </p>
        </nav>

        {chips.length > 0 && !showIntro && !completed && chipSuppressors === 0 && (
          <div className="flex flex-wrap gap-2" aria-label={t('wz_answers')}>
            {chips.map(c => (
              <button
                key={c.key}
                type="button"
                onClick={() => goTo(c.step as number, { focus: c.fieldId, returnTo: currentStep })}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                title={t('ss_change')}
              >
                <span className="text-muted-foreground">{c.label}:</span>
                <span className="font-medium truncate max-w-[14rem]">{withRecordNames(c.value, t('v_record_unnamed'))}</span>
              </button>
            ))}
          </div>
        )}

        {/* Step content */}
        <div
          ref={contentRef}
          tabIndex={-1}
          role="region"
          aria-label={currentLabel}
          className={contentClass}
        >
          {showIntro && intro ? (
            <div
              className={`${resolvedSurface === 'card' ? '' : 'rounded-[27px] bg-card shadow-lg p-6 sm:p-8 '}space-y-8`}
              data-journey-intro=""
            >
              {/* Headline zone — the header above already carries the title. */}
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t('wz_intro_eyebrow')}</p>
                  {intro.description && (
                    <p className="text-xl sm:text-2xl leading-snug font-semibold tracking-tight max-w-2xl">{intro.description}</p>
                  )}
                  <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground tabular-nums">
                    <span>{tp('wz_intro_steps_count', total, { n: total })}</span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <IconClock size={14} aria-hidden="true" />
                      {t('wz_intro_minutes', { n: introMinutes })}
                    </span>
                  </p>
                </div>
                {introOpen && (
                  <button
                    type="button"
                    onClick={() => setIntroOpen(false)}
                    className="shrink-0 h-9 w-9 rounded-full border border-input bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    aria-label={t('wz_intro_close')}
                  >
                    <IconX size={18} aria-hidden="true" />
                  </button>
                )}
              </div>

              {/* Steps as a numbered list, one per line — and beside it what to
                  have at hand. Pills are reserved for answers and choices. */}
              <div className={`grid gap-6 ${introNeeds.length > 0 ? 'md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:gap-10' : ''}`}>
                <ol className="list-none m-0 p-0" aria-label={t('wz_intro_steps')}>
                  {enabledSteps.map((n, idx) => (
                    <li key={n} className="relative flex items-start gap-3 pb-4 last:pb-0">
                      {idx < enabledSteps.length - 1 && (
                        <span className="absolute left-[13px] top-7 bottom-0 w-px bg-border" aria-hidden="true" />
                      )}
                      <span
                        className="relative z-[1] w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center tabular-nums shrink-0"
                        aria-hidden="true"
                      >
                        {idx + 1}
                      </span>
                      <span className="text-base font-medium leading-7">{steps[n - 1]?.label}</span>
                    </li>
                  ))}
                </ol>

                {introNeeds.length > 0 && (
                  <div className="rounded-2xl border border-border bg-muted/30 p-4 sm:p-5 self-start">
                    <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <IconClipboardList size={14} aria-hidden="true" />
                      {t('wz_intro_needs')}
                    </p>
                    <ul className="mt-3 space-y-2 list-none p-0">
                      {introNeeds.map(need => (
                        <li key={need} className="flex items-start gap-2 text-sm">
                          <IconCheck size={16} className="text-primary shrink-0 mt-0.5" aria-hidden="true" />
                          <span>{need}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4 border-t border-border pt-6">
                <Button type="button" onClick={startFlow} size="lg" className="gap-2" autoFocus data-journey-start="">
                  {intro.startLabel ?? t('wz_intro_start')}
                  <IconArrowRight size={18} aria-hidden="true" />
                </Button>
                <p className="text-sm text-muted-foreground">
                  {draftKey ? t('wz_intro_autosave') : t('wz_intro_once')}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* What am I doing here? The step's name as a real heading — the
                  indicator only carries it as a caption under a dot, and a card
                  that opens with bare fields left users guessing (live). Blocks
                  with their own heading (summary, success) suppress it. */}
              {headingSuppressors === 0 && (steps[currentStep - 1]?.heading ?? currentLabel) && (
                <div className="space-y-1" data-journey-step-heading="">
                  <h2 className="text-lg font-semibold tracking-tight">{steps[currentStep - 1]?.heading ?? currentLabel}</h2>
                  {steps[currentStep - 1]?.description && (
                    <p className="text-sm text-muted-foreground max-w-prose">{steps[currentStep - 1]?.description}</p>
                  )}
                </div>
              )}
              {forms && forms.length > 0 && <FieldErrorSummary forms={forms} step={currentStep} />}
              {content}
            </>
          )}
        </div>
      </div>
    </WizardContext.Provider>
  );
}
