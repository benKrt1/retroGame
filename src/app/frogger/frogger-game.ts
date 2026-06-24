// Frogger Game Engine (TypeScript / Canvas)
// Hop the frog up across a road and a river to fill the home bays at the top.
import { FroggerSynth } from './frogger-synth';

export type FroggerState = 'IDLE' | 'PLAYING' | 'PAUSED' | 'GAMEOVER';
export type HopDir = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface FroggerStatus {
  score: number;
  lives: number;
  level: number;
  state: FroggerState;
}

type LaneType = 'safe' | 'car' | 'log';

interface LaneItem {
  x: number;   // pixel left edge
  len: number; // length in pixels
}

interface Lane {
  row: number;
  type: LaneType;
  dir: number;   // +1 / -1
  speed: number; // px/sec
  items: LaneItem[];
}

const COLS = 11;
const ROWS = 13;
const GOAL_ROW = 0;
const RIVER_ROWS = [1, 2, 3, 4];
const ROAD_ROWS = [6, 7, 8, 9];
const START_ROW = 12;
const BAY_COLS = [1, 4, 6, 9]; // home bay centres on the goal row
const HOP_TIME = 0.1;
const LIFE_TIME = 40; // seconds per life

export class FroggerEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private synth: FroggerSynth;
  private onStatusChange: (s: FroggerStatus) => void;

  private tile: number;
  private W: number;
  private H: number;

  private lanes: Lane[] = [];
  private bays: boolean[] = [];

  private frogCol = 5;
  private frogRow = START_ROW;
  private frogPx = 0;        // pixel centre x (for river drift + hop anim)
  private frogPy = 0;        // pixel centre y
  private hopFrom = { x: 0, y: 0 };
  private hopTo = { x: 0, y: 0 };
  private hopT = 1;          // 1 = settled
  private farthestRow = START_ROW;
  private frogDir: HopDir = 'UP';

  private score = 0;
  private lives = 3;
  private level = 1;
  private timer = LIFE_TIME;
  private state: FroggerState = 'IDLE';

  private animId: number | null = null;
  private lastTime = 0;

  constructor(
    canvas: HTMLCanvasElement,
    synth: FroggerSynth,
    onStatusChange: (s: FroggerStatus) => void,
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context');
    this.ctx = ctx;
    this.synth = synth;
    this.onStatusChange = onStatusChange;

    this.W = canvas.width;
    this.H = canvas.height;
    this.tile = Math.floor(Math.min(this.W / COLS, this.H / ROWS));

    this.initGame();
    this.startRenderLoop();
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  public hop(dir: HopDir) {
    if (this.state !== 'PLAYING') {
      if (this.state === 'IDLE') this.start();
      return;
    }
    if (this.hopT < 1) return; // mid-hop

    let col = this.frogCol;
    let row = this.frogRow;
    if (dir === 'UP') row -= 1;
    else if (dir === 'DOWN') row += 1;
    else if (dir === 'LEFT') col -= 1;
    else if (dir === 'RIGHT') col += 1;

    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;

    this.frogCol = col;
    this.frogRow = row;
    this.frogDir = dir;
    this.hopFrom = { x: this.frogPx, y: this.frogPy };
    this.hopTo = { x: this.cellCx(col), y: this.cellCy(row) };
    this.hopT = 0;
    this.synth.playHop();

    if (row < this.farthestRow) {
      this.farthestRow = row;
      this.score += 10;
      this.emitStatus();
    }
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
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.bays = BAY_COLS.map(() => false);
    this.buildLanes();
    this.resetFrog();
    this.state = 'IDLE';
    this.emitStatus();
  }

  private buildLanes() {
    const t = this.tile;
    const speedBoost = 1 + (this.level - 1) * 0.12;
    const lanes: Lane[] = [];

    const makeLane = (row: number, type: LaneType, baseSpeed: number, lenTiles: number, gapTiles: number, offset: number): Lane => {
      const dir = row % 2 === 0 ? 1 : -1;
      const period = (lenTiles + gapTiles) * t;
      const items: LaneItem[] = [];
      for (let x = -period; x < this.W + period; x += period) {
        items.push({ x: x + offset * t, len: lenTiles * t });
      }
      return { row, type, dir, speed: baseSpeed * speedBoost, items };
    };

    // River lanes (logs / turtle rows) — longer, gentler platforms.
    lanes.push(makeLane(RIVER_ROWS[0], 'log', 34, 3, 2, 0));
    lanes.push(makeLane(RIVER_ROWS[1], 'log', 44, 3, 2, 1));
    lanes.push(makeLane(RIVER_ROWS[2], 'log', 30, 4, 3, 2));
    lanes.push(makeLane(RIVER_ROWS[3], 'log', 40, 3, 2, 0));

    // Road lanes (cars) — slower with bigger gaps so there's room to cross.
    lanes.push(makeLane(ROAD_ROWS[0], 'car', 42, 1, 4, 0));
    lanes.push(makeLane(ROAD_ROWS[1], 'car', 34, 2, 5, 2));
    lanes.push(makeLane(ROAD_ROWS[2], 'car', 52, 1, 5, 1));
    lanes.push(makeLane(ROAD_ROWS[3], 'car', 40, 1, 4, 3));

    this.lanes = lanes;
  }

  private laneAt(row: number): Lane | undefined {
    return this.lanes.find((l) => l.row === row);
  }

  private resetFrog() {
    this.frogCol = 5;
    this.frogRow = START_ROW;
    this.frogPx = this.cellCx(5);
    this.frogPy = this.cellCy(START_ROW);
    this.hopT = 1;
    this.farthestRow = START_ROW;
    this.timer = LIFE_TIME;
  }

  // ─── Coordinate helpers ────────────────────────────────────────────────────

  private offsetX() { return Math.floor((this.W - this.tile * COLS) / 2); }
  private offsetY() { return Math.floor((this.H - this.tile * ROWS) / 2); }
  private cellCx(col: number) { return this.offsetX() + col * this.tile + this.tile / 2; }
  private cellCy(row: number) { return this.offsetY() + row * this.tile + this.tile / 2; }

  // ─── Simulation ────────────────────────────────────────────────────────────

  private update(dt: number) {
    // Move lane traffic.
    for (const lane of this.lanes) {
      for (const it of lane.items) {
        it.x += lane.dir * lane.speed * dt;
        const span = this.W + it.len * 2;
        if (it.x > this.W + it.len) it.x -= span;
        if (it.x < -it.len * 2) it.x += span;
      }
    }

    // Hop animation.
    if (this.hopT < 1) {
      this.hopT = Math.min(1, this.hopT + dt / HOP_TIME);
      this.frogPx = this.hopFrom.x + (this.hopTo.x - this.hopFrom.x) * this.hopT;
      this.frogPy = this.hopFrom.y + (this.hopTo.y - this.hopFrom.y) * this.hopT;
    }

    // Timer.
    this.timer -= dt;
    if (this.timer <= 0) { this.loseLife(); return; }

    // Resolve interactions only when settled on a cell.
    if (this.hopT >= 1) this.resolveCell(dt);
  }

  private resolveCell(dt: number) {
    const row = this.frogRow;

    if (row === GOAL_ROW) { this.tryEnterBay(); return; }

    const lane = this.laneAt(row);
    if (!lane) return; // safe rows (median/start/grass)

    if (lane.type === 'car') {
      if (this.frogOverlapsItem(lane)) this.loseLife();
      return;
    }

    if (lane.type === 'log') {
      const item = this.itemUnderFrog(lane);
      if (!item) { this.loseLife(); return; } // drowned
      // Ride the log.
      this.frogPx += lane.dir * lane.speed * dt;
      this.frogCol = Math.round((this.frogPx - this.offsetX() - this.tile / 2) / this.tile);
      if (this.frogPx < this.offsetX() || this.frogPx > this.offsetX() + this.tile * COLS) {
        this.loseLife(); // carried off the edge
      }
    }
  }

  private frogRect() {
    const half = this.tile * 0.4;
    return { left: this.frogPx - half, right: this.frogPx + half };
  }

  private frogOverlapsItem(lane: Lane): boolean {
    const f = this.frogRect();
    return lane.items.some((it) => f.right > it.x && f.left < it.x + it.len);
  }

  private itemUnderFrog(lane: Lane): LaneItem | undefined {
    // The frog rides a platform when its centre is over it.
    return lane.items.find((it) => this.frogPx > it.x && this.frogPx < it.x + it.len);
  }

  private tryEnterBay() {
    const bayIdx = BAY_COLS.findIndex((c) => Math.abs(this.cellCx(c) - this.frogPx) < this.tile * 0.6);
    if (bayIdx === -1 || this.bays[bayIdx]) { this.loseLife(); return; }
    this.bays[bayIdx] = true;
    this.score += 200 + Math.max(0, Math.floor(this.timer)) * 5;
    this.synth.playHome();
    if (this.bays.every(Boolean)) this.advanceLevel();
    else { this.resetFrog(); this.emitStatus(); }
  }

  private loseLife() {
    this.lives -= 1;
    this.synth.playDeath();
    if (this.lives <= 0) {
      this.state = 'GAMEOVER';
      this.emitStatus();
      return;
    }
    this.resetFrog();
    this.emitStatus();
  }

  private advanceLevel() {
    this.level += 1;
    this.score += 1000;
    this.synth.playLevelClear();
    this.bays = BAY_COLS.map(() => false);
    this.buildLanes();
    this.resetFrog();
    this.emitStatus();
  }

  private emitStatus() {
    this.onStatusChange({ score: this.score, lives: this.lives, level: this.level, state: this.state });
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
    const { ctx, tile } = this;
    const ox = this.offsetX();
    const oy = this.offsetY();
    ctx.clearRect(0, 0, this.W, this.H);

    // Row backgrounds (textured per type).
    for (let r = 0; r < ROWS; r++) {
      const y = oy + r * tile;
      if (r === GOAL_ROW) this.drawGrassRow(y, true);
      else if (RIVER_ROWS.includes(r)) this.drawWaterRow(y);
      else if (ROAD_ROWS.includes(r)) this.drawRoadRow(y, r);
      else this.drawGrassRow(y, false);
    }

    // Goal bays as glowing lily pads (filled ones show a happy frog).
    BAY_COLS.forEach((c, i) => {
      this.drawLilyPad(this.cellCx(c), oy + tile / 2, this.bays[i]);
    });

    // Lane traffic.
    for (const lane of this.lanes) {
      const y = oy + lane.row * tile;
      const riverIdx = RIVER_ROWS.indexOf(lane.row);
      for (const it of lane.items) {
        if (lane.type === 'car') {
          this.drawCar(it.x, y, it.len, lane.dir, lane.row);
        } else if (riverIdx % 2 === 1) {
          this.drawTurtles(it.x, y, it.len, lane.dir);
        } else {
          this.drawLog(it.x, y, it.len);
        }
      }
    }

    // Frog (faces its last hop direction; squashes mid-hop).
    const squash = this.hopT < 1 ? 1 + 0.22 * Math.sin(this.hopT * Math.PI) : 1;
    this.drawFrogAt(this.frogPx, this.frogPy, this.frogDir, '#0a2a10', squash);

    // Timer bar (rounded, colour shifts as it drains).
    const full = tile * COLS;
    const tw = full * Math.max(0, this.timer / LIFE_TIME);
    const by = oy + ROWS * tile - 4;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(ox, by, full, 4);
    ctx.fillStyle = this.timer < 8 ? '#ff3d00' : this.timer < 16 ? '#ff9100' : '#39ff14';
    ctx.shadowColor = ctx.fillStyle as string;
    ctx.shadowBlur = 6;
    ctx.fillRect(ox, by, tw, 4);
    ctx.shadowBlur = 0;

    if (this.state === 'IDLE') this.drawOverlay('PRESS PLAY', '#39ff14');
    else if (this.state === 'PAUSED') this.drawOverlay('PAUSED', '#00e5ff');
    else if (this.state === 'GAMEOVER') this.drawOverlay('GAME OVER', '#ff3d00');
  }

  // ─── Scenery & sprite drawing ──────────────────────────────────────────────

  private drawGrassRow(y: number, lush: boolean) {
    const { ctx, tile } = this;
    const ox = this.offsetX();
    const w = tile * COLS;
    const g = ctx.createLinearGradient(0, y, 0, y + tile);
    g.addColorStop(0, lush ? '#1c5c2c' : '#143f1d');
    g.addColorStop(1, lush ? '#123f1e' : '#0d2e14');
    ctx.fillStyle = g;
    ctx.fillRect(ox, y, w, tile);
    // Static tufts (deterministic so they don't flicker).
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let c = 0; c < COLS; c++) {
      const tx = ox + c * tile + ((c * 13) % tile);
      ctx.fillRect(tx, y + ((c * 7) % (tile - 4)) + 2, 3, 2);
    }
  }

  private drawWaterRow(y: number) {
    const { ctx, tile } = this;
    const ox = this.offsetX();
    const w = tile * COLS;
    const g = ctx.createLinearGradient(0, y, 0, y + tile);
    g.addColorStop(0, '#06375a');
    g.addColorStop(1, '#04223a');
    ctx.fillStyle = g;
    ctx.fillRect(ox, y, w, tile);
    // Animated shimmer lines.
    const now = performance.now() / 1000;
    ctx.strokeStyle = 'rgba(120,200,255,0.13)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const yy = y + tile * (0.28 + i * 0.24);
      ctx.beginPath();
      for (let x = ox; x <= ox + w; x += 6) {
        const off = Math.sin(x * 0.05 + now * 1.6 + i) * 2;
        if (x === ox) ctx.moveTo(x, yy + off);
        else ctx.lineTo(x, yy + off);
      }
      ctx.stroke();
    }
  }

  private drawRoadRow(y: number, row: number) {
    const { ctx, tile } = this;
    const ox = this.offsetX();
    const w = tile * COLS;
    ctx.fillStyle = row % 2 === 0 ? '#16161e' : '#1b1b24';
    ctx.fillRect(ox, y, w, tile);
    // Dashed lane divider along the top edge.
    ctx.strokeStyle = 'rgba(255,235,59,0.22)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(ox, y + 1);
    ctx.lineTo(ox + w, y + 1);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawLilyPad(cx: number, cy: number, filled: boolean) {
    const { ctx, tile } = this;
    const r = tile * 0.42;
    // Pad.
    ctx.fillStyle = filled ? 'rgba(57,255,20,0.25)' : 'rgba(57,255,20,0.12)';
    ctx.strokeStyle = '#39ff14';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#39ff14';
    ctx.shadowBlur = filled ? 10 : 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0.5, Math.PI * 2 + 0.2); // notched pad
    ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (filled) this.drawFrogAt(cx, cy, 'UP', '#0a2a10', 0.85);
  }

  private drawCar(x: number, y: number, len: number, dir: number, row: number) {
    const { ctx, tile } = this;
    const palette = ['#ff3d00', '#00e5ff', '#ffeb3b', '#ff007f'];
    const color = palette[row % palette.length];
    const top = y + tile * 0.2;
    const h = tile * 0.6;
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    this.roundRect(x + 2, top + h - 2, len, 5, 3);
    ctx.fill();
    // Body.
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    this.roundRect(x, top, len, h, 6);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Cabin / windscreen.
    ctx.fillStyle = 'rgba(220,245,255,0.85)';
    this.roundRect(x + len * 0.22, top + h * 0.16, len * 0.56, h * 0.4, 3);
    ctx.fill();
    // Wheels.
    ctx.fillStyle = '#0a0a0e';
    ctx.beginPath();
    ctx.arc(x + len * 0.24, top + h, h * 0.2, 0, Math.PI * 2);
    ctx.arc(x + len * 0.76, top + h, h * 0.2, 0, Math.PI * 2);
    ctx.fill();
    // Headlights at the leading edge.
    ctx.fillStyle = '#fff7c0';
    ctx.shadowColor = '#fff7c0';
    ctx.shadowBlur = 6;
    const hx = dir > 0 ? x + len - 3 : x + 3;
    ctx.beginPath();
    ctx.arc(hx, top + h * 0.35, 2, 0, Math.PI * 2);
    ctx.arc(hx, top + h * 0.7, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  private drawLog(x: number, y: number, len: number) {
    const { ctx, tile } = this;
    const top = y + tile * 0.22;
    const h = tile * 0.56;
    ctx.fillStyle = '#6b431c';
    this.roundRect(x, top, len, h, h / 2);
    ctx.fill();
    // Top highlight.
    ctx.fillStyle = 'rgba(180,120,60,0.4)';
    this.roundRect(x + 4, top + 3, len - 8, h * 0.24, h * 0.1);
    ctx.fill();
    // Bark grain.
    ctx.strokeStyle = 'rgba(50,30,12,0.5)';
    ctx.lineWidth = 1;
    for (let gx = x + 10; gx < x + len - 6; gx += 11) {
      ctx.beginPath();
      ctx.moveTo(gx, top + 4);
      ctx.lineTo(gx, top + h - 4);
      ctx.stroke();
    }
    // End rings.
    ctx.fillStyle = '#8a5a2a';
    ctx.beginPath();
    ctx.ellipse(x + len - 4, top + h / 2, 4, h / 2 - 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(50,30,12,0.6)';
    ctx.beginPath();
    ctx.ellipse(x + len - 4, top + h / 2, 2, h / 2 * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawTurtles(x: number, y: number, len: number, dir: number) {
    const { ctx, tile } = this;
    const n = Math.max(1, Math.round(len / tile));
    const tw = len / n;
    for (let i = 0; i < n; i++) {
      const cx = x + tw * (i + 0.5);
      const cy = y + tile / 2;
      const bob = Math.sin(performance.now() / 320 + i) * 1.6;
      const r = tile * 0.3;
      // Shell.
      ctx.fillStyle = '#1f8f4a';
      ctx.shadowColor = '#39ff14';
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.arc(cx, cy + bob, r, Math.PI, 0);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#155f33';
      ctx.fillRect(cx - r, cy + bob, r * 2, 2);
      // Shell ridges.
      ctx.strokeStyle = 'rgba(10,40,20,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy + bob - r * 0.9);
      ctx.lineTo(cx, cy + bob);
      ctx.moveTo(cx - r * 0.5, cy + bob - r * 0.5);
      ctx.lineTo(cx - r * 0.4, cy + bob);
      ctx.moveTo(cx + r * 0.5, cy + bob - r * 0.5);
      ctx.lineTo(cx + r * 0.4, cy + bob);
      ctx.stroke();
      // Head.
      ctx.fillStyle = '#2bbf10';
      ctx.beginPath();
      ctx.arc(cx + (dir > 0 ? r * 0.95 : -r * 0.95), cy + bob - 1, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawFrogAt(cx: number, cy: number, dir: HopDir, pupil: string, scale: number) {
    const { ctx, tile } = this;
    const r = tile * 0.32 * scale;
    const ang = dir === 'RIGHT' ? Math.PI / 2 : dir === 'DOWN' ? Math.PI : dir === 'LEFT' ? -Math.PI / 2 : 0;
    ctx.save();
    ctx.translate(cx, cy);
    // Soft ground/water shadow (unrotated).
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.7, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(ang);

    // Back legs (splayed).
    ctx.fillStyle = '#2bbf10';
    [-1, 1].forEach((s) => {
      ctx.beginPath();
      ctx.ellipse(s * r * 0.7, r * 0.5, r * 0.3, r * 0.5, s * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(s * r * 0.95, r * 0.92, r * 0.24, r * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    // Front legs.
    [-1, 1].forEach((s) => {
      ctx.beginPath();
      ctx.ellipse(s * r * 0.45, -r * 0.55, r * 0.14, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    // Body (gradient for volume).
    const g = ctx.createRadialGradient(0, -r * 0.25, r * 0.2, 0, 0, r);
    g.addColorStop(0, '#8dff66');
    g.addColorStop(1, '#1f9e2f');
    ctx.fillStyle = g;
    ctx.shadowColor = '#39ff14';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.92, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Belly highlight.
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.25, r * 0.45, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bulging eyes on top.
    [-1, 1].forEach((s) => {
      ctx.fillStyle = '#7dff5a';
      ctx.beginPath();
      ctx.arc(s * r * 0.42, -r * 0.72, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s * r * 0.42, -r * 0.74, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pupil;
      ctx.beginPath();
      ctx.arc(s * r * 0.42, -r * 0.8, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(s * r * 0.48, -r * 0.88, r * 0.045, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
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
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.font = `${Math.max(10, Math.floor(this.W / 16))}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, this.W / 2, this.H / 2);
    ctx.shadowBlur = 0;
  }
}

export default FroggerEngine;
