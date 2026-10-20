'use client';
import type { Level } from '../game';
import { fieldGlyph, fieldName } from './field-label';
import { Icon } from './icon';
import type { usePuzzle } from './puzzle';
import { selectableFields, TILE_COST } from './score-display';

type Puzzle = ReturnType<typeof usePuzzle>;
export function ForceToolkit({ level, puzzle }: { level: Level; puzzle: Puzzle }) {
  return (
    <div className="tile-list">
      {selectableFields(level).length === 0 && (
        <p className="empty-inventory">No force blocks available for this course.</p>
      )}
      {selectableFields(level).map((field) => {
        const enabled = puzzle.draft[field.id]?.enabled ?? false;
        return (
          <button
            className={`tile-option ${enabled ? 'selected' : ''}`}
            key={field.id}
            disabled={puzzle.mode !== 'setup'}
            onClick={() => puzzle.toggleField(field.id)}
            aria-pressed={enabled}
          >
            <span className="tile-arrows" aria-hidden="true">
              {fieldGlyph(field)}
            </span>
            <span className="tile-info">
              <strong>{fieldName(field.id)}</strong>
              <small>
                {enabled ? 'ON' : 'OFF'} · {field.force.kind.toUpperCase()}
              </small>
            </span>
            <span className="tile-cost">{TILE_COST} pt</span>
          </button>
        );
      })}
    </div>
  );
}
export function PlayButton({ puzzle }: { puzzle: Puzzle }) {
  return (
    <>
      <button
        className="primary-button play-button"
        disabled={puzzle.mode === 'loading' || puzzle.mode === 'error'}
        onClick={() => (puzzle.mode === 'setup' ? puzzle.play() : puzzle.rewind())}
      >
        <Icon name={puzzle.mode === 'setup' ? 'play' : 'reset'} size={20} />
        {puzzle.mode === 'running' ? 'Stop' : puzzle.mode === 'done' ? 'Try again' : 'Play'}
        <Icon name="arrow" size={19} />
      </button>
      {puzzle.error && <p role="alert">{puzzle.error}</p>}
    </>
  );
}
