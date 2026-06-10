// Server-side only. Calls Claude on AWS Bedrock via the Converse API using a
// Bedrock API key (bearer token). The key never reaches the browser.
//
// Required env (set in .env.local locally / EnvironmentFile on the server):
//   AWS_BEARER_TOKEN_BEDROCK = the Bedrock API key (bearer token)
//   BEDROCK_REGION           = region where Claude model access is enabled (e.g. eu-central-1)
//   BEDROCK_MODEL_ID         = the model id / inference profile (e.g. eu.anthropic.claude-3-5-sonnet-20240620-v1:0)

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

  const token = process.env.AWS_BEARER_TOKEN_BEDROCK;
  const region = process.env.BEDROCK_REGION;
  const modelId = process.env.BEDROCK_MODEL_ID;
  if (!token || !region || !modelId) {
    return Response.json(
      { error: 'Oracle is not configured (Bedrock key/region/model missing)' },
      { status: 503 }
    );
  }

  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(
    modelId
  )}/converse`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        system: [{ text: SYSTEM_PROMPT }],
        messages: history.map((m) => ({ role: m.role, content: [{ text: m.content }] })),
        inferenceConfig: { maxTokens: 512, temperature: 0.7 },
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('Bedrock error', res.status, detail.slice(0, 500));
      return Response.json({ error: 'The Oracle is unavailable right now.' }, { status: 502 });
    }

    const data = (await res.json()) as {
      output?: { message?: { content?: Array<{ text?: string }> } };
    };
    const reply =
      data.output?.message?.content
        ?.map((b) => b.text ?? '')
        .join('')
        .trim() ?? '';

    return Response.json({ reply: reply || '...the Oracle is silent.' });
  } catch (error) {
    console.error('Oracle error', error);
    return Response.json({ error: 'The Oracle is unavailable right now.' }, { status: 502 });
  }
}
