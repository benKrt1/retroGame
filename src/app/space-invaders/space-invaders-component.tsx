'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './space-invaders.module.css';
import { SpaceInvadersEngine, SpaceInvadersState } from './space-invaders-game';
import { invaderSynthInstance } from './invader-synth';

interface SpaceInvadersComponentProps {
  onBack?: () => void;
}

export const SpaceInvadersComponent: React.FC<SpaceInvadersComponentProps> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<SpaceInvadersEngine | null>(null);

  // React state synchronized with the engine.
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [lives, setLives] = useState(3);
  const [gameState, setGameState] = useState<SpaceInvadersState>('START');

  // Settings state.
  const [soundOn, setSoundOn] = useState(true);
  const [scanlinesOn, setScanlinesOn] = useState(true);

  // Initialize engine + keyboard controls.
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new SpaceInvadersEngine(canvasRef.current, invaderSynthInstance, (status) => {
      setScore(status.score);
      setHighScore(status.highScore);
      setWave(status.wave);
      setLives(status.lives);
      setGameState(status.state);
    });
    engineRef.current = engine;

    // Hold-to-move: track which horizontal keys are currently pressed.
    let leftDown = false;
    let rightDown = false;
    const applyDir = () => {
      if (leftDown && !rightDown) engine.setDirection('LEFT');
      else if (rightDown && !leftDown) engine.setDirection('RIGHT');
      else engine.setDirection('NONE');
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          leftDown = true;
          applyDir();
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          rightDown = true;
          applyDir();
          break;
        case ' ':
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          engine.shoot();
          break;
        case 'p':
        case 'P':
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
          leftDown = false;
          applyDir();
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          rightDown = false;
          applyDir();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (engineRef.current) engineRef.current.destroy();
    };
  }, []);

  // Sync sound setting.
  useEffect(() => {
    invaderSynthInstance.setEnabled(soundOn);
  }, [soundOn]);

  // Sync CRT scanlines effect on the body.
  useEffect(() => {
    const mainBody = document.querySelector('body');
    if (mainBody) {
      if (scanlinesOn) {
        mainBody.classList.add('crt-effect');
        mainBody.classList.add('crt-flicker-active');
      } else {
        mainBody.classList.remove('crt-effect');
        mainBody.classList.remove('crt-flicker-active');
      }
    }
  }, [scanlinesOn]);

  // Game control handlers.
  const handleStartGame = () => engineRef.current?.start();
  const handlePauseGame = () => engineRef.current?.pause();
  const handleResetGame = () => engineRef.current?.resetGame();

  const moveLeft = () => engineRef.current?.setDirection('LEFT');
  const moveRight = () => engineRef.current?.setDirection('RIGHT');
  const release = () => engineRef.current?.setDirection('NONE');
  const fire = () => engineRef.current?.shoot();

  return (
    <div className={styles.arcadeCabinet}>
      <div className={styles.arcadeHeader}>
        <h2 className={styles.title}>SPACE INVADERS</h2>
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
              <div key={i} className={styles.cannonLife} />
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

        {/* On-screen controls (mobile) */}
        <div className={styles.controlPad}>
          <button
            className={`${styles.ctrlBtn} ${styles.moveBtn}`}
            onPointerDown={moveLeft}
            onPointerUp={release}
            onPointerLeave={release}
            onContextMenu={(e) => e.preventDefault()}
          >
            ◀
          </button>
          <button
            className={`${styles.ctrlBtn} ${styles.fireBtn}`}
            onPointerDown={fire}
            onContextMenu={(e) => e.preventDefault()}
          >
            FIRE
          </button>
          <button
            className={`${styles.ctrlBtn} ${styles.moveBtn}`}
            onPointerDown={moveRight}
            onPointerUp={release}
            onPointerLeave={release}
            onContextMenu={(e) => e.preventDefault()}
          >
            ▶
          </button>
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
          ◀ ▶ / A D TO MOVE<br />
          SPACE / ▲ TO FIRE — P TO PAUSE<br />
          DEFEND EARTH. DON&apos;T LET THEM LAND.
        </div>
      </div>
    </div>
  );
};

export default SpaceInvadersComponent;
