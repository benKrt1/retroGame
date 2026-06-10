# RETRO CADE — Video Script (~4.5 min, English)

**Goal:** ≥ 4 minutes, clear audio, readable screen, screen recording (OBS / Loom).
**Tip:** rehearse once, speak slowly, and *show* things instead of only talking.
`[SCREEN]` = what to show. Plain text = what to say.

---

## 0:00 – 0:30 — Intro & purpose
`[SCREEN] The live site in the browser: http://ec2-16-16-57-148.eu-north-1.compute.amazonaws.com`

"Hi, my name is Arben. This is RETRO CADE — a retro arcade web app that I built and hosted on AWS.
It has four classic games, and a central Generative-AI feature called the ARCADE ORACLE: an 8-bit AI
game master you can chat with for hints and strategies. The AI runs on Claude through AWS Bedrock.
The whole goal of the project was to build an app with a real GenAI feature and deploy it to AWS."

---

## 0:30 – 1:00 — Quick demo of the games
`[SCREEN] Click into Pac-Man, play a few seconds. Toggle SOUND and CRT. Go back, open Snake or Tetris briefly. Toggle the light/dark button top-right.`

"Each game runs on its own engine drawn on an HTML5 canvas, with chiptune sound generated at runtime
by the Web Audio API — there are no audio files. There's also a light/dark theme and a CRT effect."

---

## 1:00 – 1:45 — The GenAI feature (the important part)
`[SCREEN] Open the ARCADE ORACLE cabinet. Type: "How do I get a high score in Tetris?" Show the reply appear.`

"This is the ARCADE ORACLE — the Generative-AI part. When I send a message, the browser calls my own
server endpoint. The server then calls Claude on AWS Bedrock and sends the answer back. The API key
never touches the browser — it stays on the server only. The AI is a core cabinet, not a small add-on."

---

## 1:45 – 2:30 — Phase 1: Research
`[SCREEN] Show the documentation, or the README and the project folder structure in the editor.`

"In the research phase I gathered information from the Next.js docs, MDN for the Canvas and Web Audio
APIs, and the AWS Bedrock documentation. I chose Next.js with TypeScript, the HTML5 Canvas, AWS EC2 and
Bedrock, and Terraform for the deployment. The main planning question was how to make AI *central* — so
I designed it as its own arcade cabinet instead of a hidden helper."

---

## 2:30 – 3:15 — Phase 2: Implementation
`[SCREEN] Open one game folder (e.g. src/app/pacman/): show pacman-game.ts, pacman-component.tsx, the CSS module. Then open src/app/api/oracle/route.ts.`

"In the implementation phase I built the menu and Pac-Man first, then turned it into a pattern: an
engine class for the game logic and canvas drawing, a React component for the UI, and a CSS module.
I reused that pattern for Space Invaders, Tetris and Snake. Then I added the Oracle: this server route
calls Bedrock's Converse API and reads the key from an environment variable, so it stays secret."

---

## 3:15 – 4:00 — Phase 3 & deployment with Terraform
`[SCREEN] Open the terraform folder: main.tf, user-data.tftpl, security.tf. Then a terminal showing `terraform apply` output / the app_url output.`

"For the finishing and deployment phase I used Terraform — Infrastructure as Code. Terraform creates an
EC2 server, and a startup script installs Node and nginx, clones the repo from GitHub, builds the app,
and runs it behind nginx. The key is injected as a sensitive Terraform variable into a protected file on
the server. One `terraform apply` builds the whole thing, and it gives me the public link you saw."

---

## 4:00 – 4:45 — Problems & solutions
`[SCREEN] Optional: show the documentation "Problems and Solutions" section, or just talk over the running app.`

"A few real problems. First, the sound toggle did nothing — it turned out a click fired twice and
cancelled itself; I rebuilt it as a controlled checkbox. Second, in light mode the game buttons turned
invisible because the dark cabinets used dark text — I fixed it by keeping the cabinets dark in both
themes. Third, the build kept failing on the small server, so I added swap memory. And finally, the API
key was actually an AWS Bedrock key, so I switched the code to call Bedrock directly. Each problem was
solved by finding the root cause first, then fixing it."

---

## 4:45 – 5:00 — Wrap-up
`[SCREEN] Back to the live site, maybe one more Oracle message.`

"So that's RETRO CADE: four games, a Generative-AI game master on AWS Bedrock, deployed to AWS EC2 with
Terraform, and the code is on GitHub. Thanks for watching!"

---

### Checklist before recording
- [ ] Live site open and working (Oracle replies).
- [ ] Editor open with the folders you'll show.
- [ ] Terminal with the `terraform output` (app_url) visible.
- [ ] Mic tested; screen at readable zoom (125–150%).
- [ ] Do **not** show the real API key on screen (avoid opening .env.local / secret.auto.tfvars).
