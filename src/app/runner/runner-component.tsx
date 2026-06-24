'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './runner.module.css';
import { RunnerEngine, RunnerState } from './runner-game';
import { runnerSynth } from './runner-synth';
import { useGameShell } from '../use-game-shell';
import { HighScoreOverlay } from '../leaderboard/high-score-overlay';

interface RunnerComponentProps {
  onBack?: () => void;
}

export const RunnerComponent: React.FC<RunnerComponentProps> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<RunnerEngine | null>(null);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [gameState, setGameState] = useState<RunnerState>('IDLE');

  const [soundOn, setSoundOn] = useState(true);
  const [scanlinesOn, setScanlinesOn] = useState(true);
  const [showScores, setShowScores] = useState(false);

  useGameShell({ scanlinesOn });

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new RunnerEngine(canvasRef.current, runnerSynth, (status) => {
      setScore(status.score);
      setBest(status.best);
      setGameState(status.state);
    });
    engineRef.current = engine;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ': case 'ArrowUp': case 'w': case 'W':
          e.preventDefault(); engine.jump(); break;
        case 'ArrowDown': case 's': case 'S':
          e.preventDefault(); engine.setDuck(true); break;
        case 'p': case 'P':
          engine.togglePause(); break;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (['ArrowDown', 's', 'S'].includes(e.key)) engine.setDuck(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (engineRef.current) engineRef.current.destroy();
    };
  }, []);

  useEffect(() => {
    runnerSynth.setEnabled(soundOn);
  }, [soundOn]);

  const handleStartGame = () => engineRef.current?.start();
  const handlePauseGame = () => engineRef.current?.togglePause();
  const handleResetGame = () => engineRef.current?.reset();
  const jump = () => engineRef.current?.jump();
  const duck = (on: boolean) => engineRef.current?.setDuck(on);

  return (
    <div className={styles.arcadeCabinet}>
      <div className={styles.arcadeHeader}>
        <h2 className={styles.title}>ENDLESS RUNNER</h2>
        <div className={styles.scoreBoard}>
          <div className={styles.scoreItem}>
            <span className={styles.label}>Score</span>
            <span className={styles.value}>{score.toString().padStart(5, '0')}</span>
          </div>
          <div className={styles.scoreItem}>
            <span className={styles.label}>Best</span>
            <span className={styles.valueCyan}>{best.toString().padStart(5, '0')}</span>
          </div>
        </div>
      </div>

      <div className={styles.screenWrapper}>
        <canvas
          ref={canvasRef}
          width={480}
          height={270}
          className={styles.canvas}
          onPointerDown={(e) => { e.preventDefault(); jump(); }}
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

        {/* On-screen controls (mobile) — tap the screen also jumps */}
        <div className={styles.touchPanel}>
          <button className={`${styles.ctrlBtn} ${styles.duckBtn}`}
            onPointerDown={(e) => { e.preventDefault(); duck(true); }}
            onPointerUp={() => duck(false)} onPointerLeave={() => duck(false)}
            onContextMenu={(e) => e.preventDefault()}>DUCK</button>
          <button className={`${styles.ctrlBtn} ${styles.jumpBtn}`}
            onPointerDown={(e) => { e.preventDefault(); jump(); }}
            onContextMenu={(e) => e.preventDefault()}>JUMP</button>
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
          TAP / SPACE / ↑ TO JUMP · ↓ TO DUCK<br />
          DODGE OBSTACLES · RUN AS FAR AS YOU CAN
        </div>
      </div>

      <HighScoreOverlay
        game="runner"
        score={score}
        active={gameState === 'GAMEOVER' || showScores}
        onClose={() => setShowScores(false)}
      />
    </div>
  );
};

export default RunnerComponent;
