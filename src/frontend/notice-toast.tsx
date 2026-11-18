'use client';

import type { ReactNode } from 'react';
import { Icon } from './icon';

export function NoticeToast({
  children,
  action,
  actionLabel,
  dismissLabel,
  onDismiss,
}: {
  children: ReactNode;
  action?: () => void;
  actionLabel?: string;
  dismissLabel: string;
  onDismiss: () => void;
}) {
  return (
    <aside className="notice-toast" role="status" aria-live="polite" aria-atomic="true">
      <p>{children}</p>
      <div className="notice-toast-actions">
        {action && actionLabel && (
          <button className="notice-toast-action" onClick={action}>
            {actionLabel}
          </button>
        )}
        <button className="notice-toast-dismiss" aria-label={dismissLabel} onClick={onDismiss}>
          <Icon name="close" size={18} />
        </button>
      </div>
    </aside>
  );
}
