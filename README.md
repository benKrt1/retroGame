# 🕹️ RETRO CADE

A browser-based retro arcade built with **Next.js** + **TypeScript**, featuring four hand-written Canvas games **and a Generative-AI game master**. Each game runs on its own HTML5 Canvas engine with a chiptune **Web Audio** soundtrack and a CRT-styled cabinet UI — no game frameworks, no audio files. The **ARCADE ORACLE** adds an AI chat cabinet powered by the **Groq API** (free tier, open-source Llama models), and the whole app is deployed to **AWS EC2 with Terraform**.

> `> SELECT A CABINET TO BOOT <`

**🔗 Live demo (AWS):** http://ec2-16-16-57-148.eu-north-1.compute.amazonaws.com

## 🎮 Games

| Game | Status | Highlights |
|------|--------|-----------|
| 🟡 **Pac-Man** | ✅ Playable | Classic maze, dots & power pellets, four ghosts with scatter/chase modes, intro theme |
| 👾 **Space Invaders** | ✅ Playable | Marching invader grid that speeds up, destructible shields, UFO bonus, waves, high score, the iconic 4-note march beat |
| 🧱 **Tetris** | ✅ Playable | 7-bag randomizer, hold piece, ghost piece, next-queue preview, wall kicks, soft/hard drop, levels & line-clear scoring, looping Korobeiniki theme |
| 🐍 **Snake** | ✅ Playable | Grid-based snake, apples, progressive speed-up, high score, smooth tween rendering |

## 🤖 ARCADE ORACLE (Generative AI)

A fifth cabinet: a retro CRT chat terminal where an 8-bit AI game master answers questions and gives strategies, hints and trivia for every game.

- The browser calls an internal server route (`/api/oracle`); the route calls the **Groq API** (OpenAI-compatible).
- The API key is read from an environment variable **server-side only** — it never reaches the browser.
- Model: **Llama 3.3 70B** on Groq's free tier, configurable via env vars.

## 🚀 Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and click a cabinet to boot it.

### Enabling the ARCADE ORACLE locally

Copy `.env.example` to `.env.local` and fill in your AWS Bedrock API key (the games work without it; only the Oracle needs it):

```bash
GROQ_API_KEY=your-groq-api-key
GROQ_MODEL=llama-3.3-70b-versatile
```

`.env.local` is gitignored — **never commit your key**.

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |

## 🎯 Controls

**Pac-Man** — Arrow keys / `WASD` to move, `Space` to pause.

**Space Invaders** — `←` `→` / `A` `D` to move, `Space` / `↑` to fire, `P` to pause.

**Tetris** — `←` `→` move, `↓` soft drop, `↑` / `X` rotate CW, `Z` rotate CCW, `Space` hard drop, `C` hold, `P` pause.

**Snake** — Arrow keys / `WASD` to steer, `Space` to pause.

On touch devices, every cabinet shows on-screen controls. Each cabinet also has **SOUND** and **CRT SCANLINES** toggles, and there's a global light/dark theme switch.

## 🏗️ Architecture

Built on the Next.js App Router. Each game is a self-contained module under `src/app/<game>/` following the same three-part pattern; the Oracle adds a client component plus a server route handler.

```
src/app/
├── page.tsx                 # Arcade menu — selects which cabinet to render
├── globals.css              # Shared retro theme, CRT effect, toggle styles
├── theme-toggle.tsx         # Light/dark theme switch
├── api/
│   └── oracle/route.ts      # Server route: calls the Groq API (key stays server-side)
├── oracle/
│   ├── oracle-component.tsx # 'use client' CRT chat UI
│   └── oracle.module.css
├── pacman/
│   ├── pacman-game.ts        # Framework-free Canvas engine (game logic + rendering)
│   ├── pacman-component.tsx  # 'use client' React wrapper: canvas, HUD, controls
│   ├── pacman.module.css     # Cabinet styling
│   └── sound-synth.ts        # Web Audio chiptune synthesizer
├── space-invaders/
├── tetris/
└── snake/                    # (each mirrors the pacman/ layout)
```

**Engine** (`*-game.ts`) — a plain TypeScript class with a uniform API:

```ts
new Engine(canvas, synth, onStatusChange)  // wire up
engine.start() / pause() / togglePause() / resetGame() / destroy()
```

It owns the game state machine, a `requestAnimationFrame` loop with delta-timing, and all canvas drawing. It reports score/lives/state back to React via the `onStatusChange` callback.

**Component** (`*-component.tsx`) — a `'use client'` React component that mounts the canvas, instantiates the engine, mirrors its status into React state for the HUD, and binds keyboard + on-screen controls.

**Sound** (`*-synth.ts`) — a lazily-initialized Web Audio synthesizer (oscillators, gain envelopes, noise buffers). All SFX are generated at runtime; nothing is loaded from disk. Audio resumes on user interaction per browser autoplay policy.

**Oracle** (`api/oracle/route.ts` + `oracle/`) — a server route handler that proxies chat messages to the Groq API, plus a client CRT chat UI. The key lives only on the server.

## ☁️ Deployment (AWS + Terraform)

The app is hosted on an **AWS EC2** instance provisioned with **Terraform** (Infrastructure as Code):

- A `user-data` startup script adds swap, installs **Node 20** and **nginx**, clones this repo, runs `npm ci && npm run build`, and serves the app as a **systemd** service behind an **nginx reverse proxy** (port 80 → 3000).
- The AI API key is injected as a **sensitive Terraform variable** into a protected environment file on the server — kept out of Git.
- `terraform apply` builds the whole stack and outputs the public link.

## 🛠️ Tech Stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack) · [React 19](https://react.dev) · [TypeScript 5](https://www.typescriptlang.org)
- HTML5 Canvas 2D + Web Audio API · CSS Modules
- **Generative AI:** **Groq API** (free tier, open-source Llama models)
- **Hosting:** AWS EC2 + nginx, provisioned with **Terraform**

## ➕ Adding a New Game

1. Create `src/app/<game>/` with an engine, a `'use client'` component, a CSS module, and (optionally) a synth — mirror the Pac-Man / Space Invaders pattern.
2. In `src/app/page.tsx`: import the component, add the id to the `GameId` union, unlock the cabinet card, and render the component when it's the active game.

---

Built for fun. 🎵 Insert coin.
