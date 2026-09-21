import './styles.css';
import {
  FIXED_DT,
  createGame,
  exampleBarPuzzle,
  quantizePosition,
  type Game,
  type GameSnapshot,
  type Prediction,
  type RenderState,
  type Vec2,
} from '../game';

const WORLD_HALF_WIDTH = 5.95;
const WORLD_HALF_HEIGHT = 4.25;
const FIELD_ID = 'lift-field';
const MAX_FRAME_STEPS = 12;
const GOAL = {
  minX: 0.85,
  maxX: 4.85,
  minY: -2.15,
  maxY: 2.15,
  holdSeconds: 1,
} as const;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const canvas = requiredElement<HTMLCanvasElement>('#arena');

function requiredCanvasContext(target: HTMLCanvasElement): CanvasRenderingContext2D {
  const result = target.getContext('2d');
  if (result === null) throw new Error('Canvas 2D is not available');
  return result;
}

const context = requiredCanvasContext(canvas);

const runButton = requiredElement<HTMLButtonElement>('#runButton');
const runButtonIcon = requiredElement<HTMLElement>('#runButtonIcon');
const runButtonText = requiredElement<HTMLElement>('#runButtonText');
const resetRunButton = requiredElement<HTMLButtonElement>('#resetRunButton');
const resetLayoutButton = requiredElement<HTMLButtonElement>('#resetLayoutButton');
const tickValue = requiredElement<HTMLElement>('#tickValue');
const barAngleValue = requiredElement<HTMLElement>('#barAngleValue');
const speedValue = requiredElement<HTMLElement>('#speedValue');
const runState = requiredElement<HTMLElement>('#runState');
const runLight = requiredElement<HTMLElement>('#runLight');
const dragHint = requiredElement<HTMLElement>('#dragHint');
const successMessage = requiredElement<HTMLElement>('#successMessage');

type Mode = 'setup' | 'running' | 'paused' | 'finished';

let game: Game;
let setupSnapshot: GameSnapshot;
let prediction: Prediction | null = null;
let mode: Mode = 'setup';
let commandSequence = 1;
let dragging = false;
let accumulator = 0;
let previousTime = performance.now();
let initialized = false;
let goalCharge = 0;
let barInGoal = false;

function canvasMetrics(): { width: number; height: number; scale: number; centerX: number; centerY: number } {
  const width = canvas.width;
  const height = canvas.height;
  const scale = Math.min(width / (WORLD_HALF_WIDTH * 2), height / (WORLD_HALF_HEIGHT * 2));
  return { width, height, scale, centerX: width / 2, centerY: height / 2 };
}

function worldToCanvas(point: Vec2): Vec2 {
  const { scale, centerX, centerY } = canvasMetrics();
  return { x: centerX + point.x * scale, y: centerY - point.y * scale };
}

function canvasToWorld(clientX: number, clientY: number): Vec2 {
  const rect = canvas.getBoundingClientRect();
  const pixelX = ((clientX - rect.left) / rect.width) * canvas.width;
  const pixelY = ((clientY - rect.top) / rect.height) * canvas.height;
  const { scale, centerX, centerY } = canvasMetrics();
  return { x: (pixelX - centerX) / scale, y: (centerY - pixelY) / scale };
}

function tracePolygon(points: readonly Vec2[]): void {
  const first = points[0];
  if (first === undefined) return;
  const start = worldToCanvas(first);
  context.beginPath();
  context.moveTo(start.x, start.y);
  for (let index = 1; index < points.length; index += 1) {
    const point = worldToCanvas(points[index]!);
    context.lineTo(point.x, point.y);
  }
  context.closePath();
}

function pointInPolygon(point: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index]!;
    const b = polygon[previous]!;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInGoal(point: Vec2): boolean {
  return point.x >= GOAL.minX && point.x <= GOAL.maxX && point.y >= GOAL.minY && point.y <= GOAL.maxY;
}

function drawBackground(): void {
  const { width, height, scale, centerX, centerY } = canvasMetrics();
  const gradient = context.createRadialGradient(
    centerX * 0.65,
    centerY * 0.2,
    scale,
    centerX,
    centerY,
    Math.max(width, height) * 0.72,
  );
  gradient.addColorStop(0, '#183d36');
  gradient.addColorStop(1, '#081f20');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.save();
  context.strokeStyle = 'rgba(174, 223, 185, 0.055)';
  context.lineWidth = Math.max(1, devicePixelRatio);
  for (let coordinate = -5; coordinate <= 5; coordinate += 1) {
    const verticalStart = worldToCanvas({ x: coordinate, y: -WORLD_HALF_HEIGHT });
    const verticalEnd = worldToCanvas({ x: coordinate, y: WORLD_HALF_HEIGHT });
    context.beginPath();
    context.moveTo(verticalStart.x, verticalStart.y);
    context.lineTo(verticalEnd.x, verticalEnd.y);
    context.stroke();
  }
  for (let coordinate = -3; coordinate <= 3; coordinate += 1) {
    const horizontalStart = worldToCanvas({ x: -WORLD_HALF_WIDTH, y: coordinate });
    const horizontalEnd = worldToCanvas({ x: WORLD_HALF_WIDTH, y: coordinate });
    context.beginPath();
    context.moveTo(horizontalStart.x, horizontalStart.y);
    context.lineTo(horizontalEnd.x, horizontalEnd.y);
    context.stroke();
  }
  context.restore();

}

function drawGoal(): void {
  const topLeft = worldToCanvas({ x: GOAL.minX, y: GOAL.maxY });
  const bottomRight = worldToCanvas({ x: GOAL.maxX, y: GOAL.minY });
  const width = bottomRight.x - topLeft.x;
  const height = bottomRight.y - topLeft.y;
  const progress = goalCharge / GOAL.holdSeconds;

  context.save();
  context.beginPath();
  context.roundRect(topLeft.x, topLeft.y, width, height, 18 * devicePixelRatio);
  context.fillStyle = barInGoal ? 'rgba(199, 243, 110, 0.18)' : 'rgba(199, 243, 110, 0.065)';
  context.fill();
  context.strokeStyle = barInGoal ? '#d8ff91' : 'rgba(199, 243, 110, 0.48)';
  context.lineWidth = (barInGoal ? 3 : 2) * devicePixelRatio;
  context.setLineDash(barInGoal ? [] : [8 * devicePixelRatio, 7 * devicePixelRatio]);
  context.stroke();
  context.setLineDash([]);

  context.textAlign = 'center';
  context.fillStyle = barInGoal ? '#e8ffba' : 'rgba(224, 249, 181, 0.68)';
  context.font = `500 ${10 * devicePixelRatio}px "DM Mono", monospace`;
  context.fillText('GOAL · KEEP CENTER DOT INSIDE', topLeft.x + width / 2, topLeft.y + 22 * devicePixelRatio);

  const progressX = topLeft.x + 16 * devicePixelRatio;
  const progressY = bottomRight.y - 18 * devicePixelRatio;
  const progressWidth = width - 32 * devicePixelRatio;
  const progressHeight = 5 * devicePixelRatio;
  context.fillStyle = 'rgba(7, 25, 26, 0.7)';
  context.fillRect(progressX, progressY, progressWidth, progressHeight);
  context.fillStyle = '#c7f36e';
  context.fillRect(progressX, progressY, progressWidth * progress, progressHeight);
  context.restore();
}

function drawPrediction(): void {
  if (prediction === null || prediction.samples.length < 2) return;
  const predictedBodies = prediction.samples
    .map((sample) => sample.bodies.find((body) => body.id === 'bar'))
    .filter((body) => body !== undefined);
  const goalEntryIndex = predictedBodies.findIndex((body) => pointInGoal(body.position));
  const visibleBodies = goalEntryIndex >= 0 ? predictedBodies.slice(0, goalEntryIndex + 1) : predictedBodies;
  const points = visibleBodies.map((body) => worldToCanvas(body.position));
  if (points.length < 2) return;

  context.save();
  context.strokeStyle = 'rgba(218, 251, 149, 0.62)';
  context.lineWidth = 2 * devicePixelRatio;
  context.setLineDash([2 * devicePixelRatio, 8 * devicePixelRatio]);
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(points[0]!.x, points[0]!.y);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index]!.x, points[index]!.y);
  }
  context.stroke();
  context.restore();

  if (goalEntryIndex >= 0) {
    const endpoint = points[points.length - 1]!;
    context.beginPath();
    context.arc(endpoint.x, endpoint.y, 6 * devicePixelRatio, 0, Math.PI * 2);
    context.fillStyle = '#d8ff91';
    context.fill();
    context.strokeStyle = '#17362d';
    context.lineWidth = 2 * devicePixelRatio;
    context.stroke();
  }
}

function drawStaticBodies(state: RenderState): void {
  context.save();
  context.shadowColor = 'rgba(0, 0, 0, 0.35)';
  context.shadowBlur = 10 * devicePixelRatio;
  context.shadowOffsetY = 4 * devicePixelRatio;
  for (const body of state.staticBodies) {
    for (const piece of body.pieces) {
      tracePolygon(piece.worldPolygon);
      context.fillStyle = body.id.includes('gate') ? '#d7dbce' : '#71877f';
      context.fill();
      context.shadowColor = 'transparent';
      context.strokeStyle = body.id.includes('gate') ? '#f1f3e9' : '#8da098';
      context.lineWidth = 1.5 * devicePixelRatio;
      context.stroke();
      context.shadowColor = 'rgba(0, 0, 0, 0.35)';
    }
  }
  context.restore();
}

function drawField(state: RenderState): void {
  const field = state.fields.find((candidate) => candidate.id === FIELD_ID);
  if (field === undefined) return;
  const center = worldToCanvas(field.position);
  const tip = worldToCanvas({
    x: field.position.x + field.forceDensityWorld.x * 0.105,
    y: field.position.y + field.forceDensityWorld.y * 0.105,
  });

  context.save();
  tracePolygon(field.worldPolygon);
  context.fillStyle = field.enabled ? 'rgba(190, 244, 113, 0.28)' : 'rgba(190, 244, 113, 0.16)';
  context.fill();
  context.strokeStyle = field.enabled ? '#d7ff91' : '#a9d874';
  context.lineWidth = 2 * devicePixelRatio;
  context.setLineDash(field.enabled ? [] : [7 * devicePixelRatio, 5 * devicePixelRatio]);
  context.stroke();
  context.setLineDash([]);

  context.strokeStyle = '#eaffbd';
  context.fillStyle = '#eaffbd';
  context.lineWidth = 2.5 * devicePixelRatio;
  context.beginPath();
  context.moveTo(center.x, center.y);
  context.lineTo(tip.x, tip.y);
  context.stroke();
  const angle = Math.atan2(tip.y - center.y, tip.x - center.x);
  const arrowSize = 8 * devicePixelRatio;
  context.beginPath();
  context.moveTo(tip.x, tip.y);
  context.lineTo(tip.x - arrowSize * Math.cos(angle - Math.PI / 6), tip.y - arrowSize * Math.sin(angle - Math.PI / 6));
  context.lineTo(tip.x - arrowSize * Math.cos(angle + Math.PI / 6), tip.y - arrowSize * Math.sin(angle + Math.PI / 6));
  context.closePath();
  context.fill();

  if (mode === 'setup' || dragging) {
    context.beginPath();
    context.arc(center.x, center.y, 5 * devicePixelRatio, 0, Math.PI * 2);
    context.fillStyle = '#102b25';
    context.fill();
    context.strokeStyle = '#eaffbd';
    context.lineWidth = 2 * devicePixelRatio;
    context.stroke();
  }
  context.restore();
}

function drawDynamicBodies(state: RenderState): void {
  context.save();
  context.shadowColor = 'rgba(0, 0, 0, 0.45)';
  context.shadowBlur = 14 * devicePixelRatio;
  context.shadowOffsetY = 6 * devicePixelRatio;
  for (const body of state.bodies) {
    for (const piece of body.pieces) {
      tracePolygon(piece.worldPolygon);
      const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, '#ffbb6f');
      gradient.addColorStop(1, '#ec684c');
      context.fillStyle = gradient;
      context.fill();
      context.shadowColor = 'transparent';
      context.strokeStyle = '#ffd6a0';
      context.lineWidth = 2 * devicePixelRatio;
      context.stroke();
    }
    const center = worldToCanvas(body.position);
    context.beginPath();
    context.arc(center.x, center.y, 5 * devicePixelRatio, 0, Math.PI * 2);
    context.fillStyle = '#fff5c7';
    context.fill();
    context.strokeStyle = '#7d3f30';
    context.lineWidth = 2 * devicePixelRatio;
    context.stroke();
  }
  context.restore();
}

function render(): void {
  if (!initialized) return;
  const state = game.getRenderState();
  drawBackground();
  drawGoal();
  if (mode === 'setup') drawPrediction();
  drawStaticBodies(state);
  drawField(state);
  drawDynamicBodies(state);
  updateReadout(state);
}

function updateReadout(state: RenderState): void {
  const bar = state.bodies.find((body) => body.id === 'bar');
  const field = state.fields.find((candidate) => candidate.id === FIELD_ID);
  if (bar === undefined || field === undefined) return;
  tickValue.textContent = state.tick.toLocaleString();
  barAngleValue.textContent = `${((bar.angle * 180) / Math.PI).toFixed(1)}°`;
  speedValue.textContent = Math.hypot(bar.linearVelocity.x, bar.linearVelocity.y).toFixed(2);
  updateControls();
}

function updateGoalProgress(): void {
  const bar = game.getRenderState().bodies.find((body) => body.id === 'bar');
  if (bar === undefined) return;
  barInGoal = pointInGoal(bar.position);
  goalCharge = barInGoal
    ? Math.min(GOAL.holdSeconds, goalCharge + FIXED_DT)
    : Math.max(0, goalCharge - FIXED_DT * 0.35);
  if (goalCharge >= GOAL.holdSeconds) {
    mode = 'finished';
    successMessage.classList.add('visible');
  }
}

function updateControls(): void {
  const running = mode === 'running';
  const paused = mode === 'paused';
  runButtonIcon.textContent = running ? 'Ⅱ' : '▶';
  runButtonText.textContent = running
    ? 'Pause simulation'
    : paused
      ? 'Continue simulation'
      : mode === 'finished'
        ? 'Replay setup'
        : 'Run simulation';
  resetRunButton.disabled = mode === 'setup';
  const goalPercent = Math.round((goalCharge / GOAL.holdSeconds) * 100);
  runState.textContent = running
    ? barInGoal
      ? `In goal ${goalPercent}%`
      : 'Simulating'
    : paused
      ? 'Paused'
      : mode === 'finished'
        ? 'Goal secured'
        : 'Setting up';
  runLight.classList.toggle('active', running);
  runLight.classList.toggle('complete', mode === 'finished');
  dragHint.classList.toggle('hidden', mode !== 'setup');
}

function queueFieldPosition(position: Vec2): void {
  game.queueCommand({
    type: 'move-field',
    fieldId: FIELD_ID,
    xQ: quantizePosition(Math.max(-4.45, Math.min(4.45, position.x))),
    yQ: quantizePosition(Math.max(-3.05, Math.min(3.05, position.y))),
    sequence: commandSequence++,
  });
  game.step();
}

function updatePrediction(): void {
  if (mode !== 'setup') return;
  prediction = game.predict(
    {
      type: 'set-field-enabled',
      fieldId: FIELD_ID,
      enabled: true,
      sequence: commandSequence,
    },
    { maxTicks: 3600, sampleEveryTicks: 12 },
  );
  render();
}

function beginRun(): void {
  setupSnapshot = game.snapshot();
  game.queueCommand({
    type: 'set-field-enabled',
    fieldId: FIELD_ID,
    enabled: true,
    sequence: commandSequence++,
  });
  mode = 'running';
  accumulator = 0;
  goalCharge = 0;
  barInGoal = false;
  previousTime = performance.now();
  successMessage.classList.remove('visible');
  updateControls();
}

function resetRun(): void {
  game.restore(setupSnapshot);
  mode = 'setup';
  accumulator = 0;
  goalCharge = 0;
  barInGoal = false;
  successMessage.classList.remove('visible');
  updatePrediction();
}

async function resetLayout(): Promise<void> {
  game.destroy();
  game = await createGame(exampleBarPuzzle);
  setupSnapshot = game.snapshot();
  commandSequence = 1;
  mode = 'setup';
  accumulator = 0;
  goalCharge = 0;
  barInGoal = false;
  successMessage.classList.remove('visible');
  updatePrediction();
}

canvas.addEventListener('pointerdown', (event) => {
  if (!initialized || mode !== 'setup') return;
  const field = game.getRenderState().fields.find((candidate) => candidate.id === FIELD_ID);
  if (field === undefined || !pointInPolygon(canvasToWorld(event.clientX, event.clientY), field.worldPolygon)) {
    return;
  }
  dragging = true;
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add('dragging');
  dragHint.classList.add('hidden');
});

canvas.addEventListener('pointermove', (event) => {
  if (!dragging || mode !== 'setup') return;
  queueFieldPosition(canvasToWorld(event.clientX, event.clientY));
  prediction = null;
  render();
});

function finishDragging(event: PointerEvent): void {
  if (!dragging) return;
  dragging = false;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  canvas.classList.remove('dragging');
  updatePrediction();
}

canvas.addEventListener('pointerup', finishDragging);
canvas.addEventListener('pointercancel', finishDragging);

runButton.addEventListener('click', () => {
  if (!initialized) return;
  if (mode === 'setup') beginRun();
  else if (mode === 'finished') {
    resetRun();
    beginRun();
  }
  else if (mode === 'running') mode = 'paused';
  else {
    mode = 'running';
    previousTime = performance.now();
  }
  updateControls();
});

resetRunButton.addEventListener('click', () => {
  if (initialized) resetRun();
});
resetLayoutButton.addEventListener('click', () => {
  if (initialized) void resetLayout();
});

window.addEventListener('keydown', (event) => {
  if (!initialized) return;
  if (event.code === 'Space' && event.target === document.body) {
    event.preventDefault();
    runButton.click();
  } else if (event.key.toLowerCase() === 'r') {
    resetRun();
  }
});

const resizeObserver = new ResizeObserver(() => {
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(devicePixelRatio, 2);
  const width = Math.max(1, Math.round(rect.width * pixelRatio));
  const height = Math.max(1, Math.round(rect.height * pixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    render();
  }
});
resizeObserver.observe(canvas);

function animationFrame(now: number): void {
  const elapsed = Math.min((now - previousTime) / 1000, 0.1);
  previousTime = now;
  if (mode === 'running') {
    accumulator += elapsed;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < MAX_FRAME_STEPS && mode === 'running') {
      game.step();
      updateGoalProgress();
      accumulator -= FIXED_DT;
      steps += 1;
    }
    if (steps === MAX_FRAME_STEPS) accumulator = 0;
  }
  render();
  requestAnimationFrame(animationFrame);
}

async function initialize(): Promise<void> {
  game = await createGame(exampleBarPuzzle);
  setupSnapshot = game.snapshot();
  initialized = true;
  runButton.disabled = false;
  resetLayoutButton.disabled = false;
  updatePrediction();
  updateControls();
  requestAnimationFrame(animationFrame);
}

void initialize().catch((error: unknown) => {
  runState.textContent = 'Failed to load';
  console.error(error);
});

window.addEventListener('beforeunload', () => {
  resizeObserver.disconnect();
  if (initialized) game.destroy();
});
