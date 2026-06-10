// Server-side only. Powers the ARCADE ORACLE via the Groq API (free tier,
// OpenAI-compatible, runs open-source Llama models). The key is read from the
// environment and never reaches the browser.
//
// Required env (set in .env.local locally / EnvironmentFile on the server):
//   GROQ_API_KEY = your Groq API key (free, from console.groq.com)
//   GROQ_MODEL   = optional, defaults to llama-3.3-70b-versatile

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

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'Oracle is not configured (missing GROQ_API_KEY)' }, { status: 503 });
  }
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        temperature: 0.7,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('Groq error', res.status, detail.slice(0, 500));
      return Response.json({ error: 'The Oracle is unavailable right now.' }, { status: 502 });
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = (data.choices?.[0]?.message?.content ?? '').trim();

    return Response.json({ reply: reply || '...the Oracle is silent.' });
  } catch (error) {
    console.error('Oracle error', error);
    return Response.json({ error: 'The Oracle is unavailable right now.' }, { status: 502 });
  }
}
