'use client';

import { useSyncExternalStore } from 'react';
import type { SoundEvent } from '../game';

type SoundName =
  | 'impact-soft'
  | 'impact-hard'
  | 'portal-enter'
  | 'portal-exit'
  | 'water-splash-in'
  | 'water-splash-out'
  | 'water-sink'
  | 'lava-sizzle';

/** Literal `new URL` paths are bundled as assets by both the game and the editor app. */
function soundUrls(): Record<SoundName, URL> {
  return {
    'impact-soft': new URL('./sounds/impact-soft.wav', import.meta.url),
    'impact-hard': new URL('./sounds/impact-hard.wav', import.meta.url),
    'portal-enter': new URL('./sounds/portal-enter.wav', import.meta.url),
    'portal-exit': new URL('./sounds/portal-exit.wav', import.meta.url),
    'water-splash-in': new URL('./sounds/water-splash-in.wav', import.meta.url),
    'water-splash-out': new URL('./sounds/water-splash-out.wav', import.meta.url),
    'water-sink': new URL('./sounds/water-sink.wav', import.meta.url),
    'lava-sizzle': new URL('./sounds/lava-sizzle.wav', import.meta.url),
  };
}

// Speeds are world units per second at the contact point.
const IMPACT_AUDIBLE_SPEED = 0.3;
/** At or above this the crisp hard click plays instead of the soft thud. */
const IMPACT_HARD_SPEED = 2.5;
const IMPACT_FULL_SPEED = 8;
const SPLASH_FULL_SPEED = 6;
/** Seconds between sounds for one body, so grazing contacts don't chatter. */
const IMPACT_COOLDOWN = 0.06;
const EVENT_COOLDOWN = 0.12;
const MAX_VOICES = 12;
const PAN_WIDTH = 0.6;
const SOUND_EFFECTS_SETTING = 'puttential-sound-effects';

export type SoundOptions = Readonly<{
  /** Horizontal extent of the course, used to pan sounds left and right. */
  bounds?: Readonly<{ minX: number; maxX: number }>;
}>;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Plays engine `SoundEvent`s through one shared Web Audio graph. Clips are
 * fetched early and decoded on the first user gesture (browsers keep audio
 * locked until then); each event is a fire-and-forget buffer source.
 */
class PhysicsAudio {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private clips: Promise<[SoundName, ArrayBuffer][]> | null = null;
  private decoding: Promise<void> | null = null;
  private buffers: Partial<Record<SoundName, AudioBuffer>> = {};
  private voices = new Set<AudioBufferSourceNode>();
  private lastPlayed = new Map<string, number>();
  private enabled: boolean | null = null;
  private listeners = new Set<() => void>();

  /** Starts fetching clips and arms audio for the first gesture. Safe to call repeatedly. */
  prepare = () => {
    if (typeof window === 'undefined' || this.clips) return;
    this.clips = Promise.all(
      Object.entries(soundUrls()).map(async ([name, url]) => {
        try {
          const response = await fetch(url);
          return response.ok
            ? ([name, await response.arrayBuffer()] as [SoundName, ArrayBuffer])
            : null;
        } catch {
          return null;
        }
      }),
    ).then((clips) => clips.filter((clip) => clip !== null));
    // Kept installed: mobile browsers may suspend audio again after backgrounding.
    for (const type of ['pointerdown', 'keydown', 'touchend'] as const)
      window.addEventListener(type, this.unlock, { capture: true, passive: true });
  };

  private unlock = () => {
    if (!this.isEnabled()) return;
    if (!this.context) {
      const Context =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      try {
        this.context = new Context({ latencyHint: 'interactive' });
      } catch {
        return;
      }
      this.output = this.context.createGain();
      this.output.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
    if (this.clips) this.decoding ??= this.decode(this.context);
  };

  private async decode(context: AudioContext) {
    for (const [name, data] of (await this.clips) ?? []) {
      try {
        this.buffers[name] = await context.decodeAudioData(data.slice(0));
      } catch {
        /* A missing clip only silences that event. */
      }
    }
  }

  /** Plays the events from one rendered frame (one or more ticks). */
  play(events: readonly SoundEvent[], options: SoundOptions = {}) {
    const context = this.context;
    if (!events.length || !context || context.state !== 'running' || !this.isEnabled()) return;
    const impacts = new Map<string, Extract<SoundEvent, { kind: 'impact' }>>();
    for (const event of events) {
      const x = event.point.x;
      switch (event.kind) {
        case 'impact': {
          // Several contacts in one frame read as one hit: keep the hardest per body.
          const previous = impacts.get(event.bodyId);
          if (!previous || event.speed > previous.speed) impacts.set(event.bodyId, event);
          break;
        }
        case 'portal-enter':
        case 'portal-exit':
          this.voice(
            `${event.kind}:${event.bodyId}`,
            EVENT_COOLDOWN,
            event.kind,
            0.9,
            1,
            x,
            options,
          );
          break;
        case 'water-enter':
          this.voice(
            `water:${event.bodyId}`,
            EVENT_COOLDOWN,
            'water-splash-in',
            0.45 + 0.55 * clamp01(event.speed / SPLASH_FULL_SPEED),
            1,
            x,
            options,
          );
          break;
        case 'water-exit':
          this.voice(
            `water:${event.bodyId}`,
            EVENT_COOLDOWN,
            'water-splash-out',
            0.35 + 0.45 * clamp01(event.speed / SPLASH_FULL_SPEED),
            1,
            x,
            options,
          );
          break;
        case 'water-sink':
          this.voice(`sink:${event.bodyId}`, EVENT_COOLDOWN, 'water-sink', 1, 1, x, options);
          break;
        case 'lava-burn':
          this.voice(`burn:${event.bodyId}`, EVENT_COOLDOWN, 'lava-sizzle', 1, 1, x, options);
          break;
      }
    }
    for (const impact of impacts.values()) {
      const speed = impact.speed;
      if (speed < IMPACT_AUDIBLE_SPEED) continue;
      const hard = speed >= IMPACT_HARD_SPEED;
      const loudness = clamp01(
        (speed - IMPACT_AUDIBLE_SPEED) / (IMPACT_FULL_SPEED - IMPACT_AUDIBLE_SPEED),
      );
      // Within each clip's range, faster hits play slightly lower, slower ones slightly higher.
      const pitch = hard
        ? 1.08 -
          0.16 * clamp01((speed - IMPACT_HARD_SPEED) / (IMPACT_FULL_SPEED - IMPACT_HARD_SPEED))
        : 1.12 -
          0.2 *
            clamp01((speed - IMPACT_AUDIBLE_SPEED) / (IMPACT_HARD_SPEED - IMPACT_AUDIBLE_SPEED));
      this.voice(
        `impact:${impact.bodyId}`,
        IMPACT_COOLDOWN,
        hard ? 'impact-hard' : 'impact-soft',
        0.2 + 0.8 * Math.pow(loudness, 0.75),
        pitch,
        impact.point.x,
        options,
      );
    }
  }

  private voice(
    key: string,
    cooldown: number,
    name: SoundName,
    gain: number,
    rate: number,
    x: number,
    { bounds }: SoundOptions,
  ) {
    const context = this.context!,
      buffer = this.buffers[name];
    if (!buffer || this.voices.size >= MAX_VOICES) return;
    const now = context.currentTime;
    if (now - (this.lastPlayed.get(key) ?? -Infinity) < cooldown) return;
    this.lastPlayed.set(key, now);

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const level = context.createGain();
    level.gain.value = gain;
    source.connect(level);
    const nodes: AudioNode[] = [source, level];
    if (bounds && bounds.maxX > bounds.minX && typeof context.createStereoPanner === 'function') {
      const panner = context.createStereoPanner();
      const center = (bounds.minX + bounds.maxX) / 2,
        half = (bounds.maxX - bounds.minX) / 2;
      panner.pan.value = Math.max(-1, Math.min(1, (x - center) / half)) * PAN_WIDTH;
      level.connect(panner);
      nodes.push(panner);
    }
    nodes[nodes.length - 1]!.connect(this.output!);
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      for (const node of nodes) node.disconnect();
    };
    source.start();
  }

  /** Silences everything still ringing, e.g. on rewind or when leaving a run. */
  stopAll = () => {
    for (const source of this.voices)
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
    this.voices.clear();
    this.lastPlayed.clear();
  };

  isEnabled = () => {
    if (this.enabled === null) {
      try {
        this.enabled = localStorage.getItem(SOUND_EFFECTS_SETTING) !== 'off';
      } catch {
        this.enabled = true;
      }
    }
    return this.enabled;
  };

  setEnabled = (enabled: boolean) => {
    this.enabled = enabled;
    try {
      localStorage.setItem(SOUND_EFFECTS_SETTING, enabled ? 'on' : 'off');
    } catch {
      /* Preference lasts for this page only. */
    }
    if (enabled) this.unlock();
    else this.stopAll();
    for (const listener of this.listeners) listener();
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
}

export const physicsAudio = new PhysicsAudio();

/** The device-wide sound effects preference, for settings toggles. */
export function useSoundEffects(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(physicsAudio.subscribe, physicsAudio.isEnabled, () => true);
  return [enabled, physicsAudio.setEnabled];
}
