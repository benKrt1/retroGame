'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './2048.module.css';
import { Game2048Engine, SlideDir, Game2048State } from './2048-game';
import { game2048Synth } from './2048-synth';
import { useGameShell } from '../use-game-shell';
import { HighScoreOverlay } from '../leaderboard/high-score-overlay';

interface Game2048ComponentProps {
  onBack?: () => void;
}

export const Game2048Component: React.FC<Game2048ComponentProps> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Game2048Engine | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [gameState, setGameState] = useState<Game2048State>('IDLE');

  const [soundOn, setSoundOn] = useState(true);
  const [scanlinesOn, setScanlinesOn] = useState(true);
  const [showScores, setShowScores] = useState(false);

  useGameShell({ scanlinesOn });

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new Game2048Engine(canvasRef.current, game2048Synth, (status) => {
      setScore(status.score);
      setBest(status.best);
      setGameState(status.state);
    });
    engineRef.current = engine;

    const handleKeyDown = (e: KeyboardEvent) => {
      let dir: SlideDir | null = null;
      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': dir = 'UP'; break;
        case 'ArrowDown': case 's': case 'S': dir = 'DOWN'; break;
        case 'ArrowLeft': case 'a': case 'A': dir = 'LEFT'; break;
        case 'ArrowRight': case 'd': case 'D': dir = 'RIGHT'; break;
        default: return;
      }
      e.preventDefault();
      engine.move(dir);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (engineRef.current) engineRef.current.destroy();
    };
  }, []);

  useEffect(() => {
    game2048Synth.setEnabled(soundOn);
  }, [soundOn]);

  // Swipe detection on the canvas (touch + mouse drag).
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    swipeStart.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (Math.max(adx, ady) < 24) return; // ignore taps
    const dir: SlideDir = adx > ady ? (dx > 0 ? 'RIGHT' : 'LEFT') : (dy > 0 ? 'DOWN' : 'UP');
    engineRef.current?.move(dir);
  };

  const handleStartGame = () => engineRef.current?.start();
  const handleResetGame = () => engineRef.current?.reset();
  const dpad = (dir: SlideDir) => engineRef.current?.move(dir);

  return (
    <div className={styles.arcadeCabinet}>
      <div className={styles.arcadeHeader}>
        <h2 className={styles.title}>2048</h2>
        <div className={styles.scoreBoard}>
          <div className={styles.scoreItem}>
            <span className={styles.label}>Score</span>
            <span className={styles.value}>{score.toString().padStart(5, '0')}</span>
          </div>
          <div className={styles.scoreItem}>
            <span className={styles.label}>Best Tile</span>
            <span className={styles.valueCyan}>{best}</span>
          </div>
        </div>
      </div>

      <div className={styles.screenWrapper}>
        <canvas
          ref={canvasRef}
          width={400}
          height={400}
          className={styles.canvas}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      <div className={styles.cabinetControls}>
        <div className={styles.btnGroup}>
          <button className={`${styles.btn} pixel-btn pixel-btn-yellow`} onClick={handleStartGame}>
            {gameState === 'IDLE' ? 'PLAY' : 'NEW'}
          </button>
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
          SWIPE ON THE BOARD · ARROWS / WASD · D-PAD<br />
          MERGE EQUAL TILES TO REACH 2048
        </div>
      </div>

      <HighScoreOverlay
        game="2048"
        score={score}
        active={gameState === 'GAMEOVER' || showScores}
        onClose={() => setShowScores(false)}
      />
    </div>
  );
};

export default Game2048Component;
