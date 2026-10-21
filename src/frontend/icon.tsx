import type { ReactNode } from 'react';

export type IconName =
  | 'home'
  | 'calendar'
  | 'stats'
  | 'profile'
  | 'trophy'
  | 'settings'
  | 'help'
  | 'close'
  | 'arrow'
  | 'reset'
  | 'play'
  | 'fire';

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };
  const paths: Record<IconName, ReactNode> = {
    home: (
      <>
        <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4M17 3v4M3 10h18M7 14h6M7 17h4" />
      </>
    ),
    stats: (
      <>
        <rect x="3" y="13" width="4" height="8" rx="1" />
        <rect x="10" y="8" width="4" height="13" rx="1" />
        <rect x="17" y="3" width="4" height="18" rx="1" />
      </>
    ),
    profile: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
      </>
    ),
    trophy: (
      <>
        <path d="M7 3h10v7a5 5 0 0 1-10 0zM7 5H4v3a4 4 0 0 0 4 4M17 5h3v3a4 4 0 0 1-4 4M12 15v4M8 21h8M10 19h4" />
      </>
    ),
    settings: (
      <>
        <path d="m9.5 3-.5 2a7 7 0 0 0-1.5.9l-2-.6-2.5 4.4 1.5 1.4a7 7 0 0 0 0 1.8L3 14.3l2.5 4.4 2-.6a7 7 0 0 0 1.5.9l.5 2h5l.5-2a7 7 0 0 0 1.5-.9l2 .6 2.5-4.4-1.5-1.4a7 7 0 0 0 0-1.8L21 9.7l-2.5-4.4-2 .6A7 7 0 0 0 15 5l-.5-2z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.2 9a3 3 0 0 1 5.6 1.5c0 2-2.8 2.5-2.8 4.5M12 18h.01" />
      </>
    ),
    close: <path d="M5 5 19 19M19 5 5 19" />,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    reset: (
      <>
        <path d="M3 11a9 9 0 1 1 2.6 6.4M3 4v7h7" />
      </>
    ),
    play: <path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none" />,
    fire: (
      <path d="M12 22c4.5 0 7-3 7-7 0-2.5-1.2-4.7-3-6-.2 2.5-1.7 3.7-2.6 4C14 8.5 11.4 5.2 9 3c.4 4-3 6.2-4 9.4C3.3 17.7 6.4 22 12 22z" />
    ),
  };
  return <svg {...common}>{paths[name]}</svg>;
}
