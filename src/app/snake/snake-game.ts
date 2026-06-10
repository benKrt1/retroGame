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

    // Apple – pulsing neon red square
    const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 200);
    ctx.fillStyle = `rgba(255,61,0,${pulse})`;
    ctx.shadowColor = '#ff3d00';
    ctx.shadowBlur = 8;
    const ap = this.apple;
    ctx.fillRect(
      ap.x * tileW + 3,
      ap.y * tileH + 3,
      tileW - 6,
      tileH - 6,
    );
    ctx.shadowBlur = 0;

    // Snake body
    this.snake.forEach((seg, i) => {
      const isHead = i === 0;
      const t = 1 - i / this.snake.length; // brightness gradient

      if (isHead) {
        ctx.fillStyle = '#39ff14';
        ctx.shadowColor = '#39ff14';
        ctx.shadowBlur = 10;
      } else {
        const g = Math.round(160 + t * 80);
        ctx.fillStyle = `rgb(0,${g},0)`;
        ctx.shadowBlur = 0;
      }

      const pad = isHead ? 1 : 2;
      ctx.fillRect(
        seg.x * tileW + pad,
        seg.y * tileH + pad,
        tileW - pad * 2,
        tileH - pad * 2,
      );

      // Head eyes
      if (isHead) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#000';
        this.drawEyes(seg);
      }
    });
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
