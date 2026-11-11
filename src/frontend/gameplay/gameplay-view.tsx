'use client';
import type { ComponentProps, ReactNode } from 'react';
import type { Level } from '../../game';
import { CourseCanvas } from '../course-canvas';
import { ForceToolkit, PlayButton, SelectedFieldControls } from '../player-controls';
import { Icon } from '../icon';
import type { usePuzzle } from '../puzzle';

type Puzzle = ReturnType<typeof usePuzzle>;
type ViewProps = {
  level: Level;
  puzzle: Puzzle;
  locked?: boolean;
  showPreview?: boolean;
  selectFields?: boolean;
  placementBounds?: ComponentProps<typeof CourseCanvas>['placementBounds'];
  camera?: ComponentProps<typeof CourseCanvas>['camera'];
};
/** Presentation only: no guest, API client, storage owner or competitive session imports. */
export function GameplayCanvas({
  level,
  puzzle,
  locked = false,
  showPreview = true,
  selectFields = true,
  placementBounds,
  camera,
}: ViewProps) {
  return (
    <CourseCanvas
      level={level}
      goalRef={puzzle.goalRef}
      frameRef={puzzle.frameRef}
      draft={puzzle.draft}
      mode={puzzle.mode}
      trail={showPreview ? puzzle.trail : []}
      onMoveField={puzzle.moveField}
      {...(selectFields
        ? { onSelectField: puzzle.selectField, selectedField: puzzle.selectedField }
        : {})}
      editingLocked={locked}
      {...(placementBounds ? { placementBounds } : {})}
      {...(camera ? { camera } : {})}
    />
  );
}
export function GameplayToolkit({
  level,
  puzzle,
  locked = false,
  costs,
}: Pick<ViewProps, 'level' | 'puzzle' | 'locked'> & { costs?: Record<string, number> }) {
  return (
    <>
      <ForceToolkit level={level} puzzle={puzzle} locked={locked} {...(costs ? { costs } : {})} />
      <SelectedFieldControls level={level} puzzle={puzzle} locked={locked} />
    </>
  );
}
type RunControlsProps = {
  puzzle: Puzzle;
  locked?: boolean;
  pending?: boolean;
  disabled?: boolean;
  onPlay?: () => void;
  onStop?: () => void;
};
export function GameplayRunControls({
  puzzle,
  locked = false,
  pending = false,
  disabled = false,
  onPlay,
  onStop,
}: RunControlsProps) {
  return (
    <section className="run-controls" aria-label="Run controls">
      <PlayButton
        puzzle={puzzle}
        pending={pending}
        disabled={disabled}
        {...(onPlay ? { onPlay } : {})}
        {...(onStop ? { onStop } : {})}
      />
      <p className="run-timer" role="timer">
        {(puzzle.tick / 120).toFixed(2)}s / {(puzzle.maxTicks / 120).toFixed(2)}s
      </p>
      <button
        className="text-button"
        disabled={locked || puzzle.mode !== 'setup'}
        onClick={puzzle.resetLayout}
      >
        <Icon name="reset" size={17} /> Reset layout
      </button>
    </section>
  );
}
/** Local/unranked presentation. Controllers supply explicit metadata and own all persistence. */
export function GameplayView({
  heading,
  status,
  ...props
}: ViewProps & RunControlsProps & { heading: ReactNode; status?: ReactNode }) {
  return (
    <div className="gameplay-view">
      {heading}
      <div className="course">
        <GameplayCanvas {...props} />
      </div>
      {status}
      <GameplayToolkit
        level={props.level}
        puzzle={props.puzzle}
        {...(props.locked !== undefined ? { locked: props.locked } : {})}
      />
      <GameplayRunControls {...props} />
    </div>
  );
}
