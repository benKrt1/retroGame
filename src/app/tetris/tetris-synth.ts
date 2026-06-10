// Web Audio API Retro Sound Synthesizer for Tetris.
// SSR safe, lazy-initialized. Mirrors the API of the other game synths
// (setEnabled / isEnabled / stopAll) plus a looping background theme.

export class TetrisSoundSynth {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  // Theme loop control. Each (re)start bumps the generation so that any
  // pending scheduled callback from a previous run becomes a no-op.
  private themeGen = 0;
  private themePlaying = false;
  private themeTimer: ReturnType<typeof setTimeout> | null = null;

  // Korobeiniki ("Theme A"), [frequency Hz, duration seconds]. 0 = rest.
  private static readonly THEME: [number, number][] = [
    [659, 0.22], [494, 0.11], [523, 0.11], [587, 0.22], [523, 0.11], [494, 0.11],
    [440, 0.22], [440, 0.11], [523, 0.11], [659, 0.22], [587, 0.11], [523, 0.11],
    [494, 0.33], [523, 0.11], [587, 0.22], [659, 0.22],
    [523, 0.22], [440, 0.22], [440, 0.22], [0, 0.22],
    [587, 0.33], [698, 0.11], [880, 0.22], [784, 0.11], [698, 0.11],
    [659, 0.33], [523, 0.11], [659, 0.22], [587, 0.11], [523, 0.11],
    [494, 0.22], [494, 0.11], [523, 0.11], [587, 0.22], [659, 0.22],
    [523, 0.22], [440, 0.22], [440, 0.22], [0, 0.22],
  ];

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
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
    if (val) {
      this.init();
      if (this.themePlaying) this.scheduleTheme(); // resume audible theme
    } else {
      this.silenceTheme(); // keep themePlaying flag, just go quiet
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public stopAll() {
    this.stopTheme();
  }

  // Generic short tone with a click-free envelope.
  private playTone(
    freq: number,
    type: OscillatorType,
    duration: number,
    volume: number = 0.05,
    startTimeOffset: number = 0
  ) {
    this.init();
    if (!this.ctx || !this.enabled || freq <= 0) return;

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

  // ---- SFX ----

  public playMove() {
    this.playTone(220, 'square', 0.04, 0.03);
  }

  public playRotate() {
    this.playTone(330, 'square', 0.05, 0.035);
  }

  public playLock() {
    this.playTone(150, 'triangle', 0.07, 0.05);
  }

  public playHardDrop() {
    this.init();
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.12);
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  public playHold() {
    this.playTone(523, 'triangle', 0.08, 0.04);
  }

  // Rising arpeggio; a 4-line "Tetris" gets a brighter fanfare.
  public playLineClear(lines: number) {
    const base = [523, 659, 784]; // C5 E5 G5
    base.forEach((f, i) => this.playTone(f, 'square', 0.1, 0.05, i * 0.06));
    if (lines >= 4) {
      this.playTone(1046, 'square', 0.18, 0.06, 0.18); // C6 cap
      this.playTone(1318, 'square', 0.22, 0.05, 0.30); // E6 sparkle
    }
  }

  public playLevelUp() {
    [523, 659, 784, 1046].forEach((f, i) =>
      this.playTone(f, 'square', 0.12, 0.05, i * 0.08)
    );
  }

  public playGameOver() {
    this.stopTheme();
    [392, 349, 311, 262].forEach((f, i) =>
      this.playTone(f, 'sawtooth', 0.3, 0.06, i * 0.22)
    );
  }

  // ---- Looping theme ----

  public startTheme() {
    this.init();
    this.themePlaying = true;
    this.themeGen++;
    this.scheduleTheme();
  }

  public stopTheme() {
    this.themePlaying = false;
    this.silenceTheme();
  }

  // Stops audible scheduling without clearing the themePlaying intent,
  // so it can be resumed (e.g. when sound is toggled back on).
  private silenceTheme() {
    this.themeGen++;
    if (this.themeTimer) {
      clearTimeout(this.themeTimer);
      this.themeTimer = null;
    }
  }

  private scheduleTheme() {
    if (!this.ctx || !this.enabled || !this.themePlaying) return;
    const gen = ++this.themeGen;

    let offset = 0;
    for (const [freq, dur] of TetrisSoundSynth.THEME) {
      if (freq > 0) this.playTone(freq, 'square', dur * 0.92, 0.03, offset);
      offset += dur;
    }

    // Loop: schedule the next pass when this one ends, unless superseded.
    this.themeTimer = setTimeout(() => {
      if (gen === this.themeGen && this.themePlaying && this.enabled) {
        this.scheduleTheme();
      }
    }, offset * 1000);
  }
}

export const tetrisSynthInstance = new TetrisSoundSynth();
