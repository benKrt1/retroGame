// Bomberman Game Engine (TypeScript / Canvas)
// Single player vs roaming AI enemies. Clear every enemy on a stage to advance.
import { BombermanSynth } from './bomberman-synth';

export type BombermanGameState = 'IDLE' | 'PLAYING' | 'PAUSED' | 'GAMEOVER';
export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface BombermanStatus {
  score: number;
  stage: number;
  lives: number;
  enemiesLeft: number;
  state: BombermanGameState;
}

// Tile types on the static board.
const EMPTY = 0;
const HARD = 1; // indestructible pillar / border
const SOFT = 2; // destructible block
type Tile = typeof EMPTY | typeof HARD | typeof SOFT;

const COLS = 13;
const ROWS = 11;

const BOMB_FUSE = 2.2;       // seconds before a bomb detonates
const FLAME_LIFE = 0.5;      // seconds a flame tile burns
const PLAYER_SPEED = 4.6;    // tiles per second
const INVULN_TIME = 1.6;     // respawn grace period (seconds)
const STAGE_BANNER = 1.6;    // "STAGE X" pause (seconds)
const SOFT_FILL = 0.62;      // fraction of free interior cells that get a soft block
const POWERUP_CHANCE = 0.28; // chance a destroyed soft block drops a power-up

type PowerType = 'BOMB' | 'RANGE';

interface Mover {
  col: number;          // source cell of the current step
  row: number;
  px: number;           // pixel centre (canvas space)
  py: number;
  dir: Direction;
  moving: boolean;
  targetCol: number;
  targetRow: number;
  speed: number;        // tiles per second
}

interface Bomb {
  col: number;
  row: number;
  fuse: number;
  range: number;
  exploded: boolean;
}

interface Flame {
  col: number;
  row: number;
  life: number;
  center: boolean;
}

interface PowerUp {
  col: number;
  row: number;
  type: PowerType;
}

interface Enemy extends Mover {
  alive: boolean;
  chase: number; // 0..1 probability of moving toward the player at a junction
}

export class BombermanEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private synth: BombermanSynth;
  private onStatusChange: (s: BombermanStatus) => void;

  private tile = 0;
  private offsetX = 0;
  private offsetY = 0;

  private grid: Tile[][] = [];
  private player!: Mover;
  private enemies: Enemy[] = [];
  private bombs: Bomb[] = [];
  private flames: Flame[] = [];
  private powerups: PowerUp[] = [];

  private maxBombs = 1;
  private range = 1;
  private lives = 3;
  private score = 0;
  private stage = 1;
  private invuln = 0;
  private banner = 0;

  private state: BombermanGameState = 'IDLE';

  // Input — held directions, latest takes priority.
  private held: Record<Direction, boolean> = { UP: false, DOWN: false, LEFT: false, RIGHT: false };
  private heldOrder: Direction[] = [];
  private wantBomb = false;

  private animId: number | null = null;
  private lastTime = 0;

  constructor(
    canvas: HTMLCanvasElement,
    synth: BombermanSynth,
    onStatusChange: (s: BombermanStatus) => void,
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context');
    this.ctx = ctx;
    this.synth = synth;
    this.onStatusChange = onStatusChange;

    this.tile = Math.floor(Math.min(canvas.width / COLS, canvas.height / ROWS));
    this.offsetX = Math.floor((canvas.width - this.tile * COLS) / 2);
    this.offsetY = Math.floor((canvas.height - this.tile * ROWS) / 2);

    this.initGame();
    this.startRenderLoop();
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  public setHeld(dir: Direction, held: boolean) {
    if (this.held[dir] === held) return;
    this.held[dir] = held;
    if (held) {
      this.heldOrder = this.heldOrder.filter((d) => d !== dir);
      this.heldOrder.push(dir);
    } else {
      this.heldOrder = this.heldOrder.filter((d) => d !== dir);
    }
  }

  // Convenience for tap-style controls (no key-up): nudge one direction.
  public setDirection(dir: Direction) {
    this.setHeld(dir, true);
    // Auto-release shortly after so a tap doesn't latch forever.
    setTimeout(() => this.setHeld(dir, false), 140);
  }

  public placeBomb() {
    this.wantBomb = true;
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
    if (this.state === 'PLAYING') {
      this.state = 'PAUSED';
      this.emitStatus();
    } else if (this.state === 'PAUSED') {
      this.state = 'PLAYING';
      this.emitStatus();
    } else {
      this.start();
    }
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
    this.maxBombs = 1;
    this.range = 1;
    this.lives = 3;
    this.score = 0;
    this.stage = 1;
    this.buildStage();
    this.state = 'IDLE';
    this.emitStatus();
  }

  private buildStage() {
    this.bombs = [];
    this.flames = [];
    this.powerups = [];
    this.invuln = INVULN_TIME;
    this.banner = STAGE_BANNER;
    this.held = { UP: false, DOWN: false, LEFT: false, RIGHT: false };
    this.heldOrder = [];
    this.wantBomb = false;

    // Static board: border + even/even pillars are HARD.
    const grid: Tile[][] = [];
    for (let r = 0; r < ROWS; r++) {
      grid[r] = [];
      for (let c = 0; c < COLS; c++) {
        const border = r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1;
        const pillar = r % 2 === 0 && c % 2 === 0;
        grid[r][c] = border || pillar ? HARD : EMPTY;
      }
    }
    this.grid = grid;

    // Keep the player's start corner and the enemy spawns clear of soft blocks.
    const playerStart = { col: 1, row: 1 };
    const enemySpawns = [
      { col: COLS - 2, row: ROWS - 2 },
      { col: COLS - 2, row: 1 },
      { col: 1, row: ROWS - 2 },
      { col: Math.floor(COLS / 2), row: Math.floor(ROWS / 2) },
      { col: COLS - 2, row: Math.floor(ROWS / 2) },
    ];
    const safe = new Set<string>();
    const markSafe = (col: number, row: number) => {
      [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        safe.add(`${col + dx},${row + dy}`);
      });
    };
    markSafe(playerStart.col, playerStart.row);
    enemySpawns.forEach((s) => markSafe(s.col, s.row));

    // Scatter destructible blocks across the remaining free interior cells.
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (grid[r][c] !== EMPTY) continue;
        if (safe.has(`${c},${r}`)) continue;
        if (Math.random() < SOFT_FILL) grid[r][c] = SOFT;
      }
    }

    // Player.
    this.player = this.makeMover(playerStart.col, playerStart.row, PLAYER_SPEED);

    // Enemies — more and faster each stage.
    const count = Math.min(enemySpawns.length, 2 + this.stage);
    const speed = 2.0 + this.stage * 0.22;
    const chase = Math.min(0.7, 0.15 + this.stage * 0.12);
    this.enemies = [];
    for (let i = 0; i < count; i++) {
      const s = enemySpawns[i];
      const e = this.makeMover(s.col, s.row, speed) as Enemy;
      e.alive = true;
      e.chase = chase;
      e.dir = (['UP', 'DOWN', 'LEFT', 'RIGHT'] as Direction[])[Math.floor(Math.random() * 4)];
      this.enemies.push(e);
    }
  }

  private makeMover(col: number, row: number, speed: number): Mover {
    return {
      col, row,
      px: this.cellToPx(col),
      py: this.cellToPy(row),
      dir: 'DOWN',
      moving: false,
      targetCol: col,
      targetRow: row,
      speed,
    };
  }

  // ─── Coordinate helpers ────────────────────────────────────────────────────

  private cellToPx(col: number) { return this.offsetX + col * this.tile + this.tile / 2; }
  private cellToPy(row: number) { return this.offsetY + row * this.tile + this.tile / 2; }
  private pxToCol(px: number) { return Math.round((px - this.offsetX - this.tile / 2) / this.tile); }
  private pxToRow(py: number) { return Math.round((py - this.offsetY - this.tile / 2) / this.tile); }

  private inBounds(col: number, row: number) {
    return col >= 0 && col < COLS && row >= 0 && row < ROWS;
  }

  private bombAt(col: number, row: number) {
    return this.bombs.some((b) => b.col === col && b.row === row);
  }

  // A cell is walkable if it is empty terrain and not blocked by a bomb.
  private walkable(col: number, row: number) {
    if (!this.inBounds(col, row)) return false;
    if (this.grid[row][col] !== EMPTY) return false;
    if (this.bombAt(col, row)) return false;
    return true;
  }

  private static readonly DELTA: Record<Direction, [number, number]> = {
    UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0],
  };

  // ─── Simulation ────────────────────────────────────────────────────────────

  private update(dt: number) {
    if (this.banner > 0) {
      this.banner -= dt;
      this.wantBomb = false;
      return; // hold the action during the stage banner
    }
    if (this.invuln > 0) this.invuln -= dt;

    this.updatePlayer(dt);
    this.enemies.forEach((e) => { if (e.alive) this.updateEnemy(e, dt); });
    this.updateBombs(dt);
    this.updateFlames(dt);
    this.checkPickups();
    this.checkPlayerHazards();
  }

  private desiredDir(): Direction | null {
    for (let i = this.heldOrder.length - 1; i >= 0; i--) {
      if (this.held[this.heldOrder[i]]) return this.heldOrder[i];
    }
    return null;
  }

  private updatePlayer(dt: number) {
    const p = this.player;

    if (this.wantBomb) {
      this.tryPlaceBomb(p.col, p.row);
      this.wantBomb = false;
    }

    if (!p.moving) {
      const want = this.desiredDir();
      if (want) {
        const [dx, dy] = BombermanEngine.DELTA[want];
        p.dir = want;
        if (this.walkable(p.col + dx, p.row + dy)) {
          p.targetCol = p.col + dx;
          p.targetRow = p.row + dy;
          p.moving = true;
        }
      }
    }
    this.advanceMover(p, dt);
  }

  private updateEnemy(e: Enemy, dt: number) {
    if (!e.moving) {
      this.pickEnemyDir(e);
      const [dx, dy] = BombermanEngine.DELTA[e.dir];
      if (this.walkable(e.col + dx, e.row + dy)) {
        e.targetCol = e.col + dx;
        e.targetRow = e.row + dy;
        e.moving = true;
      }
    }
    this.advanceMover(e, dt);
  }

  private pickEnemyDir(e: Enemy) {
    const opposite: Record<Direction, Direction> = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
    const dirs = (Object.keys(BombermanEngine.DELTA) as Direction[]).filter((d) => {
      const [dx, dy] = BombermanEngine.DELTA[d];
      return this.walkable(e.col + dx, e.row + dy);
    });
    if (dirs.length === 0) return;

    // Chase: bias toward the direction that reduces distance to the player.
    if (Math.random() < e.chase) {
      dirs.sort((a, b) => this.distAfter(e, a) - this.distAfter(e, b));
      e.dir = dirs[0];
      return;
    }

    // Otherwise wander, preferring not to reverse unless it's a dead end.
    const forward = dirs.filter((d) => d !== opposite[e.dir]);
    const pool = forward.length > 0 ? forward : dirs;
    e.dir = pool[Math.floor(Math.random() * pool.length)];
  }

  private distAfter(e: Enemy, d: Direction) {
    const [dx, dy] = BombermanEngine.DELTA[d];
    return Math.abs(e.col + dx - this.player.col) + Math.abs(e.row + dy - this.player.row);
  }

  // Move a grid-locked mover toward its target cell, snapping on arrival.
  private advanceMover(m: Mover, dt: number) {
    if (!m.moving) return;
    const tx = this.cellToPx(m.targetCol);
    const ty = this.cellToPy(m.targetRow);
    const step = m.speed * this.tile * dt;
    const dx = tx - m.px;
    const dy = ty - m.py;
    const dist = Math.hypot(dx, dy);
    if (dist <= step) {
      m.px = tx;
      m.py = ty;
      m.col = m.targetCol;
      m.row = m.targetRow;
      m.moving = false;
    } else {
      m.px += (dx / dist) * step;
      m.py += (dy / dist) * step;
    }
  }

  private tryPlaceBomb(col: number, row: number) {
    if (this.bombs.filter((b) => !b.exploded).length >= this.maxBombs) return;
    if (this.bombAt(col, row)) return;
    this.bombs.push({ col, row, fuse: BOMB_FUSE, range: this.range, exploded: false });
    this.synth.playBombPlace();
  }

  private updateBombs(dt: number) {
    for (const b of this.bombs) {
      if (b.exploded) continue;
      b.fuse -= dt;
      if (b.fuse <= 0) this.explode(b);
    }
    this.bombs = this.bombs.filter((b) => !b.exploded);
  }

  private explode(b: Bomb) {
    if (b.exploded) return;
    b.exploded = true;
    this.synth.playExplosion();
    this.addFlame(b.col, b.row, true);

    for (const dir of Object.keys(BombermanEngine.DELTA) as Direction[]) {
      const [dx, dy] = BombermanEngine.DELTA[dir];
      for (let i = 1; i <= b.range; i++) {
        const c = b.col + dx * i;
        const r = b.row + dy * i;
        if (!this.inBounds(c, r)) break;
        const t = this.grid[r][c];
        if (t === HARD) break;
        if (t === SOFT) {
          this.destroySoft(c, r);
          this.addFlame(c, r, false);
          break; // flame stops at the first destructible block
        }
        this.addFlame(c, r, false);
        // Chain-detonate any bomb caught in the blast.
        const chained = this.bombs.find((o) => !o.exploded && o.col === c && o.row === r);
        if (chained) this.explode(chained);
      }
    }
  }

  private addFlame(col: number, row: number, center: boolean) {
    this.flames.push({ col, row, life: FLAME_LIFE, center });
  }

  private destroySoft(col: number, row: number) {
    this.grid[row][col] = EMPTY;
    this.score += 10;
    if (Math.random() < POWERUP_CHANCE) {
      const type: PowerType = Math.random() < 0.5 ? 'BOMB' : 'RANGE';
      this.powerups.push({ col, row, type });
    }
    this.emitStatus();
  }

  private updateFlames(dt: number) {
    for (const f of this.flames) f.life -= dt;
    // Kill any enemy standing in a flame before the flame expires.
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const ec = this.pxToCol(e.px);
      const er = this.pxToRow(e.py);
      if (this.flames.some((f) => f.life > 0 && f.col === ec && f.row === er)) {
        e.alive = false;
        this.score += 100;
        this.synth.playEnemyDeath();
        this.emitStatus();
      }
    }
    this.enemies = this.enemies.filter((e) => e.alive);
    this.flames = this.flames.filter((f) => f.life > 0);

    if (this.enemies.length === 0 && this.banner <= 0) this.advanceStage();
  }

  private checkPickups() {
    const pc = this.pxToCol(this.player.px);
    const pr = this.pxToRow(this.player.py);
    const hit = this.powerups.find((u) => u.col === pc && u.row === pr);
    if (hit) {
      if (hit.type === 'BOMB') this.maxBombs += 1;
      else this.range += 1;
      this.powerups = this.powerups.filter((u) => u !== hit);
      this.synth.playPickup();
      this.emitStatus();
    }
  }

  private checkPlayerHazards() {
    if (this.invuln > 0) return;
    const pc = this.pxToCol(this.player.px);
    const pr = this.pxToRow(this.player.py);

    const inFlame = this.flames.some((f) => f.life > 0 && f.col === pc && f.row === pr);
    const touched = this.enemies.some((e) => Math.hypot(e.px - this.player.px, e.py - this.player.py) < this.tile * 0.7);

    if (inFlame || touched) this.killPlayer();
  }

  private killPlayer() {
    this.lives -= 1;
    this.synth.playPlayerDeath();
    if (this.lives <= 0) {
      this.state = 'GAMEOVER';
      this.emitStatus();
      return;
    }
    // Respawn at the start corner with a short grace period.
    this.player = this.makeMover(1, 1, PLAYER_SPEED);
    this.invuln = INVULN_TIME;
    this.held = { UP: false, DOWN: false, LEFT: false, RIGHT: false };
    this.heldOrder = [];
    this.emitStatus();
  }

  private advanceStage() {
    this.stage += 1;
    this.score += 500;
    this.synth.playStageClear();
    this.buildStage();
    this.emitStatus();
  }

  private emitStatus() {
    this.onStatusChange({
      score: this.score,
      stage: this.stage,
      lives: this.lives,
      enemiesLeft: this.enemies.length,
      state: this.state,
    });
  }

  // ─── Render loop ─────────────────────────────────────────────────────────

  private startRenderLoop() {
    this.lastTime = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;
      if (this.state === 'PLAYING') this.update(dt);
      this.draw();
      this.animId = requestAnimationFrame(frame);
    };
    this.animId = requestAnimationFrame(frame);
  }

  private draw() {
    const { ctx, canvas, tile } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Board backdrop.
    ctx.fillStyle = '#0a0d18';
    ctx.fillRect(this.offsetX, this.offsetY, tile * COLS, tile * ROWS);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = this.offsetX + c * tile;
        const y = this.offsetY + r * tile;
        const t = this.grid[r][c];
        if (t === HARD) this.drawHard(x, y, tile);
        else if (t === SOFT) this.drawSoft(x, y, tile);
        else this.drawFloor(x, y, tile);
      }
    }

    this.powerups.forEach((u) => this.drawPowerUp(u));
    this.bombs.forEach((b) => this.drawBomb(b));
    this.flames.forEach((f) => this.drawFlame(f));
    this.enemies.forEach((e) => this.drawEnemy(e));
    this.drawPlayer();

    if (this.state === 'PLAYING' && this.banner > 0) {
      this.drawOverlay(`STAGE ${this.stage}`, '#ff9100');
    } else if (this.state === 'IDLE') {
      this.drawOverlay('PRESS PLAY', '#ff9100');
    } else if (this.state === 'PAUSED') {
      this.drawOverlay('PAUSED', '#00e5ff');
    } else if (this.state === 'GAMEOVER') {
      this.drawOverlay('GAME OVER', '#ff3d00');
    }
  }

  private drawFloor(x: number, y: number, s: number) {
    const { ctx } = this;
    ctx.fillStyle = '#0c1020';
    ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
    ctx.strokeStyle = 'rgba(255,145,0,0.05)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
  }

  private drawHard(x: number, y: number, s: number) {
    const { ctx } = this;
    ctx.fillStyle = '#2a2140';
    ctx.fillRect(x, y, s, s);
    // Bevel.
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x + 2, y + 2, s - 4, 3);
    ctx.fillRect(x + 2, y + 2, 3, s - 4);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x + 2, y + s - 5, s - 4, 3);
    ctx.fillRect(x + s - 5, y + 2, 3, s - 4);
    ctx.strokeStyle = 'rgba(0,229,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
  }

  private drawSoft(x: number, y: number, s: number) {
    const { ctx } = this;
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
    // Brick texture.
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    const h = (s - 2) / 3;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x + 1, y + 1 + i * h);
      ctx.lineTo(x + s - 1, y + 1 + i * h);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x + s / 2, y + 1);
    ctx.lineTo(x + s / 2, y + 1 + h);
    ctx.moveTo(x + s / 2, y + 1 + 2 * h);
    ctx.lineTo(x + s / 2, y + s - 1);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,180,90,0.18)';
    ctx.fillRect(x + 2, y + 2, s - 4, 2);
  }

  private drawBomb(b: Bomb) {
    const { ctx, tile } = this;
    const cx = this.cellToPx(b.col);
    const cy = this.cellToPy(b.row);
    const now = performance.now();
    // Heartbeat that quickens as the fuse runs down (more frantic near 0).
    const urgency = 1 - Math.max(0, Math.min(1, b.fuse / BOMB_FUSE));
    const pulse = 1 + 0.06 * Math.sin(now / (120 - urgency * 90)) * (0.6 + urgency);
    const r = tile * 0.32 * pulse;
    const bodyCy = cy + tile * 0.06; // sit the sphere slightly low to leave room for the fuse

    // Round black sphere body (radial gradient for volume).
    const grad = ctx.createRadialGradient(
      cx - r * 0.35, bodyCy - r * 0.35, r * 0.15,
      cx, bodyCy, r,
    );
    grad.addColorStop(0, '#3a3a48');
    grad.addColorStop(0.55, '#14141c');
    grad.addColorStop(1, '#06060a');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, bodyCy, r, 0, Math.PI * 2);
    ctx.fill();

    // Glossy highlight arc near the top-left.
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.35, bodyCy - r * 0.4, r * 0.26, r * 0.16, -0.7, 0, Math.PI * 2);
    ctx.fill();

    // Fuse cap (the little cylinder on top of the bomb).
    const capW = r * 0.5;
    const capH = r * 0.32;
    const capY = bodyCy - r;
    ctx.fillStyle = '#4a4a52';
    ctx.beginPath();
    ctx.moveTo(cx - capW * 0.5, capY);
    ctx.lineTo(cx + capW * 0.5, capY);
    ctx.lineTo(cx + capW * 0.36, capY - capH);
    ctx.lineTo(cx - capW * 0.36, capY - capH);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(cx - capW * 0.36, capY - capH, capW * 0.2, capH);

    // Curved fuse string rising from the cap.
    const fuseBaseY = capY - capH;
    const tipX = cx + r * 0.5;
    const tipY = fuseBaseY - r * 0.7;
    ctx.strokeStyle = '#7a5a2a';
    ctx.lineWidth = Math.max(1.5, r * 0.12);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, fuseBaseY);
    ctx.quadraticCurveTo(cx - r * 0.3, fuseBaseY - r * 0.6, tipX, tipY);
    ctx.stroke();

    // Sparking tip — flickers faster as the fuse nears 0.
    const flick = Math.sin(now / (60 - urgency * 40));
    const sparkR = r * (0.16 + 0.1 * (flick * 0.5 + 0.5));
    ctx.shadowColor = '#ff9100';
    ctx.shadowBlur = 10 + urgency * 8;
    ctx.fillStyle = '#ff6a00';
    ctx.beginPath();
    ctx.arc(tipX, tipY, sparkR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffeb3b';
    ctx.beginPath();
    ctx.arc(tipX, tipY, sparkR * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  private drawFlame(f: Flame) {
    const { ctx, tile } = this;
    const x = this.offsetX + f.col * tile;
    const y = this.offsetY + f.row * tile;
    const a = Math.max(0, Math.min(1, f.life / FLAME_LIFE));
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.5 * a;
    ctx.fillStyle = '#ff9100';
    ctx.shadowColor = '#ff3d00';
    ctx.shadowBlur = 12;
    ctx.fillRect(x + 2, y + 2, tile - 4, tile - 4);
    ctx.fillStyle = '#ffeb3b';
    const inset = tile * 0.26;
    ctx.fillRect(x + inset, y + inset, tile - inset * 2, tile - inset * 2);
    ctx.restore();
  }

  private drawPowerUp(u: PowerUp) {
    const { ctx, tile } = this;
    const cx = this.cellToPx(u.col);
    const cy = this.cellToPy(u.row);
    const r = tile * 0.32;
    ctx.fillStyle = u.type === 'BOMB' ? 'rgba(0,229,255,0.2)' : 'rgba(255,61,0,0.2)';
    ctx.strokeStyle = u.type === 'BOMB' ? '#00e5ff' : '#ff3d00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(cx - r, cy - r, r * 2, r * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.floor(tile * 0.5)}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(u.type === 'BOMB' ? '+' : '✶', cx, cy + 1);
  }

  private drawEnemy(e: Enemy) {
    const { ctx, tile } = this;
    const r = tile * 0.36;
    ctx.fillStyle = '#ff007f';
    ctx.shadowColor = '#ff007f';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(e.px, e.py, r, Math.PI, 0);
    ctx.lineTo(e.px + r, e.py + r * 0.8);
    // Wavy skirt.
    for (let i = 0; i <= 4; i++) {
      const wx = e.px + r - (i / 4) * r * 2;
      const wy = e.py + r * 0.8 + (i % 2 === 0 ? 0 : r * 0.3);
      ctx.lineTo(wx, wy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    // Eyes.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(e.px - r * 0.35, e.py - r * 0.1, r * 0.22, 0, Math.PI * 2);
    ctx.arc(e.px + r * 0.35, e.py - r * 0.1, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(e.px - r * 0.3, e.py - r * 0.1, r * 0.1, 0, Math.PI * 2);
    ctx.arc(e.px + r * 0.4, e.py - r * 0.1, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawPlayer() {
    const { ctx, tile } = this;
    const p = this.player;
    // Blink while invulnerable.
    if (this.invuln > 0 && Math.floor(performance.now() / 120) % 2 === 0) return;

    const u = tile;                      // size unit
    const cx = p.px;
    const walking = p.moving;
    const phase = walking ? Math.sin(performance.now() / 90) : 0; // limb swing
    const bob = walking ? -Math.abs(phase) * u * 0.04 : 0;        // tiny vertical bob
    const cy = p.py + bob;

    // Anchor points (fractions of the tile, centred on cx/cy).
    const hipY = cy + u * 0.30;
    const torsoY = cy + u * 0.06;
    const headY = cy - u * 0.26;
    const headR = u * 0.20;

    // Legs — swing fore/aft with the walk phase.
    const legSwing = phase * u * 0.12;
    ctx.strokeStyle = '#0090b3';
    ctx.lineWidth = u * 0.12;
    ctx.lineCap = 'round';
    [[-1, legSwing], [1, -legSwing]].forEach(([side, sw]) => {
      ctx.beginPath();
      ctx.moveTo(cx + side * u * 0.08, hipY);
      ctx.lineTo(cx + side * u * 0.08 + sw, hipY + u * 0.16);
      ctx.stroke();
    });

    // Arms — swing opposite the legs.
    ctx.strokeStyle = '#00b8d4';
    ctx.lineWidth = u * 0.1;
    [[-1, -phase], [1, phase]].forEach(([side, sw]) => {
      ctx.beginPath();
      ctx.moveTo(cx + side * u * 0.14, torsoY);
      ctx.lineTo(cx + side * u * 0.2, torsoY + u * 0.16 + sw * u * 0.08);
      ctx.stroke();
    });

    // Torso — glowing cyan capsule.
    ctx.fillStyle = '#00e5ff';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 10;
    this.roundRect(cx - u * 0.15, torsoY - u * 0.04, u * 0.3, u * 0.34, u * 0.12);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Chest emblem.
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(cx, torsoY + u * 0.12, u * 0.05, 0, Math.PI * 2);
    ctx.fill();

    // Head — peach face + cyan helmet, oriented by facing direction.
    const dir = p.dir;
    // Skin head.
    ctx.fillStyle = '#ffd9b3';
    ctx.beginPath();
    ctx.arc(cx, headY, headR, 0, Math.PI * 2);
    ctx.fill();
    // Helmet cap (top half) with a white rim.
    ctx.fillStyle = '#00e5ff';
    ctx.beginPath();
    ctx.arc(cx, headY, headR, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - headR, headY - u * 0.01, headR * 2, u * 0.03);

    // Face per direction.
    ctx.fillStyle = '#15202b';
    if (dir === 'UP') {
      // Back of the head — no eyes, drop the helmet a touch lower.
      ctx.fillStyle = '#00cbe0';
      ctx.beginPath();
      ctx.arc(cx, headY + headR * 0.15, headR * 0.9, Math.PI, 0);
      ctx.fill();
    } else if (dir === 'LEFT' || dir === 'RIGHT') {
      const s = dir === 'LEFT' ? -1 : 1;
      ctx.beginPath();
      ctx.arc(cx + s * headR * 0.35, headY + headR * 0.15, headR * 0.16, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // DOWN — two eyes facing us.
      ctx.beginPath();
      ctx.arc(cx - headR * 0.35, headY + headR * 0.1, headR * 0.16, 0, Math.PI * 2);
      ctx.arc(cx + headR * 0.35, headY + headR * 0.1, headR * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Trace a rounded rectangle path (caller fills/strokes).
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
    const { ctx, canvas } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.font = `${Math.max(10, Math.floor(canvas.width / 16))}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    ctx.shadowBlur = 0;
  }
}

export default BombermanEngine;
