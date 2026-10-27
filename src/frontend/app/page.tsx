'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { starterLevels, levelName } from '../../game';
import type { Bounds, Level } from '../../game';
import type { Player, PuzzleResponse, Scope } from '../../shared/puzzle-contracts';
import { ForceToolkit, PlayButton, SelectedFieldControls } from '../player-controls';
import { LevelImport } from '../level-import';
import { CourseCanvas } from '../course-canvas';
import { usePuzzle } from '../puzzle';
import { Icon } from '../icon';
import { BrandLogo } from '../brand-logo';
import type { IconName } from '../icon';
import { Modal, usePreferences } from '../modal';
import type { Panel } from '../modal';
import { ApiError, puzzleApi } from '../api';
import {
  selectableFields,
  selectedFieldCount,
  displayedForceCost,
  TILE_COST,
} from '../score-display';
import { bootstrapGuest } from '../guest-session';
import { localContext, publishedContext, dailyDelay } from '../course-context';
import type { CourseContext } from '../course-context';
import { deliveredEngine, ENGINE_UNAVAILABLE } from '../engine-adapter';
import { CourseSession } from '../course-session';
import { ProgressStorage } from '../progress-storage';
import { ownerTokens } from '../run-ownership';
import { AuthoritativeState } from '../authoritative-state';
import { validDate } from '../response-validation';
import { ArchivePanel } from '../panels/archive';
import { LeaderboardPanel } from '../panels/leaderboard';
import { ProfilePanel } from '../panels/profile';
import { ResultPanel } from '../panels/result';
import { RunsPanel } from '../panels/runs';
import { shareResult } from '../share-result';

const PRACTICE_LEVELS = starterLevels.map((level) => ({ level, day: 'Practice course' }));
export default function Home() {
  const [context, setContext] = useState<CourseContext | null>(null);
  const contextRef = useRef(context);
  contextRef.current = context;
  const [daily, setDaily] = useState<PuzzleResponse | null>(null);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [importBounds, setImportBounds] = useState<Bounds | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [sidebarTab, setSidebarTab] = useState<'toolkit' | 'runs'>('toolkit');
  const [preferences, setPreferences] = usePreferences();
  const [player, setPlayer] = useState<Player | null>(null);
  const playerRef = useRef(player);
  playerRef.current = player;
  const [guestIssue, setGuestIssue] = useState('');
  const [guestGeneration, retryGuest] = useState(0);
  const reconcileGuest = useCallback(() => {
    setPlayer(null);
    retryGuest((n) => n + 1);
  }, []);
  const [memoryOnly, setMemoryOnly] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [startingPlay, setStartingPlay] = useState(false);
  const [, redraw] = useState(0);
  const sessionRef = useRef<CourseSession | null>(null);
  const stateRef = useRef(new AuthoritativeState());
  const activeRequest = useRef<string | null>(null);
  const selectedGeneration = useRef(0);
  const selectionAbort = useRef<AbortController | null>(null);
  const dailyAbort = useRef<AbortController | null>(null);
  const rollover = useRef<{ puzzle: PuzzleResponse; received: number } | null>(null);
  const staleBoundary = useRef(false);
  const level = context?.level ?? starterLevels[0]!;
  const p = context?.puzzle;
  const puzzle = usePuzzle(level, {
    ...(!p || deliveredEngine.supports(p.rules) ? { adapter: deliveredEngine } : {}),
    ...(p ? { rules: p.rules } : {}),
    ...(context
      ? {
          storageKey: `puttential-draft-v1/${p ? (player?.id ?? 'unconfirmed') : 'local'}/${context.key}`,
        }
      : {}),
  });
  const executorRef = useRef(puzzle);
  executorRef.current = puzzle;

  useEffect(() => {
    const storage = new ProgressStorage();
    let alive = true;
    const session = new CourseSession(
      puzzleApi,
      storage,
      ownerTokens(),
      {
        supports: (course) => !!deliveredEngine?.supports(course.rules),
        play: (placement, requestId) => {
          activeRequest.current = requestId;
          executorRef.current.play(placement);
        },
      },
      () => {
        if (alive) {
          setMemoryOnly(storage.mode === 'memory');
          redraw((n) => n + 1);
        }
      },
      reconcileGuest,
    );
    sessionRef.current = session;
    stateRef.current = session.state;
    void storage.initialize().then(() => {
      if (alive) {
        setMemoryOnly(storage.mode === 'memory');
        setStorageReady(true);
        redraw((n) => n + 1);
      }
    });
    return () => {
      alive = false;
      session.dispose();
      storage.close();
      sessionRef.current = null;
    };
  }, [reconcileGuest]);
  useEffect(() => {
    const controller = new AbortController();
    setGuestIssue('Confirming guest session…');
    void bootstrapGuest(puzzleApi, controller.signal)
      .then((confirmed) => {
        if (controller.signal.aborted) return;
        setPlayer(confirmed);
        setGuestIssue('');
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setPlayer(null);
          setGuestIssue(e instanceof Error ? e.message : 'Competitive session unavailable.');
        }
      });
    return () => controller.abort();
  }, [guestGeneration]);
  useEffect(() => {
    if (!player || !storageReady) return;
    void sessionRef.current
      ?.recover(player.id)
      .catch(() => setNotice('Pending run recovery unavailable. Keep this page open to retry.'));
  }, [player?.id, storageReady]);

  const refreshToday = useCallback(async (select = false) => {
    dailyAbort.current?.abort();
    const controller = new AbortController();
    dailyAbort.current = controller;
    const generation = selectedGeneration.current;
    if (!contextRef.current) setLoading(true);
    try {
      const response = await puzzleApi.today({ signal: controller.signal });
      if (controller.signal.aborted) return;
      stateRef.current.applyAvailability(response.availability);
      setDaily(response);
      rollover.current = { puzzle: response, received: performance.now() };
      setNotice('');
      if (select && generation === selectedGeneration.current) {
        const next = publishedContext(response);
        setContext((current) =>
          current?.key === next.key ? { ...next, level: current.level } : next,
        );
      } else {
        setContext((current) => {
          if (!current?.puzzle) return current;
          // A new server day changes presentation, never the selected immutable content.
          return {
            ...current,
            source: current.puzzle.date === response.todayDate ? 'daily' : 'archive',
          };
        });
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      setNotice(
        e instanceof ApiError && e.status === 404
          ? 'No course is published for today.'
          : e instanceof ApiError && e.code === 'INVALID_DATA'
            ? 'The daily service returned incompatible puzzle data.'
            : 'Today’s puzzle service is unavailable.',
      );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  const leaveOwned = useCallback(async () => {
    const session = sessionRef.current;
    const record =
      (activeRequest.current ? session?.records.get(activeRequest.current) : undefined) ??
      [...(session?.records.values() ?? [])].find(
        (r) =>
          r.start.puzzleId === contextRef.current?.puzzle?.id &&
          !r.intent &&
          r.phase !== 'terminal' &&
          session?.blocks(r),
      );
    const unresolved = record && !record.intent && record.phase !== 'terminal';
    if (
      (executorRef.current.mode === 'running' || unresolved) &&
      !window.confirm('Leave this run? It will end; an accepted ranked start still counts.')
    )
      return false;
    if (unresolved) await session?.cancel(record.start.requestId);
    return true;
  }, []);
  const chooseDate = useCallback(
    async (date: string, history = true) => {
      if (!validDate(date)) {
        setNotice('Use a valid YYYY-MM-DD course date.');
        setLoading(false);
        return;
      }
      const sameDate = contextRef.current?.puzzle?.date === date;
      if (!sameDate && !(await leaveOwned())) {
        if (!history)
          window.history.pushState(
            null,
            '',
            contextRef.current?.puzzle
              ? `?date=${contextRef.current.puzzle.date}`
              : window.location.pathname,
          );
        return;
      }
      const generation = ++selectedGeneration.current;
      selectionAbort.current?.abort();
      const controller = new AbortController();
      selectionAbort.current = controller;
      setLoading(true);
      setNotice('Loading selected course…');
      try {
        const response = await puzzleApi.byDate(date, { signal: controller.signal });
        if (generation !== selectedGeneration.current || controller.signal.aborted) return;
        if (response.date !== date)
          throw new Error('The service returned a different course date.');
        stateRef.current.applyAvailability(response.availability);
        const next = publishedContext(response);
        if (sameDate && contextRef.current?.key !== next.key)
          throw new Error(
            'Published content changed for this date. Your current course is preserved; contact the publishing owner.',
          );
        const sameContent = contextRef.current?.key === next.key;
        setContext((current) =>
          current?.key === next.key ? { ...next, level: current.level } : next,
        );
        setImportBounds(null);
        setNotice('');
        setPanel(null);
        if (!sameContent) activeRequest.current = null;
        if (history) window.history.pushState(null, '', `?date=${date}`);
      } catch (e) {
        if (generation === selectedGeneration.current && !controller.signal.aborted)
          setNotice(e instanceof Error ? e.message : 'Selected course unavailable.');
      } finally {
        if (generation === selectedGeneration.current && !controller.signal.aborted)
          setLoading(false);
      }
    },
    [leaveOwned],
  );
  async function chooseLocal(
    next: Level,
    bounds?: Bounds,
    source: 'practice' | 'local' = 'practice',
  ) {
    if (!(await leaveOwned())) return;
    ++selectedGeneration.current;
    selectionAbort.current?.abort();
    setContext(localContext(next, source));
    setImportBounds(bounds ?? null);
    setPanel(null);
    setLoading(false);
    activeRequest.current = null;
    setNotice('');
    window.history.pushState(null, '', window.location.pathname);
  }
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('date');
    void refreshToday(!requested);
    if (requested) void chooseDate(requested, false);
    const back = () => {
      const date = new URLSearchParams(window.location.search).get('date');
      if (date) void chooseDate(date, false);
      else
        void (async () => {
          if (await leaveOwned()) {
            ++selectedGeneration.current;
            activeRequest.current = null;
            await refreshToday(true);
          } else {
            window.history.pushState(
              null,
              '',
              contextRef.current?.puzzle
                ? `?date=${contextRef.current.puzzle.date}`
                : window.location.pathname,
            );
          }
        })();
    };
    window.addEventListener('popstate', back);
    return () => {
      window.removeEventListener('popstate', back);
      selectionAbort.current?.abort();
      dailyAbort.current?.abort();
    };
  }, [refreshToday, chooseDate]);
  useEffect(() => {
    const current = rollover.current;
    if (!current) return;
    const delay = dailyDelay(
      current.puzzle.serverNow,
      current.puzzle.nextDailyAt,
      current.received,
      performance.now(),
    );
    const wait = delay > 0 ? delay : staleBoundary.current ? 30_000 : 0;
    staleBoundary.current = delay <= 0;
    const refresh = () => {
      if (!document.hidden) void refreshToday();
    };
    const timer = setTimeout(refresh, Math.min(wait, 2_147_483_647));
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [daily, refreshToday]);
  useEffect(() => {
    if (!player || !p) return;
    const controller = new AbortController();
    const load = () => {
      void puzzleApi
        .progress(p.id, { signal: controller.signal })
        .then((response) => {
          if (
            controller.signal.aborted ||
            response.progress.guestId !== player.id ||
            response.progress.puzzleId !== p.id
          )
            return;
          stateRef.current.applyProgress(response.progress);
          stateRef.current.applyAvailability(response.availability);
          redraw((n) => n + 1);
        })
        .catch(() => {});
    };
    load();
    const channel =
      typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('puttential-progress');
    if (channel) channel.onmessage = load; // Broadcasts are hints, never authoritative snapshots.
    window.addEventListener('focus', load);
    return () => {
      controller.abort();
      channel?.close();
      window.removeEventListener('focus', load);
    };
  }, [player?.id, p?.id]);
  useEffect(() => {
    if (!puzzle.completedRun) return;
    if (activeRequest.current)
      void sessionRef.current?.finish(
        activeRequest.current,
        'terminal',
        puzzle.completedRun.result.tick ?? 0,
      );
    setPanel('result');
  }, [puzzle.completedRun]);

  const session = sessionRef.current;
  const state = stateRef.current;
  const progress = p && player ? state.progress.get(`${player.id}/${p.id}`) : undefined;
  const availability = p ? (state.availability.get(p.id) ?? p.availability) : undefined;
  const records = [...(session?.records.values() ?? [])].filter(
    (r) => r.start.expectedGuestId === player?.id,
  );
  const record =
    records.find((r) => r.start.requestId === activeRequest.current) ??
    records.filter((r) => r.start.puzzleId === p?.id).at(-1);
  const locked =
    startingPlay ||
    (!!record && !!session?.blocks(record) && !record.intent && record.phase !== 'terminal');
  const compatible = !!p && !!deliveredEngine?.supports(p.rules);
  const canRank =
    storageReady && !!player && compatible && availability?.publicationStatus === 'active';
  async function play() {
    if (!p) {
      puzzle.play();
      return;
    }
    if (!canRank || !session) return;
    try {
      // Freeze UI synchronously before any asynchronous start work.
      setNotice('Starting run…');
      setStartingPlay(true);
      const starting = session.start(p, player!, puzzle.getPlacement());
      redraw((n) => n + 1);
      const started = await starting;
      activeRequest.current = started.start.requestId;
      setNotice('');
      redraw((n) => n + 1);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not start run.');
    } finally {
      setStartingPlay(false);
    }
  }
  async function stop() {
    if (activeRequest.current && puzzle.mode === 'running')
      await session?.finish(activeRequest.current, 'aborted', puzzle.tick);
    puzzle.rewind();
  }
  async function compose(savedBest = false) {
    const saved = savedBest
      ? context?.source === 'daily'
        ? progress?.bestDaily
        : progress?.bestArchive
      : record?.response?.state === 'saved'
        ? record.response.result
        : null;
    if (saved && p && player) {
      const scope: Scope = context?.source === 'daily' ? 'daily' : 'archive';
      let currentAvailability =
          state.availability.get(p.id)?.publicationStatus === 'canceled'
            ? state.availability.get(p.id)!
            : null,
        board = null;
      try {
        const response = await puzzleApi.run(saved.runId);
        if (
          response.guestId !== player.id ||
          response.puzzleId !== p.id ||
          response.state !== 'saved' ||
          response.result.runId !== saved.runId
        )
          throw new Error('Identity mismatch');
        state.applyRun(response);
        currentAvailability = state.availability.get(p.id) ?? null;
        if (currentAvailability?.publicationStatus === 'active') {
          board = await puzzleApi.board(p.id, scope, 'top');
          state.applyAvailability(board.availability);
          currentAvailability = state.availability.get(p.id) ?? null;
        }
      } catch {
        board = null;
      }
      if (
        playerRef.current?.id !== player.id ||
        contextRef.current?.key !== context?.key ||
        (contextRef.current?.source === 'daily' ? 'daily' : 'archive') !== scope
      ) {
        throw new Error('Guest or course selection changed. Copy again for the selected course.');
      }
      return shareResult({
        date: p.date,
        puzzleId: p.id,
        guestId: player.id,
        scope,
        result: saved,
        firstSolveAttempts: progress?.firstSolveAttempts ?? null,
        availability: currentAvailability,
        board,
        origin: window.location.origin,
      });
    }
    return `⛳ Puttential — ${p?.date ?? 'Practice'} — ${p ? 'Unverified' : 'Practice — unranked'}\n${puzzle.result?.solved ? 'Solved' : (puzzle.result?.outcome ?? 'Finished')}\nForce ${puzzle.result?.forceCost ?? 0} · Tiles ${puzzle.result?.tiles ?? 0}\nBall time ${(puzzle.result?.seconds ?? 0).toFixed(2)}s${p ? `\n${window.location.origin}/?date=${p.date}` : ''}`;
  }
  const nav: { name: Exclude<Panel, 'result' | null>; label: string; icon: IconName }[] = [
    { name: 'archive', label: 'Calendar', icon: 'calendar' },
    { name: 'leaderboard', label: 'Leaderboard', icon: 'trophy' },
    { name: 'settings', label: 'Settings', icon: 'settings' },
    { name: 'stats', label: 'Profile', icon: 'profile' },
    { name: 'help', label: 'Help', icon: 'help' },
  ];
  const placed = selectedFieldCount(level, puzzle.draft),
    inventory = selectableFields(level).length;
  const cost = displayedForceCost(level, puzzle.draft, p?.rules.tileCosts);
  const pending = records.filter((r) => r.phase !== 'terminal');
  const recoveryLimited = memoryOnly || pending.some((r) => r.persistence === 'memory');
  return (
    <div className={`site-wrap ${preferences.reducedMotion ? 'reduce-motion' : ''}`}>
      <header className="site-header">
        <button
          className="brand"
          aria-label="Puttential home"
          onClick={() => {
            if (daily) void chooseDate(daily.date);
            else void refreshToday(true);
          }}
        >
          <BrandLogo />
        </button>
        <nav className="main-nav" aria-label="Main navigation">
          {nav.map((item) => (
            <button
              key={item.name}
              className={`nav-button ${panel === item.name ? 'active' : ''}`}
              aria-expanded={panel === item.name}
              aria-label={item.label}
              title={item.label}
              onClick={() => setPanel(item.name)}
            >
              <Icon name={item.icon} size={20} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </header>
      <main className="dashboard">
        {(notice || !context) && (
          <div className="api-notice" role="status">
            {loading && !context ? "Loading today's course…" : notice}
            <div className="panel-actions">
              <button onClick={() => void refreshToday(!context)} disabled={loading}>
                Retry daily course
              </button>
              <button onClick={() => void chooseLocal(starterLevels[0]!)}>Play practice</button>
            </div>
            {!loading && !context && <p>Practice courses still work; those runs are unranked.</p>}
          </div>
        )}
        {context && (
          <>
            {daily && p && p.id !== daily.id && (
              <p className="api-notice">
                Today’s course is {daily.date}. Your selected course is preserved.{' '}
                <button onClick={() => void chooseDate(daily.date)}>Open today</button>
              </p>
            )}
            {p && (
              <div className="api-notice" role="status">
                {availability?.publicationStatus === 'canceled'
                  ? `Course canceled. ${availability.cancellationMessage}`
                  : !compatible
                    ? ENGINE_UNAVAILABLE
                    : guestIssue}
                {!canRank && (
                  <button onClick={() => void chooseLocal(level)}>Play this course unranked</button>
                )}
              </div>
            )}
            {recoveryLimited && (
              <p className="api-notice" role="status">
                Progress recovery unavailable after refresh. Keep this page open to retry saves.{' '}
                <button
                  onClick={async () => {
                    await session?.storage.initialize();
                    setMemoryOnly(session?.storage.mode !== 'durable');
                  }}
                >
                  Retry persistence
                </button>
              </p>
            )}
            <div className="game-layout">
              <div className="course-meta course-heading">
                <div className="course-identity">
                  <h1 id="course-title">{p?.title ?? levelName(level)}</h1>
                  <span className="challenge-label">
                    <Icon name="calendar" size={16} />{' '}
                    {context.source === 'daily'
                      ? 'Daily challenge'
                      : context.source === 'archive'
                        ? 'Archive challenge'
                        : context.source === 'local'
                          ? 'Local course — unranked'
                          : 'Practice challenge — unranked'}{' '}
                    {p && <b>{p.date}</b>}
                  </span>
                </div>
                <span className={`course-status ${puzzle.mode === 'running' ? 'running' : ''}`}>
                  <i aria-hidden="true" />
                  {locked && puzzle.mode !== 'running'
                    ? 'Awaiting start'
                    : puzzle.mode === 'setup'
                      ? 'Planning'
                      : puzzle.mode === 'running'
                        ? 'In motion'
                        : puzzle.mode === 'done'
                          ? 'Finished'
                          : 'Loading'}
                </span>
              </div>
              <section className="course-stage" aria-labelledby="course-title">
                <div className="course">
                  <CourseCanvas
                    level={level}
                    goalRef={puzzle.goalRef}
                    frameRef={puzzle.frameRef}
                    draft={puzzle.draft}
                    mode={puzzle.mode}
                    trail={preferences.showPreview ? puzzle.trail : []}
                    onMoveField={puzzle.moveField}
                    onSelectField={puzzle.selectField}
                    selectedField={puzzle.selectedField}
                    editingLocked={locked}
                    {...(p ? { placementBounds: p.rules.placementBounds } : {})}
                    {...(importBounds
                      ? {
                          camera: {
                            bounds: importBounds,
                            zoom: 1,
                            center: {
                              x: (importBounds.minX + importBounds.maxX) / 2,
                              y: (importBounds.minY + importBounds.maxY) / 2,
                            },
                          },
                        }
                      : {})}
                  />
                </div>
              </section>
              <aside className="control-column" aria-label="Course controls">
                <div className="sidebar-tabs" role="tablist" aria-label="Course tools">
                  {(['toolkit', 'runs'] as const).map((tab, index) => (
                    <button
                      key={tab}
                      id={`${tab}-tab`}
                      role="tab"
                      aria-selected={sidebarTab === tab}
                      aria-controls={`${tab}-panel`}
                      tabIndex={sidebarTab === tab ? 0 : -1}
                      onClick={() => setSidebarTab(tab)}
                      onKeyDown={(event) => {
                        const next =
                          event.key === 'Home'
                            ? 'toolkit'
                            : event.key === 'End'
                              ? 'runs'
                              : event.key === 'ArrowRight' || event.key === 'ArrowLeft'
                                ? (['toolkit', 'runs'] as const)[1 - index]
                                : undefined;
                        if (!next) return;
                        event.preventDefault();
                        setSidebarTab(next);
                        document.getElementById(`${next}-tab`)?.focus();
                      }}
                    >
                      {tab === 'toolkit' ? 'Toolkit' : 'Runs'}
                      {tab === 'runs' && pending.length > 0 && (
                        <span className="pending-run-count" aria-hidden="true">
                          {pending.length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <p className="sr-only" role="status">
                  {pending.length > 0
                    ? `${pending.length} pending runs. Open the Runs tab for status and recovery.`
                    : ''}
                </p>
                <div
                  className="setup-tools"
                  id="toolkit-panel"
                  role="tabpanel"
                  aria-labelledby="toolkit-tab"
                  hidden={sidebarTab !== 'toolkit'}
                  tabIndex={0}
                >
                  <div className="control-heading">
                    <span className="section-kicker">YOUR TOOLKIT</span>
                    <div className="toolkit-title">
                      <h2 id="toolkit-title">Force blocks</h2>
                      <span
                        className="inventory-count"
                        aria-label={`${inventory} force blocks available`}
                      >
                        {inventory}
                      </span>
                    </div>
                    <p>Turn a block ON, then drag its field on the course.</p>
                  </div>
                  <ForceToolkit
                    level={level}
                    puzzle={puzzle}
                    {...(p ? { costs: p.rules.tileCosts } : {})}
                    locked={locked}
                  />
                  <SelectedFieldControls level={level} puzzle={puzzle} locked={locked} />
                  <p className="toolkit-note">
                    Force cost {cost} · {placed} tiles.{' '}
                    {p
                      ? 'Use the published tile costs to improve your solution.'
                      : 'Practice costs 1 point per active block.'}
                  </p>
                </div>
                <section
                  className="runs-panel"
                  id="runs-panel"
                  role="tabpanel"
                  aria-labelledby="runs-tab"
                  hidden={sidebarTab !== 'runs'}
                  tabIndex={0}
                >
                  <RunsPanel
                    puzzleId={p?.id}
                    progress={progress}
                    records={records}
                    localAttempts={puzzle.attempts}
                    hasSavedBest={
                      !!(context.source === 'daily' ? progress?.bestDaily : progress?.bestArchive)
                    }
                    compose={() => compose(true)}
                    retry={(requestId) =>
                      void session?.retry(requestId).catch((e) => setNotice(e.message))
                    }
                    cancel={(requestId) =>
                      void session?.cancel(requestId).catch((e) => setNotice(e.message))
                    }
                    interrupt={(requestId) =>
                      void session?.interrupt(requestId).catch((e) => setNotice(e.message))
                    }
                  />
                </section>
                <section className="run-controls" aria-label="Run controls">
                  <PlayButton
                    puzzle={puzzle}
                    pending={locked && puzzle.mode !== 'running'}
                    disabled={puzzle.mode === 'setup' && !!p && !canRank}
                    onPlay={() => void play()}
                    onStop={() => void stop()}
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
              </aside>
            </div>
          </>
        )}
      </main>
      {panel && (
        <Modal
          key={`${panel}/${context?.key ?? 'loading'}/${player?.id ?? 'guest'}`}
          panel={panel}
          close={() => setPanel(null)}
          preferences={preferences}
          setPreferences={setPreferences}
          result={puzzle.result}
          levels={PRACTICE_LEVELS}
          currentLevel={level}
          chooseLevel={(next) => void chooseLocal(next)}
          tileCost={TILE_COST}
          courseImport={
            <LevelImport onLoad={(next, bounds) => void chooseLocal(next, bounds, 'local')} />
          }
          {...(panel === 'archive'
            ? {
                body: (
                  <>
                    <ArchivePanel
                      player={player}
                      {...(p ? { date: p.date } : {})}
                      state={state}
                      choose={(date) => void chooseDate(date)}
                      reconcileGuest={reconcileGuest}
                    />
                    <h3>Practice — unranked</h3>
                    {PRACTICE_LEVELS.map((entry) => (
                      <button
                        className="modal-row practice-course"
                        key={entry.level.id}
                        onClick={() => void chooseLocal(entry.level)}
                      >
                        {levelName(entry.level)}
                      </button>
                    ))}
                  </>
                ),
              }
            : panel === 'leaderboard'
              ? {
                  body: (
                    <LeaderboardPanel
                      puzzle={p}
                      player={player}
                      state={state}
                      reconcileGuest={reconcileGuest}
                    />
                  ),
                }
              : panel === 'stats'
                ? {
                    body: (
                      <ProfilePanel
                        player={player}
                        progress={progress}
                        update={(next) =>
                          setPlayer((current) => (current?.id === next.id ? next : current))
                        }
                        retry={reconcileGuest}
                        memoryOnly={recoveryLimited}
                      />
                    ),
                  }
                : panel === 'result'
                  ? {
                      body: (
                        <ResultPanel
                          result={puzzle.result}
                          record={record}
                          progress={progress}
                          compose={() => compose()}
                          retry={() => {
                            if (record) void session?.retry(record.start.requestId);
                          }}
                        />
                      ),
                    }
                  : {})}
        />
      )}
    </div>
  );
}
