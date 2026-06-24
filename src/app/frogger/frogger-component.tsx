'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './frogger.module.css';
import { FroggerEngine, HopDir, FroggerState } from './frogger-game';
import { froggerSynth } from './frogger-synth';
import { useGameShell } from '../use-game-shell';
import { HighScoreOverlay } from '../leaderboard/high-score-overlay';

interface FroggerComponentProps {
  onBack?: () => void;
}

export const FroggerComponent: React.FC<FroggerComponentProps> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<FroggerEngine | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [gameState, setGameState] = useState<FroggerState>('IDLE');

  const [soundOn, setSoundOn] = useState(true);
  const [scanlinesOn, setScanlinesOn] = useState(true);
  const [showScores, setShowScores] = useState(false);

  useGameShell({ scanlinesOn });

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new FroggerEngine(canvasRef.current, froggerSynth, (status) => {
      setScore(status.score);
      setLives(status.lives);
      setLevel(status.level);
      setGameState(status.state);
    });
    engineRef.current = engine;

    const handleKeyDown = (e: KeyboardEvent) => {
      let dir: HopDir | null = null;
      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': dir = 'UP'; break;
        case 'ArrowDown': case 's': case 'S': dir = 'DOWN'; break;
        case 'ArrowLeft': case 'a': case 'A': dir = 'LEFT'; break;
        case 'ArrowRight': case 'd': case 'D': dir = 'RIGHT'; break;
        case 'p': case 'P': engine.togglePause(); return;
        default: return;
      }
      e.preventDefault();
      engine.hop(dir);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (engineRef.current) engineRef.current.destroy();
    };
  }, []);

  useEffect(() => {
    froggerSynth.setEnabled(soundOn);
  }, [soundOn]);

  // Swipe on the canvas → hop in the swiped direction.
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    swipeStart.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    const dir: HopDir = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 'RIGHT' : 'LEFT')
      : (dy > 0 ? 'DOWN' : 'UP');
    engineRef.current?.hop(dir);
  };

  const handleStartGame = () => engineRef.current?.start();
  const handlePauseGame = () => engineRef.current?.togglePause();
  const handleResetGame = () => engineRef.current?.reset();
  const dpad = (dir: HopDir) => engineRef.current?.hop(dir);

  return (
    <div className={styles.arcadeCabinet}>
      <div className={styles.arcadeHeader}>
        <h2 className={styles.title}>FROGGER</h2>
        <div className={styles.scoreBoard}>
          <div className={styles.scoreItem}>
            <span className={styles.label}>Score</span>
            <span className={styles.value}>{score.toString().padStart(5, '0')}</span>
          </div>
          <div className={styles.scoreItem}>
            <span className={styles.label}>Level</span>
            <span className={styles.valueGreen}>{level}</span>
          </div>
          <div className={styles.scoreItem}>
            <span className={styles.label}>Lives</span>
            <span className={styles.value}>{'●'.repeat(Math.max(0, lives)) || '—'}</span>
          </div>
        </div>
      </div>

      <div className={styles.screenWrapper}>
        <canvas
          ref={canvasRef}
          width={330}
          height={390}
          className={styles.canvas}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      <div className={styles.cabinetControls}>
        <div className={styles.btnGroup}>
          {gameState === 'PLAYING' ? (
            <button className={`${styles.btn} pixel-btn`} onClick={handlePauseGame}>PAUSE</button>
          ) : (
            <button className={`${styles.btn} pixel-btn pixel-btn-yellow`} onClick={handleStartGame}>
              {gameState === 'PAUSED' ? 'RESUME' : 'PLAY'}
            </button>
          )}
          <button className={`${styles.btn} pixel-btn`} onClick={handleResetGame}>RESET</button>
          <button className={`${styles.btn} pixel-btn`} onClick={() => setShowScores(true)}>SCORES</button>
          {onBack && <button className={`${styles.btn} pixel-btn`} onClick={onBack}>MENU</button>}
        </div>

        {/* On-screen D-pad (mobile) — swipe on the board also works */}
        <div className={styles.dpadContainer}>
          <button className={`${styles.dpadBtn} ${styles.dpadUp}`} onPointerDown={() => dpad('UP')} onContextMenu={(e) => e.preventDefault()}>▲</button>
          <button className={`${styles.dpadBtn} ${styles.dpadLeft}`} onPointerDown={() => dpad('LEFT')} onContextMenu={(e) => e.preventDefault()}>◀</button>
          <div className={styles.dpadCenter} />
          <button className={`${styles.dpadBtn} ${styles.dpadRight}`} onPointerDown={() => dpad('RIGHT')} onContextMenu={(e) => e.preventDefault()}>▶</button>
          <button className={`${styles.dpadBtn} ${styles.dpadDown}`} onPointerDown={() => dpad('DOWN')} onContextMenu={(e) => e.preventDefault()}>▼</button>
        </div>

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
          SWIPE / ARROWS / WASD / D-PAD TO HOP<br />
          DODGE CARS · RIDE LOGS · FILL ALL HOMES
        </div>
      </div>

      <HighScoreOverlay
        game="frogger"
        score={score}
        active={gameState === 'GAMEOVER' || showScores}
        onClose={() => setShowScores(false)}
      />
    </div>
  );
};

export default FroggerComponent;
