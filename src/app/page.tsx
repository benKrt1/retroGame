'use client';

import React, { useState } from 'react';
import styles from './page.module.css';
import { PacmanComponent } from './pacman/pacman-component';

type GameId = 'pacman' | null;

export default function Home() {
  const [activeGame, setActiveGame] = useState<GameId>(null);

  return (
    <main className={styles.main}>
      {/* Settings bar for global controls (like CRT effect toggle) */}
      <div className="settings-bar">
        {/* We place scanlines toggles inside the game cabinet component, 
            but this bar is prepared for global dashboard variables if needed */}
      </div>

      {activeGame === null ? (
        <>
          <header className={styles.header}>
            <h1 className={styles.logoText}>RETRO CADE</h1>
            <p className={styles.subtitle}>&gt; SELECT A CABINET TO BOOT &lt;</p>
          </header>

          <section className={styles.gameGrid}>
            {/* Pacman Cabinet */}
            <div 
              className={`${styles.cabinetCard} ${styles.activeCard}`}
              onClick={() => setActiveGame('pacman')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setActiveGame('pacman');
                }
              }}
            >
              <div className={styles.cardTop}>
                <span className={styles.cardIcon}>🟡</span>
                <span className={styles.badge}>READY</span>
              </div>
              <div className={styles.cardBody}>
                <h3 className={styles.cardTitle}>PAC-MAN</h3>
                <p className={styles.cardDesc}>
                  THE 1980 RETRO ARCADE CLASSIC. CHOMP DOTS, EAT POWER PELLETS, AND ESCAPE THE GHOSTS IN A GLOWING MAZE.
                </p>
              </div>
              <div className={styles.cardFooter}>
                <span className={styles.cardAction}>[ BOOT CABINET ]</span>
              </div>
            </div>

            {/* Space Invaders */}
            <div className={`${styles.cabinetCard} ${styles.lockedCard}`}>
              <div className={styles.cardTop}>
                <span className={styles.cardIcon}>👾</span>
                <span className={styles.badge}>LOCKED</span>
              </div>
              <div className={styles.cardBody}>
                <h3 className={styles.cardTitle}>SPACE INVADERS</h3>
                <p className={styles.cardDesc}>
                  DEFEND THE EARTH FROM DESCENDING WAVES OF ALIEN SHIPS. CHIP-TUNE CHASE MELODIES AND MULTIPLE SHIELD LAYOUTS.
                </p>
              </div>
              <div className={styles.cardFooter}>
                <span className={styles.cardAction}>COMING SOON</span>
              </div>
            </div>

            {/* Tetris */}
            <div className={`${styles.cabinetCard} ${styles.lockedCard}`}>
              <div className={styles.cardTop}>
                <span className={styles.cardIcon}>🧱</span>
                <span className={styles.badge}>LOCKED</span>
              </div>
              <div className={styles.cardBody}>
                <h3 className={styles.cardTitle}>TETRIS</h3>
                <p className={styles.cardDesc}>
                  FIT RANDOMLY FALLING PUZZLE BLOCK SHAPES TOGETHER TO CLEAR HORIZONTAL LINES AND RACK UP BIG MULTIPLIERS.
                </p>
              </div>
              <div className={styles.cardFooter}>
                <span className={styles.cardAction}>COMING SOON</span>
              </div>
            </div>

            {/* Snake */}
            <div className={`${styles.cabinetCard} ${styles.lockedCard}`}>
              <div className={styles.cardTop}>
                <span className={styles.cardIcon}>🐍</span>
                <span className={styles.badge}>LOCKED</span>
              </div>
              <div className={styles.cardBody}>
                <h3 className={styles.cardTitle}>SNAKE</h3>
                <p className={styles.cardDesc}>
                  GUIDE A GROWING REPTILE AROUND A DENSE GRID TO EAT EGGS WITHOUT COLLIDING INTO WALLS OR YOUR OWN TAIL.
                </p>
              </div>
              <div className={styles.cardFooter}>
                <span className={styles.cardAction}>COMING SOON</span>
              </div>
            </div>
          </section>

          <footer className={styles.footer}>
            RETRO CADE SYSTEM V1.0.0 // NATIVE WEB AUDIO & CANVAS GRID ENGINE
          </footer>
        </>
      ) : (
        <div className={styles.gameContainer}>
          {activeGame === 'pacman' && (
            <PacmanComponent onBack={() => setActiveGame(null)} />
          )}
        </div>
      )}
    </main>
  );
}
