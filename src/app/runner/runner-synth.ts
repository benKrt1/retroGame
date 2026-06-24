// Web Audio API retro sound synth for Endless Runner.
// SSR-safe, lazy-initialized on first user interaction.

export class RunnerSynth {
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

  public playJump() {
    this.tone(360, 'square', 0.12, 0.05, 0, 720);
  }

  public playPoint() {
    this.tone(880, 'square', 0.07, 0.04);
  }

  public playGameOver() {
    for (let i = 0; i < 3; i++) this.tone(520 - i * 130, 'sawtooth', 0.24, 0.05, i * 0.16, 80);
  }
}

export const runnerSynth = new RunnerSynth();
