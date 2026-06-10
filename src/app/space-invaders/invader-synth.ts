// Web Audio API Retro Sound Synthesizer for Space Invaders
// SSR Safe and lazy-initialized on user interaction.
// Mirrors the API of pacman/sound-synth.ts (RetroSoundSynth) so the
// SOUND toggle can wire to it identically: setEnabled / isEnabled / stopAll.

export class InvaderSoundSynth {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  // Index into the iconic 4-note descending march loop.
  private marchStep: number = 0;
  private static readonly MARCH_NOTES = [110, 98, 87, 82]; // A2, G2, F2, E2-ish

  // Continuous UFO drone nodes (kept so we can stop them).
  private ufoOsc: OscillatorNode | null = null;
  private ufoLfo: OscillatorNode | null = null;
  private ufoGain: GainNode | null = null;

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
      this.stopUfo();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public stopAll() {
    this.stopUfo();
  }

  // Generic short tone with click-free envelope.
  private playTone(
    freq: number,
    type: OscillatorType,
    duration: number,
    volume: number = 0.05,
    startTimeOffset: number = 0
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

  // Short white-noise burst, used for explosions.
  private playNoise(duration: number, volume: number, sweepDown: boolean) {
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
    filter.frequency.setValueAtTime(sweepDown ? 1800 : 1200, t);
    if (sweepDown) {
      filter.frequency.exponentialRampToValueAtTime(200, t + duration);
    }

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    src.start(t);
    src.stop(t + duration);
  }

  // Player cannon firing: quick upward square blip.
  public playShoot() {
    this.init();
    if (!this.ctx || !this.enabled) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.12);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.05, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.14);
  }

  // An invader is destroyed: short crunchy noise burst.
  public playInvaderKilled() {
    this.playNoise(0.18, 0.06, true);
  }

  // The player is hit: longer descending crunch.
  public playPlayerExplosion() {
    this.playNoise(0.5, 0.09, true);
    this.playTone(180, 'sawtooth', 0.5, 0.05);
    setTimeout(() => this.playTone(90, 'sawtooth', 0.4, 0.05), 120);
  }

  // The iconic four-note descending march; one note per invader step.
  public playMarchStep() {
    const freq = InvaderSoundSynth.MARCH_NOTES[this.marchStep % InvaderSoundSynth.MARCH_NOTES.length];
    this.marchStep++;
    this.playTone(freq, 'square', 0.1, 0.06);
  }

  public resetMarch() {
    this.marchStep = 0;
  }

  // Continuous warbling UFO drone while it is on screen.
  public playUfo() {
    this.init();
    if (!this.ctx || !this.enabled || this.ufoOsc) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(620, t);

    // LFO warble.
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(11, t);
    lfoGain.gain.setValueAtTime(60, t);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    gain.gain.setValueAtTime(0.035, t);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    lfo.start(t);

    this.ufoOsc = osc;
    this.ufoLfo = lfo;
    this.ufoGain = gain;
  }

  public stopUfo() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.ufoGain) {
      this.ufoGain.gain.cancelScheduledValues(t);
      this.ufoGain.gain.setValueAtTime(this.ufoGain.gain.value, t);
      this.ufoGain.gain.linearRampToValueAtTime(0, t + 0.05);
    }
    try {
      this.ufoOsc?.stop(t + 0.06);
      this.ufoLfo?.stop(t + 0.06);
    } catch {
      // already stopped
    }
    this.ufoOsc = null;
    this.ufoLfo = null;
    this.ufoGain = null;
  }
}

export const invaderSynthInstance = new InvaderSoundSynth();
