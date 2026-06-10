'use client';

import React, { useEffect, useState } from 'react';
import styles from './page.module.css';
import { PacmanComponent } from './pacman/pacman-component';
import { SpaceInvadersComponent } from './space-invaders/space-invaders-component';
import { TetrisComponent } from './tetris/tetris-component';
import { SnakeComponent } from './snake/snake-component';
import { OracleComponent } from './oracle/oracle-component';
import { ThemeToggle } from './theme-toggle';

type GameId = 'pacman' | 'space-invaders' | 'tetris' | 'snake' | 'oracle' | null;

// Tab title + favicon per screen. The menu shows the arcade brand; booting a
// game swaps both to that game's identity.
const MENU_CHROME = { title: 'RETRO CADE — Mini Games Arcade', icon: '/favicons/menu.svg' };
const GAME_CHROME: Record<Exclude<GameId, null>, { title: string; icon: string }> = {
  'pacman': { title: 'PAC-MAN — RETRO CADE', icon: '/favicons/pacman.svg' },
  'space-invaders': { title: 'SPACE INVADERS — RETRO CADE', icon: '/favicons/space-invaders.svg' },
  'tetris': { title: 'TETRIS — RETRO CADE', icon: '/favicons/tetris.svg' },
  'snake': { title: 'SNAKE — RETRO CADE', icon: '/favicons/snake.svg' },
  'oracle': { title: 'ARCADE ORACLE — RETRO CADE', icon: '/favicons/menu.svg' },
};

export default function Home() {
  const [activeGame, setActiveGame] = useState<GameId>(null);

  // Drive the browser tab's title + favicon from the active game.
  useEffect(() => {
    const chrome = activeGame ? GAME_CHROME[activeGame] : MENU_CHROME;
    document.title = chrome.title;
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/svg+xml';
    link.href = chrome.icon;
  }, [activeGame]);

  return (
    <main className={styles.main}>
      {/* Settings bar for global controls — shown on the menu and during games */}
      <div className="settings-bar">
        <ThemeToggle />
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
            <div
              className={`${styles.cabinetCard} ${styles.activeCard}`}
              onClick={() => setActiveGame('space-invaders')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setActiveGame('space-invaders');
                }
              }}
            >
              <div className={styles.cardTop}>
                <span className={styles.cardIcon}>👾</span>
                <span className={styles.badge}>READY</span>
              </div>
              <div className={styles.cardBody}>
                <h3 className={styles.cardTitle}>SPACE INVADERS</h3>
                <p className={styles.cardDesc}>
                  DEFEND THE EARTH FROM DESCENDING WAVES OF ALIEN SHIPS. CHIP-TUNE CHASE MELODIES AND MULTIPLE SHIELD LAYOUTS.
                </p>
              </div>
              <div className={styles.cardFooter}>
                <span className={styles.cardAction}>[ BOOT CABINET ]</span>
              </div>
            </div>

            {/* Tetris */}
            <div
              className={`${styles.cabinetCard} ${styles.activeCard}`}
              onClick={() => setActiveGame('tetris')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setActiveGame('tetris');
                }
              }}
            >
              <div className={styles.cardTop}>
                <span className={styles.cardIcon}>🧱</span>
                <span className={styles.badge}>READY</span>
              </div>
              <div className={styles.cardBody}>
                <h3 className={styles.cardTitle}>TETRIS</h3>
                <p className={styles.cardDesc}>
                  FIT RANDOMLY FALLING PUZZLE BLOCK SHAPES TOGETHER TO CLEAR HORIZONTAL LINES AND RACK UP BIG MULTIPLIERS.
                </p>
              </div>
              <div className={styles.cardFooter}>
                <span className={styles.cardAction}>[ BOOT CABINET ]</span>
              </div>
            </div>

            {/* Snake */}
            <div
              className={`${styles.cabinetCard} ${styles.activeCard}`}
              onClick={() => setActiveGame('snake')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setActiveGame('snake');
                }
              }}
            >
              <div className={styles.cardTop}>
                <span className={styles.cardIcon}>🐍</span>
                <span className={styles.badge}>READY</span>
              </div>
              <div className={styles.cardBody}>
                <h3 className={styles.cardTitle}>SNAKE</h3>
                <p className={styles.cardDesc}>
                  GUIDE A GROWING REPTILE AROUND A DENSE GRID TO EAT EGGS WITHOUT COLLIDING INTO WALLS OR YOUR OWN TAIL.
                </p>
              </div>
              <div className={styles.cardFooter}>
                <span className={styles.cardAction}>[ BOOT CABINET ]</span>
              </div>
            </div>

            {/* Arcade Oracle — AI chat */}
            <div
              className={`${styles.cabinetCard} ${styles.activeCard}`}
              onClick={() => setActiveGame('oracle')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setActiveGame('oracle');
                }
              }}
            >
              <div className={styles.cardTop}>
                <span className={styles.cardIcon}>🤖</span>
                <span className={styles.badge}>AI</span>
              </div>
              <div className={styles.cardBody}>
                <h3 className={styles.cardTitle}>ARCADE ORACLE</h3>
                <p className={styles.cardDesc}>
                  CHAT WITH THE 8-BIT AI GAME MASTER. ASK FOR STRATEGIES, HINTS AND TRIVIA ON EVERY CABINET. POWERED BY GENERATIVE AI.
                </p>
              </div>
              <div className={styles.cardFooter}>
                <span className={styles.cardAction}>[ CONSULT ORACLE ]</span>
              </div>
            </div>
          </section>

          <footer className={styles.footer}>
            RETRO CADE SYSTEM V1.0.0 // NATIVE WEB AUDIO & CANVAS GRID ENGINE
          </footer>
        </>
      ) : (
        <div className={styles.gameContainer} data-theme="dark">
          {activeGame === 'pacman' && (
            <PacmanComponent onBack={() => setActiveGame(null)} />
          )}
          {activeGame === 'space-invaders' && (
            <SpaceInvadersComponent onBack={() => setActiveGame(null)} />
          )}
          {activeGame === 'tetris' && (
            <TetrisComponent onBack={() => setActiveGame(null)} />
          )}
          {activeGame === 'snake' && (
            <SnakeComponent onBack={() => setActiveGame(null)} />
          )}
          {activeGame === 'oracle' && (
            <OracleComponent onBack={() => setActiveGame(null)} />
          )}
        </div>
      )}
    </main>
  );
}
