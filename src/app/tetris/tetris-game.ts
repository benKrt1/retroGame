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
    this.resetGame();
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
    let dropped = 0;
    while (!this.collides(p.matrix, p.x, p.y + 1)) {
      p.y += 1;
      dropped++;
    }
    if (dropped > 0) this.score += dropped * 2;
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
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (this.board[r].every((v) => v !== 0)) {
        this.board.splice(r, 1);
        this.board.unshift(Array(COLS).fill(0));
        cleared++;
        r++; // recheck the same row index after the shift
      }
    }
    if (cleared > 0) {
      this.lines += cleared;
      this.score += LINE_SCORES[cleared] * this.level;
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

    this.drawWellGrid();
    this.drawBoard();
    if (this.state !== 'GAMEOVER') {
      this.drawGhost();
      this.drawActive();
    }
    this.drawPanel();

    if (this.state === 'START') this.drawOverlay('PRESS PLAY');
  }

  private cellRect(col: number, row: number, color: string, inset = 1) {
    if (row < 0) return;
    const x = WELL_X + col * CELL;
    const y = WELL_Y + row * CELL;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x + inset, y + inset, CELL - inset * 2, CELL - inset * 2);
  }

  private drawWellGrid() {
    this.ctx.fillStyle = '#06060c';
    this.ctx.fillRect(WELL_X, WELL_Y, WELL_W, WELL_H);
    this.ctx.strokeStyle = '#15152a';
    this.ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
      this.ctx.beginPath();
      this.ctx.moveTo(WELL_X + c * CELL, WELL_Y);
      this.ctx.lineTo(WELL_X + c * CELL, WELL_Y + WELL_H);
      this.ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      this.ctx.beginPath();
      this.ctx.moveTo(WELL_X, WELL_Y + r * CELL);
      this.ctx.lineTo(WELL_X + WELL_W, WELL_Y + r * CELL);
      this.ctx.stroke();
    }
    this.ctx.strokeStyle = '#3a3a66';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(WELL_X, WELL_Y, WELL_W, WELL_H);
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
    for (let r = 0; r < p.matrix.length; r++) {
      for (let c = 0; c < p.matrix[r].length; c++) {
        if (p.matrix[r][c]) {
          const row = gy + r;
          if (row < 0) continue;
          const x = WELL_X + (p.x + c) * CELL;
          const y = WELL_Y + row * CELL;
          this.ctx.strokeStyle = 'rgba(255,255,255,0.35)';
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
    this.ctx.fillStyle = PIECES[type].color;
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c]) {
          this.ctx.fillRect(x + c * MINI + 1, y + r * MINI + 1, MINI - 2, MINI - 2);
        }
      }
    }
    this.ctx.globalAlpha = 1;
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
