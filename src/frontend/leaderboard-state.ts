import type { BoardView, LeaderboardResponse, Scope } from '../shared/puzzle-contracts';
import type { PuzzleApi } from './api';
import { ApiError } from './api';

/** One window per authenticated viewer/puzzle/scope/view. */
export class LeaderboardWindow {
  board: LeaderboardResponse | null = null;
  message = '';
  private generation = 0;
  private controller: AbortController | undefined;
  constructor(
    private api: PuzzleApi,
    readonly viewer: string,
    readonly puzzle: string,
    readonly scope: Scope,
    readonly view: BoardView,
    private viewerChanged: () => void,
  ) {}
  cancel() {
    ++this.generation;
    this.controller?.abort();
  }
  private async reconcileViewer(generation: number) {
    try {
      const confirmed = await this.api.me(
        this.controller ? { signal: this.controller.signal } : {},
      );
      if (generation === this.generation && confirmed.player.id !== this.viewer)
        this.viewerChanged();
      // A confirmed unchanged viewer plus a contradictory board is a service error.
      // Leave a manual refresh state instead of repeatedly bootstrapping the same guest.
    } catch {
      if (generation === this.generation) this.viewerChanged();
    }
  }
  async load(more = false) {
    const generation = ++this.generation;
    this.controller?.abort();
    this.controller = new AbortController();
    const options = { signal: this.controller.signal };
    const old = this.board;
    let cursor = more ? (old?.nextCursor ?? null) : null;
    let restarted = false;
    this.message = '';
    while (true) {
      try {
        const next = await this.api.board(this.puzzle, this.scope, this.view, cursor, options);
        if (generation !== this.generation) return;
        if (next.viewerGuestId !== this.viewer) {
          this.board = null;
          await this.reconcileViewer(generation);
          throw new Error('Guest session changed. Refresh to load your standings.');
        }
        if (next.puzzleId !== this.puzzle || next.scope !== this.scope || next.view !== this.view)
          throw new Error('Standings response does not match this course.');
        if (cursor && old && next.boardRevision !== old.boardRevision)
          throw new ApiError('Standings changed.', 409, 'BOARD_REVISION_CHANGED', false);
        const rows = cursor && old ? [...old.rows, ...next.rows] : next.rows;
        if (new Set(rows.map((r) => r.player.id)).size !== rows.length)
          throw new Error('Standings pages overlap. Refresh to continue.');
        this.board = { ...next, rows };
        return;
      } catch (e) {
        if (generation !== this.generation) return;
        if (e instanceof ApiError && e.code === 'LEADERBOARD_VIEWER_CHANGED') {
          this.board = null;
          await this.reconcileViewer(generation);
          this.message = 'Guest session changed. Refresh to load your standings.';
          return;
        }
        if (e instanceof ApiError && e.code === 'BOARD_REVISION_CHANGED') {
          this.board = null;
          if (more && !restarted) {
            restarted = true;
            cursor = null;
            continue;
          }
          this.message = 'Standings are changing; refresh to continue';
          return;
        }
        this.message = e instanceof Error ? e.message : 'Leaderboard unavailable.';
        return;
      }
    }
  }
}
