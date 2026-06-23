'use client';

import { useEffect, useState } from 'react';

type Orientation = 'portrait' | 'landscape';

interface UseGameShellOptions {
  /** Whether the CRT scanline overlay should be active (mirrors the per-game toggle). */
  scanlinesOn: boolean;
}

interface GameShell {
  /** Current device orientation — drives the "rotate for best experience" hint. */
  orientation: Orientation;
}

/**
 * Shared per-game shell behaviour, previously copy-pasted into every game
 * component:
 *
 *  - Syncs the CRT scanline body classes with the game's toggle.
 *  - Locks page scroll/zoom (`playing-lock`) while a game is mounted so swiping
 *    on the on-screen controls can't scroll the page or pull-to-refresh.
 *  - Tracks portrait/landscape so games can prompt the player to rotate.
 *
 * All body classes are removed on unmount so the menu stays interactive after
 * backing out of a game.
 */
export function useGameShell({ scanlinesOn }: UseGameShellOptions): GameShell {
  const [orientation, setOrientation] = useState<Orientation>('portrait');

  // CRT scanline overlay follows the per-game toggle.
  useEffect(() => {
    const body = document.body;
    if (scanlinesOn) {
      body.classList.add('crt-effect', 'crt-flicker-active');
    } else {
      body.classList.remove('crt-effect', 'crt-flicker-active');
    }
    return () => {
      body.classList.remove('crt-effect', 'crt-flicker-active');
    };
  }, [scanlinesOn]);

  // Freeze the page while playing; restore on unmount.
  useEffect(() => {
    document.body.classList.add('playing-lock');
    return () => {
      document.body.classList.remove('playing-lock');
    };
  }, []);

  // Track orientation via matchMedia.
  useEffect(() => {
    const mql = window.matchMedia('(orientation: landscape)');
    const apply = () => setOrientation(mql.matches ? 'landscape' : 'portrait');
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, []);

  return { orientation };
}
