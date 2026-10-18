'use client';

import { useState } from 'react';
import type { Level } from '../../../game';
import { Modal, usePreferences } from '../../modal';
import type { Panel } from '../../modal';
import { Icon } from '../../icon';
import type { IconName } from '../../icon';

// This preview needs course identities only; it does not initialize the engine.
const courses = [
  { id: 'bar-around-corner', day: 'Today' },
  { id: 'radial-relay', day: 'Yesterday' },
  { id: 'spin-cycle', day: 'Sep 20' },
  { id: 'key-turn', day: 'Sep 19' },
  { id: 'corner-pocket', day: 'Sep 18' },
].map(({ id, day }) => ({ level: { id } as Level, day }));

const panels: {
  panel: Exclude<Panel, 'result' | null>;
  label: string;
  icon: IconName;
}[] = [
  { panel: 'help', label: 'Help', icon: 'help' },
  { panel: 'stats', label: 'Profile', icon: 'profile' },
  { panel: 'leaderboard', label: 'Leaderboard', icon: 'trophy' },
  { panel: 'archive', label: 'Calendar', icon: 'calendar' },
  { panel: 'settings', label: 'Settings', icon: 'settings' },
];

export default function ModalPreview() {
  const [panel, setPanel] = useState<Panel>(null);
  const [level, setLevel] = useState(courses[0]!.level);
  const [preferences, setPreferences] = usePreferences();

  return (
    <div className={`site-wrap ${preferences.reducedMotion ? 'reduce-motion' : ''}`}>
      <header className="site-header">
        <span className="brand">
          Puttential<span className="brand-dot">.</span>
        </span>
        <nav className="main-nav" aria-label="Modal preview">
          {panels.map((item) => (
            <button
              className={`nav-button ${panel === item.panel ? 'active' : ''}`}
              key={item.panel}
              onClick={() => setPanel(item.panel)}
              aria-expanded={panel === item.panel}
              aria-label={item.label}
              title={item.label}
            >
              <Icon name={item.icon} size={23} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </header>
      <main className="dashboard">
        <section className="course-details">
          <div className="details-heading">
            <div>
              <span className="section-kicker">DESIGN C</span>
              <h1>Modal preview</h1>
              <p>Open a panel above to review its layout and interactions.</p>
            </div>
          </div>
          <p className="modal-footnote">Selected course: {level.id.split('-').join(' ')}</p>
        </section>
      </main>
      {panel && (
        <Modal
          key={panel}
          panel={panel}
          close={() => setPanel(null)}
          preferences={preferences}
          setPreferences={setPreferences}
          result={null}
          levels={courses}
          currentLevel={level}
          chooseLevel={setLevel}
          tileCost={1}
        />
      )}
    </div>
  );
}
