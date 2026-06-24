// Web Audio API retro sound synth for Breakout.
// SSR-safe, lazy-initialized on first user interaction.

export class BreakoutSynth {
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

  // Soft blip for wall/paddle bounces.
  public playBounce() {
    this.tone(440, 'square', 0.05, 0.04);
  }

  // Brick break — pitch rises with the row index (higher rows = higher ping).
  public playBrick(row: number) {
    this.tone(520 + row * 70, 'square', 0.06, 0.045);
  }

  public playLaunch() {
    this.tone(300, 'square', 0.12, 0.05, 0, 620);
  }

  public playPowerup() {
    this.tone(660, 'square', 0.08, 0.05);
    this.tone(990, 'square', 0.12, 0.05, 0.08);
  }

  public playLoseLife() {
    this.tone(400, 'sawtooth', 0.3, 0.06, 0, 90);
  }

  public playLevelClear() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 'square', 0.14, 0.05, i * 0.1));
  }
}

export const breakoutSynth = new BreakoutSynth();
