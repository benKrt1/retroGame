// Web Audio API retro sound synth for 2048.
// SSR-safe, lazy-initialized on first user interaction.

export class Game2048Synth {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  private init() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      try {
        const AudioCtx = window.AudioContext || (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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

  private tone(
    freq: number,
    type: OscillatorType,
    duration: number,
    volume: number = 0.05,
    startOffset: number = 0,
    endFreq?: number,
  ) {
    this.init();
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + startOffset;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + duration);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  public playMove() {
    this.tone(220, 'triangle', 0.06, 0.035);
  }

  // Pop whose pitch rises with how much was merged this move.
  public playMerge(gained: number) {
    const base = 360 + Math.min(900, gained) * 0.6;
    this.tone(base, 'square', 0.09, 0.05, 0, base * 1.5);
  }

  public playSpawn() {
    this.tone(520, 'sine', 0.07, 0.03);
  }

  public playWin() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 'square', 0.14, 0.05, i * 0.1));
  }

  public playGameOver() {
    for (let i = 0; i < 3; i++) this.tone(440 - i * 110, 'sawtooth', 0.24, 0.05, i * 0.16, 80);
  }
}

export const game2048Synth = new Game2048Synth();
