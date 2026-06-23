'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './asteroids.module.css';
import { AsteroidsEngine, AsteroidsState } from './asteroids-game';
import { asteroidsSynthInstance } from './asteroids-synth';
import { useGameShell } from '../use-game-shell';

interface AsteroidsComponentProps {
  onBack?: () => void;
}

export const AsteroidsComponent: React.FC<AsteroidsComponentProps> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<AsteroidsEngine | null>(null);

  // React state synchronized with the engine.
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [lives, setLives] = useState(3);
  const [gameState, setGameState] = useState<AsteroidsState>('START');

  // Settings state.
  const [soundOn, setSoundOn] = useState(true);
  const [scanlinesOn, setScanlinesOn] = useState(true);

  // Shared mobile shell: CRT sync, scroll lock, orientation.
  useGameShell({ scanlinesOn });

  // Initialize engine + keyboard controls.
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new AsteroidsEngine(canvasRef.current, asteroidsSynthInstance, (status) => {
      setScore(status.score);
      setHighScore(status.highScore);
      setWave(status.wave);
      setLives(status.lives);
      setGameState(status.state);
    });
    engineRef.current = engine;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          engine.setRotateLeft(true);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          engine.setRotateRight(true);
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          engine.setThrust(true);
          break;
        case ' ':
          e.preventDefault();
          engine.shoot();
          break;
        case 'p':
        case 'P':
        case 'Escape':
          engine.togglePause();
          break;
        default:
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          engine.setRotateLeft(false);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          engine.setRotateRight(false);
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
          engine.setThrust(false);
          break;
        default:
          break;
      }
    };

    // Releasing focus should drop all held inputs to avoid "stuck" thrust/rotate.
    const handleBlur = () => {
      engine.setRotateLeft(false);
      engine.setRotateRight(false);
      engine.setThrust(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      if (engineRef.current) engineRef.current.destroy();
    };
  }, []);

  // Sync sound setting.
  useEffect(() => {
    asteroidsSynthInstance.setEnabled(soundOn);
  }, [soundOn]);

  // Game control handlers.
  const handleStartGame = () => engineRef.current?.start();
  const handlePauseGame = () => engineRef.current?.pause();
  const handleResetGame = () => engineRef.current?.resetGame();

  // Mobile hold-controls.
  const rotLeftDown = () => engineRef.current?.setRotateLeft(true);
  const rotLeftUp = () => engineRef.current?.setRotateLeft(false);
  const rotRightDown = () => engineRef.current?.setRotateRight(true);
  const rotRightUp = () => engineRef.current?.setRotateRight(false);
  const thrustDown = () => engineRef.current?.setThrust(true);
  const thrustUp = () => engineRef.current?.setThrust(false);
  const fire = () => engineRef.current?.shoot();

  return (
    <div className={styles.arcadeCabinet}>
      <div className={styles.arcadeHeader}>
        <h2 className={styles.title}>ASTEROIDS</h2>
        <div className={styles.scoreBoard}>
          <div className={styles.scoreItem}>
            <span className={styles.label}>Score</span>
            <span className={styles.value}>{score.toString().padStart(6, '0')}</span>
          </div>
          <div className={styles.scoreItem}>
            <span className={styles.label}>Hi-Score</span>
            <span className={styles.value}>{highScore.toString().padStart(6, '0')}</span>
          </div>
          <div className={styles.scoreItem}>
            <span className={styles.label}>Wave</span>
            <span className={styles.value}>{wave}</span>
          </div>
        </div>
      </div>

      <div className={styles.screenWrapper}>
        <canvas ref={canvasRef} width={380} height={420} className={styles.canvas} />
      </div>

      <div className={styles.cabinetControls}>
        <div className={styles.livesContainer}>
          <span className={styles.label} style={{ marginRight: '8px' }}>LIVES</span>
          <div className={styles.livesList}>
            {Array.from({ length: Math.max(0, lives) }).map((_, i) => (
              <div key={i} className={styles.shipLife} />
            ))}
          </div>
        </div>

        <div className={styles.btnGroup}>
          {gameState === 'PLAYING' ? (
            <button className={`${styles.btn} pixel-btn`} onClick={handlePauseGame}>
              PAUSE
            </button>
          ) : (
            <button className={`${styles.btn} pixel-btn pixel-btn-yellow`} onClick={handleStartGame}>
              {gameState === 'PAUSED' ? 'RESUME' : 'PLAY'}
            </button>
          )}

          <button className={`${styles.btn} pixel-btn`} onClick={handleResetGame}>
            RESET
          </button>

          {onBack && (
            <button className={`${styles.btn} pixel-btn`} onClick={onBack}>
              MENU
            </button>
          )}
        </div>

        {/* On-screen hold-controls (mobile) — rotate left, thrust/fire right so
            in landscape each cluster flanks the screen for a thumb. */}
        <div className={styles.controlPad}>
          <div className={styles.controlsLeft}>
            <button
              className={`${styles.ctrlBtn} ${styles.moveBtn}`}
              onPointerDown={rotLeftDown}
              onPointerUp={rotLeftUp}
              onPointerLeave={rotLeftUp}
              onPointerCancel={rotLeftUp}
              onContextMenu={(e) => e.preventDefault()}
            >
              ↺
            </button>
            <button
              className={`${styles.ctrlBtn} ${styles.moveBtn}`}
              onPointerDown={rotRightDown}
              onPointerUp={rotRightUp}
              onPointerLeave={rotRightUp}
              onPointerCancel={rotRightUp}
              onContextMenu={(e) => e.preventDefault()}
            >
              ↻
            </button>
          </div>
          <div className={styles.controlsRight}>
            <button
              className={`${styles.ctrlBtn} ${styles.thrustBtn}`}
              onPointerDown={thrustDown}
              onPointerUp={thrustUp}
              onPointerLeave={thrustUp}
              onPointerCancel={thrustUp}
              onContextMenu={(e) => e.preventDefault()}
            >
              THRUST
            </button>
            <button
              className={`${styles.ctrlBtn} ${styles.fireBtn}`}
              onPointerDown={fire}
              onContextMenu={(e) => e.preventDefault()}
            >
              FIRE
            </button>
          </div>
        </div>

        {/* Settings options — single-fire toggles (controlled input inside a label) */}
        <div className={styles.settingsRow}>
          <label className={styles.optionToggle}>
            <span className="toggle-switch">
              <input
                type="checkbox"
                checked={soundOn}
                onChange={(e) => setSoundOn(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </span>
            <span>SOUND: {soundOn ? 'ON' : 'OFF'}</span>
          </label>

          <label className={styles.optionToggle}>
            <span className="toggle-switch">
              <input
                type="checkbox"
                checked={scanlinesOn}
                onChange={(e) => setScanlinesOn(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </span>
            <span>CRT SCANLINES</span>
          </label>
        </div>

        <div className={styles.instructions}>
          ◀ ▶ / A D TO ROTATE — ▲ / W TO THRUST<br />
          SPACE TO FIRE — P TO PAUSE<br />
          BLAST THE ROCKS. THEY SPLIT WHEN HIT.
        </div>
      </div>
    </div>
  );
};

export default AsteroidsComponent;
