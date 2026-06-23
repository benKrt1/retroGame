'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './pacman.module.css';
import { PacmanEngine, Direction, GameState } from './pacman-game';
import { synthInstance } from './sound-synth';
import { useGameShell } from '../use-game-shell';

interface PacmanComponentProps {
  onBack?: () => void;
}

export const PacmanComponent: React.FC<PacmanComponentProps> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<PacmanEngine | null>(null);

  // React state synchronized with engine
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [gameState, setGameState] = useState<GameState>('START');
  
  // Settings state
  const [soundOn, setSoundOn] = useState(true);
  const [scanlinesOn, setScanlinesOn] = useState(true);

  // Shared mobile shell: CRT sync, scroll lock, orientation.
  useGameShell({ scanlinesOn });

  // Initialize engine
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new PacmanEngine(
      canvasRef.current,
      synthInstance,
      (status) => {
        setScore(status.score);
        setLives(status.lives);
        setLevel(status.level);
        setGameState(status.state);
      }
    );

    engineRef.current = engine;

    // Keyboard controls listener
    const handleKeyDown = (e: KeyboardEvent) => {
      let dir: Direction = 'NONE';
      
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
        case ' ': // Space bar pauses
          if (engineRef.current) {
            e.preventDefault();
            engineRef.current.togglePause();
          }
          return;
        default:
          return;
      }

      if (engineRef.current) {
        // Prevent scrolling with arrow keys when playing
        if (e.key.startsWith('Arrow')) {
          e.preventDefault();
        }
        engineRef.current.setDirection(dir);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Initial draw of the maze
    engine.resetGame();

    // Clean up
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (engineRef.current) {
        engineRef.current.destroy();
      }
    };
  }, []);

  // Sync settings changes
  useEffect(() => {
    synthInstance.setEnabled(soundOn);
  }, [soundOn]);

  // Game control handlers
  const handleStartGame = () => {
    if (engineRef.current) {
      engineRef.current.start();
    }
  };

  const handlePauseGame = () => {
    if (engineRef.current) {
      engineRef.current.pause();
    }
  };

  const handleResetGame = () => {
    if (engineRef.current) {
      engineRef.current.resetGame();
    }
  };

  const handleDpadPress = (dir: Direction) => {
    if (engineRef.current) {
      engineRef.current.setDirection(dir);
    }
  };

  return (
    <div className={styles.arcadeCabinet}>
      <div className={styles.arcadeHeader}>
        <h2 className={styles.title}>PACMAN</h2>
        <div className={styles.scoreBoard}>
          <div className={styles.scoreItem}>
            <span className={styles.label}>Score</span>
            <span className={styles.value}>{score.toString().padStart(6, '0')}</span>
          </div>
          <div className={styles.scoreItem}>
            <span className={styles.label}>Level</span>
            <span className={styles.value}>{level}</span>
          </div>
        </div>
      </div>

      <div className={styles.screenWrapper}>
        <canvas
          ref={canvasRef}
          width={380}
          height={420}
          className={styles.canvas}
        />
      </div>

      <div className={styles.cabinetControls}>
        <div className={styles.livesContainer}>
          <span className={styles.label} style={{ marginRight: '8px' }}>LIVES</span>
          <div className={styles.livesList}>
            {Array.from({ length: Math.max(0, lives - 1) }).map((_, i) => (
              <div key={i} className={styles.pacmanLife} />
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

        {/* Mobile virtual controls — pointer events for instant, lag-free taps */}
        <div className={styles.dpadContainer}>
          <button className={`${styles.dpadBtn} ${styles.dpadUp}`} onPointerDown={() => handleDpadPress('UP')} onContextMenu={(e) => e.preventDefault()}>▲</button>
          <button className={`${styles.dpadBtn} ${styles.dpadLeft}`} onPointerDown={() => handleDpadPress('LEFT')} onContextMenu={(e) => e.preventDefault()}>◀</button>
          <div className={styles.dpadCenter} />
          <button className={`${styles.dpadBtn} ${styles.dpadRight}`} onPointerDown={() => handleDpadPress('RIGHT')} onContextMenu={(e) => e.preventDefault()}>▶</button>
          <button className={`${styles.dpadBtn} ${styles.dpadDown}`} onPointerDown={() => handleDpadPress('DOWN')} onContextMenu={(e) => e.preventDefault()}>▼</button>
        </div>

        {/* Options Row */}
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
          USE ARROWS / WASD TO MOVE<br />
          EAT PELLETS & AVOID GHOSTS<br />
          EAT POWER PELLETS TO EAT GHOSTS
        </div>
      </div>
    </div>
  );
};
export default PacmanComponent;
