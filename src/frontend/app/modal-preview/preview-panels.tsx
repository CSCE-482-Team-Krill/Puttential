import { Icon } from '../../icon';
import type { Panel } from '../../modal';
import { TILE_COST } from '../../score-display';

// Display-only course identities; the preview never initializes the engine.
export const EXAMPLE_COURSES = [
  { id: 'bar-around-corner', day: 'Today' },
  { id: 'radial-relay', day: 'Yesterday' },
  { id: 'spin-cycle', day: 'Sep 20' },
  { id: 'key-turn', day: 'Sep 19' },
  { id: 'corner-pocket', day: 'Sep 18' },
] as const;

// Display-only fixtures, rendered exclusively by the development preview.
const RANKINGS = [
  { rank: 1, name: 'Example player 1', tiles: 1, time: '4.82s' },
  { rank: 2, name: 'Example player 2', tiles: 2, time: '3.14s' },
  { rank: 3, name: 'Example player 3', tiles: 2, time: '5.26s' },
  { rank: 4, name: 'Example player 4', tiles: 3, time: '4.67s' },
  { rank: 5, name: 'Example player 5', tiles: 3, time: '5.92s' },
  { rank: 6, name: 'Example player 6', tiles: 4, time: '6.31s' },
] as const;

export function PreviewPanel({
  panel,
  currentCourse,
  chooseCourse,
  close,
}: {
  panel: Exclude<Panel, null>;
  currentCourse: string;
  chooseCourse: (id: string) => void;
  close: () => void;
}) {
  if (panel === 'stats')
    return (
      <>
        <p className="modal-intro">Profile statistics are not connected.</p>
        {[
          ['stats', 'Stats'],
          ['games', 'Games played'],
          ['ranking', 'Ranking'],
        ].map(([id, title]) => (
          <section className="profile-section" aria-labelledby={`profile-${id}`} key={id}>
            <h3 id={`profile-${id}`} className="modal-section-heading">
              {title}
            </h3>
            <p className="unavailable-state">No recorded data available</p>
          </section>
        ))}
      </>
    );
  if (panel === 'leaderboard')
    return (
      <>
        <p className="modal-intro">EXAMPLE RANKINGS — PREVIEW ONLY</p>
        <ol className="modal-stack ranking-list" aria-label="Sample rankings">
          {RANKINGS.map((entry) => (
            <li className="modal-row ranking-row" key={entry.rank}>
              <span className="ranking-number">#{entry.rank}</span>
              <span className="ranking-player">
                <strong>{entry.name}</strong>
                <small>
                  {entry.tiles} {entry.tiles === 1 ? 'tile' : 'tiles'} · {entry.time}
                </small>
              </span>
              <span className="ranking-score">
                {entry.tiles * TILE_COST}
                <small>pt</small>
              </span>
            </li>
          ))}
        </ol>
        <p className="modal-footnote">
          Example rankings. Ties use tile count, first-solve attempts, simulation time, then path
          length.
        </p>
      </>
    );
  if (panel === 'archive')
    return (
      <>
        <p className="modal-intro">
          Available courses <span>Find another way to the goal</span>
        </p>
        <div className="modal-stack archive-list">
          {EXAMPLE_COURSES.map(({ id, day }, index) => (
            <button
              className={`modal-row archive-row ${id === currentCourse ? 'current-course' : ''}`}
              key={id}
              onClick={() => {
                chooseCourse(id);
                close();
              }}
              aria-current={id === currentCourse ? 'true' : undefined}
            >
              <span className="archive-number">#{index + 1}</span>
              <span className="archive-course">
                <strong>
                  {id
                    .split('-')
                    .map((word) => word[0]!.toUpperCase() + word.slice(1))
                    .join(' ')}
                </strong>
                <small>{day}</small>
              </span>
              <span className="row-status">
                {id === currentCourse ? 'Playing' : 'Play'}
                <Icon name="arrow" size={15} />
              </span>
            </button>
          ))}
        </div>
        <p className="modal-footnote">Choose a course to start a fresh layout.</p>
      </>
    );
  return null;
}
