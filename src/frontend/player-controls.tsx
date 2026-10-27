'use client';
import type { Level } from '../game';
import { fieldGlyph, fieldName } from './field-label';
import { Icon } from './icon';
import type { usePuzzle } from './puzzle';
import { selectableFields, TILE_COST } from './score-display';

type Puzzle = ReturnType<typeof usePuzzle>;
export function ForceToolkit({
  level,
  puzzle,
  costs,
  locked = false,
}: {
  level: Level;
  puzzle: Puzzle;
  costs?: Record<string, number>;
  locked?: boolean;
}) {
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
            disabled={locked || puzzle.mode !== 'setup'}
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
            <span className="tile-cost">{costs?.[field.id] ?? TILE_COST} pt</span>
          </button>
        );
      })}
    </div>
  );
}
export function PlayButton({
  puzzle,
  pending = false,
  disabled = false,
  onPlay,
  onStop,
}: {
  puzzle: Puzzle;
  pending?: boolean;
  disabled?: boolean;
  onPlay?: () => void;
  onStop?: () => void;
}) {
  return (
    <>
      <button
        className="primary-button play-button"
        disabled={disabled || pending || puzzle.mode === 'loading' || puzzle.mode === 'error'}
        onClick={() =>
          puzzle.mode === 'setup' ? (onPlay ?? puzzle.play)() : (onStop ?? puzzle.rewind)()
        }
      >
        <Icon name={puzzle.mode === 'setup' ? 'play' : 'reset'} size={20} />
        {pending
          ? 'Starting…'
          : puzzle.mode === 'running'
            ? 'Stop'
            : puzzle.mode === 'done'
              ? 'Try again'
              : 'Play'}
        <Icon name="arrow" size={19} />
      </button>
      {puzzle.error && <p role="alert">{puzzle.error}</p>}
    </>
  );
}

export function SelectedFieldControls({
  level,
  puzzle,
  locked = false,
}: {
  level: Level;
  puzzle: Puzzle;
  locked?: boolean;
}) {
  const id = puzzle.selectedField;
  const draft = id ? puzzle.draft[id] : undefined;
  if (!id || !draft) return null;
  const disabled = locked || puzzle.mode !== 'setup';
  const angle =
    ((draft.angle ?? level.fields.find((f) => f.id === id)?.angle ?? 0) * 180) / Math.PI;
  return (
    <fieldset className="selected-field-controls" disabled={disabled}>
      <legend>{fieldName(id)}</legend>
      <div className="field-inputs">
        {(['x', 'y'] as const).map((axis) => (
          <label key={axis}>
            {axis.toUpperCase()}
            <input
              aria-label={`Selected tile ${axis.toUpperCase()}`}
              type="number"
              step="0.125"
              value={draft.position[axis]}
              onChange={(event) => {
                if (event.target.value !== '')
                  puzzle.moveField(id, { ...draft.position, [axis]: event.target.valueAsNumber });
              }}
            />
          </label>
        ))}
        <label>
          Angle
          <input
            aria-label="Selected tile angle"
            type="number"
            step="0.1"
            disabled={!puzzle.rotationAvailable}
            value={Number(angle.toFixed(1))}
            onChange={(event) => {
              if (event.target.value !== '')
                puzzle.rotateField(id, (event.target.valueAsNumber * Math.PI) / 180);
            }}
          />
        </label>
      </div>
      <div className="panel-actions">
        <button
          type="button"
          disabled={!puzzle.rotationAvailable}
          onClick={() => puzzle.rotateField(id, ((angle - 15) * Math.PI) / 180)}
        >
          Rotate left
        </button>
        <button
          type="button"
          disabled={!puzzle.rotationAvailable}
          onClick={() => puzzle.rotateField(id, ((angle + 15) * Math.PI) / 180)}
        >
          Rotate right
        </button>
      </div>
      {!puzzle.rotationAvailable && <small>Rotation unavailable in this version.</small>}
      {puzzle.editError && <p role="alert">{puzzle.editError}</p>}
    </fieldset>
  );
}
