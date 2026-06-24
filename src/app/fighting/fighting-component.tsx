'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './fighting.module.css';
import {
  FightEngine,
  FightMode,
  FightState,
  FightStatus,
  HeldInput,
  PlayerId,
  PressAction,
} from './fighting-game';
import { fightSynth } from './fighting-synth';
import { useGameShell } from '../use-game-shell';
import { HighScoreOverlay } from '../leaderboard/high-score-overlay';

interface FightingComponentProps {
  onBack?: () => void;
}

const MAX_HP = 100;

export const FightingComponent: React.FC<FightingComponentProps> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<FightEngine | null>(null);

  const [status, setStatus] = useState<FightStatus>({
    mode: '1P',
    state: 'START',
    round: 1,
    p1Hp: MAX_HP,
    p2Hp: MAX_HP,
    p1Wins: 0,
    p2Wins: 0,
    timeLeft: 60,
  });

  const [soundOn, setSoundOn] = useState(true);
  const [scanlinesOn, setScanlinesOn] = useState(true);
  const [showScores, setShowScores] = useState(false);

  // Shared mobile shell: CRT sync, scroll lock, orientation (drives the
  // "rotate" hint — this wide 16:9 game plays best in landscape).
  const { orientation } = useGameShell({ scanlinesOn });

  // Keep the latest status readable inside the keyboard listener (set up once).
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Initialize engine + keyboard controls.
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new FightEngine(canvasRef.current, fightSynth, (s) => setStatus(s));
    engineRef.current = engine;

    // Held-key map: key -> [player, held-field] or [player, press-action].
    const heldMap: Record<string, [PlayerId, keyof HeldInput]> = {
      // Player 1 (left cluster) — also the only player in 1P.
      a: [1, 'left'],
      d: [1, 'right'],
      s: [1, 'crouch'],
      h: [1, 'block'],
      // Player 2 (arrows) in 2P.
      arrowleft: [2, 'left'],
      arrowright: [2, 'right'],
      arrowdown: [2, 'crouch'],
      ';': [2, 'block'],
    };
    const pressMap: Record<string, [PlayerId, PressAction]> = {
      w: [1, 'jump'],
      f: [1, 'punch'],
      g: [1, 'kick'],
      arrowup: [2, 'jump'],
      k: [2, 'punch'],
      l: [2, 'kick'],
    };

    const isGameKey = (k: string) =>
      k in heldMap || k in pressMap || k === ' ' || k.startsWith('arrow');

    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();

      if (k === ' ') {
        e.preventDefault();
        engine.togglePause();
        return;
      }
      if (isGameKey(k)) e.preventDefault();

      // In 1P mode, let the arrow keys mirror Player 1 for convenience.
      const mode = statusRef.current.mode;

      if (k in heldMap) {
        const [player, field] = heldMap[k];
        if (mode === '1P' && player === 2) {
          if (field !== 'block') engine.setHeld(1, { [field]: true } as Partial<HeldInput>);
        } else {
          engine.setHeld(player, { [field]: true } as Partial<HeldInput>);
        }
      }
      if (k in pressMap) {
        const [player, action] = pressMap[k];
        if (mode === '1P' && player === 2) {
          if (action === 'jump') engine.press(1, 'jump');
        } else {
          engine.press(player, action);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!(k in heldMap)) return;
      const [player, field] = heldMap[k];
      const mode = statusRef.current.mode;
      if (mode === '1P' && player === 2) {
        if (field !== 'block') engine.setHeld(1, { [field]: false } as Partial<HeldInput>);
      } else {
        engine.setHeld(player, { [field]: false } as Partial<HeldInput>);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      engine.destroy();
    };
  }, []);

  // Sync sound.
  useEffect(() => {
    fightSynth.setEnabled(soundOn);
  }, [soundOn]);

  // Control handlers.
  const handlePlay = () => engineRef.current?.play();
  const handlePause = () => engineRef.current?.pause();
  const handleReset = () => engineRef.current?.reset();
  const startMode = (mode: FightMode) => engineRef.current?.startMatch(mode);

  // Touch controls (Player 1 only) — held + press helpers.
  const touchHold = (field: keyof HeldInput, on: boolean) =>
    engineRef.current?.setHeld(1, { [field]: on } as Partial<HeldInput>);
  const touchPress = (action: PressAction) => engineRef.current?.press(1, action);

  const showStartOverlay = status.state === 'START';
  const isPlaying = status.state === 'PLAYING';
  const p1Pct = Math.max(0, (status.p1Hp / MAX_HP) * 100);
  const p2Pct = Math.max(0, (status.p2Hp / MAX_HP) * 100);

  // Leaderboard only applies to a 1P-vs-CPU win. Derive a "KO score" rewarding
  // flawless, fast, high-HP victories (tunable).
  const wonVsCpu = status.state === 'MATCH_OVER' && status.mode === '1P' && status.p1Wins >= 2;
  const koScore = wonVsCpu
    ? 500 + (status.p2Wins === 0 ? 500 : 0) + Math.max(0, status.p1Hp) + Math.round(status.timeLeft) * 10
    : 0;

  const stateLabel: Record<FightState, string> = {
    START: 'SELECT MODE',
    ROUND_INTRO: `ROUND ${status.round}`,
    PLAYING: `ROUND ${status.round}`,
    PAUSED: 'PAUSED',
    ROUND_OVER: 'K.O.',
    MATCH_OVER: 'MATCH OVER',
  };

  return (
    <div className={styles.arcadeCabinet}>
      <div className={styles.arcadeHeader}>
        <h2 className={styles.title}>KNOCKOUT KINGS</h2>

        {/* HP bars + round info */}
        <div className={styles.hpRow}>
          <div className={styles.hpSide}>
            <div className={styles.hpLabelRow}>
              <span className={styles.label}>{status.mode === '1P' ? 'YOU' : 'P1'}</span>
              <span className={styles.pips}>{'●'.repeat(status.p1Wins)}{'○'.repeat(Math.max(0, 2 - status.p1Wins))}</span>
            </div>
            <div className={styles.hpTrack}>
              <div className={`${styles.hpFill} ${styles.hpFillP1}`} style={{ width: `${p1Pct}%` }} />
            </div>
          </div>

          <div className={styles.centerInfo}>
            <span className={styles.timer}>{status.timeLeft}</span>
            <span className={styles.stateTag}>{stateLabel[status.state]}</span>
          </div>

          <div className={styles.hpSide}>
            <div className={styles.hpLabelRow}>
              <span className={styles.pips}>{'○'.repeat(Math.max(0, 2 - status.p2Wins))}{'●'.repeat(status.p2Wins)}</span>
              <span className={styles.label}>{status.mode === '1P' ? 'CPU' : 'P2'}</span>
            </div>
            <div className={styles.hpTrack}>
              <div className={`${styles.hpFill} ${styles.hpFillP2}`} style={{ width: `${p2Pct}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.screenWrapper}>
        <canvas ref={canvasRef} width={480} height={270} className={styles.canvas} />

        {showStartOverlay && (
          <div className={styles.startOverlay}>
            <h3 className={styles.startTitle}>KNOCKOUT KINGS</h3>
            <p className={styles.startSub}>SELECT MODE</p>
            <button className={`${styles.modeBtn} pixel-btn pixel-btn-yellow`} onClick={() => startMode('1P')}>
              1P vs CPU
            </button>
            <button className={`${styles.modeBtn} pixel-btn`} onClick={() => startMode('2P')}>
              2P VERSUS
            </button>
          </div>
        )}
      </div>

      <div className={styles.cabinetControls}>
        <div className={styles.btnGroup}>
          {isPlaying ? (
            <button className={`${styles.btn} pixel-btn`} onClick={handlePause}>
              PAUSE
            </button>
          ) : (
            <button className={`${styles.btn} pixel-btn pixel-btn-yellow`} onClick={handlePlay}>
              {status.state === 'PAUSED' ? 'RESUME' : 'PLAY'}
            </button>
          )}
          <button className={`${styles.btn} pixel-btn`} onClick={handleReset}>
            RESET
          </button>
          <button className={`${styles.btn} pixel-btn`} onClick={() => setShowScores(true)}>
            SCORES
          </button>
          {onBack && (
            <button className={`${styles.btn} pixel-btn`} onClick={onBack}>
              MENU
            </button>
          )}
        </div>

        {/* Rotate hint — this wide game plays best in landscape on a phone. */}
        {orientation === 'portrait' && (
          <div className={styles.rotateHint}>↻ ROTATE YOUR PHONE FOR THE BEST FIGHT</div>
        )}

        {/* On-screen controls (mobile, Player 1 only) */}
        {status.mode === '2P' ? (
          <div className={styles.touchNote}>2-PLAYER NEEDS A KEYBOARD</div>
        ) : (
          <div className={styles.touchControls}>
            <div className={styles.touchPadLeft}>
              <button
                className={styles.touchBtn}
                onPointerDown={() => touchHold('left', true)}
                onPointerUp={() => touchHold('left', false)}
                onPointerLeave={() => touchHold('left', false)}
                onPointerCancel={() => touchHold('left', false)}
              >
                ◀
              </button>
              <button
                className={styles.touchBtn}
                onPointerDown={() => touchPress('jump')}
              >
                ▲
              </button>
              <button
                className={styles.touchBtn}
                onPointerDown={() => touchHold('crouch', true)}
                onPointerUp={() => touchHold('crouch', false)}
                onPointerLeave={() => touchHold('crouch', false)}
                onPointerCancel={() => touchHold('crouch', false)}
              >
                ▼
              </button>
              <button
                className={styles.touchBtn}
                onPointerDown={() => touchHold('right', true)}
                onPointerUp={() => touchHold('right', false)}
                onPointerLeave={() => touchHold('right', false)}
                onPointerCancel={() => touchHold('right', false)}
              >
                ▶
              </button>
            </div>
            <div className={styles.touchPadRight}>
              <button className={`${styles.touchBtn} ${styles.punchBtn}`} onPointerDown={() => touchPress('punch')}>
                P
              </button>
              <button className={`${styles.touchBtn} ${styles.kickBtn}`} onPointerDown={() => touchPress('kick')}>
                K
              </button>
              <button
                className={`${styles.touchBtn} ${styles.blockBtn}`}
                onPointerDown={() => touchHold('block', true)}
                onPointerUp={() => touchHold('block', false)}
                onPointerLeave={() => touchHold('block', false)}
                onPointerCancel={() => touchHold('block', false)}
              >
                B
              </button>
            </div>
          </div>
        )}

        <div className={styles.settingsRow}>
          <label className={styles.optionToggle}>
            <span className="toggle-switch">
              <input type="checkbox" checked={soundOn} onChange={(e) => setSoundOn(e.target.checked)} />
              <span className="toggle-slider"></span>
            </span>
            <span>SOUND: {soundOn ? 'ON' : 'OFF'}</span>
          </label>
          <label className={styles.optionToggle}>
            <span className="toggle-switch">
              <input type="checkbox" checked={scanlinesOn} onChange={(e) => setScanlinesOn(e.target.checked)} />
              <span className="toggle-slider"></span>
            </span>
            <span>CRT SCANLINES</span>
          </label>
        </div>

        <div className={styles.instructions}>
          P1: A/D MOVE · W JUMP · S CROUCH · F PUNCH · G KICK · H BLOCK<br />
          P2: ←/→ MOVE · ↑ JUMP · ↓ CROUCH · K PUNCH · L KICK · ; BLOCK<br />
          BEST OF 3 ROUNDS — SPACE TO PAUSE
        </div>
      </div>

      <HighScoreOverlay
        game="fighting"
        score={koScore}
        scoreLabel="KO SCORE"
        active={wonVsCpu || showScores}
        onClose={() => setShowScores(false)}
      />
    </div>
  );
};

export default FightingComponent;
