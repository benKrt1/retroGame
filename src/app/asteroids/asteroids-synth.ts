// Web Audio API Retro Sound Synthesizer for Asteroids
// SSR Safe and lazy-initialized on user interaction.
// Mirrors the API of space-invaders/invader-synth.ts (InvaderSoundSynth) so the
// SOUND toggle can wire to it identically: setEnabled / isEnabled / stopAll.

export class AsteroidsSoundSynth {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  // Continuous thrust rumble nodes (kept so we can stop them).
  private thrustSrc: AudioBufferSourceNode | null = null;
  private thrustGain: GainNode | null = null;

  constructor() {
    // Lazy initialized on first play / enable.
  }

  private init() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        this.ctx = new AudioCtx();
      } catch (e) {
        console.error('Web Audio API not supported', e);
      }
    }
    // Resume context if suspended (browser autoplay policy).
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
    if (val) {
      this.init();
    } else {
      this.stopThrust();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public stopAll() {
    this.stopThrust();
  }

  // Short white-noise burst, used for asteroid explosions.
  private playNoise(duration: number, volume: number, cutoff: number) {
    this.init();
    if (!this.ctx || !this.enabled) return;

    const t = this.ctx.currentTime;
    const sampleCount = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, sampleCount, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    src.start(t);
    src.stop(t + duration);
  }

  // Player firing: quick descending square blip (laser pew).
  public playShoot() {
    this.init();
    if (!this.ctx || !this.enabled) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.16);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.045, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.18);
  }

  // An asteroid is destroyed: noise burst, deeper/longer for bigger rocks.
  public playBang(size: 1 | 2 | 3) {
    const map = {
      3: { dur: 0.4, vol: 0.09, cut: 900 },
      2: { dur: 0.28, vol: 0.07, cut: 1400 },
      1: { dur: 0.18, vol: 0.06, cut: 2000 },
    } as const;
    const p = map[size];
    this.playNoise(p.dur, p.vol, p.cut);
  }

  // The ship is destroyed: longer descending crunch.
  public playShipExplosion() {
    this.playNoise(0.55, 0.1, 1600);
    this.init();
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.5);
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  }

  // Continuous low rumble while the ship is thrusting (filtered noise loop).
  public startThrust() {
    this.init();
    if (!this.ctx || !this.enabled || this.thrustSrc) return;

    const t = this.ctx.currentTime;
    // 1s of looping brown-ish noise.
    const sampleCount = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, sampleCount, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < sampleCount; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(380, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.05, t + 0.05);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    src.start(t);

    this.thrustSrc = src;
    this.thrustGain = gain;
  }

  public stopThrust() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.thrustGain) {
      this.thrustGain.gain.cancelScheduledValues(t);
      this.thrustGain.gain.setValueAtTime(this.thrustGain.gain.value, t);
      this.thrustGain.gain.linearRampToValueAtTime(0, t + 0.05);
    }
    try {
      this.thrustSrc?.stop(t + 0.06);
    } catch {
      // already stopped
    }
    this.thrustSrc = null;
    this.thrustGain = null;
  }
}

export const asteroidsSynthInstance = new AsteroidsSoundSynth();
