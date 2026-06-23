// Snake Game Engine (TypeScript / Canvas)
import { RetroSoundSynth } from '../pacman/sound-synth';

export type SnakeGameState = 'IDLE' | 'PLAYING' | 'PAUSED' | 'GAMEOVER';
export type SnakeDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface SnakeStatus {
  score: number;
  highScore: number;
  state: SnakeGameState;
  length: number;
  speed: number; // current tick interval in ms
}

interface Point {
  x: number;
  y: number;
}

const COLS = 19;
const ROWS = 21;
const BASE_TICK_MS = 160;
const MIN_TICK_MS = 65;
const SPEED_STEP = 5; // reduce tick by this many ms per apple eaten

export class SnakeEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private synth: RetroSoundSynth;
  private onStatusChange: (s: SnakeStatus) => void;

  private tileW = 0;
  private tileH = 0;

  private snake: Point[] = [];
  private dir: SnakeDirection = 'RIGHT';
  private nextDir: SnakeDirection = 'RIGHT';
  private apple: Point = { x: 0, y: 0 };

  private score = 0;
  private highScore = 0;
  private tickMs = BASE_TICK_MS;
  private state: SnakeGameState = 'IDLE';

  private loopId: ReturnType<typeof setTimeout> | null = null;
  private animId: number | null = null;
  private lastRenderTime = 0;
  // Smooth animation interpolation between ticks
  private moveProgress = 0; // 0‑1 fraction of current tick elapsed

  constructor(
    canvas: HTMLCanvasElement,
    synth: RetroSoundSynth,
    onStatusChange: (s: SnakeStatus) => void,
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context');
    this.ctx = ctx;
    this.synth = synth;
    this.onStatusChange = onStatusChange;

    this.tileW = Math.floor(canvas.width / COLS);
    this.tileH = Math.floor(canvas.height / ROWS);

    this.initLevel();
    this.startRenderLoop();
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  public setDirection(dir: SnakeDirection) {
    if (this.state !== 'PLAYING') return;
    // Prevent 180° reversal
    const blocked: Record<SnakeDirection, SnakeDirection> = {
      UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT',
    };
    if (dir === blocked[this.dir]) return;
    this.nextDir = dir;
  }

  public start() {
    if (this.state === 'GAMEOVER' || this.state === 'IDLE') {
      this.initLevel();
    }
    if (this.state === 'PLAYING') return;
    this.state = 'PLAYING';
    this.emitStatus();
    this.scheduleNextTick();
  }

  public togglePause() {
    if (this.state === 'PLAYING') {
      this.state = 'PAUSED';
      this.clearTick();
      this.emitStatus();
    } else if (this.state === 'PAUSED') {
      this.state = 'PLAYING';
      this.emitStatus();
      this.scheduleNextTick();
    } else if (this.state === 'IDLE' || this.state === 'GAMEOVER') {
      this.start();
    }
  }

  public reset() {
    this.clearTick();
    this.initLevel();
  }

  public destroy() {
    this.clearTick();
    if (this.animId !== null) cancelAnimationFrame(this.animId);
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private initLevel() {
    // Spawn snake in the middle facing right, length 3
    const midX = Math.floor(COLS / 2);
    const midY = Math.floor(ROWS / 2);
    this.snake = [
      { x: midX,     y: midY },
      { x: midX - 1, y: midY },
      { x: midX - 2, y: midY },
    ];
    this.dir = 'RIGHT';
    this.nextDir = 'RIGHT';
    this.score = 0;
    this.tickMs = BASE_TICK_MS;
    this.moveProgress = 0;
    this.spawnApple();
    this.state = 'IDLE';
    this.emitStatus();
  }

  private spawnApple() {
    const occupied = new Set(this.snake.map(p => `${p.x},${p.y}`));
    let a: Point;
    do {
      a = {
        x: Math.floor(Math.random() * COLS),
        y: Math.floor(Math.random() * ROWS),
      };
    } while (occupied.has(`${a.x},${a.y}`));
    this.apple = a;
  }

  private scheduleNextTick() {
    this.clearTick();
    this.loopId = setTimeout(() => this.tick(), this.tickMs);
  }

  private clearTick() {
    if (this.loopId !== null) {
      clearTimeout(this.loopId);
      this.loopId = null;
    }
  }

  private tick() {
    if (this.state !== 'PLAYING') return;

    this.dir = this.nextDir;
    this.moveProgress = 0;

    const head = this.snake[0];
    const next: Point = { x: head.x, y: head.y };

    switch (this.dir) {
      case 'UP':    next.y -= 1; break;
      case 'DOWN':  next.y += 1; break;
      case 'LEFT':  next.x -= 1; break;
      case 'RIGHT': next.x += 1; break;
    }

    // Wall collision
    if (next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS) {
      this.handleDeath();
      return;
    }

    // Self collision (ignore tail tip which will be removed)
    const body = this.snake.slice(0, this.snake.length - 1);
    if (body.some(p => p.x === next.x && p.y === next.y)) {
      this.handleDeath();
      return;
    }

    const atApple = next.x === this.apple.x && next.y === this.apple.y;
    this.snake.unshift(next);
    if (atApple) {
      this.score += 10 * Math.ceil((BASE_TICK_MS - this.tickMs) / SPEED_STEP + 1);
      if (this.score > this.highScore) this.highScore = this.score;
      this.tickMs = Math.max(MIN_TICK_MS, this.tickMs - SPEED_STEP);
      this.spawnApple();
      this.synth.playEatFruit();
      this.emitStatus();
    } else {
      this.snake.pop();
      // Soft tick sound – reuse waka at very low volume
      this.synth.playWaka();
    }

    this.scheduleNextTick();
  }

  private handleDeath() {
    this.synth.playDeath();
    this.state = 'GAMEOVER';
    this.emitStatus();
  }

  private emitStatus() {
    this.onStatusChange({
      score: this.score,
      highScore: this.highScore,
      state: this.state,
      length: this.snake.length,
      speed: this.tickMs,
    });
  }

  // ─── Render loop ──────────────────────────────────────────────────────────

  private startRenderLoop() {
    this.lastRenderTime = performance.now();
    const frame = (now: number) => {
      const delta = now - this.lastRenderTime;
      this.lastRenderTime = now;

      if (this.state === 'PLAYING') {
        // Advance interpolation so animation looks smooth between ticks
        this.moveProgress = Math.min(1, this.moveProgress + delta / this.tickMs);
      }

      this.draw();
      this.animId = requestAnimationFrame(frame);
    };
    this.animId = requestAnimationFrame(frame);
  }

  private draw() {
    const { ctx, canvas, tileW, tileH } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background grid
    ctx.strokeStyle = 'rgba(0,100,50,0.08)';
    ctx.lineWidth = 0.5;
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * tileW, 0);
      ctx.lineTo(c * tileW, ROWS * tileH);
      ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * tileH);
      ctx.lineTo(COLS * tileW, r * tileH);
      ctx.stroke();
    }

    // Apple food
    const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 200);
    const ap = this.apple;
    this.drawApple(
      ap.x * tileW + tileW / 2,
      ap.y * tileH + tileH / 2,
      Math.min(tileW, tileH) * 0.42,
      pulse,
    );

    // Snake – connected organic body
    this.drawSnake();
    ctx.shadowBlur = 0;

    // Overlays
    if (this.state === 'IDLE') {
      this.drawOverlay('PRESS PLAY', '#39ff14');
    } else if (this.state === 'PAUSED') {
      this.drawOverlay('PAUSED', '#00e5ff');
    } else if (this.state === 'GAMEOVER') {
      this.drawOverlay('GAME OVER', '#ff3d00');
    }
  }

  // Draw an apple at canvas coords (cx, cy) with body radius r.
  private drawApple(cx: number, cy: number, r: number, pulse: number) {
    const { ctx } = this;

    // Soft red glow.
    ctx.shadowColor = '#ff3d00';
    ctx.shadowBlur = 8 * pulse;

    // Body: two overlapping lobes give the classic apple silhouette.
    ctx.fillStyle = '#e8231a';
    ctx.beginPath();
    ctx.arc(cx - r * 0.32, cy + r * 0.05, r * 0.75, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.32, cy + r * 0.05, r * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Lower shading for volume.
    ctx.fillStyle = 'rgba(140,10,0,0.4)';
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.45, r * 0.62, 0, Math.PI, false);
    ctx.fill();

    // Upper-left highlight.
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.35, cy - r * 0.28, r * 0.2, r * 0.3, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // Stem.
    ctx.strokeStyle = '#6b3a1f';
    ctx.lineWidth = Math.max(1.5, r * 0.16);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.55);
    ctx.lineTo(cx + r * 0.12, cy - r * 0.98);
    ctx.stroke();

    // Leaf.
    ctx.fillStyle = '#39c24b';
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.42, cy - r * 0.85, r * 0.3, r * 0.16, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw the snake as one continuous, tapered body with a distinct head.
  private drawSnake() {
    const { ctx, tileW, tileH } = this;
    const n = this.snake.length;
    if (n === 0) return;

    const baseW = Math.min(tileW, tileH);
    const cx = (p: Point) => p.x * tileW + tileW / 2;
    const cy = (p: Point) => p.y * tileH + tileH / 2;
    // Body width tapers from head (wide) to tail (thin).
    const widthAt = (i: number) => {
      const f = n > 1 ? i / (n - 1) : 0;
      return baseW * (0.7 - 0.36 * f);
    };

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Pass 1 — dark outline tube (per segment so it tapers smoothly).
    ctx.strokeStyle = '#0a5c12';
    for (let i = 0; i < n - 1; i++) {
      const w = (widthAt(i) + widthAt(i + 1)) / 2;
      ctx.lineWidth = w + 2;
      ctx.beginPath();
      ctx.moveTo(cx(this.snake[i]), cy(this.snake[i]));
      ctx.lineTo(cx(this.snake[i + 1]), cy(this.snake[i + 1]));
      ctx.stroke();
    }

    // Pass 2 — bright body, fading green from head to tail.
    for (let i = 0; i < n - 1; i++) {
      const f = i / Math.max(1, n - 1);
      const rr = Math.round(57 - 37 * f);
      const gg = Math.round(255 - 105 * f);
      const bb = Math.round(20 + 10 * f);
      ctx.strokeStyle = `rgb(${rr},${gg},${bb})`;
      ctx.lineWidth = (widthAt(i) + widthAt(i + 1)) / 2;
      ctx.beginPath();
      ctx.moveTo(cx(this.snake[i]), cy(this.snake[i]));
      ctx.lineTo(cx(this.snake[i + 1]), cy(this.snake[i + 1]));
      ctx.stroke();
    }

    // Pass 3 — subtle scale ticks across the body.
    ctx.strokeStyle = 'rgba(10,80,18,0.5)';
    ctx.lineWidth = 1.5;
    for (let i = 1; i < n - 1; i += 2) {
      const dx = cx(this.snake[i + 1]) - cx(this.snake[i - 1]);
      const dy = cy(this.snake[i + 1]) - cy(this.snake[i - 1]);
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len;
      const py = dx / len;
      const w = widthAt(i) * 0.42;
      ctx.beginPath();
      ctx.moveTo(cx(this.snake[i]) - px * w, cy(this.snake[i]) - py * w);
      ctx.lineTo(cx(this.snake[i]) + px * w, cy(this.snake[i]) + py * w);
      ctx.stroke();
    }

    // Head — brighter green with glow, on top of the body.
    const head = this.snake[0];
    const hr = widthAt(0) * 0.62;
    ctx.fillStyle = '#39ff14';
    ctx.shadowColor = '#39ff14';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(cx(head), cy(head), hr, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Flicking forked tongue (only while moving).
    if (this.state === 'PLAYING') this.drawTongue(head, hr);

    // Eyes on top.
    this.drawEyes(head);
  }

  // Forked tongue flicking out of the snake's mouth in the travel direction.
  private drawTongue(head: Point, hr: number) {
    const { ctx, tileW, tileH } = this;
    const cx = head.x * tileW + tileW / 2;
    const cy = head.y * tileH + tileH / 2;
    let dx = 0, dy = 0;
    switch (this.dir) {
      case 'UP':    dy = -1; break;
      case 'DOWN':  dy =  1; break;
      case 'LEFT':  dx = -1; break;
      case 'RIGHT': dx =  1; break;
    }
    const base = Math.min(tileW, tileH);
    const flick = (Math.sin(performance.now() / 90) + 1) / 2; // 0..1
    const len = base * (0.3 + flick * 0.4);
    const sx = cx + dx * hr * 0.8;
    const sy = cy + dy * hr * 0.8;
    const ex = cx + dx * (hr * 0.8 + len);
    const ey = cy + dy * (hr * 0.8 + len);
    const px = -dy;
    const py = dx;
    const fork = base * 0.16;

    ctx.strokeStyle = '#ff3d00';
    ctx.lineWidth = Math.max(1.5, base * 0.09);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex + px * fork + dx * fork * 0.5, ey + py * fork + dy * fork * 0.5);
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - px * fork + dx * fork * 0.5, ey - py * fork + dy * fork * 0.5);
    ctx.stroke();
  }

  private drawEyes(head: Point) {
    const { ctx, tileW, tileH } = this;
    const cx = head.x * tileW + tileW / 2;
    const cy = head.y * tileH + tileH / 2;
    const off = tileW * 0.18;
    let dx = 0, dy = 0;
    switch (this.dir) {
      case 'UP':    dy = -1; break;
      case 'DOWN':  dy =  1; break;
      case 'LEFT':  dx = -1; break;
      case 'RIGHT': dx =  1; break;
    }
    const perpX = dy; // perpendicular
    const perpY = -dx;
    const r = Math.max(1.5, tileW * 0.12);
    [1, -1].forEach(side => {
      const ex = cx + perpX * off * side + dx * off;
      const ey = cy + perpY * off * side + dy * off;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex, ey, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(ex + dx * r * 0.4, ey + dy * r * 0.4, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private drawOverlay(text: string, color: string) {
    const { ctx, canvas } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.font = `${Math.max(10, Math.floor(canvas.width / 18))}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    ctx.shadowBlur = 0;
  }
}

export default SnakeEngine;
