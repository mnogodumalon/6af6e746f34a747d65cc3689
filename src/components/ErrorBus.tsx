import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { toast, Toaster } from 'sonner';
import { t } from '@/i18n';


/** Window `error` events that are notices, not failures — never a toast. */
const BENIGN_BROWSER_NOTICES: RegExp[] = [/ResizeObserver loop/];

const APPGROUP_ID = '6af6e746f34a747d65cc3689';
const REPAIR_ENDPOINT = '/claude/build/repair';
const DEDUP_WINDOW_MS = 5000;
const TOAST_DURATION_MS = 10000;

const USER_TYPES = new Set<string>([
  'validation-error',
  'required-field-missing',
  'unique-constraint-violation',
]);

const BUG_TYPES = new Set<string>([
  'illegal-field-value',
  'unsupported-field-value',
  'unknown-control',
  'invalid-request-body',
]);

type ErrorSource = 'api' | 'promise' | 'js' | 'network';
type ErrorCategory = 'user' | 'bug' | 'transient' | 'auth' | 'forbidden';

export interface ErrorPayload {
  source: ErrorSource;
  type?: string;
  status?: number;
  control_identifier?: string;
  control_type?: string;
  field_type?: string;
  detail?: string;
  message?: string;
  stack?: string;
}

function classify(err: ErrorPayload): ErrorCategory {
  // 401: the Layout login screen is the surface for this — a repair run
  // cannot fix a missing session. 403: signed in, but without the right for
  // this list — a plain notice, never a repair offer (05.10.2026).
  if (err.status === 401) return 'auth';
  if (err.status === 403) return 'forbidden';
  if (err.source === 'network') return 'transient';
  if (typeof err.status === 'number' && err.status >= 500) return 'transient';
  if (err.type && USER_TYPES.has(err.type)) return 'user';
  if (err.type && BUG_TYPES.has(err.type)) return 'bug';
  if (err.source === 'js' || err.source === 'promise') return 'bug';
  return 'bug';
}

function dedupKey(err: ErrorPayload): string {
  const msg = (err.message || err.detail || '').slice(0, 80);
  return [
    err.source,
    err.type ?? '',
    err.control_identifier ?? '',
    err.status ?? '',
    msg,
  ].join(':');
}

interface ErrorBusValue {
  emit: (err: ErrorPayload) => void;
}

const ErrorBusContext = createContext<ErrorBusValue | null>(null);

export function useErrorBus(): ErrorBusValue {
  const ctx = useContext(ErrorBusContext);
  if (!ctx) throw new Error('useErrorBus must be used within ErrorBusProvider');
  return ctx;
}

async function runRepair(err: ErrorPayload): Promise<void> {
  const toastId = toast.loading(t('repair_starting'));
  const errorContext = JSON.stringify({
    type: err.type || 'api_error',
    source: err.source,
    status: err.status,
    control_identifier: err.control_identifier,
    control_type: err.control_type,
    field_type: err.field_type,
    detail: err.detail,
    message: err.message,
    stack: err.stack,
    url: window.location.href,
  });

  try {
    const resp = await fetch(REPAIR_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ appgroup_id: APPGROUP_ID, error_context: errorContext }),
    });

    if (!resp.ok || !resp.body) {
      toast.error(t('repair_failed'), { id: toastId });
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finished = false;

    while (!finished) {
      const { value, done: readerDone } = await reader.read();
      if (readerDone) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith('data: ')) continue;
        const content = line.slice(6);
        if (content.startsWith('[STATUS]')) {
          toast.loading(content.replace(/^\[STATUS]\s*/, ''), { id: toastId });
        }
        if (content.startsWith('[DONE]')) {
          toast.success(t('repair_done_desc'), { id: toastId, duration: 12000 });
          finished = true;
        }
        if (content.startsWith('[ERROR]') && !content.includes('Dashboard-Links')) {
          toast.error(t('repair_failed'), { id: toastId });
          finished = true;
        }
      }
    }

    if (!finished) {
      toast.error(t('repair_failed'), { id: toastId });
    }
  } catch {
    toast.error(t('repair_failed'), { id: toastId });
  }
}

export function ErrorBusProvider({ children }: { children: ReactNode }) {
  const seen = useRef<Map<string, number>>(new Map());

  const emit = useCallback((err: ErrorPayload) => {
    const key = dedupKey(err);
    const now = Date.now();
    const last = seen.current.get(key);
    if (last && now - last < DEDUP_WINDOW_MS) return;
    seen.current.set(key, now);

    const category = classify(err);
    if (category === 'user' || category === 'auth') return;
    if (category === 'forbidden') {
      toast.error(t('perm_denied_title'), { description: t('perm_denied_desc'), duration: TOAST_DURATION_MS });
      return;
    }

    if (category === 'transient') {
      const isServerError = typeof err.status === 'number' && err.status >= 500;
      toast.error(isServerError ? t('toast_server_title') : t('toast_network_title'), {
        description: err.message || err.detail || (isServerError ? t('toast_server_desc') : t('toast_network_desc')),
        action: {
          label: t('repair_reload'),
          onClick: () => window.location.reload(),
        },
        duration: TOAST_DURATION_MS,
      });
      return;
    }

    // A visitor on a public page is not the owner: no „Dashboard reparieren“
    // for them (audit 02.11.2026 — the offer started the repair agent with
    // the service key from a page anyone can open).
    if (window.location.hash.startsWith('#/public')) {
      toast.error(t('repair_error_title'), { description: err.detail || err.message || t('toast_bug_desc'), duration: TOAST_DURATION_MS });
      return;
    }
    toast.error(t('repair_error_title'), {
      description: err.detail || err.message || t('toast_bug_desc'),
      action: {
        label: t('repair_text'),
        onClick: () => { void runRepair(err); },
      },
      duration: TOAST_DURATION_MS,
    });
  }, []);

  useEffect(() => {
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail as ErrorPayload | undefined;
      if (detail) emit(detail);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason: unknown = e.reason;
      // Aborted work is not failure. React 19's Navigation-API integration
      // runs view transitions the browser may skip (reload mid-flight,
      // rapid navigation) — the promise rejects with `AbortError:
      // Transition was skipped`, uncaught by React. lib/sentry.ts filters
      // this for the REPORT channel; this is the TOAST channel and needs
      // its own filter, otherwise every skipped animation toasts a bug.
      // Cancelled fetches reject with AbortError too — same verdict.
      if (
        (reason instanceof DOMException && reason.name === 'AbortError') ||
        (reason instanceof Error && reason.message.includes('Transition was skipped'))
      ) return;
      const message =
        reason instanceof Error ? reason.message :
        typeof reason === 'string' ? reason :
        'Unhandled rejection';
      const stack = reason instanceof Error ? (reason.stack ?? '') : '';
      emit({
        source: 'promise',
        message,
        stack: stack.split('\n').slice(0, 10).join('\n'),
      });
    };
    const onError = (e: ErrorEvent) => {
      // Browsers report a ResizeObserver callback that changed layout again
      // in the same frame as a window `error` event — „ResizeObserver loop
      // completed with undelivered notifications“ (Chrome, Safari) or „… loop
      // limit exceeded“ (Firefox). It is a notice, not a failure: the
      // observer simply delivers in the next frame, nothing is lost. Below
      // 800 px the sidebar collapse and the measured stat cards trigger it,
      // and every owner saw „Etwas ist schiefgelaufen · Dashboard reparieren“
      // for it (issue 30.09.2026). The console keeps the trace for developers.
      if (BENIGN_BROWSER_NOTICES.some(re => re.test(e.message ?? ''))) {
        console.warn('[ErrorBus] benign browser notice, not shown:', e.message);
        return;
      }
      emit({
        source: 'js',
        message: e.message,
        stack: (e.error?.stack ?? '').split('\n').slice(0, 10).join('\n'),
      });
    };

    window.addEventListener('errorbus:emit', onCustom);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('errorbus:emit', onCustom);
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, [emit]);

  return (
    <ErrorBusContext.Provider value={{ emit }}>
      {children}
      <Toaster position="bottom-right" richColors closeButton />
    </ErrorBusContext.Provider>
  );
}
