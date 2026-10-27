'use client';
import { useMemo } from 'react';
import { decodeLevel } from '../../src/game';
import type { LevelDocument } from '../../src/game';
import { CourseCanvas } from '../../src/frontend/course-canvas';
import { usePuzzle } from '../../src/frontend/puzzle';
import { ForceToolkit, PlayButton } from '../../src/frontend/player-controls';

export function Playtest({ document, onClose }: { document: LevelDocument; onClose: () => void }) {
  const level = useMemo(
    () => decodeLevel({ ...document.level, bounds: document.editor.arena.bounds }),
    [document],
  );
  const puzzle = usePuzzle(level);
  const bounds = document.editor.arena.bounds;
  return (
    <section className="playtest-layout">
      <div className="game-card">
        <div className="card-heading">
          <div>
            <span className="section-kicker">PLAYTEST</span>
            <h2>{document.editor.name}</h2>
          </div>
          <button onClick={onClose}>Return to editor</button>
        </div>
        <div className="course playtest-course">
          <CourseCanvas
            level={level}
            frameRef={puzzle.frameRef}
            goalRef={puzzle.goalRef}
            draft={puzzle.draft}
            mode={puzzle.mode}
            trail={puzzle.trail}
            onMoveField={puzzle.moveField}
            camera={{
              bounds,
              zoom: 1,
              center: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
            }}
          />
        </div>
        <p className="muted">
          {puzzle.mode === 'running'
            ? 'Simulation running. Stop returns to your test layout.'
            : 'Choose fields, position them, then press Play.'}
        </p>
      </div>
      <aside className="control-card">
        <h2>Force tiles</h2>
        <ForceToolkit level={level} puzzle={puzzle} />
        <PlayButton puzzle={puzzle} />
        <button className="text-button" onClick={puzzle.resetLayout}>
          Reset test layout
        </button>
        {puzzle.result && (
          <p role="status">
            {puzzle.result.solved
              ? 'Goal reached'
              : puzzle.result.failure === 'water'
                ? 'Ball sank in water'
                : puzzle.result.failure === 'lava'
                  ? 'Ball burnt by lava'
                  : puzzle.result.failure === 'out-of-bounds'
                    ? 'An object left the course'
                    : 'Run finished'}{' '}
            · {puzzle.result.seconds.toFixed(2)} seconds · {puzzle.result.tiles} tiles
          </p>
        )}
        <p className="muted">
          Test placements do not change the authored course. Physics and controls are shared with
          the game.
        </p>
      </aside>
    </section>
  );
}
