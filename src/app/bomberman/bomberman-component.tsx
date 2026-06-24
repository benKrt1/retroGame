'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './bomberman.module.css';
import { BombermanEngine, Direction, BombermanGameState } from './bomberman-game';
import { bombermanSynth } from './bomberman-synth';
import { useGameShell } from '../use-game-shell';
import { HighScoreOverlay } from '../leaderboard/high-score-overlay';

interface BombermanComponentProps {
  onBack?: () => void;
}

export const BombermanComponent: React.FC<BombermanComponentProps> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<BombermanEngine | null>(null);

  const [score, setScore] = useState(0);
  const [stage, setStage] = useState(1);
  const [lives, setLives] = useState(3);
  const [enemiesLeft, setEnemiesLeft] = useState(0);
  const [gameState, setGameState] = useState<BombermanGameState>('IDLE');

  const [soundOn, setSoundOn] = useState(true);
  const [scanlinesOn, setScanlinesOn] = useState(true);
  const [showScores, setShowScores] = useState(false);

  useGameShell({ scanlinesOn });

  // Initialize engine + keyboard controls.
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new BombermanEngine(canvasRef.current, bombermanSynth, (status) => {
      setScore(status.score);
      setStage(status.stage);
      setLives(status.lives);
      setEnemiesLeft(status.enemiesLeft);
      setGameState(status.state);
    });
    engineRef.current = engine;

    const keyToDir = (key: string): Direction | null => {
      switch (key) {
        case 'ArrowUp': case 'w': case 'W': return 'UP';
        case 'ArrowDown': case 's': case 'S': return 'DOWN';
        case 'ArrowLeft': case 'a': case 'A': return 'LEFT';
        case 'ArrowRight': case 'd': case 'D': return 'RIGHT';
        default: return null;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const dir = keyToDir(e.key);
      if (dir) {
        e.preventDefault();
        engine.setHeld(dir, true);
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        engine.placeBomb();
      } else if (e.key === 'p' || e.key === 'P') {
        engine.togglePause();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const dir = keyToDir(e.key);
      if (dir) engine.setHeld(dir, false);
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
    bombermanSynth.setEnabled(soundOn);
  }, [soundOn]);

  const handleStartGame = () => engineRef.current?.start();
  const handlePauseGame = () => engineRef.current?.togglePause();
  const handleResetGame = () => engineRef.current?.reset();
  const hold = (dir: Direction, down: boolean) => engineRef.current?.setHeld(dir, down);
  const dropBomb = () => engineRef.current?.placeBomb();

  return (
    <div className={styles.arcadeCabinet}>
      <div className={styles.arcadeHeader}>
        <h2 className={styles.title}>BOMBERMAN</h2>
        <div className={styles.scoreBoard}>
          <div className={styles.scoreItem}>
            <span className={styles.label}>Score</span>
            <span className={styles.value}>{score.toString().padStart(5, '0')}</span>
          </div>
          <div className={styles.scoreItem}>
            <span className={styles.label}>Stage</span>
            <span className={styles.valueOrange}>{stage}</span>
          </div>
          <div className={styles.scoreItem}>
            <span className={styles.label}>Lives</span>
            <span className={styles.value}>{'♥'.repeat(Math.max(0, lives)) || '—'}</span>
          </div>
          <div className={styles.scoreItem}>
            <span className={styles.label}>Enemies</span>
            <span className={styles.valueOrange}>{enemiesLeft}</span>
          </div>
        </div>
      </div>

      <div className={styles.screenWrapper}>
        <canvas ref={canvasRef} width={390} height={330} className={styles.canvas} />
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

        {/* On-screen controls (mobile) — D-pad on the left, BOMB on the right */}
        <div className={styles.touchPanel}>
          <div className={styles.dpadContainer}>
            <button className={`${styles.dpadBtn} ${styles.dpadUp}`}
              onPointerDown={() => hold('UP', true)} onPointerUp={() => hold('UP', false)}
              onPointerLeave={() => hold('UP', false)} onContextMenu={(e) => e.preventDefault()}>▲</button>
            <button className={`${styles.dpadBtn} ${styles.dpadLeft}`}
              onPointerDown={() => hold('LEFT', true)} onPointerUp={() => hold('LEFT', false)}
              onPointerLeave={() => hold('LEFT', false)} onContextMenu={(e) => e.preventDefault()}>◀</button>
            <div className={styles.dpadCenter} />
            <button className={`${styles.dpadBtn} ${styles.dpadRight}`}
              onPointerDown={() => hold('RIGHT', true)} onPointerUp={() => hold('RIGHT', false)}
              onPointerLeave={() => hold('RIGHT', false)} onContextMenu={(e) => e.preventDefault()}>▶</button>
            <button className={`${styles.dpadBtn} ${styles.dpadDown}`}
              onPointerDown={() => hold('DOWN', true)} onPointerUp={() => hold('DOWN', false)}
              onPointerLeave={() => hold('DOWN', false)} onContextMenu={(e) => e.preventDefault()}>▼</button>
          </div>

          <button className={styles.bombBtn}
            onPointerDown={(e) => { e.preventDefault(); dropBomb(); }}
            onContextMenu={(e) => e.preventDefault()}>💣</button>
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
          ARROWS / WASD TO MOVE · SPACE TO DROP BOMB<br />
          BLAST SOFT BLOCKS · CLEAR ALL ENEMIES TO ADVANCE
        </div>
      </div>

      <HighScoreOverlay
        game="bomberman"
        score={score}
        active={gameState === 'GAMEOVER' || showScores}
        onClose={() => setShowScores(false)}
      />
    </div>
  );
};

export default BombermanComponent;
