// Web Audio API sound synth for PIXEL BRAWL.
// SSR-safe and lazily initialized on first user interaction, mirroring the
// pattern of RetroSoundSynth in ../pacman/sound-synth.ts.

export class FightSoundSynth {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  private init() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AudioCtx();
      } catch (e) {
        console.error('Web Audio API not supported', e);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
    if (val) this.init();
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  // Flat retro note with a click-free envelope.
  private playTone(
    freq: number,
    type: OscillatorType,
    duration: number,
    volume: number = 0.05,
    startTimeOffset: number = 0,
  ) {
    this.init();
    if (!this.ctx || !this.enabled) return;

    const t = this.ctx.currentTime + startTimeOffset;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.01);
    gain.gain.setValueAtTime(volume, t + Math.max(0.02, duration - 0.02));
    gain.gain.linearRampToValueAtTime(0, t + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + duration);
  }

  // Pitch sweep (used for impacts / KO).
  private sweep(
    fromFreq: number,
    toFreq: number,
    type: OscillatorType,
    duration: number,
    volume: number = 0.06,
    startTimeOffset: number = 0,
  ) {
    this.init();
    if (!this.ctx || !this.enabled) return;

    const t = this.ctx.currentTime + startTimeOffset;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(fromFreq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, toFreq), t + duration);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + duration);
  }

  // Light, fast jab impact.
  public punchHit() {
    this.sweep(260, 90, 'square', 0.1, 0.08);
    this.playTone(140, 'triangle', 0.07, 0.05);
  }

  // Heavier kick impact.
  public kickHit() {
    this.sweep(180, 50, 'sawtooth', 0.16, 0.09);
    this.playTone(90, 'square', 0.12, 0.06);
  }

  // Metallic tick when an attack is blocked.
  public blockClink() {
    this.playTone(1200, 'square', 0.05, 0.04);
    this.playTone(1700, 'square', 0.04, 0.025, 0.02);
  }

  // Airy whoosh on a swing.
  public whiff() {
    this.sweep(520, 240, 'sine', 0.09, 0.02);
  }

  // Knockout: descending crunch.
  public ko() {
    for (let i = 0; i < 3; i++) {
      this.sweep(420 - i * 80, 60, 'sawtooth', 0.28, 0.07, i * 0.12);
    }
  }

  // Bright two-note bell at the start of a round.
  public roundBell() {
    this.playTone(880, 'sine', 0.16, 0.06);
    this.playTone(1320, 'sine', 0.22, 0.05, 0.14);
  }

  // Short triumphant jingle when the match is won.
  public victory() {
    const notes: [number, number][] = [
      [523.25, 0.12], // C5
      [659.25, 0.12], // E5
      [783.99, 0.12], // G5
      [1046.5, 0.28], // C6
    ];
    let time = 0;
    notes.forEach(([freq, dur]) => {
      this.playTone(freq, 'square', dur, 0.05, time);
      time += dur;
    });
  }
}

export const fightSynth = new FightSoundSynth();
