// Web Audio API retro sound synth for Bomberman.
// SSR-safe and lazy-initialized on first user interaction.

export class BombermanSynth {
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
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + duration);
    }
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // Short percussive noise burst (used for the explosion).
  private noise(duration: number, volume: number = 0.18, startOffset: number = 0) {
    this.init();
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + startOffset;
    const frames = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames); // fade out
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, t);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(t);
    src.stop(t + duration);
  }

  public playBombPlace() {
    this.tone(180, 'square', 0.12, 0.05, 0, 90);
  }

  public playExplosion() {
    this.noise(0.4, 0.2);
    this.tone(120, 'sawtooth', 0.35, 0.06, 0, 40);
  }

  public playPickup() {
    this.tone(660, 'square', 0.09, 0.05);
    this.tone(990, 'square', 0.12, 0.05, 0.09);
  }

  public playEnemyDeath() {
    this.tone(420, 'square', 0.1, 0.05, 0, 140);
    this.tone(220, 'square', 0.14, 0.05, 0.1, 80);
  }

  public playPlayerDeath() {
    for (let i = 0; i < 3; i++) {
      this.tone(500 - i * 120, 'sawtooth', 0.22, 0.05, i * 0.18, 90);
    }
  }

  public playStageClear() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.tone(f, 'square', 0.14, 0.05, i * 0.12));
  }
}

export const bombermanSynth = new BombermanSynth();
