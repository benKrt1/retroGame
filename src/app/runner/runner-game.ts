// Endless Runner Game Engine (TypeScript / Canvas)
// Auto-run, jump over ground obstacles and duck under flying ones. Endless,
// speed ramps up, score climbs with distance. Modern parallax + day/night art.
import { RunnerSynth } from './runner-synth';

export type RunnerState = 'IDLE' | 'PLAYING' | 'PAUSED' | 'GAMEOVER';

export interface RunnerStatus {
  score: number;
  best: number;
  state: RunnerState;
}

interface Obstacle {
  x: number;
  w: number;
  h: number;
  air: boolean; // flying drone (duck under) vs ground block (jump over)
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
}

const GRAVITY = 2100;       // px/s^2
const JUMP_V = 720;         // initial jump velocity
const BASE_SPEED = 240;     // px/s at the start
const MAX_SPEED = 560;
const RUN_X = 80;           // runner's fixed x (left edge of body)

export class RunnerEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private synth: RunnerSynth;
  private onStatusChange: (s: RunnerStatus) => void;

  private W: number;
  private H: number;
  private groundY: number;

  private runnerY = 0;        // top of the runner body (relative offset handled in draw)
  private vy = 0;
  private grounded = true;
  private ducking = false;
  private legPhase = 0;

  private speed = BASE_SPEED;
  private distance = 0;
  private score = 0;
  private best = 0;
  private nextPoint = 100;

  private obstacles: Obstacle[] = [];
  private particles: Particle[] = [];
  private spawnTimer = 0;
  private bgScroll = 0;       // far/mid parallax + ground offset
  private worldTime = 0;      // drives the day/night cycle
  private stars: { x: number; y: number; r: number }[] = [];

  private state: RunnerState = 'IDLE';
  private animId: number | null = null;
  private lastTime = 0;

  // Runner body metrics.
  private readonly bodyW = 26;
  private readonly bodyH = 42;
  private readonly duckH = 24;

  constructor(
    canvas: HTMLCanvasElement,
    synth: RunnerSynth,
    onStatusChange: (s: RunnerStatus) => void,
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context');
    this.ctx = ctx;
    this.synth = synth;
    this.onStatusChange = onStatusChange;

    this.W = canvas.width;
    this.H = canvas.height;
    this.groundY = this.H - 46;

    // Fixed starfield (drawn at night).
    for (let i = 0; i < 40; i++) {
      this.stars.push({ x: Math.random() * this.W, y: Math.random() * (this.groundY - 40), r: Math.random() * 1.2 + 0.3 });
    }

    this.initGame();
    this.startRenderLoop();
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  public jump() {
    if (this.state !== 'PLAYING') {
      if (this.state === 'IDLE') this.start();
      else if (this.state === 'PAUSED') this.togglePause();
      return;
    }
    if (this.grounded) {
      this.vy = -JUMP_V;
      this.grounded = false;
      this.ducking = false;
      this.synth.playJump();
    }
  }

  public setDuck(on: boolean) {
    if (this.state !== 'PLAYING') return;
    this.ducking = on;
    if (on && !this.grounded) this.vy += 260; // fast-fall when ducking mid-air
  }

  public start() {
    if (this.state === 'GAMEOVER' || this.state === 'IDLE') this.initGame();
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
    if (this.state === 'PLAYING') { this.state = 'PAUSED'; this.emitStatus(); }
  }

  public reset() {
    this.initGame();
  }

  public destroy() {
    if (this.animId !== null) cancelAnimationFrame(this.animId);
  }

  // ─── Setup ───────────────────────────────────────────────────────────────

  private initGame() {
    this.runnerY = 0;
    this.vy = 0;
    this.grounded = true;
    this.ducking = false;
    this.speed = BASE_SPEED;
    this.distance = 0;
    this.score = 0;
    this.nextPoint = 100;
    this.obstacles = [];
    this.particles = [];
    this.spawnTimer = 1.2; // small grace before the first obstacle
    this.state = 'IDLE';
    this.emitStatus();
  }

  private runnerHeight() { return this.ducking && this.grounded ? this.duckH : this.bodyH; }
  private runnerTopY() { return this.groundY - this.runnerHeight() + this.runnerY; }

  // ─── Simulation ────────────────────────────────────────────────────────────

  private update(dt: number) {
    this.worldTime += dt;
    this.distance += this.speed * dt;
    this.bgScroll += this.speed * dt;
    this.legPhase += this.speed * dt * 0.05;

    // Speed ramps gently with distance.
    this.speed = Math.min(MAX_SPEED, BASE_SPEED + this.distance * 0.012);

    // Score from distance.
    this.score = Math.floor(this.distance / 10);
    if (this.score >= this.nextPoint) {
      this.nextPoint += 100;
      this.synth.playPoint();
    }
    if (this.score > this.best) this.best = this.score;

    // Vertical physics.
    if (!this.grounded) {
      this.vy += GRAVITY * dt;
      this.runnerY += this.vy * dt;
      if (this.runnerY >= 0) {
        this.runnerY = 0;
        this.vy = 0;
        this.grounded = true;
        this.spawnDust();
      }
    } else if (Math.random() < 0.5) {
      this.spawnDust(1); // running dust
    }

    // Obstacles.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) this.spawnObstacle();
    for (const o of this.obstacles) o.x -= this.speed * dt;
    this.obstacles = this.obstacles.filter((o) => o.x + o.w > -10);

    this.updateParticles(dt);
    this.checkCollisions();
    this.emitStatus();
  }

  private spawnObstacle() {
    const air = Math.random() < 0.32 && this.speed > 300;
    let o: Obstacle;
    if (air) {
      o = { x: this.W + 20, w: 34, h: 22, air: true };
    } else {
      const tall = Math.random() < 0.4;
      const w = 18 + Math.floor(Math.random() * 3) * 12;
      o = { x: this.W + 20, w, h: tall ? 46 : 30, air: false };
    }
    this.obstacles.push(o);
    // Fair, speed-scaled gap before the next spawn.
    const gapPx = 220 + Math.random() * 180 + (this.speed - BASE_SPEED) * 0.5;
    this.spawnTimer = gapPx / this.speed;
  }

  private checkCollisions() {
    const rx = RUN_X;
    const ry = this.runnerTopY();
    const rw = this.bodyW;
    const rh = this.runnerHeight();
    for (const o of this.obstacles) {
      const oy = o.air ? this.groundY - 56 : this.groundY - o.h;
      if (rx + rw - 4 > o.x + 3 && rx + 4 < o.x + o.w - 3 && ry + rh - 3 > oy + 3 && ry + 3 < oy + o.h - 3) {
        this.gameOver();
        return;
      }
    }
  }

  private gameOver() {
    this.state = 'GAMEOVER';
    this.synth.playGameOver();
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 140;
      this.particles.push({ x: RUN_X + this.bodyW / 2, y: this.runnerTopY() + this.bodyH / 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6, max: 0.6, color: '#00e5ff' });
    }
    this.emitStatus();
  }

  private spawnDust(n = 3) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: RUN_X + 4 + Math.random() * 6,
        y: this.groundY - 2,
        vx: -this.speed * 0.3 - Math.random() * 30,
        vy: -Math.random() * 40,
        life: 0.4, max: 0.4, color: 'rgba(180,200,255,0.6)',
      });
    }
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 240 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private emitStatus() {
    this.onStatusChange({ score: this.score, best: this.best, state: this.state });
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
    // day/night cycle 0..1 (full loop every ~40s).
    const cycle = (Math.sin(this.worldTime * (Math.PI * 2) / 40) + 1) / 2; // 0=night,1=day
    this.drawSky(cycle);
    this.drawCelestial(cycle);
    if (cycle < 0.4) this.drawStars(0.4 - cycle);
    this.drawFarLayer(cycle);
    this.drawMidLayer(cycle);
    this.drawGround();
    this.drawParticles();
    this.obstacles.forEach((o) => this.drawObstacle(o));
    this.drawRunner();

    if (this.state === 'IDLE') this.drawOverlay('TAP / SPACE TO RUN', '#00e5ff');
    else if (this.state === 'PAUSED') this.drawOverlay('PAUSED', '#00e5ff');
    else if (this.state === 'GAMEOVER') this.drawOverlay('GAME OVER', '#ff3d00');
  }

  private lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

  private drawSky(cycle: number) {
    const { ctx, W, H } = this;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    // Night → day top/bottom colours.
    const topNight = [11, 12, 30], topDay = [30, 90, 160];
    const botNight = [25, 18, 48], botDay = [120, 175, 210];
    const top = `rgb(${this.lerp(topNight[0], topDay[0], cycle)},${this.lerp(topNight[1], topDay[1], cycle)},${this.lerp(topNight[2], topDay[2], cycle)})`;
    const bot = `rgb(${this.lerp(botNight[0], botDay[0], cycle)},${this.lerp(botNight[1], botDay[1], cycle)},${this.lerp(botNight[2], botDay[2], cycle)})`;
    g.addColorStop(0, top);
    g.addColorStop(1, bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  private drawCelestial(cycle: number) {
    const { ctx, W } = this;
    // Sun by day, moon by night; arcs across the sky with the cycle.
    const x = W * 0.78;
    const y = this.lerp(46, 30, cycle);
    if (cycle > 0.5) {
      ctx.fillStyle = '#ffe08a';
      ctx.shadowColor = '#ffce54';
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#e6ecff';
      ctx.shadowColor = '#aab4ff';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.arc(x + 5, y - 3, 11, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  private drawStars(intensity: number) {
    const { ctx } = this;
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.9, intensity * 2)})`;
    for (const s of this.stars) {
      const tw = 0.6 + 0.4 * Math.sin(this.worldTime * 3 + s.x);
      ctx.globalAlpha = Math.min(1, intensity * 2) * tw;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Far city/mountain silhouettes (slow parallax).
  private drawFarLayer(cycle: number) {
    const { ctx } = this;
    const baseY = this.groundY;
    const off = (this.bgScroll * 0.15) % 120;
    const shade = Math.floor(this.lerp(20, 60, cycle));
    ctx.fillStyle = `rgb(${shade},${shade + 8},${shade + 24})`;
    for (let x = -off - 120; x < this.W + 120; x += 120) {
      const h = 40 + ((Math.floor(x / 120) * 53) % 40);
      ctx.fillRect(x, baseY - h, 70, h);
      ctx.fillRect(x + 80, baseY - h * 0.7, 30, h * 0.7);
    }
  }

  // Mid hills (medium parallax).
  private drawMidLayer(cycle: number) {
    const { ctx, W } = this;
    const off = (this.bgScroll * 0.4) % 200;
    const shade = Math.floor(this.lerp(28, 90, cycle));
    ctx.fillStyle = `rgb(${shade},${shade + 20},${shade + 30})`;
    ctx.beginPath();
    ctx.moveTo(-off - 200, this.groundY);
    for (let x = -off - 200; x < W + 200; x += 100) {
      ctx.quadraticCurveTo(x + 50, this.groundY - 34, x + 100, this.groundY);
    }
    ctx.lineTo(W + 200, this.groundY);
    ctx.lineTo(-off - 200, this.groundY);
    ctx.closePath();
    ctx.fill();
  }

  private drawGround() {
    const { ctx, W, H } = this;
    // Surface.
    ctx.fillStyle = '#0a0c14';
    ctx.fillRect(0, this.groundY, W, H - this.groundY);
    // Neon edge line.
    ctx.strokeStyle = '#00e5ff';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, this.groundY);
    ctx.lineTo(W, this.groundY);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Scrolling dashes.
    ctx.strokeStyle = 'rgba(0,229,255,0.3)';
    ctx.lineWidth = 2;
    const off = this.bgScroll % 40;
    ctx.beginPath();
    for (let x = -off; x < W; x += 40) {
      ctx.moveTo(x, this.groundY + 14);
      ctx.lineTo(x + 20, this.groundY + 14);
    }
    ctx.stroke();
  }

  private drawObstacle(o: Obstacle) {
    const { ctx } = this;
    if (o.air) {
      const y = this.groundY - 56;
      ctx.fillStyle = '#ff007f';
      ctx.shadowColor = '#ff007f';
      ctx.shadowBlur = 10;
      this.roundRect(o.x, y, o.w, o.h, 5);
      ctx.fill();
      ctx.shadowBlur = 0;
      // Rotor + eye.
      ctx.strokeStyle = '#ffd1e6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(o.x + 4, y); ctx.lineTo(o.x + o.w - 4, y);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(o.x + o.w / 2, y + o.h / 2, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const y = this.groundY - o.h;
      ctx.fillStyle = '#39ff14';
      ctx.shadowColor = '#39ff14';
      ctx.shadowBlur = 10;
      // Crystal-ish block.
      this.roundRect(o.x, y, o.w, o.h, 4);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(o.x + 3, y + 3, o.w - 6, 3);
    }
  }

  private drawRunner() {
    const { ctx } = this;
    const x = RUN_X;
    const h = this.runnerHeight();
    const y = this.runnerTopY();
    const cx = x + this.bodyW / 2;

    // Motion trail.
    if (this.state === 'PLAYING') {
      ctx.fillStyle = 'rgba(0,229,255,0.12)';
      for (let i = 1; i <= 3; i++) {
        this.roundRect(x - i * 8, y + 4, this.bodyW, h - 6, 6);
        ctx.fill();
      }
    }

    // Body.
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#7df9ff');
    grad.addColorStop(1, '#00b8d4');
    ctx.fillStyle = grad;
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 12;
    this.roundRect(x, y, this.bodyW, h, 7);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Visor.
    ctx.fillStyle = '#06222b';
    this.roundRect(x + this.bodyW * 0.5, y + 6, this.bodyW * 0.42, h * 0.22, 3);
    ctx.fill();

    // Legs — animated run cycle when grounded, tucked when jumping.
    ctx.strokeStyle = '#0090b3';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    const footY = this.groundY + this.runnerY;
    if (this.grounded && !this.ducking) {
      const swing = Math.sin(this.legPhase) * 7;
      ctx.beginPath();
      ctx.moveTo(cx - 4, y + h);
      ctx.lineTo(cx - 4 + swing, footY);
      ctx.moveTo(cx + 4, y + h);
      ctx.lineTo(cx + 4 - swing, footY);
      ctx.stroke();
    } else if (!this.grounded) {
      ctx.beginPath();
      ctx.moveTo(cx - 4, y + h);
      ctx.lineTo(cx - 8, y + h + 8);
      ctx.moveTo(cx + 4, y + h);
      ctx.lineTo(cx + 9, y + h + 6);
      ctx.stroke();
    }
  }

  private drawParticles() {
    const { ctx } = this;
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
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
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.font = `${Math.max(9, Math.floor(W / 26))}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, H / 2);
    ctx.shadowBlur = 0;
  }
}

export default RunnerEngine;
