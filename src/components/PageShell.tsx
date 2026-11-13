import type { ReactNode } from 'react';

interface PageShellProps {
  title: string;
  subtitle: string;
  action?: ReactNode;
  /** small marker beside the title, e.g. „Beta“ */
  badge?: ReactNode;
  children: ReactNode;
}

export function PageShell({ title, subtitle, action, badge, children }: PageShellProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-normal">
            {title}
            {badge != null && <span className="ml-2 align-middle">{badge}</span>}
          </h1>
          <p className="text-base text-foreground mt-1">{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}