'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

export const LEADERBOARD_TOOLTIP_TEXT = {
  sharing: {
    community: 'Verified community solutions are shared automatically. Rankings remain open.',
    daily:
      'Leaderboard solutions are shared automatically after daily close. Archive rankings remain open.',
  },
  actions: {
    top: 'Top rankings',
    aroundMe: 'Rankings around me',
    refresh: 'Refresh standings',
  },
  columns: {
    rank: 'Your rank is determined by cost, tiles, attempts, time, and path in that order.',
    name: 'Player nickname.',
    cost: 'Total force cost. Lower values rank better.',
    tiles: 'Number of enabled force tiles. Fewer tiles rank better.',
    attempts:
      "Number of attempts until solve of the player's first verified solve. Fewer attempts rank better.",
    time: 'Simulated completion time in seconds. Faster times rank better.',
    path: 'Distance traveled by the goal ball. Shorter paths rank better.',
    replay: "Watch this player's best verified solution.",
  },
} as const;

type TooltipTriggerProps = { 'aria-describedby': string };

export function LeaderboardTooltip({
  content,
  className = '',
  children,
}: {
  content: string;
  className?: string;
  children: (props: TooltipTriggerProps) => ReactNode;
}) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: -9999, top: -9999, above: false });
  const place = useCallback(() => {
    if (!anchor.current) return;
    const rect = anchor.current.getBoundingClientRect();
    const width = tooltip.current?.offsetWidth ?? 240;
    const height = tooltip.current?.offsetHeight ?? 40;
    const above = rect.bottom + height + 8 > globalThis.innerHeight && rect.top > height + 8;
    setPosition({
      left: Math.min(
        globalThis.innerWidth - width / 2 - 8,
        Math.max(width / 2 + 8, rect.left + rect.width / 2),
      ),
      top: above ? rect.top - 7 : rect.bottom + 7,
      above,
    });
  }, []);
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, content]);
  useEffect(() => {
    if (!open) return;
    globalThis.addEventListener('resize', place);
    globalThis.addEventListener('scroll', place, true);
    return () => {
      globalThis.removeEventListener('resize', place);
      globalThis.removeEventListener('scroll', place, true);
    };
  }, [open, place]);
  return (
    <span
      className={`leaderboard-tooltip-anchor ${className}`.trim()}
      ref={anchor}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      {children({ 'aria-describedby': id })}
      {open &&
        createPortal(
          <span
            className="leaderboard-floating-tooltip"
            id={id}
            role="tooltip"
            ref={tooltip}
            data-placement={position.above ? 'above' : 'below'}
            style={{ left: position.left, top: position.top }}
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  );
}

export function ColumnLabel({
  label,
  help,
  children = label,
}: {
  label: string;
  help: string;
  children?: ReactNode;
}) {
  return (
    <LeaderboardTooltip content={help}>
      {(tooltipProps) => (
        <span
          className="leaderboard-column-label"
          tabIndex={0}
          aria-label={label}
          {...tooltipProps}
        >
          {children}
        </span>
      )}
    </LeaderboardTooltip>
  );
}
