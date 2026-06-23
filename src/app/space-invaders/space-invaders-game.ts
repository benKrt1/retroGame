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

const STAR_COUNT = 55;
const MAX_SHAKE_MS = 420;
const MAX_FLASH_MS = 260;

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

  // Visual effects (rendering only).
  private particles: Particle[] = [];
  private popups: ScorePopup[] = [];
  private stars: Star[] = [];
  private elapsed = 0; // ms, drives starfield twinkle
  private shakeTime = 0;
  private shakeMag = 0;
  private flashTime = 0;

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
    this.initStars();
    this.resetGame();
  }

  private initStars() {
    this.stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      this.stars.push({
        x: Math.random() * CW,
        y: Math.random() * CH,
        size: 0.6 + Math.random() * 1.2,
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
    this.score = 0;
    this.lives = 3;
    this.wave = 1;
    this.state = 'START';
    this.particles = [];
    this.popups = [];
    this.shakeTime = 0;
    this.flashTime = 0;
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
    this.elapsed += delta;

    if (this.state === 'PLAYING') {
      this.updatePlayer(f);
      this.updatePlayerBullet(f);
      this.updateInvaders(delta);
      this.updateInvaderBullets(f, delta);
      this.updateUfo(f, delta);
      this.updateEffects(f, delta);
      this.checkCollisions();
    } else if (this.state === 'DYING') {
      this.dyingTimer -= delta;
      this.updateEffects(f, delta);
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
        const bonus = this.randomUfoBonus();
        this.addScore(bonus);
        const ux = this.ufoX + UFO_W / 2;
        const uy = UFO_Y + UFO_H / 2;
        this.spawnBurst(ux, uy, 18, ['#ff4d4d', '#ffd24d', '#ffffff'], 0.8, 3, 320, 700);
        this.popups.push({ x: ux, y: uy, text: `+${bonus}`, life: 800, maxLife: 800 });
        this.shakeTime = Math.max(this.shakeTime, 140);
        this.shakeMag = Math.max(this.shakeMag, 3);
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
            const pts = rowPoints(r);
            this.addScore(pts);
            this.synth.playInvaderKilled();
            const icx = x + INV_W / 2;
            const icy = y + INV_H / 2;
            this.spawnBurst(icx, icy, 12, [SPRITE_COLORS[rowType(r)], '#ffffff'], 0.6, 2.4, 260, 560);
            this.popups.push({ x: icx, y: icy, text: `+${pts}`, life: 700, maxLife: 700 });
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
    // Burst + shake + flash at the cannon.
    this.spawnBurst(
      this.playerX + PLAYER_W / 2, PLAYER_Y + PLAYER_H / 2,
      28, ['#2bd44b', '#9dff5d', '#ffffff'], 1, 4, 500, 1100
    );
    this.shakeTime = MAX_SHAKE_MS;
    this.shakeMag = 7;
    this.flashTime = MAX_FLASH_MS;
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

    // Shake the gameplay layer (stars + entities + effects), not the overlays.
    this.ctx.save();
    if (this.shakeTime > 0) {
      const amt = this.shakeMag * (this.shakeTime / MAX_SHAKE_MS);
      this.ctx.translate((Math.random() - 0.5) * amt * 2, (Math.random() - 0.5) * amt * 2);
    }

    this.drawStars();
    this.drawShields();
    if (this.state !== 'GAMEOVER') {
      this.drawInvaders();
      this.drawUfo();
      if (this.state !== 'DYING') this.drawPlayer();
      else this.drawPlayerExplosion();
      this.drawBullets();
    }
    this.drawParticles();
    this.drawPopups();

    this.ctx.restore();

    // Full-screen white flash on impact (un-shaken).
    if (this.flashTime > 0) {
      this.ctx.fillStyle = `rgba(255, 255, 255, ${0.5 * (this.flashTime / MAX_FLASH_MS)})`;
      this.ctx.fillRect(0, 0, CW, CH);
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

  // ---- Visual effects ----

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

  private updateEffects(f: number, delta: number) {
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

    if (this.shakeTime > 0) this.shakeTime -= delta;
    if (this.flashTime > 0) this.flashTime -= delta;
  }

  private drawStars() {
    for (const s of this.stars) {
      const tw = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(this.elapsed * 0.002 + s.phase));
      this.ctx.fillStyle = `rgba(200, 210, 230, ${tw})`;
      this.ctx.fillRect(s.x, s.y, s.size, s.size);
    }
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
    this.ctx.shadowColor = 'rgba(157, 255, 93, 0.5)';
    this.ctx.shadowBlur = 6;
    for (const s of this.popups) {
      this.ctx.globalAlpha = Math.max(0, s.life / s.maxLife);
      this.ctx.fillStyle = '#9dff5d';
      this.ctx.fillText(s.text, s.x, s.y);
    }
    this.ctx.globalAlpha = 1;
    this.ctx.shadowBlur = 0;
  }

  private drawPlayer() {
    const ctx = this.ctx;
    const x = this.playerX;
    const cx = x + PLAYER_W / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(43, 212, 75, 0.6)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#2bd44b';

    // Hull: trapezoid spanning the footprint.
    ctx.beginPath();
    ctx.moveTo(x, PLAYER_Y + PLAYER_H);
    ctx.lineTo(x + 3, PLAYER_Y + 7);
    ctx.lineTo(x + PLAYER_W - 3, PLAYER_Y + 7);
    ctx.lineTo(x + PLAYER_W, PLAYER_Y + PLAYER_H);
    ctx.closePath();
    ctx.fill();

    // Raised turret dome.
    ctx.beginPath();
    ctx.moveTo(cx - 6, PLAYER_Y + 7);
    ctx.lineTo(cx - 3, PLAYER_Y + 1);
    ctx.lineTo(cx + 3, PLAYER_Y + 1);
    ctx.lineTo(cx + 6, PLAYER_Y + 7);
    ctx.closePath();
    ctx.fill();

    // Barrel.
    ctx.fillRect(cx - 1.5, PLAYER_Y - 3, 3, 5);
    ctx.shadowBlur = 0;

    // Brighter side fins.
    ctx.fillStyle = '#9dff5d';
    ctx.fillRect(x, PLAYER_Y + PLAYER_H - 4, 3, 4);
    ctx.fillRect(x + PLAYER_W - 3, PLAYER_Y + PLAYER_H - 4, 3, 4);

    // Cyan cockpit.
    ctx.fillStyle = '#5de2ff';
    ctx.beginPath();
    ctx.arc(cx, PLAYER_Y + 5, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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
      this.ctx.shadowColor = SPRITE_COLORS[type];
      this.ctx.shadowBlur = 5;
      for (let c = 0; c < INV_COLS; c++) {
        if (!this.alive[r][c]) continue;
        const { x, y } = this.invaderPos(r, c);
        this.drawBitmap(bitmap, x, y, 2);
      }
    }
    this.ctx.shadowBlur = 0;
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
    this.ctx.shadowColor = '#ff4d4d';
    this.ctx.shadowBlur = 8;
    this.ctx.fillStyle = '#ff4d4d';
    this.ctx.fillRect(this.ufoX + 4, UFO_Y + 4, UFO_W - 8, UFO_H - 6);
    this.ctx.fillRect(this.ufoX, UFO_Y + UFO_H - 4, UFO_W, 3);
    this.ctx.fillRect(this.ufoX + 8, UFO_Y, UFO_W - 16, 4);
    this.ctx.fillStyle = '#ffd24d';
    this.ctx.fillRect(this.ufoX + 6, UFO_Y + UFO_H - 3, 2, 2);
    this.ctx.fillRect(this.ufoX + UFO_W - 8, UFO_Y + UFO_H - 3, 2, 2);
    this.ctx.shadowBlur = 0;
  }

  private drawBullets() {
    // Player bullet (white core, cyan glow).
    if (this.playerBullet.alive) {
      this.ctx.shadowColor = '#5de2ff';
      this.ctx.shadowBlur = 8;
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(this.playerBullet.x, this.playerBullet.y, BULLET_W, BULLET_H);
    }
    // Invader bullets (orange glow).
    this.ctx.shadowColor = '#ff9d4d';
    this.ctx.shadowBlur = 6;
    this.ctx.fillStyle = '#ff9d4d';
    for (const b of this.invaderBullets) {
      if (b.alive) this.ctx.fillRect(b.x, b.y, BULLET_W, BULLET_H);
    }
    this.ctx.shadowBlur = 0;
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
