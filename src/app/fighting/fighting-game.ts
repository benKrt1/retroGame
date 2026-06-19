// PIXEL BRAWL — 2D fighting game engine (TypeScript / Canvas)
// Two blocky pixel brawlers, best-of-3 rounds, 1P-vs-CPU or local 2P.
import { FightSoundSynth } from './fighting-synth';

export type FightState =
  | 'START'
  | 'ROUND_INTRO'
  | 'PLAYING'
  | 'PAUSED'
  | 'ROUND_OVER'
  | 'MATCH_OVER';

export type FightMode = '1P' | '2P';
export type PlayerId = 1 | 2;
export type PressAction = 'jump' | 'punch' | 'kick';

export interface HeldInput {
  left: boolean;
  right: boolean;
  crouch: boolean;
  block: boolean;
}

export interface FightStatus {
  mode: FightMode;
  state: FightState;
  round: number;
  p1Hp: number;
  p2Hp: number;
  p1Wins: number;
  p2Wins: number;
  timeLeft: number;
}

type Action = 'idle' | 'walk' | 'jump' | 'block' | 'punch' | 'kick' | 'hit' | 'ko';
type AttackType = 'punch' | 'kick' | null;

interface Fighter {
  x: number; // left of body box
  y: number; // feet (bottom) position
  vx: number;
  vy: number;
  facing: 1 | -1;
  hp: number;
  roundsWon: number;
  onGround: boolean;
  crouching: boolean;
  action: Action;
  attackType: AttackType;
  actionTimer: number; // ms remaining for a timed action (attack / hit)
  actionDur: number; // total ms of the current timed action
  hasHit: boolean; // whether the current attack already connected
  cooldown: number; // ms until the next attack is allowed
  flash: number; // ms of hit-flash remaining
  color: string;
  trim: string;
  kind: 'human' | 'cpu';
  held: HeldInput;
  pending: { jump: boolean; punch: boolean; kick: boolean };
  aiTimer: number;
}

// ─── Tuning ──────────────────────────────────────────────────────────────────
const MAX_HP = 100;
const ROUND_TIME = 60; // seconds
const ROUNDS_TO_WIN = 2;

const GRAVITY = 1500; // px/s^2
const JUMP_V = 470; // px/s
const WALK_SPEED = 135; // px/s

const BODY_W = 30;
const STAND_H = 64;
const CROUCH_H = 42;
const GROUND_MARGIN = 22; // feet height above the canvas bottom

// [duration, active window, damage, reach, knockback, hitstun] in ms / px
const PUNCH = { dur: 260, aStart: 70, aEnd: 150, dmg: 6, range: 26, kb: 90, stun: 240 };
const KICK = { dur: 380, aStart: 120, aEnd: 230, dmg: 11, range: 34, kb: 150, stun: 330 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class FightEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private synth: FightSoundSynth;
  private onStatusChange: (s: FightStatus) => void;

  private fighters: [Fighter, Fighter];
  private mode: FightMode = '1P';
  private lastMode: FightMode = '1P';
  private state: FightState = 'START';
  private round = 1;
  private timeLeft = ROUND_TIME;
  private phaseTimer = 0; // drives ROUND_INTRO / ROUND_OVER timing
  private lastRoundWinner: 0 | 1 | 2 = 0;

  private animId: number | null = null;
  private lastTime = 0;
  private lastEmit = '';

  constructor(
    canvas: HTMLCanvasElement,
    synth: FightSoundSynth,
    onStatusChange: (s: FightStatus) => void,
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context');
    this.ctx = ctx;
    this.synth = synth;
    this.onStatusChange = onStatusChange;

    this.fighters = [this.makeFighter(1), this.makeFighter(2)];
    this.initFighters();
    this.startRenderLoop();
  }

  // ─── Public API ──────────────────────────────────────────────────────────
  public startMatch(mode: FightMode) {
    this.mode = mode;
    this.lastMode = mode;
    this.round = 1;
    this.initFighters();
    this.fighters[1].kind = mode === '1P' ? 'cpu' : 'human';
    this.timeLeft = ROUND_TIME;
    this.state = 'ROUND_INTRO';
    this.phaseTimer = 1700;
    this.emit(true);
  }

  // PLAY button: begin a match, or resume from pause.
  public play() {
    if (this.state === 'PAUSED') {
      this.state = 'PLAYING';
      this.emit(true);
    } else if (this.state === 'START' || this.state === 'MATCH_OVER') {
      this.startMatch(this.lastMode);
    }
  }

  public pause() {
    if (this.state === 'PLAYING') {
      this.state = 'PAUSED';
      this.emit(true);
    }
  }

  public togglePause() {
    if (this.state === 'PLAYING') this.pause();
    else this.play();
  }

  // RESET button: back to the mode-select screen.
  public reset() {
    this.initFighters();
    this.state = 'START';
    this.emit(true);
  }

  public setHeld(player: PlayerId, held: Partial<HeldInput>) {
    Object.assign(this.fighters[player - 1].held, held);
  }

  public press(player: PlayerId, action: PressAction) {
    this.fighters[player - 1].pending[action] = true;
  }

  public getState(): FightState {
    return this.state;
  }

  public destroy() {
    if (this.animId !== null) cancelAnimationFrame(this.animId);
  }

  // ─── Setup ────────────────────────────────────────────────────────────────
  private makeFighter(id: PlayerId): Fighter {
    return {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      facing: id === 1 ? 1 : -1,
      hp: MAX_HP,
      roundsWon: 0,
      onGround: true,
      crouching: false,
      action: 'idle',
      attackType: null,
      actionTimer: 0,
      actionDur: 0,
      hasHit: false,
      cooldown: 0,
      flash: 0,
      color: id === 1 ? '#00e5ff' : '#ff3d00',
      trim: id === 1 ? '#9bf6ff' : '#ffb199',
      kind: 'human',
      held: { left: false, right: false, crouch: false, block: false },
      pending: { jump: false, punch: false, kick: false },
      aiTimer: 0,
    };
  }

  // Full reset: positions, HP and rounds won (new match).
  private initFighters() {
    const ground = this.canvas.height - GROUND_MARGIN;
    const [f1, f2] = this.fighters;
    this.resetPose(f1, this.canvas.width * 0.25, ground, 1);
    this.resetPose(f2, this.canvas.width * 0.75 - BODY_W, ground, -1);
    f1.hp = f2.hp = MAX_HP;
    f1.roundsWon = f2.roundsWon = 0;
    this.timeLeft = ROUND_TIME;
  }

  // Reset for a new round: positions + HP, keep rounds won.
  private resetForRound() {
    const ground = this.canvas.height - GROUND_MARGIN;
    const [f1, f2] = this.fighters;
    this.resetPose(f1, this.canvas.width * 0.25, ground, 1);
    this.resetPose(f2, this.canvas.width * 0.75 - BODY_W, ground, -1);
    f1.hp = f2.hp = MAX_HP;
    this.timeLeft = ROUND_TIME;
  }

  private resetPose(f: Fighter, x: number, feetY: number, facing: 1 | -1) {
    f.x = x;
    f.y = feetY;
    f.vx = 0;
    f.vy = 0;
    f.facing = facing;
    f.onGround = true;
    f.crouching = false;
    f.action = 'idle';
    f.attackType = null;
    f.actionTimer = 0;
    f.actionDur = 0;
    f.hasHit = false;
    f.cooldown = 0;
    f.flash = 0;
    f.held = { left: false, right: false, crouch: false, block: false };
    f.pending = { jump: false, punch: false, kick: false };
    f.aiTimer = 0;
  }

  // ─── Render / update loop ──────────────────────────────────────────────────
  private startRenderLoop() {
    this.lastTime = performance.now();
    const frame = (now: number) => {
      const delta = Math.min(50, now - this.lastTime);
      this.lastTime = now;

      switch (this.state) {
        case 'PLAYING':
          this.updatePlaying(delta);
          break;
        case 'ROUND_INTRO':
          this.updateIntro(delta);
          break;
        case 'ROUND_OVER':
          this.updateRoundOver(delta);
          break;
        // START / PAUSED / MATCH_OVER: no simulation
      }

      this.draw();
      this.animId = requestAnimationFrame(frame);
    };
    this.animId = requestAnimationFrame(frame);
  }

  private updateIntro(dtMs: number) {
    this.phaseTimer -= dtMs;
    if (this.phaseTimer <= 0) {
      this.state = 'PLAYING';
      this.timeLeft = ROUND_TIME;
      this.synth.roundBell();
      this.emit(true);
    }
  }

  private updateRoundOver(dtMs: number) {
    this.phaseTimer -= dtMs;
    if (this.phaseTimer > 0) return;
    const [f1, f2] = this.fighters;
    if (f1.roundsWon >= ROUNDS_TO_WIN || f2.roundsWon >= ROUNDS_TO_WIN) {
      this.state = 'MATCH_OVER';
      this.synth.victory();
      this.emit(true);
    } else {
      this.round += 1;
      this.resetForRound();
      this.state = 'ROUND_INTRO';
      this.phaseTimer = 1700;
      this.emit(true);
    }
  }

  private updatePlaying(dtMs: number) {
    const dt = dtMs / 1000;
    const [f1, f2] = this.fighters;

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.resolveRound('time');
      return;
    }

    if (f1.kind === 'cpu') this.updateAI(f1, f2, dtMs);
    if (f2.kind === 'cpu') this.updateAI(f2, f1, dtMs);

    this.updateFacing(f1, f2);
    this.updateFacing(f2, f1);

    this.stepFighter(f1, dt, dtMs);
    this.stepFighter(f2, dt, dtMs);

    this.separate(f1, f2);

    this.resolveAttack(f1, f2);
    this.resolveAttack(f2, f1);

    if (f1.hp <= 0 || f2.hp <= 0) {
      this.resolveRound('ko');
      return;
    }

    this.emit(false);
  }

  private updateFacing(f: Fighter, opp: Fighter) {
    if (f.action === 'punch' || f.action === 'kick' || f.action === 'hit' || f.action === 'ko') {
      return;
    }
    const selfC = f.x + BODY_W / 2;
    const oppC = opp.x + BODY_W / 2;
    f.facing = oppC >= selfC ? 1 : -1;
  }

  private stepFighter(f: Fighter, dt: number, dtMs: number) {
    if (f.cooldown > 0) f.cooldown -= dtMs;
    if (f.flash > 0) f.flash -= dtMs;

    if (f.action === 'ko') {
      // frozen on the ground
      f.vx = 0;
      return;
    }

    const attacking = f.action === 'punch' || f.action === 'kick';
    const stunned = f.action === 'hit';

    if (attacking || stunned) {
      f.actionTimer -= dtMs;
      if (f.actionTimer <= 0) {
        f.action = 'idle';
        f.attackType = null;
      }
    }

    // Try to start a new attack only when free and grounded.
    const free = f.action !== 'punch' && f.action !== 'kick' && f.action !== 'hit';
    if (free && f.onGround && !f.held.block) {
      if (f.pending.punch && f.cooldown <= 0) this.startAttack(f, 'punch');
      else if (f.pending.kick && f.cooldown <= 0) this.startAttack(f, 'kick');
    }
    f.pending.punch = false;
    f.pending.kick = false;

    const nowAttacking = f.action === 'punch' || f.action === 'kick';
    const nowStunned = f.action === 'hit';
    const blocking = f.held.block && f.onGround && !nowAttacking && !nowStunned;
    f.crouching = f.held.crouch && f.onGround && !nowAttacking && !nowStunned && !blocking;

    const canMove = !nowAttacking && !nowStunned && !blocking && !f.crouching;

    // Horizontal control.
    if (canMove) {
      let dir = 0;
      if (f.held.left) dir -= 1;
      if (f.held.right) dir += 1;
      f.vx = dir * WALK_SPEED;
    } else if (nowStunned) {
      f.vx *= 0.9; // let knockback decay
    } else if (f.onGround) {
      f.vx = 0;
    }

    // Jump.
    if (f.pending.jump && f.onGround && canMove) {
      f.vy = -JUMP_V;
      f.onGround = false;
    }
    f.pending.jump = false;

    // Integrate.
    f.vy += GRAVITY * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;

    const ground = this.canvas.height - GROUND_MARGIN;
    if (f.y >= ground) {
      f.y = ground;
      f.vy = 0;
      f.onGround = true;
    }
    f.x = clamp(f.x, 4, this.canvas.width - BODY_W - 4);

    // Resolve the visual action (attacks / hit / ko keep their own value).
    if (!nowAttacking && !nowStunned) {
      if (blocking) f.action = 'block';
      else if (!f.onGround) f.action = 'jump';
      else if (Math.abs(f.vx) > 1) f.action = 'walk';
      else f.action = 'idle';
    }
  }

  private startAttack(f: Fighter, type: 'punch' | 'kick') {
    const cfg = type === 'punch' ? PUNCH : KICK;
    f.action = type;
    f.attackType = type;
    f.actionTimer = cfg.dur;
    f.actionDur = cfg.dur;
    f.hasHit = false;
    f.cooldown = cfg.dur + 120;
    f.vx = 0;
    this.synth.whiff();
  }

  private resolveAttack(attacker: Fighter, defender: Fighter) {
    if (attacker.action !== 'punch' && attacker.action !== 'kick') return;
    if (attacker.hasHit) return;

    const cfg = attacker.attackType === 'punch' ? PUNCH : KICK;
    const elapsed = attacker.actionDur - attacker.actionTimer;
    if (elapsed < cfg.aStart || elapsed > cfg.aEnd) return;

    // Attacker stands while striking.
    const top = attacker.y - STAND_H;
    const hbW = cfg.range;
    const hbH = attacker.attackType === 'punch' ? 16 : 18;
    const hbY = attacker.attackType === 'punch' ? top + 10 : top + 26;
    const hbX = attacker.facing === 1 ? attacker.x + BODY_W - 4 : attacker.x - hbW + 4;

    const db = this.bodyBox(defender);
    if (!this.overlap(hbX, hbY, hbW, hbH, db.x, db.y, db.w, db.h)) return;

    attacker.hasHit = true;

    const facingAttacker = defender.facing === -attacker.facing;
    const blocking =
      defender.action === 'block' || (defender.held.block && defender.onGround && defender.action !== 'hit');

    if (blocking && facingAttacker) {
      this.synth.blockClink();
      defender.vx = attacker.facing * 60;
    } else {
      defender.hp = Math.max(0, defender.hp - cfg.dmg);
      defender.action = 'hit';
      defender.attackType = null;
      defender.actionTimer = cfg.stun;
      defender.actionDur = cfg.stun;
      defender.flash = 120;
      defender.vx = attacker.facing * cfg.kb;
      if (attacker.attackType === 'punch') this.synth.punchHit();
      else this.synth.kickHit();
    }
  }

  private separate(a: Fighter, b: Fighter) {
    const ba = this.bodyBox(a);
    const bb = this.bodyBox(b);
    const overlapX = !(ba.x + ba.w <= bb.x || bb.x + bb.w <= ba.x);
    const overlapY = !(ba.y + ba.h <= bb.y || bb.y + bb.h <= ba.y);
    if (!overlapX || !overlapY) return;

    const aCenter = ba.x + ba.w / 2;
    const bCenter = bb.x + bb.w / 2;
    const amount = ba.w / 2 + bb.w / 2 - Math.abs(aCenter - bCenter);
    if (amount <= 0) return;
    const push = amount / 2 + 0.5;
    if (aCenter <= bCenter) {
      a.x -= push;
      b.x += push;
    } else {
      a.x += push;
      b.x -= push;
    }
    a.x = clamp(a.x, 4, this.canvas.width - BODY_W - 4);
    b.x = clamp(b.x, 4, this.canvas.width - BODY_W - 4);
  }

  private bodyBox(f: Fighter): { x: number; y: number; w: number; h: number } {
    const h = f.crouching ? CROUCH_H : STAND_H;
    return { x: f.x, y: f.y - h, w: BODY_W, h };
  }

  private overlap(
    ax: number,
    ay: number,
    aw: number,
    ah: number,
    bx: number,
    by: number,
    bw: number,
    bh: number,
  ): boolean {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  // ─── CPU AI ─────────────────────────────────────────────────────────────────
  private updateAI(f: Fighter, opp: Fighter, dtMs: number) {
    if (f.action === 'hit' || f.action === 'ko') return;
    f.aiTimer -= dtMs;
    if (f.aiTimer > 0) return;

    const selfC = f.x + BODY_W / 2;
    const oppC = opp.x + BODY_W / 2;
    const dist = Math.abs(selfC - oppC);
    const oppAttacking = opp.action === 'punch' || opp.action === 'kick';

    f.held.left = f.held.right = f.held.block = f.held.crouch = false;
    f.aiTimer = 200 + Math.random() * 320;

    if (oppAttacking && dist < 62 && Math.random() < 0.5) {
      f.held.block = true;
      f.aiTimer = 180 + Math.random() * 160;
      return;
    }

    if (dist > 64) {
      if (oppC > selfC) f.held.right = true;
      else f.held.left = true;
      if (Math.random() < 0.05) f.pending.jump = true;
      return;
    }

    const r = Math.random();
    if (r < 0.58) {
      if (Math.random() < 0.6) f.pending.punch = true;
      else f.pending.kick = true;
      f.aiTimer = 300 + Math.random() * 260;
    } else if (r < 0.74) {
      if (oppC > selfC) f.held.left = true;
      else f.held.right = true;
      f.aiTimer = 150 + Math.random() * 200;
    } else {
      f.held.block = Math.random() < 0.5;
    }
  }

  // ─── Round resolution ───────────────────────────────────────────────────────
  private resolveRound(reason: 'ko' | 'time') {
    const [f1, f2] = this.fighters;
    let winner: 0 | 1 | 2;
    if (f1.hp <= 0 && f2.hp <= 0) winner = 0;
    else if (f1.hp <= 0) winner = 2;
    else if (f2.hp <= 0) winner = 1;
    else winner = f1.hp > f2.hp ? 1 : f2.hp > f1.hp ? 2 : 0;

    if (winner === 1) f1.roundsWon += 1;
    else if (winner === 2) f2.roundsWon += 1;
    this.lastRoundWinner = winner;

    if (reason === 'ko') {
      const loser = f1.hp <= 0 ? f1 : f2;
      loser.action = 'ko';
      loser.attackType = null;
      this.synth.ko();
    }

    this.state = 'ROUND_OVER';
    this.phaseTimer = 1900;
    this.emit(true);
  }

  // ─── Status emit (throttled to meaningful changes) ────────────────────────────
  private emit(force: boolean) {
    const [f1, f2] = this.fighters;
    const status: FightStatus = {
      mode: this.mode,
      state: this.state,
      round: this.round,
      p1Hp: Math.round(f1.hp),
      p2Hp: Math.round(f2.hp),
      p1Wins: f1.roundsWon,
      p2Wins: f2.roundsWon,
      timeLeft: Math.ceil(this.timeLeft),
    };
    const key = JSON.stringify(status);
    if (!force && key === this.lastEmit) return;
    this.lastEmit = key;
    this.onStatusChange(status);
  }

  // ─── Drawing ──────────────────────────────────────────────────────────────
  private draw() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Backdrop.
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#0a0a18');
    grad.addColorStop(1, '#05050b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Floor line.
    const ground = canvas.height - GROUND_MARGIN;
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, ground);
    ctx.lineTo(canvas.width, ground);
    ctx.stroke();
    // Floor grid ticks.
    ctx.strokeStyle = 'rgba(120, 120, 160, 0.12)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= canvas.width; gx += 24) {
      ctx.beginPath();
      ctx.moveTo(gx, ground);
      ctx.lineTo(gx, canvas.height);
      ctx.stroke();
    }

    this.drawFighter(this.fighters[0]);
    this.drawFighter(this.fighters[1]);

    this.drawAnnouncements();
  }

  private drawFighter(f: Fighter) {
    const { ctx } = this;
    const h = f.crouching ? CROUCH_H : STAND_H;
    const top = f.y - h;
    const x = f.x;
    const w = BODY_W;
    const color = f.flash > 0 ? '#ffffff' : f.color;

    ctx.save();
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 10;

    if (f.action === 'ko') {
      // Downed: a flat slab on the floor.
      ctx.fillStyle = color;
      ctx.fillRect(x - 6, f.y - 16, w + 12, 14);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#000';
      ctx.fillRect(x + 4, f.y - 12, 4, 4);
      ctx.fillRect(x + 14, f.y - 12, 4, 4);
      ctx.restore();
      return;
    }

    const headH = 14;
    const legH = Math.round(h * 0.32);
    const torsoTop = top + headH;
    const torsoBottom = f.y - legH;

    // Legs.
    ctx.fillStyle = color;
    ctx.fillRect(x + 4, torsoBottom, 8, legH);
    ctx.fillRect(x + w - 12, torsoBottom, 8, legH);

    // Torso.
    ctx.fillRect(x + 3, torsoTop, w - 6, torsoBottom - torsoTop);

    // Head.
    ctx.fillStyle = f.trim;
    const headX = x + (w - 16) / 2;
    ctx.fillRect(headX, top, 16, headH);
    // Eye (facing side).
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#05050b';
    const eyeX = f.facing === 1 ? headX + 10 : headX + 2;
    ctx.fillRect(eyeX, top + 5, 4, 4);
    ctx.shadowBlur = 10;
    ctx.shadowColor = f.color;

    // Arms / attacking limbs.
    ctx.fillStyle = color;
    const shoulderY = torsoTop + 4;
    if (f.action === 'block') {
      // Guard arm across the front.
      const gx = f.facing === 1 ? x + w - 4 : x - 6;
      ctx.fillStyle = f.trim;
      ctx.fillRect(gx, shoulderY, 10, 22);
    } else if (f.action === 'punch') {
      const armY = top + 10;
      const ax = f.facing === 1 ? x + w - 4 : x - PUNCH.range + 4;
      ctx.fillRect(ax, armY, PUNCH.range, 8);
    } else if (f.action === 'kick') {
      const ky = top + 26;
      const kx = f.facing === 1 ? x + w - 4 : x - KICK.range + 4;
      ctx.fillRect(kx, ky, KICK.range, 10);
    } else {
      // Resting arms on each side.
      ctx.fillRect(x - 2, shoulderY, 5, 18);
      ctx.fillRect(x + w - 3, shoulderY, 5, 18);
    }

    ctx.restore();
  }

  private drawAnnouncements() {
    const { ctx, canvas } = this;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    const bigText = (text: string, color: string, y: number, size: number) => {
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.font = `${size}px "Press Start 2P", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cx, y);
      ctx.shadowBlur = 0;
    };

    if (this.state === 'ROUND_INTRO') {
      if (this.phaseTimer > 700) bigText(`ROUND ${this.round}`, '#ffeb3b', cy, 22);
      else bigText('FIGHT!', '#39ff14', cy, 28);
    } else if (this.state === 'PAUSED') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      bigText('PAUSED', '#00e5ff', cy, 24);
    } else if (this.state === 'ROUND_OVER') {
      const sub =
        this.lastRoundWinner === 0
          ? 'DRAW'
          : `PLAYER ${this.lastRoundWinner} WINS`;
      bigText('K.O.', '#ff3d00', cy - 16, 30);
      bigText(sub, '#ffffff', cy + 18, 12);
    } else if (this.state === 'MATCH_OVER') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const [f1] = this.fighters;
      const p1Won = f1.roundsWon >= ROUNDS_TO_WIN;
      let title: string;
      let color: string;
      if (this.mode === '1P') {
        title = p1Won ? 'YOU WIN' : 'YOU LOSE';
        color = p1Won ? '#39ff14' : '#ff3d00';
      } else {
        title = p1Won ? 'PLAYER 1 WINS' : 'PLAYER 2 WINS';
        color = p1Won ? '#00e5ff' : '#ff3d00';
      }
      bigText(title, color, cy - 10, 22);
      bigText('PRESS PLAY OR RESET', '#8c8c9e', cy + 22, 9);
    }
  }
}

export default FightEngine;
