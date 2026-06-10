import Anthropic from '@anthropic-ai/sdk';

// Server-side only. The Anthropic SDK reads ANTHROPIC_API_KEY from the
// environment — the key is never exposed to the browser.

export const dynamic = 'force-dynamic';

type ChatRole = 'user' | 'assistant';
interface ChatMessage {
  role: ChatRole;
  content: string;
}

const SYSTEM_PROMPT = `You are the ARCADE ORACLE — the 8-bit AI host of RETRO CADE, a browser arcade with four games: PAC-MAN, SPACE INVADERS, TETRIS, and SNAKE.

Persona & rules:
- Speak like a retro arcade machine: punchy, playful, a little neon. Light use of arcade flair (e.g. ">>", "INSERT COIN", "*BEEP*") is welcome but keep it readable.
- Help players: give concrete strategies, hints, scoring tips, controls, and trivia/lore for the four games.
- Be concise — 2 to 5 short sentences. No long essays.
- Stay on the arcade topic. If asked something unrelated, steer back with a witty one-liner.
- Never claim to control the games or change scores; you advise, the player plays.`;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const messages = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: 'messages array is required' }, { status: 400 });
  }

  // Sanitize + bound the history so a bad client can't blow up token usage.
  const history: ChatMessage[] = messages
    .filter(
      (m): m is ChatMessage =>
        !!m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim().length > 0
    )
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

  if (history.length === 0 || history[0].role !== 'user') {
    return Response.json({ error: 'Conversation must start with a user message' }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'Oracle is not configured (missing API key)' }, { status: 503 });
  }

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: history,
    });

    const reply = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    return Response.json({ reply: reply || '...the Oracle is silent.' });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error('Anthropic API error', error.status, error.message);
    } else {
      console.error('Oracle error', error);
    }
    return Response.json({ error: 'The Oracle is unavailable right now.' }, { status: 502 });
  }
}
