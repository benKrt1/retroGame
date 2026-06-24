'use client';

import React, { useEffect, useState } from 'react';
import styles from './menu-leaderboard.module.css';
import { fetchScores, ScoreRow } from './scores-client';

interface MenuLeaderboardProps {
  onClose: () => void;
}

// The nine games that feed the global leaderboard (Oracle is not a game).
const GAMES: { id: string; label: string; icon: string }[] = [
  { id: 'pacman', label: 'PAC-MAN', icon: '🟡' },
  { id: 'space-invaders', label: 'INVADERS', icon: '👾' },
  { id: 'tetris', label: 'TETRIS', icon: '🧩' },
  { id: 'snake', label: 'SNAKE', icon: '🐍' },
  { id: 'asteroids', label: 'ASTEROIDS', icon: '🚀' },
  { id: 'fighting', label: 'KO KINGS', icon: '🥊' },
  { id: 'bomberman', label: 'BOMBERMAN', icon: '💣' },
  { id: 'breakout', label: 'BREAKOUT', icon: '🧱' },
  { id: '2048', label: '2048', icon: '🔢' },
];

export const MenuLeaderboard: React.FC<MenuLeaderboardProps> = ({ onClose }) => {
  const [selected, setSelected] = useState(GAMES[0].id);
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  // Fetch the selected game's board. setState here happens only in the async
  // callback (not synchronously in the effect body).
  useEffect(() => {
    let cancelled = false;
    fetchScores(selected).then((res) => {
      if (cancelled) return;
      setRows(res.scores);
      setOffline(res.offline);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [selected]);

  // Switching tabs is an event — reset the view to "loading" here.
  const selectGame = (id: string) => {
    if (id === selected) return;
    setSelected(id);
    setRows([]);
    setOffline(false);
    setLoading(true);
  };

  const current = GAMES.find((g) => g.id === selected);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.heading}>🏆 HIGH SCORES</h3>

        {/* Game tabs */}
        <div className={styles.tabs}>
          {GAMES.map((g) => (
            <button
              key={g.id}
              className={`${styles.tab} ${g.id === selected ? styles.tabActive : ''}`}
              onClick={() => selectGame(g.id)}
              title={g.label}
            >
              <span className={styles.tabIcon}>{g.icon}</span>
              <span className={styles.tabLabel}>{g.label}</span>
            </button>
          ))}
        </div>

        <div className={styles.gameTitle}>{current?.icon} {current?.label}</div>

        {loading ? (
          <p className={styles.note}>LOADING…</p>
        ) : offline ? (
          <p className={styles.note}>LEADERBOARD OFFLINE</p>
        ) : (
          <ol className={styles.list}>
            {rows.length === 0 && <li className={styles.empty}>NO SCORES YET — BE THE FIRST!</li>}
            {rows.map((r, i) => (
              <li key={i} className={styles.row}>
                <span className={styles.rank}>{(i + 1).toString().padStart(2, '0')}</span>
                <span className={styles.rowName}>{r.name}</span>
                <span className={styles.rowScore}>{r.score.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        )}

        <button className={`${styles.closeBtn} pixel-btn`} onClick={onClose}>CLOSE</button>
      </div>
    </div>
  );
};

export default MenuLeaderboard;
