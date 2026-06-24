'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './snake.module.css';
import { SnakeEngine, SnakeDirection, SnakeGameState } from './snake-game';
import { synthInstance } from '../pacman/sound-synth';
import { useGameShell } from '../use-game-shell';
import { HighScoreOverlay } from '../leaderboard/high-score-overlay';

interface SnakeComponentProps {
  onBack?: () => void;
}

// Tick interval bounds (mirrors BASE_TICK_MS / MIN_TICK_MS in the engine)
// used to render the speed meter.
const SLOW_MS = 160;
const FAST_MS = 65;

export const SnakeComponent: React.FC<SnakeComponentProps> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<SnakeEngine | null>(null);

  // React state synchronized with the engine.
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [length, setLength] = useState(3);
  const [speed, setSpeed] = useState(SLOW_MS);
  const [gameState, setGameState] = useState<SnakeGameState>('IDLE');

  // Settings state.
  const [soundOn, setSoundOn] = useState(true);
  const [scanlinesOn, setScanlinesOn] = useState(true);
  const [showScores, setShowScores] = useState(false);

  // Shared mobile shell: CRT sync, scroll lock, orientation.
  useGameShell({ scanlinesOn });

  // Initialize engine + keyboard controls.
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new SnakeEngine(canvasRef.current, synthInstance, (status) => {
      setScore(status.score);
      setHighScore(status.highScore);
      setLength(status.length);
      setSpeed(status.speed);
      setGameState(status.state);
    });
    engineRef.current = engine;

    const handleKeyDown = (e: KeyboardEvent) => {
      let dir: SnakeDirection | null = null;
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          dir = 'UP';
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          dir = 'DOWN';
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          dir = 'LEFT';
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          dir = 'RIGHT';
          break;
        case ' ':
          e.preventDefault();
          engine.togglePause();
          return;
        default:
          return;
      }
      if (e.key.startsWith('Arrow')) e.preventDefault();
      engine.setDirection(dir);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (engineRef.current) engineRef.current.destroy();
    };
  }, []);

  // Sync sound setting.
  useEffect(() => {
    synthInstance.setEnabled(soundOn);
  }, [soundOn]);

  // Game control handlers.
  const handleStartGame = () => engineRef.current?.start();
  const handlePauseGame = () => engineRef.current?.togglePause();
  const handleResetGame = () => engineRef.current?.reset();
  const handleDpad = (dir: SnakeDirection) => engineRef.current?.setDirection(dir);

  // Speed meter fill (0% slow → 100% fast).
  const speedPct = Math.max(
    0,
    Math.min(100, ((SLOW_MS - speed) / (SLOW_MS - FAST_MS)) * 100)
  );

  return (
    <div className={styles.arcadeCabinet}>
      <div className={styles.arcadeHeader}>
        <h2 className={styles.title}>SNAKE</h2>
        <div className={styles.scoreBoard}>
          <div className={styles.scoreItem}>
            <span className={styles.label}>Score</span>
            <span className={styles.value}>{score.toString().padStart(4, '0')}</span>
          </div>
          <div className={styles.scoreItem}>
            <span className={styles.label}>Hi-Score</span>
            <span className={styles.valueGreen}>{highScore.toString().padStart(4, '0')}</span>
          </div>
          <div className={styles.scoreItem}>
            <span className={styles.label}>Length</span>
            <span className={styles.value}>{length}</span>
          </div>
        </div>
      </div>

      <div className={styles.screenWrapper}>
        <canvas ref={canvasRef} width={380} height={420} className={styles.canvas} />
      </div>

      <div className={styles.cabinetControls}>
        <div className={styles.speedBar}>
          <span className={styles.label}>SPEED</span>
          <div className={styles.speedTrack}>
            <div className={styles.speedFill} style={{ width: `${speedPct}%` }} />
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

          <button className={`${styles.btn} pixel-btn`} onClick={() => setShowScores(true)}>
            SCORES
          </button>

          {onBack && (
            <button className={`${styles.btn} pixel-btn`} onClick={onBack}>
              MENU
            </button>
          )}
        </div>

        {/* On-screen D-pad (mobile) — pointer events for instant, lag-free taps */}
        <div className={styles.dpadContainer}>
          <button className={`${styles.dpadBtn} ${styles.dpadUp}`} onPointerDown={() => handleDpad('UP')} onContextMenu={(e) => e.preventDefault()}>▲</button>
          <button className={`${styles.dpadBtn} ${styles.dpadLeft}`} onPointerDown={() => handleDpad('LEFT')} onContextMenu={(e) => e.preventDefault()}>◀</button>
          <div className={styles.dpadCenter} />
          <button className={`${styles.dpadBtn} ${styles.dpadRight}`} onPointerDown={() => handleDpad('RIGHT')} onContextMenu={(e) => e.preventDefault()}>▶</button>
          <button className={`${styles.dpadBtn} ${styles.dpadDown}`} onPointerDown={() => handleDpad('DOWN')} onContextMenu={(e) => e.preventDefault()}>▼</button>
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
          ARROWS / WASD TO STEER<br />
          EAT APPLES — AVOID WALLS & YOUR TAIL<br />
          SPACE TO PAUSE
        </div>
      </div>

      <HighScoreOverlay
        game="snake"
        score={score}
        active={gameState === 'GAMEOVER' || showScores}
        onClose={() => setShowScores(false)}
      />
    </div>
  );
};

export default SnakeComponent;
