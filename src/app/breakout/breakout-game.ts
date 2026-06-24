// Breakout / Arkanoid Game Engine (TypeScript / Canvas)
// Bounce a ball off the paddle to smash a wall of neon bricks. Arkanoid-style
// power-ups drop from broken bricks. Pure rendering + logic, no framework.
import { BreakoutSynth } from './breakout-synth';

export type BreakoutState = 'IDLE' | 'PLAYING' | 'PAUSED' | 'GAMEOVER';
export type PaddleDir = 'LEFT' | 'RIGHT';

export interface BreakoutStatus {
  score: number;
  lives: number;
  level: number;
  state: BreakoutState;
}

type PowerType = 'WIDE' | 'MULTI' | 'SLOW';

interface Brick {
  col: number;
  row: number;
  alive: boolean;
  color: string;
  points: number;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface PowerUp {
  x: number;
  y: number;
  type: PowerType;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

const COLS = 9;
const ROWS = 6;
const WALL = 12;             // play-area inset from the canvas edge
const BRICK_TOP = 64;        // y where the brick field starts
const BRICK_GAP = 4;
const BASE_BALL_SPEED = 250; // px/sec at level 1
const PADDLE_SPEED = 460;    // px/sec for keyboard movement
const POWER_FALL = 130;      // px/sec power-up fall speed
const POWER_CHANCE = 0.15;
const SLOW_TIME = 6;         // seconds the SLOW power-up lasts

const ROW_COLORS = ['#ff3d00', '#ff9100', '#ffeb3b', '#39ff14', '#00e5ff', '#ff007f'];

export class BreakoutEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private synth: BreakoutSynth;
  private onStatusChange: (s: BreakoutStatus) => void;

  private W: number;
  private H: number;

  private bricks: Brick[] = [];
  private balls: Ball[] = [];
  private powerups: PowerUp[] = [];
  private particles: Particle[] = [];

  private paddleX = 0;          // centre x
  private paddleY = 0;
  private paddleW = 80;
  private readonly paddleH = 14;
  private basePaddleW = 80;
  private wideTimer = 0;
  private slowTimer = 0;

  private ballOnPaddle = true;  // waiting to launch
  private brickW = 0;
  private heldDir: PaddleDir | null = null;
  private pointerX: number | null = null;

  private score = 0;
  private lives = 3;
  private level = 1;
  private state: BreakoutState = 'IDLE';

  private animId: number | null = null;
  private lastTime = 0;

  constructor(
    canvas: HTMLCanvasElement,
    synth: BreakoutSynth,
    onStatusChange: (s: BreakoutStatus) => void,
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context');
    this.ctx = ctx;
    this.synth = synth;
    this.onStatusChange = onStatusChange;

    this.W = canvas.width;
    this.H = canvas.height;
    this.paddleY = this.H - 40;
    this.brickW = (this.W - WALL * 2 - BRICK_GAP * (COLS - 1)) / COLS;

    this.initGame();
    this.startRenderLoop();
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  public setPaddleDir(dir: PaddleDir | null) {
    this.heldDir = dir;
  }

  // Pointer/touch control: move the paddle centre toward a canvas x.
  public setPaddleX(x: number) {
    this.pointerX = x;
  }

  // Stop tracking the pointer (so on-screen buttons / keys take over).
  public clearPointer() {
    this.pointerX = null;
  }

  public launch() {
    if (this.state === 'IDLE' || this.state === 'GAMEOVER') {
      this.start();
      return;
    }
    if (this.state === 'PAUSED') {
      this.togglePause();
      return;
    }
    if (this.state === 'PLAYING' && this.ballOnPaddle) {
      this.ballOnPaddle = false;
      const speed = this.ballSpeed();
      this.balls = [{ x: this.paddleX, y: this.paddleY - 12, vx: speed * 0.4, vy: -speed }];
      this.synth.playLaunch();
    }
  }

  public start() {
    if (this.state === 'GAMEOVER' || this.state === 'IDLE') {
      this.initGame();
    }
    if (this.state === 'PLAYING') return;
    this.state = 'PLAYING';
    this.emitStatus();
  }

  public togglePause() {
    if (this.state === 'PLAYING') this.state = 'PAUSED';
    else if (this.state === 'PAUSED') this.state = 'PLAYING';
    else this.start();
    this.emitStatus();
  }

  public pause() {
    if (this.state === 'PLAYING') {
      this.state = 'PAUSED';
      this.emitStatus();
    }
  }

  public reset() {
    this.initGame();
  }

  public destroy() {
    if (this.animId !== null) cancelAnimationFrame(this.animId);
  }

  // ─── Setup ───────────────────────────────────────────────────────────────

  private initGame() {
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.basePaddleW = 80;
    this.buildLevel();
    this.state = 'IDLE';
    this.emitStatus();
  }

  private buildLevel() {
    this.bricks = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        this.bricks.push({
          col: c,
          row: r,
          alive: true,
          color: ROW_COLORS[r % ROW_COLORS.length],
          points: (ROWS - r) * 10, // top rows worth more
        });
      }
    }
    this.powerups = [];
    this.particles = [];
    this.paddleW = this.basePaddleW;
    this.wideTimer = 0;
    this.slowTimer = 0;
    this.paddleX = this.W / 2;
    this.resetBallToPaddle();
  }

  private resetBallToPaddle() {
    this.ballOnPaddle = true;
    this.balls = [{ x: this.paddleX, y: this.paddleY - 12, vx: 0, vy: 0 }];
  }

  private ballSpeed() {
    return BASE_BALL_SPEED + (this.level - 1) * 28;
  }

  // ─── Geometry helpers ───────────────────────────────────────────────────

  private brickRect(b: Brick) {
    const x = WALL + b.col * (this.brickW + BRICK_GAP);
    const y = BRICK_TOP + b.row * (16 + BRICK_GAP);
    return { x, y, w: this.brickW, h: 16 };
  }

  // ─── Simulation ────────────────────────────────────────────────────────────

  private update(dt: number) {
    this.movePaddle(dt);

    if (this.wideTimer > 0) {
      this.wideTimer -= dt;
      if (this.wideTimer <= 0) this.paddleW = this.basePaddleW;
    }
    if (this.slowTimer > 0) this.slowTimer -= dt;

    if (this.ballOnPaddle) {
      this.balls[0].x = this.paddleX;
      this.balls[0].y = this.paddleY - 12;
    } else {
      this.moveBalls(dt);
    }

    this.movePowerups(dt);
    this.updateParticles(dt);

    if (this.bricks.every((b) => !b.alive)) this.advanceLevel();
  }

  private movePaddle(dt: number) {
    const half = this.paddleW / 2;
    if (this.pointerX !== null) {
      // Pointer control glides the paddle toward the cursor.
      const target = this.pointerX;
      this.paddleX += (target - this.paddleX) * Math.min(1, dt * 18);
    } else if (this.heldDir === 'LEFT') {
      this.paddleX -= PADDLE_SPEED * dt;
    } else if (this.heldDir === 'RIGHT') {
      this.paddleX += PADDLE_SPEED * dt;
    }
    this.paddleX = Math.max(WALL + half, Math.min(this.W - WALL - half, this.paddleX));
  }

  private moveBalls(dt: number) {
    const factor = this.slowTimer > 0 ? 0.6 : 1;
    const survivors: Ball[] = [];

    for (const ball of this.balls) {
      ball.x += ball.vx * dt * factor;
      ball.y += ball.vy * dt * factor;

      // Walls.
      if (ball.x < WALL + 6) { ball.x = WALL + 6; ball.vx = Math.abs(ball.vx); this.synth.playBounce(); }
      if (ball.x > this.W - WALL - 6) { ball.x = this.W - WALL - 6; ball.vx = -Math.abs(ball.vx); this.synth.playBounce(); }
      if (ball.y < WALL + 6) { ball.y = WALL + 6; ball.vy = Math.abs(ball.vy); this.synth.playBounce(); }

      // Paddle.
      if (
        ball.vy > 0 &&
        ball.y + 6 >= this.paddleY &&
        ball.y - 6 <= this.paddleY + this.paddleH &&
        ball.x >= this.paddleX - this.paddleW / 2 - 6 &&
        ball.x <= this.paddleX + this.paddleW / 2 + 6
      ) {
        const rel = (ball.x - this.paddleX) / (this.paddleW / 2); // -1..1
        const angle = rel * (Math.PI / 3); // up to 60° off vertical
        const speed = Math.hypot(ball.vx, ball.vy);
        ball.vx = speed * Math.sin(angle);
        ball.vy = -Math.abs(speed * Math.cos(angle));
        ball.y = this.paddleY - 7;
        this.synth.playBounce();
      }

      this.collideBricks(ball);

      // Below the paddle → ball lost.
      if (ball.y - 6 > this.H) continue;
      survivors.push(ball);
    }

    this.balls = survivors;
    if (this.balls.length === 0) this.loseLife();
  }

  private collideBricks(ball: Ball) {
    for (const b of this.bricks) {
      if (!b.alive) continue;
      const { x, y, w, h } = this.brickRect(b);
      if (ball.x + 6 < x || ball.x - 6 > x + w || ball.y + 6 < y || ball.y - 6 > y + h) continue;

      // Decide bounce axis from the shallower overlap.
      const overlapX = Math.min(ball.x + 6 - x, x + w - (ball.x - 6));
      const overlapY = Math.min(ball.y + 6 - y, y + h - (ball.y - 6));
      if (overlapX < overlapY) ball.vx = -ball.vx;
      else ball.vy = -ball.vy;

      b.alive = false;
      this.score += b.points;
      this.spawnParticles(x + w / 2, y + h / 2, b.color);
      this.synth.playBrick(b.row);
      this.maybeDropPower(x + w / 2, y + h / 2);
      this.emitStatus();
      break; // one brick per frame keeps bounces clean
    }
  }

  private maybeDropPower(x: number, y: number) {
    if (Math.random() > POWER_CHANCE) return;
    const types: PowerType[] = ['WIDE', 'MULTI', 'SLOW'];
    this.powerups.push({ x, y, type: types[Math.floor(Math.random() * types.length)] });
  }

  private movePowerups(dt: number) {
    const half = this.paddleW / 2;
    const kept: PowerUp[] = [];
    for (const p of this.powerups) {
      p.y += POWER_FALL * dt;
      const caught =
        p.y >= this.paddleY - 8 &&
        p.y <= this.paddleY + this.paddleH + 8 &&
        p.x >= this.paddleX - half &&
        p.x <= this.paddleX + half;
      if (caught) {
        this.applyPower(p.type);
        this.synth.playPowerup();
        continue;
      }
      if (p.y < this.H + 12) kept.push(p);
    }
    this.powerups = kept;
  }

  private applyPower(type: PowerType) {
    if (type === 'WIDE') {
      this.paddleW = Math.min(this.W - WALL * 2, this.basePaddleW * 1.6);
      this.wideTimer = 10;
    } else if (type === 'SLOW') {
      this.slowTimer = SLOW_TIME;
    } else if (type === 'MULTI') {
      this.splitBalls();
    }
  }

  private splitBalls() {
    if (this.ballOnPaddle) return;
    const extra: Ball[] = [];
    for (const ball of this.balls) {
      const speed = Math.hypot(ball.vx, ball.vy) || this.ballSpeed();
      const base = Math.atan2(ball.vy, ball.vx);
      [-0.4, 0.4].forEach((d) => {
        extra.push({ x: ball.x, y: ball.y, vx: Math.cos(base + d) * speed, vy: Math.sin(base + d) * speed });
      });
    }
    this.balls.push(...extra);
  }

  private spawnParticles(x: number, y: number, color: string) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 90;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5, color });
    }
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 200 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private loseLife() {
    this.lives -= 1;
    this.synth.playLoseLife();
    if (this.lives <= 0) {
      this.state = 'GAMEOVER';
      this.emitStatus();
      return;
    }
    this.paddleW = this.basePaddleW;
    this.wideTimer = 0;
    this.slowTimer = 0;
    this.resetBallToPaddle();
    this.emitStatus();
  }

  private advanceLevel() {
    this.level += 1;
    this.score += 100;
    this.synth.playLevelClear();
    this.buildLevel();
    this.emitStatus();
  }

  private emitStatus() {
    this.onStatusChange({
      score: this.score,
      lives: this.lives,
      level: this.level,
      state: this.state,
    });
  }

  // ─── Render loop ─────────────────────────────────────────────────────────

  private startRenderLoop() {
    this.lastTime = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.04, (now - this.lastTime) / 1000);
      this.lastTime = now;
      if (this.state === 'PLAYING') this.update(dt);
      this.draw();
      this.animId = requestAnimationFrame(frame);
    };
    this.animId = requestAnimationFrame(frame);
  }

  private draw() {
    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#05060c';
    ctx.fillRect(0, 0, W, H);

    // Side walls.
    ctx.fillStyle = 'rgba(0,229,255,0.10)';
    ctx.fillRect(0, 0, WALL, H);
    ctx.fillRect(W - WALL, 0, WALL, H);
    ctx.fillRect(0, 0, W, WALL);

    this.drawBricks();
    this.drawParticles();
    this.drawPowerups();
    this.drawPaddle();
    this.drawBalls();

    if (this.state === 'IDLE') this.drawOverlay('PRESS PLAY', '#00e5ff');
    else if (this.state === 'PAUSED') this.drawOverlay('PAUSED', '#00e5ff');
    else if (this.state === 'GAMEOVER') this.drawOverlay('GAME OVER', '#ff3d00');
    else if (this.ballOnPaddle) this.drawHint();
  }

  private drawBricks() {
    const { ctx } = this;
    for (const b of this.bricks) {
      if (!b.alive) continue;
      const { x, y, w, h } = this.brickRect(b);
      ctx.fillStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 6;
      this.roundRect(x, y, w, h, 3);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x + 2, y + 2, w - 4, 2);
    }
  }

  private drawPaddle() {
    const { ctx } = this;
    const x = this.paddleX - this.paddleW / 2;
    ctx.fillStyle = this.wideTimer > 0 ? '#39ff14' : '#00e5ff';
    ctx.shadowColor = ctx.fillStyle as string;
    ctx.shadowBlur = 12;
    this.roundRect(x, this.paddleY, this.paddleW, this.paddleH, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(x + 4, this.paddleY + 3, this.paddleW - 8, 2);
  }

  private drawBalls() {
    const { ctx } = this;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 10;
    for (const ball of this.balls) {
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  private drawPowerups() {
    const { ctx } = this;
    for (const p of this.powerups) {
      const color = p.type === 'WIDE' ? '#39ff14' : p.type === 'MULTI' ? '#ff007f' : '#00e5ff';
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      this.roundRect(p.x - 12, p.y - 7, 24, 14, 4);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#05060c';
      ctx.font = '9px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.type[0], p.x, p.y + 1);
    }
  }

  private drawParticles() {
    const { ctx } = this;
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / 0.5);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
  }

  private drawHint() {
    const { ctx, W } = this;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SPACE / TAP TO LAUNCH', W / 2, this.paddleY - 30);
  }

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

  private drawOverlay(text: string, color: string) {
    const { ctx, W, H } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
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

export default BreakoutEngine;
