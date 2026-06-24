// Server-side only. Global per-game high-score leaderboard backed by Upstash
// Redis (free tier, REST client — ideal for Vercel serverless). Each game has a
// sorted set `lb:<game>`; members are JSON `{n,t}` (name + timestamp so repeat
// entries stay distinct) scored by the numeric game score.
//
// Required env (set in .env.local locally / Vercel project env in prod):
//   UPSTASH_REDIS_REST_URL   = https://<db>.upstash.io
//   UPSTASH_REDIS_REST_TOKEN = <token>
//
// No auth by design (no accounts) — client-submitted scores are spoofable, which
// is acceptable for a personal arcade.

import { Redis } from '@upstash/redis';

export const dynamic = 'force-dynamic';

const GAMES = new Set([
  'pacman', 'space-invaders', 'tetris', 'snake', 'asteroids', 'bomberman', 'fighting', 'breakout', '2048', 'frogger',
]);

const TOP_N = 10;
const MAX_SCORE = 10_000_000;
const NAME_MAX = 10;

export interface ScoreRow {
  name: string;
  score: number;
}

// Lazily build the client so a missing config surfaces as a clean 503 rather
// than crashing the module at import time. The Vercel + Upstash integration
// injects KV_REST_API_* names; fall back to the UPSTASH_* names too.
function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function keyFor(game: string) {
  return `lb:${game}`;
}

function cleanName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  // Drop control chars, collapse whitespace, upper-case, clamp length.
  const cleaned = s
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, NAME_MAX);
  return cleaned || 'AAA';
}

// Pull the player name out of a stored member, which @upstash/redis may hand
// back either as the raw JSON string or as an already-parsed object.
function nameFromMember(member: unknown): string {
  if (member && typeof member === 'object' && 'n' in member) {
    return String((member as { n?: unknown }).n ?? 'AAA');
  }
  if (typeof member === 'string') {
    try {
      const parsed = JSON.parse(member) as { n?: unknown };
      if (parsed && typeof parsed === 'object' && typeof parsed.n === 'string') return parsed.n;
    } catch {
      /* fall through */
    }
    return member;
  }
  return 'AAA';
}

// Read the top N entries (descending) for a game. zrange(...withScores) returns
// a flat [member, score, member, score, ...] array.
async function topScores(redis: Redis, game: string): Promise<ScoreRow[]> {
  const flat = (await redis.zrange(keyFor(game), 0, TOP_N - 1, {
    rev: true,
    withScores: true,
  })) as unknown[];
  const rows: ScoreRow[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    rows.push({ name: nameFromMember(flat[i]), score: Number(flat[i + 1]) });
  }
  return rows;
}

export async function GET(request: Request): Promise<Response> {
  const game = new URL(request.url).searchParams.get('game') ?? '';
  if (!GAMES.has(game)) {
    return Response.json({ error: 'Unknown game' }, { status: 400 });
  }
  const redis = getRedis();
  if (!redis) {
    return Response.json({ error: 'Leaderboard is not configured' }, { status: 503 });
  }
  try {
    const scores = await topScores(redis, game);
    return Response.json({ scores });
  } catch (error) {
    console.error('Leaderboard GET error', error);
    return Response.json({ error: 'Leaderboard is unavailable right now.' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { game, name, score } = (body ?? {}) as { game?: unknown; name?: unknown; score?: unknown };

  if (typeof game !== 'string' || !GAMES.has(game)) {
    return Response.json({ error: 'Unknown game' }, { status: 400 });
  }
  const numScore = Number(score);
  if (!Number.isFinite(numScore) || numScore < 0 || numScore > MAX_SCORE) {
    return Response.json({ error: 'Invalid score' }, { status: 400 });
  }
  const cleanScore = Math.floor(numScore);
  const playerName = cleanName(name);

  const redis = getRedis();
  if (!redis) {
    return Response.json({ error: 'Leaderboard is not configured' }, { status: 503 });
  }

  try {
    const member = JSON.stringify({ n: playerName, t: Date.now() });
    await redis.zadd(keyFor(game), { score: cleanScore, member });
    // Keep only the top TOP_N (drop everything below the highest TOP_N ranks).
    await redis.zremrangebyrank(keyFor(game), 0, -(TOP_N + 1));
    const scores = await topScores(redis, game);
    return Response.json({ scores });
  } catch (error) {
    console.error('Leaderboard POST error', error);
    return Response.json({ error: 'Leaderboard is unavailable right now.' }, { status: 502 });
  }
}
