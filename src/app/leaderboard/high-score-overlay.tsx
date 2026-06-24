'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './high-score-overlay.module.css';
import {
  fetchScores,
  submitScore,
  qualifies,
  recallName,
  rememberName,
  ScoreRow,
} from './scores-client';

interface HighScoreOverlayProps {
  game: string;
  score: number;
  active: boolean;            // true while the overlay should be shown
  scoreLabel?: string;        // e.g. "SCORE" / "KO SCORE"
  onClose?: () => void;
}

type Phase = 'loading' | 'entry' | 'board' | 'offline';

export const HighScoreOverlay: React.FC<HighScoreOverlayProps> = ({
  game,
  score,
  active,
  scoreLabel = 'SCORE',
  onClose,
}) => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [name, setName] = useState('');
  const [highlight, setHighlight] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const wasActive = useRef(false);

  // On the rising edge of `active`, load the board and decide entry vs view.
  useEffect(() => {
    if (active && !wasActive.current) {
      wasActive.current = true;
      let cancelled = false;
      setPhase('loading');
      setHighlight(null);
      setDismissed(false);
      fetchScores(game).then((res) => {
        if (cancelled) return;
        if (res.offline) {
          setPhase('offline');
          return;
        }
        setRows(res.scores);
        if (qualifies(score, res.scores)) {
          setName(recallName());
          setPhase('entry');
        } else {
          setPhase('board');
        }
      });
      return () => {
        cancelled = true;
      };
    }
    if (!active) wasActive.current = false;
  }, [active, game, score]);

  if (!active || dismissed) return null;

  // CLOSE must hide the overlay even when `active` is still true (e.g. the game
  // is still in its GAMEOVER state); also clear the mid-game SCORES toggle.
  const handleClose = () => {
    setDismissed(true);
    onClose?.();
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    const finalName = name.trim() || 'AAA';
    rememberName(finalName);
    const res = await submitScore(game, finalName, score);
    setSubmitting(false);
    if (res.offline) {
      setPhase('offline');
      return;
    }
    setRows(res.scores);
    // Highlight the first row whose name+score matches this run.
    const idx = res.scores.findIndex(
      (r) => r.name === finalName.toUpperCase().slice(0, 10) && r.score === Math.floor(score),
    );
    setHighlight(idx >= 0 ? idx : null);
    setPhase('board');
  };

  return (
    <div className={styles.backdrop}>
      <div className={styles.panel}>
        <h3 className={styles.heading}>HIGH SCORES</h3>

        {phase === 'loading' && <p className={styles.note}>LOADING…</p>}

        {phase === 'offline' && (
          <>
            <p className={styles.note}>LEADERBOARD OFFLINE</p>
            <button className={`${styles.actionBtn} pixel-btn`} onClick={handleClose}>CLOSE</button>
          </>
        )}

        {phase === 'entry' && (
          <div className={styles.entry}>
            <p className={styles.bigScore}>{scoreLabel}: {Math.floor(score).toLocaleString()}</p>
            <p className={styles.note}>NEW HIGH SCORE! ENTER YOUR NAME</p>
            <input
              className={styles.nameInput}
              value={name}
              maxLength={10}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              placeholder="AAA"
            />
            <button
              className={`${styles.actionBtn} pixel-btn pixel-btn-yellow`}
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'SAVING…' : 'SUBMIT'}
            </button>
          </div>
        )}

        {phase === 'board' && (
          <>
            <ol className={styles.list}>
              {rows.length === 0 && <li className={styles.empty}>NO SCORES YET — BE THE FIRST!</li>}
              {rows.map((r, i) => (
                <li key={i} className={i === highlight ? styles.rowHi : styles.row}>
                  <span className={styles.rank}>{(i + 1).toString().padStart(2, '0')}</span>
                  <span className={styles.rowName}>{r.name}</span>
                  <span className={styles.rowScore}>{r.score.toLocaleString()}</span>
                </li>
              ))}
            </ol>
            {highlight === null && score > 0 && (
              <p className={styles.note}>{scoreLabel}: {Math.floor(score).toLocaleString()} — NOT IN TOP 10</p>
            )}
            <button className={`${styles.actionBtn} pixel-btn`} onClick={handleClose}>CLOSE</button>
          </>
        )}
      </div>
    </div>
  );
};

export default HighScoreOverlay;
