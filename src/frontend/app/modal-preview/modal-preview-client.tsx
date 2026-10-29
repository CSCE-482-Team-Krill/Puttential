'use client';

import { useState } from 'react';
import { Modal, usePreferences } from '../../modal';
import type { Panel } from '../../modal';
import { Icon } from '../../icon';
import { BrandLogo } from '../../brand-logo';
import type { IconName } from '../../icon';
import { EXAMPLE_COURSES, PreviewPanel } from './preview-panels';

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
  const [course, setCourse] = useState<string>(EXAMPLE_COURSES[0].id);
  const [preferences, setPreferences] = usePreferences();

  return (
    <div className={`site-wrap ${preferences.reducedMotion ? 'reduce-motion' : ''}`}>
      <header className="site-header">
        <span className="brand">
          <BrandLogo />
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
              <span className="section-kicker">DESIGN REVIEW</span>
              <h1>Modal preview</h1>
              <p className="preview-banner">Preview only — example courses and dates.</p>
              <p>Open a panel above to review its layout and interactions.</p>
            </div>
          </div>
          <p className="modal-footnote">Selected course: {course.split('-').join(' ')}</p>
        </section>
      </main>
      {panel && (
        <Modal
          key={panel}
          panel={panel}
          close={() => setPanel(null)}
          preferences={preferences}
          setPreferences={setPreferences}
          {...(panel === 'stats' || panel === 'leaderboard' || panel === 'archive'
            ? {
                body: (
                  <PreviewPanel
                    panel={panel}
                    currentCourse={course}
                    chooseCourse={setCourse}
                    close={() => setPanel(null)}
                  />
                ),
              }
            : {})}
        />
      )}
    </div>
  );
}
