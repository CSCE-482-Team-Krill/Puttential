/**
 * Renders placeholder physics sound effects as 16-bit mono WAV files.
 * Output is deterministic (seeded noise), so re-running produces identical files.
 *
 *   npx tsx scripts/generate-placeholder-sounds.ts [outDir]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SAMPLE_RATE = 44100;
const OUT_DIR = process.argv[2] ?? 'src/frontend/sounds';

// ---------- primitives ----------

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const buffer = (seconds: number) => new Float32Array(Math.round(seconds * SAMPLE_RATE));

function mixInto(target: Float32Array, source: Float32Array, offsetSeconds = 0, gain = 1) {
  const offset = Math.round(offsetSeconds * SAMPLE_RATE);
  for (let i = 0; i < source.length && offset + i < target.length; i++)
    target[offset + i]! += source[i]! * gain;
}

/** Sine whose frequency follows `frequency(t)`, shaped by `envelope(t)`. */
function tone(
  seconds: number,
  frequency: (t: number) => number,
  envelope: (t: number) => number,
): Float32Array {
  const out = buffer(seconds);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    phase += (2 * Math.PI * frequency(t)) / SAMPLE_RATE;
    out[i] = Math.sin(phase) * envelope(t);
  }
  return out;
}

function noise(seconds: number, seed: number, envelope: (t: number) => number): Float32Array {
  const random = seededRandom(seed);
  const out = buffer(seconds);
  for (let i = 0; i < out.length; i++) out[i] = (random() * 2 - 1) * envelope(i / SAMPLE_RATE);
  return out;
}

/** RBJ biquad; `cutoff` may vary over time for sweeps. */
function biquad(
  input: Float32Array,
  type: 'lowpass' | 'highpass' | 'bandpass',
  cutoff: (t: number) => number,
  q = 0.707,
): Float32Array {
  const out = new Float32Array(input.length);
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const w = (2 * Math.PI * Math.min(cutoff(i / SAMPLE_RATE), SAMPLE_RATE * 0.45)) / SAMPLE_RATE;
    const cos = Math.cos(w),
      alpha = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (type === 'lowpass') [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
    else if (type === 'highpass') [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
    else [b0, b1, b2] = [alpha, 0, -alpha];
    const a0 = 1 + alpha,
      a1 = -2 * cos,
      a2 = 1 - alpha;
    const x = input[i]!;
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}

/** Attack-then-exponential-decay envelope. */
const hit = (attack: number, decay: number) => (t: number) =>
  t < attack ? t / attack : Math.exp(-(t - attack) / decay);

/** A single bubble: an exponentially rising chirp (Minnaert resonance). */
function bubble(f0: number, seconds: number, rise: number, decay: number) {
  return tone(
    seconds,
    (t) => f0 * (1 + rise * t),
    (t) => Math.min(1, t / 0.002) * Math.exp(-t / decay),
  );
}

/** Rounds off the top end, normalizes to `peak` and fades the tail to avoid clicks. */
function finish(input: Float32Array, peak: number, lowpassHz = 5000): Float32Array {
  const samples = biquad(input, 'lowpass', () => lowpassHz);
  let max = 0;
  for (const s of samples) max = Math.max(max, Math.abs(s));
  const scale = max > 0 ? peak / max : 0;
  const fade = Math.round(0.01 * SAMPLE_RATE);
  for (let i = 0; i < samples.length; i++) {
    const tail = samples.length - 1 - i;
    samples[i]! *= scale * (tail < fade ? tail / fade : 1);
  }
  return samples;
}

function wav(samples: Float32Array): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) =>
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2),
  );
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// ---------- sounds ----------
// Kept deliberately soft: rounded attacks, little energy above ~4 kHz and modest peaks,
// leaving headroom for runtime gain driven by impact speed.

/** Low, muted thud: a gentle tap or a slow roll into a wall. */
function impactSoft() {
  const out = buffer(0.2);
  mixInto(
    out,
    tone(0.2, (t) => 105 + 55 * Math.exp(-t / 0.02), hit(0.004, 0.05)),
  );
  mixInto(
    out,
    biquad(noise(0.04, 11, hit(0.003, 0.008)), 'lowpass', () => 700),
    0,
    0.2,
  );
  return finish(out, 0.32, 2500);
}

/** Crisp, solid click, like two hard balls meeting, with a little grit so it isn't pure. */
function impactHard() {
  const out = buffer(0.14);
  // Contact transient: a very short band of noise carries most of the "click".
  mixInto(
    out,
    biquad(noise(0.03, 23, hit(0.0005, 0.004)), 'bandpass', () => 2600, 0.9),
    0,
    1.0,
  );
  // Short inharmonic ring of the struck shells; slightly detuned pairs add roughness.
  for (const [frequency, gain, decay] of [
    [1870, 0.35, 0.018],
    [1905, 0.2, 0.016],
    [2950, 0.3, 0.012],
    [4100, 0.12, 0.008],
  ] as const)
    mixInto(
      out,
      tone(0.14, () => frequency, hit(0.0005, decay)),
      0,
      gain,
    );
  // Midrange body (~500 Hz-1.2 kHz) fills the gap between thump and click so it isn't hollow.
  mixInto(
    out,
    tone(0.14, (t) => 820 + 160 * Math.exp(-t / 0.004), hit(0.0008, 0.022)),
    0,
    0.4,
  );
  mixInto(
    out,
    tone(0.14, () => 1180, hit(0.0008, 0.016)),
    0,
    0.2,
  );
  mixInto(
    out,
    tone(0.14, () => 560, hit(0.001, 0.02)),
    0,
    0.22,
  );
  mixInto(
    out,
    biquad(noise(0.06, 31, hit(0.0008, 0.01)), 'bandpass', () => 900, 0.8),
    0,
    0.55,
  );
  // Low body so it lands with some weight.
  mixInto(
    out,
    tone(0.14, (t) => 200 + 60 * Math.exp(-t / 0.006), hit(0.001, 0.022)),
    0,
    0.35,
  );
  // Grit: a faint noisy tail behind the click.
  mixInto(
    out,
    biquad(noise(0.08, 29, hit(0.002, 0.02)), 'bandpass', () => 1400, 0.6),
    0,
    0.12,
  );
  return finish(out, 0.42, 6000);
}

/** Rising, shimmering sweep as the ball is pulled in. */
function portalEnter() {
  const seconds = 0.4;
  const out = buffer(seconds);
  const sweep = (t: number) => 260 * Math.pow(950 / 260, t / seconds);
  const env = (t: number) => Math.min(1, t / 0.06) * Math.pow(1 - t / seconds, 1.5);
  mixInto(
    out,
    tone(seconds, (t) => sweep(t) * (1 + 0.02 * Math.sin(2 * Math.PI * 22 * t)), env),
  );
  mixInto(
    out,
    tone(seconds, (t) => sweep(t) * 1.5, env),
    0,
    0.12,
  );
  mixInto(
    out,
    biquad(noise(seconds, 31, env), 'bandpass', (t) => sweep(t) * 1.5, 4),
    0,
    0.15,
  );
  return finish(out, 0.3, 3000);
}

/** Falling sweep with a soft pop as the ball reappears. */
function portalExit() {
  const seconds = 0.34;
  const out = buffer(seconds);
  const sweep = (t: number) => 950 * Math.pow(320 / 950, t / seconds);
  const env = (t: number) => Math.min(1, t / 0.02) * Math.exp(-t / 0.11);
  mixInto(
    out,
    tone(seconds, (t) => sweep(t) * (1 + 0.02 * Math.sin(2 * Math.PI * 22 * t)), env),
  );
  mixInto(
    out,
    tone(seconds, (t) => sweep(t) * 1.5, env),
    0,
    0.12,
  );
  mixInto(
    out,
    biquad(noise(seconds, 37, env), 'bandpass', (t) => sweep(t) * 1.5, 4),
    0,
    0.15,
  );
  return finish(out, 0.28, 3000);
}

/** Plunge: a muffled noise burst that darkens, followed by a few bubbles. */
function waterSplashIn() {
  const out = buffer(0.65);
  mixInto(
    out,
    biquad(
      noise(0.65, 41, hit(0.015, 0.12)),
      'lowpass',
      (t) => 450 + 1600 * Math.exp(-t / 0.08),
      0.9,
    ),
  );
  const random = seededRandom(43);
  for (let i = 0; i < 6; i++)
    mixInto(
      out,
      bubble(320 + random() * 380, 0.08, 5 + random() * 5, 0.02),
      0.05 + random() * 0.35,
      0.25 + random() * 0.15,
    );
  return finish(out, 0.34, 3000);
}

/** Lighter splash as the ball leaves the water. */
function waterSplashOut() {
  const out = buffer(0.35);
  mixInto(
    out,
    biquad(noise(0.35, 47, hit(0.012, 0.06)), 'bandpass', (t) => 1500 - 700 * (t / 0.35), 1),
  );
  const random = seededRandom(53);
  for (let i = 0; i < 4; i++)
    mixInto(
      out,
      bubble(600 + random() * 400, 0.05, 6, 0.012),
      0.03 + random() * 0.2,
      0.2 + random() * 0.15,
    );
  return finish(out, 0.24, 3000);
}

/** Ball sinks: a low gloop then a thinning trail of rising bubbles. */
function waterSink() {
  const out = buffer(1.0);
  mixInto(out, bubble(160, 0.25, 2.5, 0.07), 0, 0.9);
  const random = seededRandom(59);
  let at = 0.08;
  for (let i = 0; i < 14; i++) {
    mixInto(out, bubble(230 + random() * 320, 0.09, 4 + random() * 4, 0.022), at, 0.45 - i * 0.025);
    at += 0.03 + i * 0.008 + random() * 0.03;
  }
  return finish(out, 0.32, 2500);
}

/** Burn: a soft hiss with a few muted crackles over a low rumble. */
function lavaSizzle() {
  const seconds = 1.1;
  const out = buffer(seconds);
  // Smooth (smoothstep) fade-in over 150 ms, then an exponential tail.
  const fadeIn = (t: number) => {
    const x = Math.min(1, t / 0.15);
    return x * x * (3 - 2 * x);
  };
  const env = (t: number) => fadeIn(t) * Math.exp(-Math.max(0, t - 0.08) / 0.32);
  mixInto(
    out,
    biquad(noise(seconds, 61, env), 'bandpass', () => 1800, 0.7),
    0,
    0.35,
  );
  mixInto(
    out,
    biquad(noise(seconds, 67, env), 'lowpass', () => 140),
    0,
    2.5,
  );
  const random = seededRandom(71);
  for (let i = 0; i < 18; i++) {
    const at = Math.pow(random(), 1.6) * 0.8;
    mixInto(
      out,
      biquad(noise(0.008, 100 + i, hit(0.001, 0.002)), 'bandpass', () => 1400, 1),
      at,
      (0.3 + random() * 0.4) * env(at),
    );
  }
  return finish(out, 0.18, 3500);
}

const sounds: Record<string, () => Float32Array> = {
  'impact-soft': impactSoft,
  'impact-hard': impactHard,
  'portal-enter': portalEnter,
  'portal-exit': portalExit,
  'water-splash-in': waterSplashIn,
  'water-splash-out': waterSplashOut,
  'water-sink': waterSink,
  'lava-sizzle': lavaSizzle,
};

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const [name, render] of Object.entries(sounds)) {
    const file = path.join(OUT_DIR, `${name}.wav`);
    const samples = render();
    await writeFile(file, wav(samples));
    console.log(`${file}  ${(samples.length / SAMPLE_RATE).toFixed(2)}s`);
  }
}

void main();
