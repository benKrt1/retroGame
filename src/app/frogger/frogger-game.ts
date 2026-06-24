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

    // Row backgrounds.
    for (let r = 0; r < ROWS; r++) {
      let color = '#0e2a14'; // grass
      if (r === GOAL_ROW) color = '#0a1f12';
      else if (RIVER_ROWS.includes(r)) color = '#05223a';
      else if (ROAD_ROWS.includes(r)) color = '#15151c';
      ctx.fillStyle = color;
      ctx.fillRect(ox, oy + r * tile, tile * COLS, tile);
    }

    // Goal bays.
    ctx.fillStyle = '#0a3a1a';
    ctx.fillRect(ox, oy, tile * COLS, tile);
    BAY_COLS.forEach((c, i) => {
      const x = this.cellCx(c);
      ctx.fillStyle = this.bays[i] ? '#39ff14' : 'rgba(57,255,20,0.18)';
      ctx.shadowColor = '#39ff14';
      ctx.shadowBlur = this.bays[i] ? 8 : 0;
      this.roundRect(x - tile * 0.42, oy + tile * 0.1, tile * 0.84, tile * 0.8, 5);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (this.bays[i]) this.drawFrogAt(x, oy + tile / 2, '#0a3a1a');
    });

    // Lane traffic.
    for (const lane of this.lanes) {
      const y = oy + lane.row * tile;
      for (const it of lane.items) {
        if (lane.type === 'car') {
          ctx.fillStyle = lane.dir > 0 ? '#ff3d00' : '#00e5ff';
          ctx.shadowColor = ctx.fillStyle as string;
          ctx.shadowBlur = 8;
          this.roundRect(it.x, y + tile * 0.15, it.len, tile * 0.7, 5);
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          // Log.
          ctx.fillStyle = '#7a4a1e';
          this.roundRect(it.x, y + tile * 0.2, it.len, tile * 0.6, 6);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    // Frog.
    this.drawFrogAt(this.frogPx, this.frogPy, '#39ff14');

    // Timer bar.
    const tw = (tile * COLS) * Math.max(0, this.timer / LIFE_TIME);
    ctx.fillStyle = this.timer < 6 ? '#ff3d00' : '#39ff14';
    ctx.fillRect(ox, oy + ROWS * tile - 3, tw, 3);

    if (this.state === 'IDLE') this.drawOverlay('PRESS PLAY', '#39ff14');
    else if (this.state === 'PAUSED') this.drawOverlay('PAUSED', '#00e5ff');
    else if (this.state === 'GAMEOVER') this.drawOverlay('GAME OVER', '#ff3d00');
  }

  private drawFrogAt(cx: number, cy: number, eyeBg: string) {
    const { ctx, tile } = this;
    const r = tile * 0.34;
    ctx.fillStyle = '#39ff14';
    ctx.shadowColor = '#39ff14';
    ctx.shadowBlur = 8;
    // Body.
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Legs.
    ctx.fillStyle = '#2bbf10';
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
      ctx.beginPath();
      ctx.ellipse(cx + sx * r * 0.7, cy + sy * r * 0.7, r * 0.28, r * 0.18, sx * sy * 0.6, 0, Math.PI * 2);
      ctx.fill();
    });
    // Eyes.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, cy - r * 0.45, r * 0.22, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.35, cy - r * 0.45, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = eyeBg === '#39ff14' ? '#0a2a10' : '#000000';
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, cy - r * 0.45, r * 0.1, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.35, cy - r * 0.45, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
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
