'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './breakout.module.css';
import { BreakoutEngine, BreakoutState } from './breakout-game';
import { breakoutSynth } from './breakout-synth';
import { useGameShell } from '../use-game-shell';
import { HighScoreOverlay } from '../leaderboard/high-score-overlay';

interface BreakoutComponentProps {
  onBack?: () => void;
}

export const BreakoutComponent: React.FC<BreakoutComponentProps> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<BreakoutEngine | null>(null);
  const pointerDownRef = useRef(false);

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [gameState, setGameState] = useState<BreakoutState>('IDLE');

  const [soundOn, setSoundOn] = useState(true);
  const [scanlinesOn, setScanlinesOn] = useState(true);
  const [showScores, setShowScores] = useState(false);

  useGameShell({ scanlinesOn });

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new BreakoutEngine(canvasRef.current, breakoutSynth, (status) => {
      setScore(status.score);
      setLives(status.lives);
      setLevel(status.level);
      setGameState(status.state);
    });
    engineRef.current = engine;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft': case 'a': case 'A':
          // Using the keyboard takes over from pointer/mouse control.
          e.preventDefault(); engine.clearPointer(); engine.setPaddleDir('LEFT'); break;
        case 'ArrowRight': case 'd': case 'D':
          e.preventDefault(); engine.clearPointer(); engine.setPaddleDir('RIGHT'); break;
        case ' ':
          e.preventDefault(); engine.launch(); break;
        case 'p': case 'P':
          engine.togglePause(); break;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'a', 'A'].includes(e.key)) engine.setPaddleDir(null);
      if (['ArrowRight', 'd', 'D'].includes(e.key)) engine.setPaddleDir(null);
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
    breakoutSynth.setEnabled(soundOn);
  }, [soundOn]);

  // Map a pointer event over the canvas to the engine's internal x.
  const pointerToPaddle = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    engineRef.current?.setPaddleX(x);
  };

  // Only drag (pressed) controls the paddle — hovering must not hijack the
  // keyboard. Releasing hands control back to the keys/buttons.
  const pointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointerDownRef.current = true;
    pointerToPaddle(e);
    engineRef.current?.launch();
  };
  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerDownRef.current) pointerToPaddle(e);
  };
  const pointerUp = () => {
    pointerDownRef.current = false;
    engineRef.current?.clearPointer();
  };

  const handleStartGame = () => engineRef.current?.start();
  const handlePauseGame = () => engineRef.current?.togglePause();
  const handleResetGame = () => engineRef.current?.reset();
  const hold = (dir: 'LEFT' | 'RIGHT', down: boolean) => {
    // A button press overrides pointer control: stop tracking the pointer.
    if (down) engineRef.current?.clearPointer();
    engineRef.current?.setPaddleDir(down ? dir : null);
  };

  return (
    <div className={styles.arcadeCabinet}>
      <div className={styles.arcadeHeader}>
        <h2 className={styles.title}>BREAKOUT</h2>
        <div className={styles.scoreBoard}>
          <div className={styles.scoreItem}>
            <span className={styles.label}>Score</span>
            <span className={styles.value}>{score.toString().padStart(5, '0')}</span>
          </div>
          <div className={styles.scoreItem}>
            <span className={styles.label}>Level</span>
            <span className={styles.valueCyan}>{level}</span>
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
          width={380}
          height={460}
          className={styles.canvas}
          onPointerMove={pointerMove}
          onPointerDown={pointerDown}
          onPointerUp={pointerUp}
          onPointerLeave={pointerUp}
          onPointerCancel={pointerUp}
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

        {/* On-screen controls (mobile) */}
        <div className={styles.touchPanel}>
          <button className={`${styles.ctrlBtn} ${styles.moveBtn}`}
            onPointerDown={() => hold('LEFT', true)} onPointerUp={() => hold('LEFT', false)}
            onPointerLeave={() => hold('LEFT', false)} onContextMenu={(e) => e.preventDefault()}>◀</button>
          <button className={`${styles.ctrlBtn} ${styles.launchBtn}`}
            onPointerDown={(e) => { e.preventDefault(); engineRef.current?.launch(); }}
            onContextMenu={(e) => e.preventDefault()}>LAUNCH</button>
          <button className={`${styles.ctrlBtn} ${styles.moveBtn}`}
            onPointerDown={() => hold('RIGHT', true)} onPointerUp={() => hold('RIGHT', false)}
            onPointerLeave={() => hold('RIGHT', false)} onContextMenu={(e) => e.preventDefault()}>▶</button>
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
          MOVE: DRAG ON SCREEN · ◀ ▶ · A / D<br />
          SPACE / TAP TO LAUNCH · SMASH ALL BRICKS
        </div>
      </div>

      <HighScoreOverlay
        game="breakout"
        score={score}
        active={gameState === 'GAMEOVER' || showScores}
        onClose={() => setShowScores(false)}
      />
    </div>
  );
};

export default BreakoutComponent;
