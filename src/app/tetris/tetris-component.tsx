'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './tetris.module.css';
import { TetrisEngine, TetrisState } from './tetris-game';
import { tetrisSynthInstance } from './tetris-synth';

interface TetrisComponentProps {
  onBack?: () => void;
}

export const TetrisComponent: React.FC<TetrisComponentProps> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<TetrisEngine | null>(null);

  // React state synchronized with the engine.
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const [gameState, setGameState] = useState<TetrisState>('START');

  // Settings state.
  const [soundOn, setSoundOn] = useState(true);
  const [scanlinesOn, setScanlinesOn] = useState(true);

  // Initialize engine + keyboard controls.
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new TetrisEngine(canvasRef.current, tetrisSynthInstance, (status) => {
      setScore(status.score);
      setHighScore(status.highScore);
      setLines(status.lines);
      setLevel(status.level);
      setGameState(status.state);
    });
    engineRef.current = engine;

    let softDown = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          engine.move(-1);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          engine.move(1);
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          if (!softDown) {
            softDown = true;
            engine.setSoftDrop(true);
          }
          break;
        case 'ArrowUp':
        case 'x':
        case 'X':
          e.preventDefault();
          engine.rotate(1);
          break;
        case 'z':
        case 'Z':
          e.preventDefault();
          engine.rotate(-1);
          break;
        case ' ':
          e.preventDefault();
          engine.hardDrop();
          break;
        case 'c':
        case 'C':
          e.preventDefault();
          engine.hold();
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
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        softDown = false;
        engine.setSoftDrop(false);
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
    tetrisSynthInstance.setEnabled(soundOn);
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

  const moveLeft = () => engineRef.current?.move(-1);
  const moveRight = () => engineRef.current?.move(1);
  const rotateCW = () => engineRef.current?.rotate(1);
  const hardDrop = () => engineRef.current?.hardDrop();
  const holdPiece = () => engineRef.current?.hold();
  const softOn = () => engineRef.current?.setSoftDrop(true);
  const softOff = () => engineRef.current?.setSoftDrop(false);

  return (
    <div className={styles.arcadeCabinet}>
      <div className={styles.arcadeHeader}>
        <h2 className={styles.title}>TETRIS</h2>
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
            <span className={styles.label}>Lines</span>
            <span className={styles.value}>{lines}</span>
          </div>
          <div className={styles.scoreItem}>
            <span className={styles.label}>Level</span>
            <span className={styles.value}>{level}</span>
          </div>
        </div>
      </div>

      <div className={styles.screenWrapper}>
        <canvas ref={canvasRef} width={380} height={420} className={styles.canvas} />
      </div>

      <div className={styles.cabinetControls}>
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
            className={`${styles.ctrlBtn} ${styles.rotateBtn}`}
            onPointerDown={rotateCW}
            onContextMenu={(e) => e.preventDefault()}
          >
            ⟳
          </button>
          <div className={styles.moveRow}>
            <button
              className={styles.ctrlBtn}
              onPointerDown={moveLeft}
              onContextMenu={(e) => e.preventDefault()}
            >
              ◀
            </button>
            <button
              className={styles.ctrlBtn}
              onPointerDown={softOn}
              onPointerUp={softOff}
              onPointerLeave={softOff}
              onContextMenu={(e) => e.preventDefault()}
            >
              ▼
            </button>
            <button
              className={styles.ctrlBtn}
              onPointerDown={moveRight}
              onContextMenu={(e) => e.preventDefault()}
            >
              ▶
            </button>
          </div>
          <div className={styles.actionRow}>
            <button
              className={`${styles.ctrlBtn} ${styles.dropBtn}`}
              onPointerDown={hardDrop}
              onContextMenu={(e) => e.preventDefault()}
            >
              DROP
            </button>
            <button
              className={`${styles.ctrlBtn} ${styles.holdBtn}`}
              onPointerDown={holdPiece}
              onContextMenu={(e) => e.preventDefault()}
            >
              HOLD
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
          ◀ ▶ MOVE — ▼ SOFT DROP — ↑ / X / Z ROTATE<br />
          SPACE HARD DROP — C HOLD — P PAUSE
        </div>
      </div>
    </div>
  );
};

export default TetrisComponent;
