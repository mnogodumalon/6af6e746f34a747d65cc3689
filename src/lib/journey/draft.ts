/**
 * Draft persistence for a journey — localStorage, namespaced per dashboard.
 *
 * Dashboards share one origin (`my.living-apps.de`), so the key carries the
 * pathname (`/objects/<appgroup>/`) — a draft of one dashboard never leaks
 * into another (live-seen once). All storage access is try/catch: private
 * mode, quota, or a blocked API must never break the wizard.
 */
export const DRAFT_CLEARED_EVENT = 'journey-draft-cleared';

export interface JourneyDraft {
  step: number;
  /** One entry per form, in the order the shell received them. */
  data: Array<Record<string, unknown>>;
  labels?: Array<Record<string, string>>;
  savedAt: number;
}

/** A draft older than this is not "your work from earlier" any more. */
export const DRAFT_MAX_AGE_MS = 30 * 86_400_000;

export function draftStorageKey(draftKey: string): string {
  return `${window.location.pathname}#${draftKey}`;
}

function filled(v: unknown): boolean {
  if (v === undefined || v === null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/** True when the draft carries at least one answer — a step number alone is
 *  not worth resuming (a reload on step 3 with nothing typed produced exactly
 *  that: "Entwurf fortgesetzt" over an empty summary, live-seen). */
export function draftHasValues(draft: Pick<JourneyDraft, 'data'>): boolean {
  return draft.data.some(d => Object.values(d ?? {}).some(filled));
}

const EXTRA_SEP = ':';
const noFiles = (_k: string, v: unknown) => (typeof v === 'string' && v.startsWith('data:') ? undefined : v);

/** Side data of a draft that is not a form value — the record an update flow
 *  picked, the entries of a list — kept under the draft's key and cleared with
 *  it (J-8, 03.11.2026: a reload mid-update lost the target, the review showed
 *  no record). `null` removes the entry. */
export function writeJourneyExtra(draftKey: string, name: string, value: unknown): void {
  try {
    const key = `${draftStorageKey(draftKey)}${EXTRA_SEP}${name}`;
    if (value === null || value === undefined) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value, noFiles));
  } catch {
    /* storage unavailable */
  }
}

export function readJourneyExtra<T>(draftKey: string, name: string): T | null {
  try {
    const raw = window.localStorage.getItem(`${draftStorageKey(draftKey)}${EXTRA_SEP}${name}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function removeExtras(draftKey: string): void {
  try {
    const prefix = `${draftStorageKey(draftKey)}${EXTRA_SEP}`;
    const gone: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(prefix)) gone.push(k);
    }
    gone.forEach(k => window.localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/** Removes the draft WITHOUT signalling completion (the shell keeps saving). */
export function removeJourneyDraft(draftKey: string): void {
  try {
    window.localStorage.removeItem(draftStorageKey(draftKey));
  } catch {
    /* ignore */
  }
  removeExtras(draftKey);
}

export function readJourneyDraft(draftKey: string): JourneyDraft | null {
  try {
    const raw = window.localStorage.getItem(draftStorageKey(draftKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<JourneyDraft>;
    if (!parsed || typeof parsed.step !== 'number' || !Array.isArray(parsed.data)) return null;
    const draft: JourneyDraft = { step: parsed.step, data: parsed.data, labels: parsed.labels, savedAt: parsed.savedAt ?? 0 };
    const stale = draft.savedAt > 0 && Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS;
    if (stale || !draftHasValues(draft)) {
      removeJourneyDraft(draftKey);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function writeJourneyDraft(draftKey: string, draft: JourneyDraft): void {
  try {
    // a chosen file (data URL, up to ~13 MB) never goes into the draft — it
    // would fill the storage and lose the whole draft; the person picks it again
    window.localStorage.setItem(draftStorageKey(draftKey), JSON.stringify(draft, noFiles));
  } catch {
    /* storage unavailable — the wizard still works, just without a draft */
  }
}

/** Removes the draft and tells the shell to stop saving until the wizard
 *  restarts — a success step must not re-write the draft it just cleared. */
export function clearJourneyDraft(draftKey: string): void {
  try {
    window.localStorage.removeItem(draftStorageKey(draftKey));
  } catch {
    /* ignore */
  }
  removeExtras(draftKey);
  try {
    window.dispatchEvent(new CustomEvent(DRAFT_CLEARED_EVENT, { detail: draftKey }));
  } catch {
    /* ignore */
  }
}


// Who keeps a draft's FORM values: IntentWizardShell when it is mounted with
// the key, else useJourneySubmit itself (a one-screen public form has no shell —
// K10a/P-14, Abnahme 7: the participant's text was lost on every reload). A
// counted claim, so two mounts of the same key cannot release each other.
const CLAIMS = new Map<string, number>();

/** The shell's claim on a draft key; call the returned function to release it. */
export function claimJourneyDraft(draftKey: string): () => void {
  CLAIMS.set(draftKey, (CLAIMS.get(draftKey) ?? 0) + 1);
  return () => {
    const n = (CLAIMS.get(draftKey) ?? 1) - 1;
    if (n <= 0) CLAIMS.delete(draftKey); else CLAIMS.set(draftKey, n);
  };
}

export function journeyDraftClaimed(draftKey: string): boolean {
  return (CLAIMS.get(draftKey) ?? 0) > 0;
}
