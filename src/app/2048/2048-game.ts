// 2048 Game Engine (TypeScript / Canvas)
// Slide a 4x4 grid of tiles; equal tiles merge and double. Reach 2048.
import { Game2048Synth } from './2048-synth';

export type Game2048State = 'IDLE' | 'PLAYING' | 'GAMEOVER';
export type SlideDir = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface Game2048Status {
  score: number;
  best: number; // highest tile value on the board
  state: Game2048State;
}

const SIZE = 4;
const CELLS = SIZE * SIZE;

// Tile colours by value (cool → warm as the value climbs).
const TILE_COLORS: Record<number, string> = {
  2: '#1f6f8b', 4: '#176d8b', 8: '#00a8b5', 16: '#00c2a8',
  32: '#39c24b', 64: '#7ac70c', 128: '#c9b400',
  256: '#e0a000', 512: '#ff9100', 1024: '#ff6a00', 2048: '#ff3d00',
};

// Per-tile spawn/merge pop animation (keyed by cell index).
interface Pop {
  index: number;
  t: number; // 0..1 progress
  merge: boolean;
}

export class Game2048Engine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private synth: Game2048Synth;
  private onStatusChange: (s: Game2048Status) => void;

  private W: number;
  private H: number;
  private pad = 12;        // outer board padding
  private gap = 10;        // gap between cells
  private cell = 0;        // computed cell size

  private grid: number[] = new Array(CELLS).fill(0);
  private score = 0;
  private won = false;
  private state: Game2048State = 'IDLE';
  private pops: Pop[] = [];

  private animId: number | null = null;
  private lastTime = 0;

  constructor(
    canvas: HTMLCanvasElement,
    synth: Game2048Synth,
    onStatusChange: (s: Game2048Status) => void,
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context');
    this.ctx = ctx;
    this.synth = synth;
    this.onStatusChange = onStatusChange;

    this.W = canvas.width;
    this.H = canvas.height;
    this.cell = (this.W - this.pad * 2 - this.gap * (SIZE - 1)) / SIZE;

    this.initGame();
    this.startRenderLoop();
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  public start() {
    if (this.state === 'GAMEOVER' || this.state === 'IDLE') this.initGame();
    this.state = 'PLAYING';
    this.emitStatus();
  }

  public reset() {
    this.initGame();
  }

  public move(dir: SlideDir) {
    if (this.state !== 'PLAYING') {
      if (this.state === 'IDLE') this.start();
      else return;
    }

    const before = this.grid.join(',');
    let gained = 0;
    let merged = false;

    // Process each of the 4 lines in the slide direction.
    for (let i = 0; i < SIZE; i++) {
      const line = this.readLine(dir, i);
      const { result, score, didMerge } = this.collapse(line);
      gained += score;
      merged = merged || didMerge;
      this.writeLine(dir, i, result);
    }

    if (this.grid.join(',') === before) return; // no change → not a valid move

    this.score += gained;
    this.spawnTile(true);
    if (merged) this.synth.playMerge(gained); else this.synth.playMove();

    if (!this.won && this.grid.some((v) => v >= 2048)) {
      this.won = true;
      this.synth.playWin();
    }
    if (this.isGameOver()) {
      this.state = 'GAMEOVER';
      this.synth.playGameOver();
    }
    this.emitStatus();
  }

  public destroy() {
    if (this.animId !== null) cancelAnimationFrame(this.animId);
  }

  // ─── Setup & core logic ────────────────────────────────────────────────────

  private initGame() {
    this.grid = new Array(CELLS).fill(0);
    this.score = 0;
    this.won = false;
    this.pops = [];
    this.spawnTile(false);
    this.spawnTile(false);
    this.state = 'IDLE';
    this.emitStatus();
  }

  private spawnTile(animate: boolean) {
    const empties: number[] = [];
    for (let i = 0; i < CELLS; i++) if (this.grid[i] === 0) empties.push(i);
    if (empties.length === 0) return;
    const idx = empties[Math.floor(Math.random() * empties.length)];
    this.grid[idx] = Math.random() < 0.9 ? 2 : 4;
    if (animate) {
      this.pops.push({ index: idx, t: 0, merge: false });
      this.synth.playSpawn();
    }
  }

  // Read the 4 tiles of a row/column in the order they travel for `dir`
  // (front-most tile first).
  private readLine(dir: SlideDir, i: number): number[] {
    const line: number[] = [];
    for (let j = 0; j < SIZE; j++) {
      let idx: number;
      if (dir === 'LEFT') idx = i * SIZE + j;
      else if (dir === 'RIGHT') idx = i * SIZE + (SIZE - 1 - j);
      else if (dir === 'UP') idx = j * SIZE + i;
      else idx = (SIZE - 1 - j) * SIZE + i; // DOWN
      line.push(this.grid[idx]);
    }
    return line;
  }

  private writeLine(dir: SlideDir, i: number, line: number[]) {
    for (let j = 0; j < SIZE; j++) {
      let idx: number;
      if (dir === 'LEFT') idx = i * SIZE + j;
      else if (dir === 'RIGHT') idx = i * SIZE + (SIZE - 1 - j);
      else if (dir === 'UP') idx = j * SIZE + i;
      else idx = (SIZE - 1 - j) * SIZE + i;
      this.grid[idx] = line[j];
    }
  }

  // Compress + merge a single line (front-first). Returns the new line, the
  // score gained, and whether any merge happened.
  private collapse(line: number[]): { result: number[]; score: number; didMerge: boolean } {
    const nums = line.filter((v) => v !== 0);
    const out: number[] = [];
    let score = 0;
    let didMerge = false;
    for (let i = 0; i < nums.length; i++) {
      if (i + 1 < nums.length && nums[i] === nums[i + 1]) {
        const val = nums[i] * 2;
        out.push(val);
        score += val;
        didMerge = true;
        i++; // skip the consumed tile
      } else {
        out.push(nums[i]);
      }
    }
    while (out.length < SIZE) out.push(0);
    return { result: out, score, didMerge };
  }

  private isGameOver(): boolean {
    if (this.grid.some((v) => v === 0)) return false;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = this.grid[r * SIZE + c];
        if (c + 1 < SIZE && this.grid[r * SIZE + c + 1] === v) return false;
        if (r + 1 < SIZE && this.grid[(r + 1) * SIZE + c] === v) return false;
      }
    }
    return true;
  }

  private emitStatus() {
    this.onStatusChange({
      score: this.score,
      best: Math.max(0, ...this.grid),
      state: this.state,
    });
  }

  // ─── Render loop ─────────────────────────────────────────────────────────

  private startRenderLoop() {
    this.lastTime = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;
      // Advance pop animations.
      for (const p of this.pops) p.t = Math.min(1, p.t + dt * 6);
      this.pops = this.pops.filter((p) => p.t < 1);
      this.draw();
      this.animId = requestAnimationFrame(frame);
    };
    this.animId = requestAnimationFrame(frame);
  }

  private cellXY(index: number) {
    const r = Math.floor(index / SIZE);
    const c = index % SIZE;
    return {
      x: this.pad + c * (this.cell + this.gap),
      y: this.pad + r * (this.cell + this.gap),
    };
  }

  private draw() {
    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0d16';
    ctx.fillRect(0, 0, W, H);

    // Empty cell slots.
    for (let i = 0; i < CELLS; i++) {
      const { x, y } = this.cellXY(i);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      this.roundRect(x, y, this.cell, this.cell, 6);
      ctx.fill();
    }

    // Tiles.
    for (let i = 0; i < CELLS; i++) {
      const v = this.grid[i];
      if (v === 0) continue;
      const pop = this.pops.find((p) => p.index === i);
      const scale = pop ? 0.3 + 0.7 * this.easeOut(pop.t) : 1;
      this.drawTile(i, v, scale);
    }

    if (this.state === 'IDLE') this.drawOverlay('PRESS PLAY', '#00e5ff');
    else if (this.state === 'GAMEOVER') this.drawOverlay('GAME OVER', '#ff3d00');
    else if (this.won) this.drawBanner('2048!', '#ffeb3b');
  }

  private drawTile(index: number, v: number, scale: number) {
    const { ctx, cell } = this;
    const { x, y } = this.cellXY(index);
    const cx = x + cell / 2;
    const cy = y + cell / 2;
    const s = cell * scale;
    const color = TILE_COLORS[v] || '#ff007f'; // beyond 2048 → pink

    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    this.roundRect(-s / 2, -s / 2, s, s, 6);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Glossy top.
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(-s / 2 + 4, -s / 2 + 4, s - 8, 3);

    // Number.
    const digits = String(v).length;
    const fontSize = Math.floor(cell * (digits >= 4 ? 0.26 : digits === 3 ? 0.32 : 0.4));
    ctx.fillStyle = '#ffffff';
    ctx.font = `${fontSize}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(v), 0, 2);
    ctx.restore();
  }

  private easeOut(t: number) { return 1 - Math.pow(1 - t, 3); }

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const { ctx } = this;
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  private drawBanner(text: string, color: string) {
    const { ctx, W } = this;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.font = `${Math.floor(W / 18)}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(text, W / 2, 4);
    ctx.shadowBlur = 0;
  }

  private drawOverlay(text: string, color: string) {
    const { ctx, W, H } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.font = `${Math.max(10, Math.floor(W / 16))}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, H / 2);
    ctx.shadowBlur = 0;
  }
}

export default Game2048Engine;
