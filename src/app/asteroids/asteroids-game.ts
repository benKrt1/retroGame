// Asteroids Game Engine (TypeScript / Canvas)
// Framework-free, mirrors the structure of space-invaders/space-invaders-game.ts:
//   constructor(canvas, synth, onStatusChange) + resetGame/start/pause/togglePause/destroy
// Adds momentum/rotation physics and screen-wrapping not present in the other cabinets.
import { AsteroidsSoundSynth } from './asteroids-synth';

export type AsteroidsState = 'START' | 'PLAYING' | 'PAUSED' | 'GAMEOVER' | 'DYING';

export interface AsteroidsStatus {
  score: number;
  highScore: number;
  lives: number;
  wave: number;
  state: AsteroidsState;
}

// Canvas dimensions (kept in sync with the <canvas> element in the component).
const CW = 380;
const CH = 420;

// Ship.
const SHIP_R = 9; // collision + draw radius
const SHIP_TURN = 0.07; // radians per normalized frame
const SHIP_THRUST = 0.12; // velocity added per frame while thrusting
const SHIP_FRICTION = 0.99; // velocity decay per frame
const SHIP_MAX_SPEED = 5;
const RESPAWN_INVULN_MS = 2000;
const DYING_MS = 1200;

// Bullets.
const BULLET_SPEED = 6;
const BULLET_LIFE_MS = 850;
const MAX_BULLETS = 4;
const BULLET_R = 2;
const FIRE_COOLDOWN_MS = 220;

// Asteroids.
const AST_RADIUS: Record<1 | 2 | 3, number> = { 1: 12, 2: 22, 3: 36 };
const AST_POINTS: Record<1 | 2 | 3, number> = { 1: 100, 2: 50, 3: 20 };
const AST_BASE_SPEED = 0.6; // large; smaller pieces move faster

const HIGHSCORE_KEY = 'asteroids-highscore';

interface Ship {
  x: number;
  y: number;
  angle: number; // 0 = pointing up
  vx: number;
  vy: number;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // ms remaining
}

interface Asteroid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: 1 | 2 | 3;
  radius: number;
  angle: number; // current rotation
  spin: number; // rotation per frame
  verts: number[]; // jagged radius multipliers, one per vertex
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
  life: number; // ms remaining
  maxLife: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number; // twinkle offset
}

const STAR_COUNT = 60;
const MAX_SHAKE_MS = 420;
const MAX_FLASH_MS = 260;

export class AsteroidsEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private synth: AsteroidsSoundSynth;
  private onStatusChange: (status: AsteroidsStatus) => void;

  // Player.
  private ship: Ship = { x: CW / 2, y: CH / 2, angle: 0, vx: 0, vy: 0 };
  private lives = 3;
  private score = 0;
  private highScore = 0;
  private wave = 1;
  private invulnTimer = 0;

  // Input flags (held) — set by the component.
  private rotLeft = false;
  private rotRight = false;
  private thrust = false;
  private fireCooldown = 0;

  // Entities.
  private bullets: Bullet[] = [];
  private asteroids: Asteroid[] = [];

  // Visual effects (rendering only).
  private particles: Particle[] = [];
  private popups: ScorePopup[] = [];
  private stars: Star[] = [];
  private elapsed = 0; // ms, drives starfield twinkle
  private shakeTime = 0;
  private shakeMag = 0;
  private flashTime = 0;

  // Loop / state.
  private state: AsteroidsState = 'START';
  private animationId: number | null = null;
  private lastTime = 0;
  private dyingTimer = 0;

  constructor(
    canvas: HTMLCanvasElement,
    synth: AsteroidsSoundSynth,
    onStatusChange: (status: AsteroidsStatus) => void
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
    this.resetShip();
    this.bullets = [];
    this.particles = [];
    this.popups = [];
    this.shakeTime = 0;
    this.flashTime = 0;
    this.spawnWave();
    this.drawFrame();
    this.updateStatus();
  }

  private resetShip() {
    this.ship = { x: CW / 2, y: CH / 2, angle: 0, vx: 0, vy: 0 };
    this.invulnTimer = RESPAWN_INVULN_MS;
    this.rotLeft = false;
    this.rotRight = false;
    this.thrust = false;
    this.synth.stopThrust();
  }

  // Spawn (wave + 3) large asteroids along the edges, away from the ship.
  private spawnWave() {
    this.asteroids = [];
    const count = this.wave + 3;
    for (let i = 0; i < count; i++) {
      this.asteroids.push(this.makeAsteroid(3));
    }
  }

  private makeAsteroid(size: 1 | 2 | 3, x?: number, y?: number): Asteroid {
    // If no position given, spawn at a random edge far from the ship.
    let ax = x;
    let ay = y;
    if (ax === undefined || ay === undefined) {
      let tries = 0;
      do {
        if (Math.random() < 0.5) {
          ax = Math.random() < 0.5 ? 0 : CW;
          ay = Math.random() * CH;
        } else {
          ax = Math.random() * CW;
          ay = Math.random() < 0.5 ? 0 : CH;
        }
        tries++;
      } while (this.dist(ax, ay, this.ship.x, this.ship.y) < 90 && tries < 10);
    }

    const speed = AST_BASE_SPEED * (1 + (3 - size) * 0.55);
    const dir = Math.random() * Math.PI * 2;
    const vertCount = 9 + Math.floor(Math.random() * 4);
    const verts: number[] = [];
    for (let v = 0; v < vertCount; v++) {
      verts.push(0.72 + Math.random() * 0.42); // jagged radius multiplier
    }

    return {
      x: ax!,
      y: ay!,
      vx: Math.cos(dir) * speed,
      vy: Math.sin(dir) * speed,
      size,
      radius: AST_RADIUS[size],
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.04,
      verts,
    };
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

  public setRotateLeft(v: boolean) {
    this.rotLeft = v;
  }
  public setRotateRight(v: boolean) {
    this.rotRight = v;
  }
  public setThrust(v: boolean) {
    if (v && !this.thrust && this.state === 'PLAYING') this.synth.startThrust();
    if (!v && this.thrust) this.synth.stopThrust();
    this.thrust = v;
  }

  public shoot() {
    if (this.state !== 'PLAYING') return;
    if (this.fireCooldown > 0 || this.bullets.length >= MAX_BULLETS) return;
    this.fireCooldown = FIRE_COOLDOWN_MS;
    // 0 angle points up, so use sin/-cos to fire from the nose.
    const nx = Math.sin(this.ship.angle);
    const ny = -Math.cos(this.ship.angle);
    this.bullets.push({
      x: this.ship.x + nx * SHIP_R,
      y: this.ship.y + ny * SHIP_R,
      vx: nx * BULLET_SPEED + this.ship.vx,
      vy: ny * BULLET_SPEED + this.ship.vy,
      life: BULLET_LIFE_MS,
    });
    this.synth.playShoot();
  }

  public start() {
    if (this.state === 'START' || this.state === 'GAMEOVER') {
      if (this.state === 'GAMEOVER') this.resetGame();
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
      this.synth.stopThrust();
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
      if (this.fireCooldown > 0) this.fireCooldown -= delta;
      if (this.invulnTimer > 0) this.invulnTimer -= delta;
      this.updateShip(f);
      this.updateBullets(f, delta);
      this.updateAsteroids(f);
      this.updateEffects(f, delta);
      this.checkCollisions();
      if (this.asteroids.length === 0) {
        this.wave++;
        this.resetShip();
        this.spawnWave();
        this.updateStatus();
      }
    } else if (this.state === 'DYING') {
      this.dyingTimer -= delta;
      this.updateAsteroids(f);
      this.updateEffects(f, delta);
      if (this.dyingTimer <= 0) this.afterDeath();
    }

    this.drawFrame();

    if (this.state === 'PLAYING' || this.state === 'DYING') {
      this.animationId = requestAnimationFrame(this.loop);
    }
  };

  private updateShip(f: number) {
    if (this.rotLeft) this.ship.angle -= SHIP_TURN * f;
    if (this.rotRight) this.ship.angle += SHIP_TURN * f;

    if (this.thrust) {
      const nx = Math.sin(this.ship.angle);
      const ny = -Math.cos(this.ship.angle);
      this.ship.vx += nx * SHIP_THRUST * f;
      this.ship.vy += ny * SHIP_THRUST * f;
      // Emit fading exhaust particles from just behind the tail.
      const ex = this.ship.x - nx * SHIP_R;
      const ey = this.ship.y - ny * SHIP_R;
      const puffs = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < puffs; i++) {
        const spread = (Math.random() - 0.5) * 0.8;
        const sp = 1 + Math.random() * 1.5;
        this.particles.push({
          x: ex,
          y: ey,
          vx: -nx * sp + Math.cos(this.ship.angle) * spread,
          vy: -ny * sp + Math.sin(this.ship.angle) * spread,
          life: 260 + Math.random() * 160,
          maxLife: 420,
          size: 1.5 + Math.random() * 1.5,
          color: Math.random() < 0.5 ? '#ff9d4d' : '#ffeb3b',
        });
      }
    }
    // Friction + speed cap.
    this.ship.vx *= Math.pow(SHIP_FRICTION, f);
    this.ship.vy *= Math.pow(SHIP_FRICTION, f);
    const speed = Math.hypot(this.ship.vx, this.ship.vy);
    if (speed > SHIP_MAX_SPEED) {
      this.ship.vx = (this.ship.vx / speed) * SHIP_MAX_SPEED;
      this.ship.vy = (this.ship.vy / speed) * SHIP_MAX_SPEED;
    }

    this.ship.x += this.ship.vx * f;
    this.ship.y += this.ship.vy * f;
    this.wrap(this.ship);
  }

  private updateBullets(f: number, delta: number) {
    for (const b of this.bullets) {
      b.x += b.vx * f;
      b.y += b.vy * f;
      b.life -= delta;
      this.wrap(b);
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }

  private updateAsteroids(f: number) {
    for (const a of this.asteroids) {
      a.x += a.vx * f;
      a.y += a.vy * f;
      a.angle += a.spin * f;
      this.wrap(a);
    }
  }

  // Toroidal wrap across the play field.
  private wrap(obj: { x: number; y: number }) {
    if (obj.x < 0) obj.x += CW;
    else if (obj.x > CW) obj.x -= CW;
    if (obj.y < 0) obj.y += CH;
    else if (obj.y > CH) obj.y -= CH;
  }

  // ---- Visual effects ----

  // Radial burst of debris/spark particles at (x, y).
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
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life,
        maxLife: life,
        size: 1 + Math.random() * 1.8,
        color: palette[Math.floor(Math.random() * palette.length)],
      });
    }
  }

  private updateEffects(f: number, delta: number) {
    // Particles: drift with light drag, fade out.
    for (const p of this.particles) {
      p.x += p.vx * f;
      p.y += p.vy * f;
      p.vx *= Math.pow(0.97, f);
      p.vy *= Math.pow(0.97, f);
      p.life -= delta;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    // Score popups drift upward and fade.
    for (const s of this.popups) {
      s.y -= 0.4 * f;
      s.life -= delta;
    }
    this.popups = this.popups.filter((s) => s.life > 0);

    // Screen shake + hit flash timers.
    if (this.shakeTime > 0) this.shakeTime -= delta;
    if (this.flashTime > 0) this.flashTime -= delta;
  }

  // ---- Collisions ----

  private checkCollisions() {
    // Bullets vs asteroids.
    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const b = this.bullets[bi];
      for (let ai = this.asteroids.length - 1; ai >= 0; ai--) {
        const a = this.asteroids[ai];
        if (this.circlesOverlap(b.x, b.y, BULLET_R, a.x, a.y, a.radius)) {
          this.bullets.splice(bi, 1);
          this.destroyAsteroid(ai);
          break;
        }
      }
    }

    // Ship vs asteroids (ignored while invulnerable).
    if (this.invulnTimer <= 0) {
      for (const a of this.asteroids) {
        if (this.circlesOverlap(this.ship.x, this.ship.y, SHIP_R, a.x, a.y, a.radius)) {
          this.playerHit();
          break;
        }
      }
    }
  }

  private destroyAsteroid(index: number) {
    const a = this.asteroids[index];
    const points = AST_POINTS[a.size];
    this.addScore(points);
    this.synth.playBang(a.size);

    // Spark burst + floating score popup at the rock's position.
    this.spawnBurst(a.x, a.y, a.size * 6, ['#ffffff', '#5de2ff', '#c9c9d6'], 0.8, 2.6, 280, 620);
    this.popups.push({
      x: a.x,
      y: a.y,
      text: `+${points}`,
      life: 800,
      maxLife: 800,
    });
    // Larger rocks give a small screen shake.
    if (a.size === 3) {
      this.shakeTime = Math.max(this.shakeTime, 140);
      this.shakeMag = Math.max(this.shakeMag, 3);
    }

    this.asteroids.splice(index, 1);
    // Split into two smaller pieces at the same spot.
    if (a.size > 1) {
      const smaller = (a.size - 1) as 1 | 2;
      this.asteroids.push(this.makeAsteroid(smaller, a.x, a.y));
      this.asteroids.push(this.makeAsteroid(smaller, a.x, a.y));
    }
  }

  private circlesOverlap(
    ax: number, ay: number, ar: number,
    bx: number, by: number, br: number
  ): boolean {
    const r = ar + br;
    return (ax - bx) ** 2 + (ay - by) ** 2 <= r * r;
  }

  private dist(ax: number, ay: number, bx: number, by: number): number {
    return Math.hypot(ax - bx, ay - by);
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
    this.synth.stopThrust();
    this.synth.playShipExplosion();
    // Big debris burst + strong shake + white flash.
    this.spawnBurst(this.ship.x, this.ship.y, 30, ['#5de2ff', '#ffffff', '#ff9d4d', '#ffeb3b'], 1.2, 4, 500, 1100);
    this.shakeTime = MAX_SHAKE_MS;
    this.shakeMag = 7;
    this.flashTime = MAX_FLASH_MS;
    this.updateStatus();
    if (this.lives <= 0) {
      this.gameOver();
    } else {
      this.state = 'DYING';
      this.dyingTimer = DYING_MS;
    }
  }

  private afterDeath() {
    this.resetShip();
    this.bullets = [];
    this.state = 'PLAYING';
    this.updateStatus();
  }

  private gameOver() {
    this.state = 'GAMEOVER';
    this.synth.stopThrust();
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

    // Shake the gameplay layer (entities + stars + effects), not the overlays.
    this.ctx.save();
    if (this.shakeTime > 0) {
      const amt = this.shakeMag * (this.shakeTime / MAX_SHAKE_MS);
      this.ctx.translate((Math.random() - 0.5) * amt * 2, (Math.random() - 0.5) * amt * 2);
    }

    this.drawStars();
    this.drawAsteroids();
    this.drawParticles();
    this.drawBullets();
    if (this.state === 'PLAYING' || this.state === 'PAUSED') {
      this.drawShip();
    }
    this.drawPopups();

    this.ctx.restore();

    // Full-screen white flash on impact (un-shaken).
    if (this.flashTime > 0) {
      this.ctx.fillStyle = `rgba(255, 255, 255, ${0.5 * (this.flashTime / MAX_FLASH_MS)})`;
      this.ctx.fillRect(0, 0, CW, CH);
    }

    if (this.state === 'START') {
      this.drawOverlay('PRESS PLAY');
    }
  }

  private drawStars() {
    for (const s of this.stars) {
      const tw = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(this.elapsed * 0.002 + s.phase));
      this.ctx.fillStyle = `rgba(200, 210, 230, ${tw})`;
      this.ctx.fillRect(s.x, s.y, s.size, s.size);
    }
  }

  private drawParticles() {
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      this.ctx.globalAlpha = alpha;
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

  private drawShip() {
    // Blink while invulnerable.
    if (this.invulnTimer > 0 && Math.floor(this.invulnTimer / 120) % 2 === 0) return;

    const { x, y, angle } = this.ship;
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(angle);
    this.ctx.strokeStyle = '#5de2ff';
    this.ctx.lineWidth = 2;
    this.ctx.shadowColor = 'rgba(93, 226, 255, 0.5)';
    this.ctx.shadowBlur = 6;
    this.ctx.beginPath();
    this.ctx.moveTo(0, -SHIP_R - 2); // nose
    this.ctx.lineTo(SHIP_R - 1, SHIP_R);
    this.ctx.lineTo(0, SHIP_R - 3); // tail notch
    this.ctx.lineTo(-(SHIP_R - 1), SHIP_R);
    this.ctx.closePath();
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;

    // Flickering thrust flame.
    if (this.thrust && Math.random() > 0.3) {
      this.ctx.strokeStyle = '#ff9d4d';
      this.ctx.beginPath();
      this.ctx.moveTo(-4, SHIP_R - 2);
      this.ctx.lineTo(0, SHIP_R + 6);
      this.ctx.lineTo(4, SHIP_R - 2);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  private drawAsteroids() {
    this.ctx.strokeStyle = '#c9c9d6';
    this.ctx.lineWidth = 2;
    this.ctx.shadowColor = 'rgba(93, 226, 255, 0.45)';
    this.ctx.shadowBlur = 6;
    for (const a of this.asteroids) {
      this.ctx.save();
      this.ctx.translate(a.x, a.y);
      this.ctx.rotate(a.angle);
      this.ctx.beginPath();
      for (let v = 0; v < a.verts.length; v++) {
        const ang = (v / a.verts.length) * Math.PI * 2;
        const r = a.radius * a.verts[v];
        const px = Math.cos(ang) * r;
        const py = Math.sin(ang) * r;
        if (v === 0) this.ctx.moveTo(px, py);
        else this.ctx.lineTo(px, py);
      }
      this.ctx.closePath();
      this.ctx.stroke();
      this.ctx.restore();
    }
    this.ctx.shadowBlur = 0;
  }

  private drawBullets() {
    for (const b of this.bullets) {
      // Faint tracer trailing the bullet's travel direction.
      this.ctx.strokeStyle = 'rgba(93, 226, 255, 0.5)';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(b.x, b.y);
      this.ctx.lineTo(b.x - b.vx * 1.6, b.y - b.vy * 1.6);
      this.ctx.stroke();
      // Glowing core.
      this.ctx.fillStyle = '#ffffff';
      this.ctx.shadowColor = '#5de2ff';
      this.ctx.shadowBlur = 8;
      this.ctx.beginPath();
      this.ctx.arc(b.x, b.y, BULLET_R + 0.5, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.shadowBlur = 0;
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

export default AsteroidsEngine;
