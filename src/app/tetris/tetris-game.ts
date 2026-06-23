// Tetris Game Engine (TypeScript / Canvas)
// Framework-free, mirrors the structure of the other RETRO CADE engines:
//   constructor(canvas, synth, onStatusChange) + resetGame/start/pause/togglePause/destroy
import { TetrisSoundSynth } from './tetris-synth';

export type TetrisState = 'START' | 'PLAYING' | 'PAUSED' | 'GAMEOVER';

export interface TetrisStatus {
  score: number;
  highScore: number;
  lines: number;
  level: number;
  state: TetrisState;
}

export type RotateDir = 1 | -1; // 1 = clockwise, -1 = counter-clockwise

interface Piece {
  type: number; // index into PIECES
  matrix: number[][];
  x: number;
  y: number;
}

// --- Visual "juice" entities (rendering only, no gameplay effect) ---
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // ms remaining
  maxLife: number;
  size: number;
  color: string;
}

interface ScorePopup {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

interface DropTrail {
  cols: number[];
  yTop: number;
  yBot: number;
  color: string;
  life: number;
  maxLife: number;
}

const STAR_COUNT = 28;
const MAX_SHAKE_MS = 380;
const MAX_FLASH_MS = 240;

// Board.
const COLS = 10;
const ROWS = 20;

// Canvas layout (kept in sync with the <canvas> element in the component).
const CW = 380;
const CH = 420;
const CELL = 17;
const WELL_X = 12;
const WELL_Y = 40;
const WELL_W = COLS * CELL; // 170
const WELL_H = ROWS * CELL; // 340
const PANEL_X = WELL_X + WELL_W + 18; // 200
const MINI = 13; // preview cell size

const HIGHSCORE_KEY = 'tetris-highscore';

// Spawn-orientation matrices + colors for the 7 tetrominoes.
const PIECES: { matrix: number[][]; color: string }[] = [
  // I
  {
    matrix: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    color: '#2be6e6',
  },
  // O
  {
    matrix: [
      [1, 1],
      [1, 1],
    ],
    color: '#ecd94d',
  },
  // T
  {
    matrix: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: '#b14dff',
  },
  // S
  {
    matrix: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    color: '#4dff6a',
  },
  // Z
  {
    matrix: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
    color: '#ff5d5d',
  },
  // J
  {
    matrix: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: '#5d8bff',
  },
  // L
  {
    matrix: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: '#ff9d4d',
  },
];

// Gravity (ms per cell) by level. Index clamped to last entry.
const GRAVITY_MS = [800, 720, 630, 550, 470, 380, 300, 220, 130, 100, 80, 80, 70, 70, 70, 50];
const SOFT_DROP_MS = 35;
const LOCK_DELAY_MS = 500;

// Standard line-clear base scores (multiplied by level).
const LINE_SCORES = [0, 100, 300, 500, 800];

export class TetrisEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private synth: TetrisSoundSynth;
  private onStatusChange: (status: TetrisStatus) => void;

  private board: number[][] = []; // 0 = empty, else (type+1) for color
  private active: Piece | null = null;
  private holdType: number | null = null;
  private canHold = true;
  private queue: number[] = [];
  private bag: number[] = [];

  private score = 0;
  private highScore = 0;
  private lines = 0;
  private level = 1;

  private state: TetrisState = 'START';
  private animationId: number | null = null;
  private lastTime = 0;
  private dropCounter = 0;
  private softDropping = false;
  private lockTimer = 0;
  private grounded = false;

  // Visual effects (rendering only).
  private particles: Particle[] = [];
  private popups: ScorePopup[] = [];
  private stars: Star[] = [];
  private dropTrail: DropTrail | null = null;
  private elapsed = 0;
  private shakeTime = 0;
  private shakeMag = 0;
  private flashTime = 0;

  constructor(
    canvas: HTMLCanvasElement,
    synth: TetrisSoundSynth,
    onStatusChange: (status: TetrisStatus) => void
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get 2D context');
    this.ctx = context;
    this.synth = synth;
    this.onStatusChange = onStatusChange;

    this.highScore = this.loadHighScore();
    this.initStars();
    this.resetGame();
  }

  private initStars() {
    this.stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      this.stars.push({
        x: WELL_X + Math.random() * WELL_W,
        y: WELL_Y + Math.random() * WELL_H,
        size: 0.6 + Math.random() * 1.1,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  private loadHighScore(): number {
    if (typeof window === 'undefined') return 0;
    const raw = window.localStorage.getItem(HIGHSCORE_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  }

  private saveHighScore() {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(HIGHSCORE_KEY, String(this.highScore));
  }

  public resetGame() {
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.holdType = null;
    this.canHold = true;
    this.queue = [];
    this.bag = [];
    this.active = null;
    this.dropCounter = 0;
    this.lockTimer = 0;
    this.grounded = false;
    this.softDropping = false;
    this.particles = [];
    this.popups = [];
    this.dropTrail = null;
    this.shakeTime = 0;
    this.flashTime = 0;
    this.state = 'START';
    this.refillQueue();
    this.drawFrame();
    this.updateStatus();
  }

  // ---- 7-bag randomizer ----
  private refillQueue() {
    while (this.queue.length < 5) {
      if (this.bag.length === 0) {
        this.bag = [0, 1, 2, 3, 4, 5, 6];
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      this.queue.push(this.bag.pop()!);
    }
  }

  private spawn(type?: number) {
    const t = type ?? this.queue.shift()!;
    this.refillQueue();
    const matrix = PIECES[t].matrix.map((r) => [...r]);
    const size = matrix.length;
    const piece: Piece = {
      type: t,
      matrix,
      x: Math.floor((COLS - size) / 2),
      y: t === 0 ? 0 : 0, // spawn near top
    };
    this.active = piece;
    this.canHold = true;
    this.grounded = false;
    this.lockTimer = 0;

    if (this.collides(piece.matrix, piece.x, piece.y)) {
      this.gameOver();
    }
  }

  private updateStatus() {
    this.onStatusChange({
      score: this.score,
      highScore: this.highScore,
      lines: this.lines,
      level: this.level,
      state: this.state,
    });
  }

  // ---- Collision / rotation ----
  private collides(matrix: number[][], px: number, py: number): boolean {
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        const x = px + c;
        const y = py + r;
        if (x < 0 || x >= COLS || y >= ROWS) return true;
        if (y >= 0 && this.board[y][x]) return true;
      }
    }
    return false;
  }

  private rotateMatrix(matrix: number[][], dir: RotateDir): number[][] {
    const n = matrix.length;
    const result = Array.from({ length: n }, () => Array(n).fill(0));
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (dir === 1) result[c][n - 1 - r] = matrix[r][c];
        else result[n - 1 - c][r] = matrix[r][c];
      }
    }
    return result;
  }

  // ---- Public input API ----
  public move(dir: -1 | 1) {
    if (this.state !== 'PLAYING' || !this.active) return;
    const p = this.active;
    if (!this.collides(p.matrix, p.x + dir, p.y)) {
      p.x += dir;
      this.synth.playMove();
      this.resetLockIfGrounded();
      this.drawFrame();
    }
  }

  public rotate(dir: RotateDir) {
    if (this.state !== 'PLAYING' || !this.active) return;
    const p = this.active;
    const rotated = this.rotateMatrix(p.matrix, dir);
    // Simple wall-kick attempts (not full SRS): try small horizontal/vertical nudges.
    const kicks = [0, -1, 1, -2, 2];
    for (const k of kicks) {
      if (!this.collides(rotated, p.x + k, p.y)) {
        p.matrix = rotated;
        p.x += k;
        this.synth.playRotate();
        this.resetLockIfGrounded();
        this.drawFrame();
        return;
      }
    }
    // Last resort: try nudging up one row (helps I-piece off the floor).
    if (!this.collides(rotated, p.x, p.y - 1)) {
      p.matrix = rotated;
      p.y -= 1;
      this.synth.playRotate();
      this.drawFrame();
    }
  }

  public setSoftDrop(on: boolean) {
    this.softDropping = on;
  }

  public hardDrop() {
    if (this.state !== 'PLAYING' || !this.active) return;
    const p = this.active;
    const startY = p.y;
    let dropped = 0;
    while (!this.collides(p.matrix, p.x, p.y + 1)) {
      p.y += 1;
      dropped++;
    }
    if (dropped > 0) {
      this.score += dropped * 2;
      // Record a fading slam trail over the piece's columns.
      const cols = new Set<number>();
      let minR = Infinity;
      let maxR = -Infinity;
      for (let r = 0; r < p.matrix.length; r++) {
        for (let c = 0; c < p.matrix[r].length; c++) {
          if (p.matrix[r][c]) {
            cols.add(p.x + c);
            if (r < minR) minR = r;
            if (r > maxR) maxR = r;
          }
        }
      }
      this.dropTrail = {
        cols: [...cols],
        yTop: WELL_Y + (startY + minR) * CELL,
        yBot: WELL_Y + (p.y + maxR + 1) * CELL,
        color: PIECES[p.type].color,
        life: 220,
        maxLife: 220,
      };
    }
    this.synth.playHardDrop();
    this.lockPiece();
  }

  public hold() {
    if (this.state !== 'PLAYING' || !this.active || !this.canHold) return;
    const current = this.active.type;
    this.synth.playHold();
    if (this.holdType === null) {
      this.holdType = current;
      this.spawn();
    } else {
      const swap = this.holdType;
      this.holdType = current;
      this.spawn(swap);
    }
    this.canHold = false;
    this.drawFrame();
  }

  private resetLockIfGrounded() {
    if (this.grounded) {
      this.lockTimer = 0;
      // Re-evaluate grounded state after the move/rotate.
      if (this.active && !this.collides(this.active.matrix, this.active.x, this.active.y + 1)) {
        this.grounded = false;
      }
    }
  }

  // ---- Lifecycle ----
  public start() {
    if (this.state === 'GAMEOVER' || this.state === 'START') {
      if (this.state === 'GAMEOVER') this.resetGame();
      this.state = 'PLAYING';
      this.spawn();
      this.synth.startTheme();
      this.lastTime = performance.now();
      this.updateStatus();
      this.loop(performance.now());
    } else if (this.state === 'PAUSED') {
      this.state = 'PLAYING';
      this.synth.startTheme();
      this.lastTime = performance.now();
      this.updateStatus();
      this.loop(performance.now());
    }
  }

  public pause() {
    if (this.state === 'PLAYING') {
      this.state = 'PAUSED';
      this.synth.stopTheme();
      this.updateStatus();
      if (this.animationId) cancelAnimationFrame(this.animationId);
      this.drawFrame();
      this.drawOverlay('PAUSED');
    }
  }

  public togglePause() {
    if (this.state === 'PLAYING') this.pause();
    else if (this.state === 'PAUSED' || this.state === 'START') this.start();
  }

  public destroy() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.synth.stopAll();
  }

  // ---- Main loop ----
  private loop = (timestamp: number) => {
    if (this.state !== 'PLAYING') return;

    let delta = timestamp - this.lastTime;
    this.lastTime = timestamp;
    if (delta > 100) delta = 100; // cap after tab switches
    this.elapsed += delta;
    this.updateEffects(delta);

    this.dropCounter += delta;
    const interval = this.softDropping ? SOFT_DROP_MS : this.gravityInterval();

    if (this.dropCounter >= interval) {
      this.dropCounter = 0;
      this.step();
    }

    // Lock delay handling when the piece is resting on the stack.
    if (this.grounded) {
      this.lockTimer += delta;
      if (this.lockTimer >= LOCK_DELAY_MS) {
        this.lockPiece();
      }
    }

    this.drawFrame();
    if (this.state === 'PLAYING') {
      this.animationId = requestAnimationFrame(this.loop);
    }
  };

  private gravityInterval(): number {
    const idx = Math.min(this.level - 1, GRAVITY_MS.length - 1);
    return GRAVITY_MS[idx];
  }

  private step() {
    if (!this.active) return;
    const p = this.active;
    if (!this.collides(p.matrix, p.x, p.y + 1)) {
      p.y += 1;
      if (this.softDropping) this.score += 1;
      this.grounded = false;
      this.lockTimer = 0;
    } else {
      // Resting on the stack: arm the lock delay.
      this.grounded = true;
    }
  }

  private lockPiece() {
    if (!this.active) return;
    const p = this.active;
    for (let r = 0; r < p.matrix.length; r++) {
      for (let c = 0; c < p.matrix[r].length; c++) {
        if (p.matrix[r][c]) {
          const y = p.y + r;
          const x = p.x + c;
          if (y >= 0) this.board[y][x] = p.type + 1;
        }
      }
    }
    this.synth.playLock();
    this.active = null;
    this.grounded = false;
    this.lockTimer = 0;
    this.clearLines();
    if (this.state === 'PLAYING') this.spawn();
    this.updateStatus();
  }

  private clearLines() {
    // Find full rows first so we can spawn effects before removing them.
    const fullRows: number[] = [];
    for (let r = 0; r < ROWS; r++) {
      if (this.board[r].every((v) => v !== 0)) fullRows.push(r);
    }
    const cleared = fullRows.length;
    if (cleared === 0) return;

    // Visual effects on the cleared rows.
    for (const r of fullRows) {
      const cy = WELL_Y + r * CELL + CELL / 2;
      for (let c = 0; c < COLS; c++) {
        const color = PIECES[this.board[r][c] - 1].color;
        const cx = WELL_X + c * CELL + CELL / 2;
        this.spawnBurst(cx, cy, 3, [color, '#ffffff'], 0.5, 2.4, 260, 560);
      }
    }
    this.flashTime = MAX_FLASH_MS;
    const points = LINE_SCORES[cleared] * this.level;
    const midRow = fullRows[Math.floor(fullRows.length / 2)];
    this.popups.push({
      x: WELL_X + WELL_W / 2,
      y: WELL_Y + midRow * CELL + CELL / 2,
      text: `+${points}`,
      life: 900,
      maxLife: 900,
    });
    if (cleared === 4) {
      this.shakeTime = MAX_SHAKE_MS;
      this.shakeMag = 6;
    }

    // Remove the rows (top-to-bottom is safe: each splice+unshift only shifts rows above).
    for (const r of fullRows) {
      this.board.splice(r, 1);
      this.board.unshift(Array(COLS).fill(0));
    }

    this.lines += cleared;
    this.score += points;
    this.synth.playLineClear(cleared);
    const newLevel = Math.floor(this.lines / 10) + 1;
    if (newLevel > this.level) {
      this.level = newLevel;
      this.synth.playLevelUp();
    }
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.saveHighScore();
    }
  }

  private gameOver() {
    this.state = 'GAMEOVER';
    this.synth.playGameOver();
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.saveHighScore();
    }
    this.updateStatus();
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.drawFrame();
    this.drawOverlay('GAME OVER');
  }

  // ---- Rendering ----
  private drawFrame() {
    this.ctx.clearRect(0, 0, CW, CH);
    this.ctx.fillStyle = '#020205';
    this.ctx.fillRect(0, 0, CW, CH);

    // Shake the well + pieces + effects (not the side panel / overlays).
    this.ctx.save();
    if (this.shakeTime > 0) {
      const amt = this.shakeMag * (this.shakeTime / MAX_SHAKE_MS);
      this.ctx.translate((Math.random() - 0.5) * amt * 2, (Math.random() - 0.5) * amt * 2);
    }
    this.drawWellGrid();
    this.drawBoard();
    if (this.state !== 'GAMEOVER') {
      this.drawGhost();
      this.drawActive();
    }
    this.drawDropTrail();
    this.drawParticles();
    this.drawPopups();
    this.ctx.restore();

    // White flash over the well on a line clear (un-shaken).
    if (this.flashTime > 0) {
      this.ctx.fillStyle = `rgba(255,255,255,${0.4 * (this.flashTime / MAX_FLASH_MS)})`;
      this.ctx.fillRect(WELL_X, WELL_Y, WELL_W, WELL_H);
    }

    this.drawPanel();

    if (this.state === 'START') this.drawOverlay('PRESS PLAY');
  }

  private cellRect(col: number, row: number, color: string, inset = 1) {
    if (row < 0) return;
    const x = WELL_X + col * CELL + inset;
    const y = WELL_Y + row * CELL + inset;
    this.drawBlock(x, y, CELL - inset * 2, color, true);
  }

  // A beveled, glowing 3D tetromino cell.
  private drawBlock(px: number, py: number, size: number, color: string, glow: boolean) {
    const ctx = this.ctx;
    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
    }
    ctx.fillStyle = color;
    ctx.fillRect(px, py, size, size);
    ctx.shadowBlur = 0;

    const b = Math.max(2, size * 0.2);
    // Top highlight.
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + size, py);
    ctx.lineTo(px + size - b, py + b);
    ctx.lineTo(px + b, py + b);
    ctx.closePath();
    ctx.fill();
    // Left highlight.
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + b, py + b);
    ctx.lineTo(px + b, py + size - b);
    ctx.lineTo(px, py + size);
    ctx.closePath();
    ctx.fill();
    // Bottom shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath();
    ctx.moveTo(px, py + size);
    ctx.lineTo(px + b, py + size - b);
    ctx.lineTo(px + size - b, py + size - b);
    ctx.lineTo(px + size, py + size);
    ctx.closePath();
    ctx.fill();
    // Right shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.beginPath();
    ctx.moveTo(px + size, py);
    ctx.lineTo(px + size, py + size);
    ctx.lineTo(px + size - b, py + size - b);
    ctx.lineTo(px + size - b, py + b);
    ctx.closePath();
    ctx.fill();
  }

  private drawWellGrid() {
    const ctx = this.ctx;

    // Background gradient.
    const bg = ctx.createLinearGradient(WELL_X, WELL_Y, WELL_X, WELL_Y + WELL_H);
    bg.addColorStop(0, '#070710');
    bg.addColorStop(1, '#0a0a1a');
    ctx.fillStyle = bg;
    ctx.fillRect(WELL_X, WELL_Y, WELL_W, WELL_H);

    // Faint twinkling starfield (clipped to the well).
    ctx.save();
    ctx.beginPath();
    ctx.rect(WELL_X, WELL_Y, WELL_W, WELL_H);
    ctx.clip();
    for (const s of this.stars) {
      const tw = 0.2 + 0.4 * (0.5 + 0.5 * Math.sin(this.elapsed * 0.002 + s.phase));
      ctx.fillStyle = `rgba(150,160,210,${tw})`;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    ctx.restore();

    // Faint grid.
    ctx.strokeStyle = 'rgba(40,40,70,0.5)';
    ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(WELL_X + c * CELL, WELL_Y);
      ctx.lineTo(WELL_X + c * CELL, WELL_Y + WELL_H);
      ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(WELL_X, WELL_Y + r * CELL);
      ctx.lineTo(WELL_X + WELL_W, WELL_Y + r * CELL);
      ctx.stroke();
    }

    // Vignette (darker edges).
    const vg = ctx.createRadialGradient(
      WELL_X + WELL_W / 2, WELL_Y + WELL_H / 2, WELL_H * 0.2,
      WELL_X + WELL_W / 2, WELL_Y + WELL_H / 2, WELL_H * 0.72
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(WELL_X, WELL_Y, WELL_W, WELL_H);

    // Glowing border.
    ctx.strokeStyle = '#3a3a66';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(124,77,255,0.6)';
    ctx.shadowBlur = 8;
    ctx.strokeRect(WELL_X, WELL_Y, WELL_W, WELL_H);
    ctx.shadowBlur = 0;
  }

  private drawBoard() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = this.board[r][c];
        if (v) this.cellRect(c, r, PIECES[v - 1].color);
      }
    }
  }

  private drawActive() {
    if (!this.active) return;
    const p = this.active;
    const color = PIECES[p.type].color;
    for (let r = 0; r < p.matrix.length; r++) {
      for (let c = 0; c < p.matrix[r].length; c++) {
        if (p.matrix[r][c]) this.cellRect(p.x + c, p.y + r, color);
      }
    }
  }

  private drawGhost() {
    if (!this.active) return;
    const p = this.active;
    let gy = p.y;
    while (!this.collides(p.matrix, p.x, gy + 1)) gy++;
    if (gy === p.y) return;
    const color = PIECES[p.type].color;
    for (let r = 0; r < p.matrix.length; r++) {
      for (let c = 0; c < p.matrix[r].length; c++) {
        if (p.matrix[r][c]) {
          const row = gy + r;
          if (row < 0) continue;
          const x = WELL_X + (p.x + c) * CELL;
          const y = WELL_Y + row * CELL;
          // Translucent filled body + faint outline.
          this.ctx.globalAlpha = 0.18;
          this.ctx.fillStyle = color;
          this.ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
          this.ctx.globalAlpha = 1;
          this.ctx.strokeStyle = 'rgba(255,255,255,0.3)';
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
        }
      }
    }
  }

  // Side panel: HOLD box + NEXT queue.
  private drawPanel() {
    this.ctx.fillStyle = '#9da7ff';
    this.ctx.font = '8px "Press Start 2P", monospace';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'alphabetic';

    this.ctx.fillText('HOLD', PANEL_X, WELL_Y + 8);
    this.drawMini(this.holdType, PANEL_X, WELL_Y + 16, this.canHold ? 1 : 0.4);

    const nextTop = WELL_Y + 16 + 4 * MINI + 24;
    this.ctx.fillText('NEXT', PANEL_X, nextTop - 8);
    for (let i = 0; i < 3; i++) {
      this.drawMini(this.queue[i] ?? null, PANEL_X, nextTop + i * (3.2 * MINI), 1);
    }
  }

  private drawMini(type: number | null, x: number, y: number, alpha: number) {
    if (type === null || type === undefined) return;
    const matrix = PIECES[type].matrix;
    this.ctx.globalAlpha = alpha;
    const color = PIECES[type].color;
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c]) {
          this.drawBlock(x + c * MINI + 1, y + r * MINI + 1, MINI - 2, color, false);
        }
      }
    }
    this.ctx.globalAlpha = 1;
  }

  // ---- Visual effects (rendering only) ----

  private spawnBurst(
    x: number, y: number, count: number,
    palette: string[], speedMin: number, speedMax: number,
    lifeMin: number, lifeMax: number
  ) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = speedMin + Math.random() * (speedMax - speedMin);
      const life = lifeMin + Math.random() * (lifeMax - lifeMin);
      this.particles.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life, maxLife: life,
        size: 1 + Math.random() * 1.8,
        color: palette[Math.floor(Math.random() * palette.length)],
      });
    }
  }

  private updateEffects(delta: number) {
    const f = delta / 16.67;
    for (const p of this.particles) {
      p.x += p.vx * f;
      p.y += p.vy * f;
      p.vx *= Math.pow(0.97, f);
      p.vy *= Math.pow(0.97, f);
      p.life -= delta;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const s of this.popups) {
      s.y -= 0.4 * f;
      s.life -= delta;
    }
    this.popups = this.popups.filter((s) => s.life > 0);

    if (this.dropTrail) {
      this.dropTrail.life -= delta;
      if (this.dropTrail.life <= 0) this.dropTrail = null;
    }
    if (this.shakeTime > 0) this.shakeTime -= delta;
    if (this.flashTime > 0) this.flashTime -= delta;
  }

  private drawParticles() {
    for (const p of this.particles) {
      this.ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      this.ctx.fillStyle = p.color;
      this.ctx.shadowColor = p.color;
      this.ctx.shadowBlur = 4;
      this.ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    this.ctx.globalAlpha = 1;
    this.ctx.shadowBlur = 0;
  }

  private drawPopups() {
    this.ctx.font = '8px "Press Start 2P", monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.shadowColor = 'rgba(177, 77, 255, 0.6)';
    this.ctx.shadowBlur = 6;
    for (const s of this.popups) {
      this.ctx.globalAlpha = Math.max(0, s.life / s.maxLife);
      this.ctx.fillStyle = '#d7a3ff';
      this.ctx.fillText(s.text, s.x, s.y);
    }
    this.ctx.globalAlpha = 1;
    this.ctx.shadowBlur = 0;
  }

  private drawDropTrail() {
    const t = this.dropTrail;
    if (!t) return;
    this.ctx.save();
    this.ctx.globalAlpha = Math.max(0, t.life / t.maxLife) * 0.55;
    for (const col of t.cols) {
      const x = WELL_X + col * CELL;
      const grad = this.ctx.createLinearGradient(0, t.yTop, 0, t.yBot);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(1, t.color);
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(x + 3, t.yTop, CELL - 6, t.yBot - t.yTop);
    }
    this.ctx.globalAlpha = 1;
    this.ctx.restore();
  }

  private drawOverlay(text: string) {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    this.ctx.fillRect(0, 0, CW, CH);

    this.ctx.fillStyle = '#b14dff';
    this.ctx.font = '16px "Press Start 2P", monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.shadowColor = 'rgba(177, 77, 255, 0.5)';
    this.ctx.shadowBlur = 8;
    this.ctx.fillText(text, WELL_X + WELL_W / 2, CH / 2);
    this.ctx.shadowBlur = 0;
  }
}

export default TetrisEngine;
