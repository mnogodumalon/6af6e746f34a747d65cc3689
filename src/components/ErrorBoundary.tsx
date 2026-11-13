import { Component, type ReactNode, type ErrorInfo } from 'react';
import * as Sentry from '@sentry/react';
import { errorTags } from '@/lib/sentry';
import { IconAlertTriangle, IconRefresh, IconTool, IconCheck } from '@tabler/icons-react';
import { t } from '@/i18n';

const APPGROUP_ID = '6af6e746f34a747d65cc3689';
const REPAIR_ENDPOINT = '/claude/build/repair';

/** Public routes are open to strangers, so a crash there must NOT offer the
 *  repair agent: every click starts a sandbox build, and `/build/repair`
 *  falls back to the server's own API key when a request carries no session
 *  cookie — an anonymous visitor could otherwise trigger builds at will.
 *  They also must not read a raw error message. Crashes are still reported
 *  to Sentry (tagged `public`), so nothing is lost on our side; the visitor
 *  just gets a plain retry. */
function isPublicRoute(): boolean {
  return window.location.hash.startsWith('#/public');
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string;
  repairing: boolean;
  repairStatus: string;
  repairDone: boolean;
  repairFailed: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = {
    hasError: false,
    error: null,
    componentStack: '',
    repairing: false,
    repairStatus: '',
    repairDone: false,
    repairFailed: false,
  };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? '' });
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info.componentStack ?? '' } },
      tags: {
        ...errorTags(),
        appgroup_id: APPGROUP_ID,
        source: 'error_boundary',
        surface: isPublicRoute() ? 'public' : 'app',
      },
    });
  }

  handleRepair = async () => {
    this.setState({ repairing: true, repairStatus: t('repair_starting'), repairFailed: false });

    const errorContext = JSON.stringify({
      type: 'render_crash',
      message: this.state.error?.message ?? 'Unknown error',
      stack: (this.state.error?.stack ?? '').split('\n').slice(0, 10).join('\n'),
      componentStack: this.state.componentStack.split('\n').slice(0, 8).join('\n'),
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
        this.setState({ repairing: false, repairFailed: true, repairStatus: `HTTP ${resp.status}` });
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data: ')) continue;
          const content = line.slice(6);
          if (content.startsWith('[STATUS]')) {
            this.setState({ repairStatus: content.replace(/^\[STATUS]\s*/, '') });
          }
          if (content.startsWith('[DONE]')) {
            this.setState({ repairDone: true, repairing: false });
          }
          if (content.startsWith('[ERROR]') && !content.includes('Dashboard-Links')) {
            this.setState({ repairFailed: true });
          }
        }
      }

      if (!this.state.repairDone) {
        this.setState({ repairing: false, repairFailed: true });
      }
    } catch (err) {
      this.setState({ repairing: false, repairFailed: true, repairStatus: String(err) });
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { repairing, repairDone, repairFailed, repairStatus } = this.state;

    return (
      // data-testid: the ONLY reliable signal that a page died. A caught error
      // never reaches Playwright's `pageerror`, so an automated render check
      // has to look for this node in the DOM — React #310 took a whole
      // dashboard down while the build stayed green.
      <div data-testid="error-boundary-fallback" className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
        <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
          {repairDone
            ? <IconCheck size={22} className="text-green-500" />
            : <IconAlertTriangle size={22} className="text-destructive" />}
        </div>
        <div className="text-center">
          <h3 className="font-semibold text-foreground mb-1">
            {repairDone ? t('repair_done_title') : t('repair_error_title')}
          </h3>
          <p className="text-sm text-muted-foreground max-w-md">
            {repairDone
              ? t('repair_done_desc')
              : repairing
                ? repairStatus
                : isPublicRoute()
                  ? t('pf_error_generic_text')
                  : this.state.error?.message}
          </p>
        </div>
        <div className="flex gap-2">
          {repairDone ? (
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <IconRefresh size={14} />
              {t('repair_reload')}
            </button>
          ) : isPublicRoute() ? (
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <IconRefresh size={14} />
              {t('repair_reload')}
            </button>
          ) : (
            <>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
              >
                <IconRefresh size={14} />
                {t('repair_reload')}
              </button>
              <button
                onClick={this.handleRepair}
                disabled={repairing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {repairing
                  ? <span className="inline-block w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  : <IconTool size={14} />}
                {repairing ? t('repair_running') : t('repair_text')}
              </button>
            </>
          )}
        </div>
        {repairFailed && !repairDone && (
          <p className="text-sm text-destructive">{t('repair_failed')}</p>
        )}
      </div>
    );
  }
}
