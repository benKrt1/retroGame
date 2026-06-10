// Web Audio API Retro Sound Synthesizer for Pacman
// SSR Safe and lazy-initialized on user interaction

export class RetroSoundSynth {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;
  private wakaToggle: boolean = false;

  constructor() {
    // Lazy initialized on play
  }

  private init() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      try {
        const AudioCtx = window.AudioContext || (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AudioCtx();
      } catch (e) {
        console.error("Web Audio API not supported", e);
      }
    }
    // Resume context if suspended (common browser security policy)
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

  public stopAll() {
    if (this.ctx) {
      // Just closing and reopening context if needed, or we let active sound scheduled nodes finish.
      // Usually, since our sounds are short and self-terminated, we don't need heavy cleanup.
    }
  }

  // Play a simple retro note
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
    
    // Quick ramp up and down to prevent clicking
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.01);
    gain.gain.setValueAtTime(volume, t + duration - 0.02);
    gain.gain.linearRampToValueAtTime(0, t + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + duration);
  }

  // Alternating pitch for "waka waka" dot consumption
  public playWaka() {
    this.init();
    if (!this.ctx || !this.enabled) return;

    this.wakaToggle = !this.wakaToggle;
    const freq = this.wakaToggle ? 350 : 250;
    
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    // Frequency pitch modulation
    osc.frequency.exponentialRampToValueAtTime(this.wakaToggle ? 200 : 400, t + 0.08);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.04, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.08);
  }

  // Quick sweep upwards when eating a ghost
  public playEatGhost() {
    this.init();
    if (!this.ctx || !this.enabled) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.3);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.06, t + 0.05);
    gain.gain.setValueAtTime(0.06, t + 0.25);
    gain.gain.linearRampToValueAtTime(0, t + 0.3);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.3);
  }

  // Quick beep when eating a power pellet or fruit
  public playEatFruit() {
    this.init();
    if (!this.ctx || !this.enabled) return;

    this.playTone(660, 'square', 0.08, 0.04);
    setTimeout(() => this.playTone(880, 'square', 0.12, 0.04), 80);
  }

  // Pacman dying: melting pitch downwards
  public playDeath() {
    this.init();
    if (!this.ctx || !this.enabled) return;

    const t = this.ctx.currentTime;
    
    // Play multiple falling sweeps in sequence
    for (let i = 0; i < 4; i++) {
      const sweepStart = t + (i * 0.25);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(600 - (i * 100), sweepStart);
      osc.frequency.linearRampToValueAtTime(100, sweepStart + 0.22);

      gain.gain.setValueAtTime(0, sweepStart);
      gain.gain.linearRampToValueAtTime(0.05, sweepStart + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, sweepStart + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(sweepStart);
      osc.stop(sweepStart + 0.23);
    }
  }

  // Pacman Theme Song!
  public playIntroTheme(): number {
    this.init();
    if (!this.ctx || !this.enabled) return 0;

    const t = this.ctx.currentTime;
    let time = 0;

    // Notes: [Frequency, Duration (seconds)] (0 represents rest)
    const notes: [number, number][] = [
      [493.88, 0.11],  // B4
      [987.77, 0.11],  // B5
      [739.99, 0.11],  // F#5
      [622.25, 0.11],  // D#5
      [987.77, 0.055], // B5
      [739.99, 0.055], // F#5
      [622.25, 0.22],  // D#5
      [0, 0.055],      // rest

      [523.25, 0.11],  // C5
      [1046.50, 0.11], // C6
      [783.99, 0.11],  // G5
      [659.25, 0.11],  // E5
      [1046.50, 0.055], // C6
      [783.99, 0.055],  // G5
      [659.25, 0.22],  // E5
      [0, 0.055],      // rest

      [493.88, 0.11],  // B4
      [987.77, 0.11],  // B5
      [739.99, 0.11],  // F#5
      [622.25, 0.11],  // D#5
      [987.77, 0.055], // B5
      [739.99, 0.055], // F#5
      [622.25, 0.22],  // D#5
      [0, 0.055],      // rest

      [622.25, 0.055], // D#5
      [659.25, 0.055], // E5
      [698.46, 0.055], // F5
      [698.46, 0.055], // F5
      [739.99, 0.055], // F#5
      [783.99, 0.055], // G5
      [830.61, 0.055], // G#5
      [830.61, 0.055], // G#5
      [880.00, 0.055], // A5
      [932.33, 0.055], // A#5
      [987.77, 0.22]   // B5
    ];

    notes.forEach(([freq, dur]) => {
      if (freq > 0) {
        // Play tone
        const noteStart = t + time;
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, noteStart);

        gain.gain.setValueAtTime(0, noteStart);
        gain.gain.linearRampToValueAtTime(0.04, noteStart + 0.01);
        gain.gain.setValueAtTime(0.04, noteStart + dur - 0.015);
        gain.gain.linearRampToValueAtTime(0, noteStart + dur);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(noteStart);
        osc.stop(noteStart + dur);
      }
      time += dur + 0.01; // add small gap between notes
    });

    return time * 1000; // Return total duration in milliseconds
  }
}
export const synthInstance = new RetroSoundSynth();
