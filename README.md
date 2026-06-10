# 🕹️ RETRO CADE

A browser-based retro arcade built with **Next.js** + **TypeScript**. Each game runs on a hand-written HTML5 Canvas engine with a chiptune **Web Audio** soundtrack and a CRT-styled cabinet UI — no game frameworks, no audio files.

> `> SELECT A CABINET TO BOOT <`

## 🎮 Games

| Game | Status | Highlights |
|------|--------|-----------|
| 🟡 **Pac-Man** | ✅ Playable | Classic maze, dots & power pellets, four ghosts with scatter/chase modes, intro theme |
| 👾 **Space Invaders** | ✅ Playable | Marching invader grid that speeds up, destructible shields, UFO bonus, waves, high score, the iconic 4-note march beat |
| 🧱 **Tetris** | 🔒 Coming soon | — |
| 🐍 **Snake** | 🔒 Coming soon | Engine in progress |

## 🚀 Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and click a cabinet to boot it.

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

On touch devices, every cabinet shows on-screen controls. Each cabinet also has **SOUND** and **CRT SCANLINES** toggles.

## 🏗️ Architecture

Built on the Next.js App Router. Each game is a self-contained module under `src/app/<game>/` following the same three-part pattern:

```
src/app/
├── page.tsx                 # Arcade menu — selects which cabinet to render
├── globals.css              # Shared retro theme, CRT effect, toggle styles
├── pacman/
│   ├── pacman-game.ts        # Framework-free Canvas engine (game logic + rendering)
│   ├── pacman-component.tsx  # 'use client' React wrapper: canvas, HUD, controls
│   ├── pacman.module.css     # Cabinet styling
│   └── sound-synth.ts        # Web Audio chiptune synthesizer
└── space-invaders/
    ├── space-invaders-game.ts
    ├── space-invaders-component.tsx
    ├── space-invaders.module.css
    └── invader-synth.ts
```

**Engine** (`*-game.ts`) — a plain TypeScript class with a uniform API:

```ts
new Engine(canvas, synth, onStatusChange)  // wire up
engine.start() / pause() / togglePause() / resetGame() / destroy()
```

It owns the game state machine, a `requestAnimationFrame` loop with delta-timing, and all canvas drawing. It reports score/lives/state back to React via the `onStatusChange` callback.

**Component** (`*-component.tsx`) — a `'use client'` React component that mounts the canvas, instantiates the engine, mirrors its status into React state for the HUD, and binds keyboard + on-screen controls.

**Sound** (`*-synth.ts`) — a lazily-initialized Web Audio synthesizer (oscillators, gain envelopes, noise buffers). All SFX are generated at runtime; nothing is loaded from disk. Audio resumes on user interaction per browser autoplay policy.

## 🛠️ Tech Stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack)
- [React 19](https://react.dev)
- [TypeScript 5](https://www.typescriptlang.org)
- HTML5 Canvas 2D + Web Audio API
- CSS Modules

## ➕ Adding a New Game

1. Create `src/app/<game>/` with an engine, a `'use client'` component, a CSS module, and (optionally) a synth — mirror the Pac-Man / Space Invaders pattern.
2. In `src/app/page.tsx`: import the component, add the id to the `GameId` union, unlock the cabinet card, and render the component when it's the active game.

---

Built for fun. 🎵 Insert coin.
