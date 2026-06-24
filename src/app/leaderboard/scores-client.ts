// Client helpers for the global leaderboard. Thin wrappers around /api/scores
// plus a couple of pure helpers shared by the overlay.

export interface ScoreRow {
  name: string;
  score: number;
}

export interface LeaderboardResult {
  scores: ScoreRow[];
  offline: boolean; // true when the backend is unconfigured/unreachable
}

const NAME_KEY = 'rc-player-name';
export const TOP_N = 10;

// Fetch the current top-N for a game. Network/backend failures resolve to an
// `offline` result so the UI can degrade instead of throwing.
export async function fetchScores(game: string): Promise<LeaderboardResult> {
  try {
    const res = await fetch(`/api/scores?game=${encodeURIComponent(game)}`, { cache: 'no-store' });
    if (!res.ok) return { scores: [], offline: true };
    const data = (await res.json()) as { scores?: ScoreRow[] };
    return { scores: data.scores ?? [], offline: false };
  } catch {
    return { scores: [], offline: true };
  }
}

// Submit a score and return the refreshed top-N.
export async function submitScore(game: string, name: string, score: number): Promise<LeaderboardResult> {
  try {
    const res = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game, name, score }),
    });
    if (!res.ok) return { scores: [], offline: true };
    const data = (await res.json()) as { scores?: ScoreRow[] };
    return { scores: data.scores ?? [], offline: false };
  } catch {
    return { scores: [], offline: true };
  }
}

// A score makes the board if it's positive and either the board isn't full or it
// beats the current lowest entry.
export function qualifies(score: number, rows: ScoreRow[]): boolean {
  if (score <= 0) return false;
  if (rows.length < TOP_N) return true;
  return score > rows[rows.length - 1].score;
}

// Remember the last name a player used so the prompt can pre-fill it.
export function recallName(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberName(name: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore */
  }
}
