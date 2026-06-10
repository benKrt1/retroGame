// Space Invaders Game Engine (TypeScript / Canvas)
// Framework-free, mirrors the structure of pacman/pacman-game.ts:
//   constructor(canvas, synth, onStatusChange) + resetGame/start/pause/togglePause/destroy
import { InvaderSoundSynth } from './invader-synth';

export type SpaceInvadersState = 'START' | 'PLAYING' | 'PAUSED' | 'GAMEOVER' | 'DYING';

export interface SpaceInvadersStatus {
  score: number;
  highScore: number;
  lives: number;
  wave: number;
  state: SpaceInvadersState;
}

export type InvaderInput = 'LEFT' | 'RIGHT' | 'NONE';

interface Bullet {
  x: number;
  y: number;
  alive: boolean;
}

// Canvas dimensions (kept in sync with the <canvas> element in the component).
const CW = 380;
const CH = 420;

// Player cannon.
const PLAYER_W = 28;
const PLAYER_H = 14;
const PLAYER_Y = CH - 30;
const PLAYER_SPEED = 3; // px per normalized frame
const MARGIN = 14;

// Invader grid.
const INV_COLS = 11;
const INV_ROWS = 5;
const CELL_W = 24;
const CELL_H = 20;
const INV_W = 16;
const INV_H = 12;
const STEP_X = 8; // horizontal pixels per march step
const DROP_Y = 14; // vertical drop when reversing
const TOTAL_INVADERS = INV_COLS * INV_ROWS;

// Bullets.
const PLAYER_BULLET_SPEED = 6;
const INVADER_BULLET_SPEED = 3;
const BULLET_W = 3;
const BULLET_H = 9;

// Shields / bunkers.
const SHIELD_COUNT = 4;
const SHIELD_COLS = 8;
const SHIELD_ROWS = 6;
const SHIELD_CELL = 4;
const SHIELD_Y = PLAYER_Y - 64;

// UFO.
const UFO_W = 26;
const UFO_H = 12;
const UFO_Y = 24;
const UFO_SPEED = 1.6;
const UFO_MIN_DELAY = 9000;
const UFO_MAX_DELAY = 18000;

const HIGHSCORE_KEY = 'si-highscore';

// Point values by invader row type: top row worth most (classic).
// rowType: 0 = top (30), 1-2 = middle (20), 3-4 = bottom (10)
function rowPoints(row: number): number {
  if (row === 0) return 30;
  if (row <= 2) return 20;
  return 10;
}
function rowType(row: number): 0 | 1 | 2 {
  if (row === 0) return 0;
  if (row <= 2) return 1;
  return 2;
}

// 8x8 sprite bitmaps (two animation frames per type) drawn with 2px pixels.
const SPRITES: Record<number, [string[], string[]]> = {
  // Type 0 — "squid"
  0: [
    [
      '00011000',
      '00111100',
      '01111110',
      '11011011',
      '11111111',
      '00100100',
      '01011010',
      '10100101',
    ],
    [
      '00011000',
      '00111100',
      '01111110',
      '11011011',
      '11111111',
      '01011010',
      '10000001',
      '01000010',
    ],
  ],
  // Type 1 — "crab"
  1: [
    [
      '00100100',
      '00100100',
      '01111110',
      '11011011',
      '11111111',
      '10111101',
      '10100101',
      '00011000',
    ],
    [
      '00100100',
      '10100101',
      '10111101',
      '11011011',
      '11111111',
      '01111110',
      '00100100',
      '01000010',
    ],
  ],
  // Type 2 — "octopus"
  2: [
    [
      '00111100',
      '01111110',
      '11111111',
      '11011011',
      '11111111',
      '00100100',
      '01011010',
      '10011001',
    ],
    [
      '00111100',
      '01111110',
      '11111111',
      '11011011',
      '11111111',
      '01000010',
      '10100101',
      '00100100',
    ],
  ],
};

const SPRITE_COLORS = ['#ff5dd2', '#5de2ff', '#9dff5d'];

export class SpaceInvadersEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private synth: InvaderSoundSynth;
  private onStatusChange: (status: SpaceInvadersStatus) => void;

  // Player.
  private playerX = 0;
  private moveDir: InvaderInput = 'NONE';
  private lives = 3;
  private score = 0;
  private highScore = 0;
  private wave = 1;

  // Invader block.
  private alive: boolean[][] = []; // [row][col]
  private blockX = 0;
  private blockY = 0;
  private invDir: 1 | -1 = 1; // 1 = right, -1 = left
  private aliveCount = 0;
  private frameToggle = false;
  private stepTimer = 0;
  private pendingDrop = false;

  // Bullets.
  private playerBullet: Bullet = { x: 0, y: 0, alive: false };
  private invaderBullets: Bullet[] = [];
  private invaderFireTimer = 0;

  // Shields: shields[i][row][col] true = intact.
  private shields: boolean[][][] = [];
  private shieldX: number[] = [];

  // UFO.
  private ufoActive = false;
  private ufoX = 0;
  private ufoDir: 1 | -1 = 1;
  private ufoTimer = 0;

  // Loop / state.
  private state: SpaceInvadersState = 'START';
  private animationId: number | null = null;
  private lastTime = 0;
  private dyingTimer = 0;

  constructor(
    canvas: HTMLCanvasElement,
    synth: InvaderSoundSynth,
    onStatusChange: (status: SpaceInvadersStatus) => void
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
    this.score = 0;
    this.lives = 3;
    this.wave = 1;
    this.state = 'START';
    this.initWave();
    this.drawFrame();
    this.updateStatus();
  }

  private initWave() {
    // Build invader grid.
    this.alive = Array.from({ length: INV_ROWS }, () =>
      Array.from({ length: INV_COLS }, () => true)
    );
    this.aliveCount = TOTAL_INVADERS;
    this.invDir = 1;
    this.frameToggle = false;
    this.stepTimer = 0;
    this.pendingDrop = false;

    // Center the block horizontally; lower start each wave (capped).
    const gridW = (INV_COLS - 1) * CELL_W + INV_W;
    this.blockX = Math.floor((CW - gridW) / 2);
    this.blockY = 30 + Math.min(this.wave - 1, 4) * 12;

    // Player.
    this.playerX = (CW - PLAYER_W) / 2;
    this.moveDir = 'NONE';

    // Bullets.
    this.playerBullet.alive = false;
    this.invaderBullets = [];
    this.invaderFireTimer = 0;

    // Shields (rebuilt fresh each wave).
    this.buildShields();

    // UFO.
    this.ufoActive = false;
    this.synth.stopUfo();
    this.ufoTimer = this.randomUfoDelay();

    this.synth.resetMarch();
  }

  private buildShields() {
    this.shields = [];
    this.shieldX = [];
    const shieldW = SHIELD_COLS * SHIELD_CELL;
    const gap = (CW - SHIELD_COUNT * shieldW) / (SHIELD_COUNT + 1);
    for (let i = 0; i < SHIELD_COUNT; i++) {
      this.shieldX.push(Math.round(gap + i * (shieldW + gap)));
      const grid: boolean[][] = [];
      for (let r = 0; r < SHIELD_ROWS; r++) {
        const row: boolean[] = [];
        for (let c = 0; c < SHIELD_COLS; c++) {
          // Carve a small notch out of the bottom-middle for the classic arch.
          const notch = r >= SHIELD_ROWS - 2 && c >= 3 && c <= 4;
          row.push(!notch);
        }
        grid.push(row);
      }
      this.shields.push(grid);
    }
  }

  private randomUfoDelay(): number {
    return UFO_MIN_DELAY + Math.random() * (UFO_MAX_DELAY - UFO_MIN_DELAY);
  }

  private updateStatus() {
    this.onStatusChange({
      score: this.score,
      highScore: this.highScore,
      lives: this.lives,
      wave: this.wave,
      state: this.state,
    });
  }

  // ---- Public input API ----

  public setDirection(dir: InvaderInput) {
    this.moveDir = dir;
  }

  public shoot() {
    if (this.state !== 'PLAYING') return;
    if (this.playerBullet.alive) return; // one player bullet at a time (classic)
    this.playerBullet = {
      x: this.playerX + PLAYER_W / 2 - BULLET_W / 2,
      y: PLAYER_Y - BULLET_H,
      alive: true,
    };
    this.synth.playShoot();
  }

  public start() {
    if (this.state === 'START' || this.state === 'GAMEOVER') {
      if (this.state === 'GAMEOVER') {
        this.resetGame();
      }
      this.state = 'PLAYING';
      this.lastTime = performance.now();
      this.updateStatus();
      this.loop(performance.now());
    } else if (this.state === 'PAUSED') {
      this.state = 'PLAYING';
      this.lastTime = performance.now();
      this.updateStatus();
      this.loop(performance.now());
    }
  }

  public pause() {
    if (this.state === 'PLAYING') {
      this.state = 'PAUSED';
      this.synth.stopUfo();
      this.updateStatus();
      if (this.animationId) cancelAnimationFrame(this.animationId);
      this.drawOverlay('PAUSED');
    }
  }

  public togglePause() {
    if (this.state === 'PLAYING') {
      this.pause();
    } else if (this.state === 'PAUSED' || this.state === 'START') {
      this.start();
    }
  }

  public destroy() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.synth.stopAll();
  }

  // ---- Main loop ----

  private loop = (timestamp: number) => {
    if (this.state === 'PAUSED') return;

    let delta = timestamp - this.lastTime;
    this.lastTime = timestamp;
    if (delta > 60) delta = 60; // cap after tab switches / long frames
    const f = delta / 16.67; // normalized frame factor

    if (this.state === 'PLAYING') {
      this.updatePlayer(f);
      this.updatePlayerBullet(f);
      this.updateInvaders(delta);
      this.updateInvaderBullets(f, delta);
      this.updateUfo(f, delta);
      this.checkCollisions();
    } else if (this.state === 'DYING') {
      this.dyingTimer -= delta;
      if (this.dyingTimer <= 0) {
        this.afterDeath();
      }
    }

    this.drawFrame();

    if (this.state === 'PLAYING' || this.state === 'DYING') {
      this.animationId = requestAnimationFrame(this.loop);
    }
  };

  private updatePlayer(f: number) {
    if (this.moveDir === 'LEFT') this.playerX -= PLAYER_SPEED * f;
    else if (this.moveDir === 'RIGHT') this.playerX += PLAYER_SPEED * f;
    this.playerX = Math.max(MARGIN, Math.min(CW - MARGIN - PLAYER_W, this.playerX));
  }

  private updatePlayerBullet(f: number) {
    if (!this.playerBullet.alive) return;
    this.playerBullet.y -= PLAYER_BULLET_SPEED * f;
    if (this.playerBullet.y + BULLET_H < 0) this.playerBullet.alive = false;
  }

  // March cadence: speeds up as fewer invaders remain and per wave.
  private currentStepInterval(): number {
    const ratio = this.aliveCount / TOTAL_INVADERS; // 1 -> 0
    const base = 60 + ratio * 540; // ~600ms full grid down to ~60ms
    const waveScale = Math.max(0.5, 1 - (this.wave - 1) * 0.08);
    return base * waveScale;
  }

  private updateInvaders(delta: number) {
    if (this.aliveCount === 0) {
      this.wave++;
      this.initWave();
      this.updateStatus();
      return;
    }

    this.stepTimer += delta;
    const interval = this.currentStepInterval();
    if (this.stepTimer < interval) return;
    this.stepTimer = 0;

    this.frameToggle = !this.frameToggle;
    this.synth.playMarchStep();

    if (this.pendingDrop) {
      this.blockY += DROP_Y;
      this.invDir = (this.invDir * -1) as 1 | -1;
      this.pendingDrop = false;
    } else {
      this.blockX += STEP_X * this.invDir;
      // Look at alive extents; if next move would breach an edge, drop next step.
      const { minX, maxX } = this.aliveExtents();
      if (minX <= MARGIN || maxX >= CW - MARGIN) {
        this.pendingDrop = true;
      }
    }

    // Reaching the player row / bottom is game over.
    const lowestY = this.lowestInvaderY();
    if (lowestY + INV_H >= PLAYER_Y) {
      this.gameOver();
    }
  }

  private aliveExtents(): { minX: number; maxX: number } {
    let minCol = INV_COLS;
    let maxCol = -1;
    for (let r = 0; r < INV_ROWS; r++) {
      for (let c = 0; c < INV_COLS; c++) {
        if (this.alive[r][c]) {
          if (c < minCol) minCol = c;
          if (c > maxCol) maxCol = c;
        }
      }
    }
    if (maxCol < 0) return { minX: this.blockX, maxX: this.blockX };
    return {
      minX: this.blockX + minCol * CELL_W,
      maxX: this.blockX + maxCol * CELL_W + INV_W,
    };
  }

  private lowestInvaderY(): number {
    let maxRow = -1;
    for (let r = INV_ROWS - 1; r >= 0; r--) {
      for (let c = 0; c < INV_COLS; c++) {
        if (this.alive[r][c]) {
          maxRow = r;
          break;
        }
      }
      if (maxRow >= 0) break;
    }
    if (maxRow < 0) return this.blockY;
    return this.blockY + maxRow * CELL_H;
  }

  private invaderPos(row: number, col: number): { x: number; y: number } {
    return { x: this.blockX + col * CELL_W, y: this.blockY + row * CELL_H };
  }

  private updateInvaderBullets(f: number, delta: number) {
    // Move existing.
    for (const b of this.invaderBullets) {
      if (!b.alive) continue;
      b.y += INVADER_BULLET_SPEED * f;
      if (b.y > CH) b.alive = false;
    }
    this.invaderBullets = this.invaderBullets.filter((b) => b.alive);

    // Fire from a random column's lowest alive invader.
    this.invaderFireTimer -= delta;
    if (this.invaderFireTimer <= 0 && this.invaderBullets.length < 3) {
      this.invaderFireTimer = 600 + Math.random() * 900;
      const shooter = this.pickShooter();
      if (shooter) {
        const { x, y } = this.invaderPos(shooter.row, shooter.col);
        this.invaderBullets.push({
          x: x + INV_W / 2 - BULLET_W / 2,
          y: y + INV_H,
          alive: true,
        });
      }
    }
  }

  private pickShooter(): { row: number; col: number } | null {
    const cols: number[] = [];
    for (let c = 0; c < INV_COLS; c++) {
      for (let r = INV_ROWS - 1; r >= 0; r--) {
        if (this.alive[r][c]) {
          cols.push(c);
          break;
        }
      }
    }
    if (cols.length === 0) return null;
    const col = cols[Math.floor(Math.random() * cols.length)];
    for (let r = INV_ROWS - 1; r >= 0; r--) {
      if (this.alive[r][col]) return { row: r, col };
    }
    return null;
  }

  private updateUfo(f: number, delta: number) {
    if (this.ufoActive) {
      this.ufoX += UFO_SPEED * this.ufoDir * f;
      if (this.ufoX < -UFO_W || this.ufoX > CW) {
        this.ufoActive = false;
        this.synth.stopUfo();
        this.ufoTimer = this.randomUfoDelay();
      }
      return;
    }
    this.ufoTimer -= delta;
    if (this.ufoTimer <= 0) {
      this.ufoActive = true;
      this.ufoDir = Math.random() < 0.5 ? 1 : -1;
      this.ufoX = this.ufoDir === 1 ? -UFO_W : CW;
      this.synth.playUfo();
    }
  }

  // ---- Collisions ----

  private checkCollisions() {
    const pb = this.playerBullet;

    // Player bullet vs UFO.
    if (pb.alive && this.ufoActive) {
      if (this.rectsOverlap(pb.x, pb.y, BULLET_W, BULLET_H, this.ufoX, UFO_Y, UFO_W, UFO_H)) {
        pb.alive = false;
        this.ufoActive = false;
        this.synth.stopUfo();
        this.synth.playInvaderKilled();
        this.addScore(this.randomUfoBonus());
        this.ufoTimer = this.randomUfoDelay();
      }
    }

    // Player bullet vs invaders.
    if (pb.alive) {
      outer: for (let r = 0; r < INV_ROWS; r++) {
        for (let c = 0; c < INV_COLS; c++) {
          if (!this.alive[r][c]) continue;
          const { x, y } = this.invaderPos(r, c);
          if (this.rectsOverlap(pb.x, pb.y, BULLET_W, BULLET_H, x, y, INV_W, INV_H)) {
            this.alive[r][c] = false;
            this.aliveCount--;
            pb.alive = false;
            this.addScore(rowPoints(r));
            this.synth.playInvaderKilled();
            break outer;
          }
        }
      }
    }

    // Player bullet vs shields.
    if (pb.alive && this.bulletHitsShield(pb)) {
      pb.alive = false;
    }

    // Invader bullets vs shields and player.
    for (const b of this.invaderBullets) {
      if (!b.alive) continue;
      if (this.bulletHitsShield(b)) {
        b.alive = false;
        continue;
      }
      if (
        this.state === 'PLAYING' &&
        this.rectsOverlap(b.x, b.y, BULLET_W, BULLET_H, this.playerX, PLAYER_Y, PLAYER_W, PLAYER_H)
      ) {
        b.alive = false;
        this.playerHit();
      }
    }
    this.invaderBullets = this.invaderBullets.filter((b) => b.alive);
  }

  private randomUfoBonus(): number {
    const options = [50, 100, 150, 300];
    return options[Math.floor(Math.random() * options.length)];
  }

  // Returns true (and erodes a cell) if the bullet hits an intact shield cell.
  private bulletHitsShield(b: Bullet): boolean {
    for (let i = 0; i < this.shields.length; i++) {
      const baseX = this.shieldX[i];
      const grid = this.shields[i];
      const shieldW = SHIELD_COLS * SHIELD_CELL;
      const shieldH = SHIELD_ROWS * SHIELD_CELL;
      if (
        !this.rectsOverlap(b.x, b.y, BULLET_W, BULLET_H, baseX, SHIELD_Y, shieldW, shieldH)
      ) {
        continue;
      }
      const cx = Math.floor((b.x + BULLET_W / 2 - baseX) / SHIELD_CELL);
      const cy = Math.floor((b.y + BULLET_H / 2 - SHIELD_Y) / SHIELD_CELL);
      // Scan a couple of cells around the impact to find the first intact one.
      for (let dy = 0; dy < SHIELD_ROWS; dy++) {
        const ry = cy + dy;
        if (ry < 0 || ry >= SHIELD_ROWS) continue;
        if (cx >= 0 && cx < SHIELD_COLS && grid[ry][cx]) {
          grid[ry][cx] = false;
          // erode a small neighborhood for chunkier damage
          if (cx + 1 < SHIELD_COLS) grid[ry][cx + 1] = false;
          if (cx - 1 >= 0) grid[ry][cx - 1] = false;
          return true;
        }
      }
    }
    return false;
  }

  private rectsOverlap(
    ax: number, ay: number, aw: number, ah: number,
    bx: number, by: number, bw: number, bh: number
  ): boolean {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  private addScore(points: number) {
    this.score += points;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.saveHighScore();
    }
    this.updateStatus();
  }

  private playerHit() {
    this.lives--;
    this.synth.playPlayerExplosion();
    this.updateStatus();
    if (this.lives <= 0) {
      this.gameOver();
    } else {
      this.state = 'DYING';
      this.dyingTimer = 900;
    }
  }

  private afterDeath() {
    // Respawn the cannon, clear bullets, resume play.
    this.playerX = (CW - PLAYER_W) / 2;
    this.moveDir = 'NONE';
    this.playerBullet.alive = false;
    this.invaderBullets = [];
    this.state = 'PLAYING';
    this.updateStatus();
  }

  private gameOver() {
    this.state = 'GAMEOVER';
    this.synth.stopUfo();
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

    this.drawShields();
    if (this.state !== 'GAMEOVER') {
      this.drawInvaders();
      this.drawUfo();
      if (this.state !== 'DYING') this.drawPlayer();
      else this.drawPlayerExplosion();
      this.drawBullets();
    }

    // Ground line.
    this.ctx.strokeStyle = '#2bd44b';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(MARGIN, PLAYER_Y + PLAYER_H + 4);
    this.ctx.lineTo(CW - MARGIN, PLAYER_Y + PLAYER_H + 4);
    this.ctx.stroke();

    if (this.state === 'START') {
      this.drawOverlay('PRESS PLAY');
    }
  }

  private drawPlayer() {
    this.ctx.fillStyle = '#2bd44b';
    // Cannon base.
    this.ctx.fillRect(this.playerX, PLAYER_Y + 6, PLAYER_W, PLAYER_H - 6);
    this.ctx.fillRect(this.playerX + 4, PLAYER_Y + 3, PLAYER_W - 8, 4);
    // Barrel.
    this.ctx.fillRect(this.playerX + PLAYER_W / 2 - 2, PLAYER_Y - 2, 4, 6);
  }

  private drawPlayerExplosion() {
    // Flicker a few debris blocks during the dying animation.
    this.ctx.fillStyle = (Math.floor(this.dyingTimer / 80) % 2 === 0) ? '#ffeb3b' : '#ff5d5d';
    for (let i = 0; i < 6; i++) {
      const px = this.playerX + Math.sin(i * 1.7 + this.dyingTimer) * 12 + PLAYER_W / 2;
      const py = PLAYER_Y + Math.cos(i * 2.1 + this.dyingTimer) * 6 + PLAYER_H / 2;
      this.ctx.fillRect(px, py, 3, 3);
    }
  }

  private drawInvaders() {
    const frame = this.frameToggle ? 1 : 0;
    for (let r = 0; r < INV_ROWS; r++) {
      const type = rowType(r);
      const bitmap = SPRITES[type][frame];
      this.ctx.fillStyle = SPRITE_COLORS[type];
      for (let c = 0; c < INV_COLS; c++) {
        if (!this.alive[r][c]) continue;
        const { x, y } = this.invaderPos(r, c);
        this.drawBitmap(bitmap, x, y, 2);
      }
    }
  }

  private drawBitmap(bitmap: string[], x: number, y: number, px: number) {
    for (let row = 0; row < bitmap.length; row++) {
      const line = bitmap[row];
      for (let col = 0; col < line.length; col++) {
        if (line[col] === '1') {
          this.ctx.fillRect(x + col * px, y + row * px, px, px);
        }
      }
    }
  }

  private drawUfo() {
    if (!this.ufoActive) return;
    this.ctx.fillStyle = '#ff4d4d';
    this.ctx.fillRect(this.ufoX + 4, UFO_Y + 4, UFO_W - 8, UFO_H - 6);
    this.ctx.fillRect(this.ufoX, UFO_Y + UFO_H - 4, UFO_W, 3);
    this.ctx.fillRect(this.ufoX + 8, UFO_Y, UFO_W - 16, 4);
    this.ctx.fillStyle = '#ffd24d';
    this.ctx.fillRect(this.ufoX + 6, UFO_Y + UFO_H - 3, 2, 2);
    this.ctx.fillRect(this.ufoX + UFO_W - 8, UFO_Y + UFO_H - 3, 2, 2);
  }

  private drawBullets() {
    // Player bullet.
    if (this.playerBullet.alive) {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(this.playerBullet.x, this.playerBullet.y, BULLET_W, BULLET_H);
    }
    // Invader bullets.
    this.ctx.fillStyle = '#ff9d4d';
    for (const b of this.invaderBullets) {
      if (b.alive) this.ctx.fillRect(b.x, b.y, BULLET_W, BULLET_H);
    }
  }

  private drawShields() {
    this.ctx.fillStyle = '#2bd44b';
    for (let i = 0; i < this.shields.length; i++) {
      const baseX = this.shieldX[i];
      const grid = this.shields[i];
      for (let r = 0; r < SHIELD_ROWS; r++) {
        for (let c = 0; c < SHIELD_COLS; c++) {
          if (grid[r][c]) {
            this.ctx.fillRect(
              baseX + c * SHIELD_CELL,
              SHIELD_Y + r * SHIELD_CELL,
              SHIELD_CELL,
              SHIELD_CELL
            );
          }
        }
      }
    }
  }

  private drawOverlay(text: string) {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    this.ctx.fillRect(0, 0, CW, CH);

    this.ctx.fillStyle = '#9dff5d';
    this.ctx.font = '16px "Press Start 2P", monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.shadowColor = 'rgba(157, 255, 93, 0.4)';
    this.ctx.shadowBlur = 8;
    this.ctx.fillText(text, CW / 2, CH / 2);
    this.ctx.shadowBlur = 0;
  }
}

export default SpaceInvadersEngine;
