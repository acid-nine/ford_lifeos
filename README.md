# FordOS — a personal Life OS

A dark, glassmorphic desktop-style workspace for your tasks, schedule, knowledge — and now a local AI layer with agents that can actually change your data. Runs on your machine; nothing leaves it.

## Run it

```bash
npm install
npm run dev
```

This starts two services together:

- **Web** — Vite on `http://localhost:5173`
- **API** — Node on `http://127.0.0.1:8787` (proxied as `/api` by Vite)

For production / phone access:

```bash
npm run serve
```

This builds the app and serves both the UI and API from `http://0.0.0.0:8787` on one port. On first start it prints an **access code** and saves it in `data/access-code.json`. Open `http://<your-LAN-IP>:8787` on your phone, enter that code once, and you get the same interface with full agent control, briefs, chat and shared files. The LAN URLs and code are also shown in **Settings → Remote access**.

`npm run dev` keeps the split Vite (5173) + API (8787) setup for local development.

## What's in it

### Desktop & apps
- **OS shell** — draggable/resizable/minimizable windows, dock, live status bar, wallpapers and accent colors. Windows use a macOS-style **genie animation** when minimizing into (or restoring from) their dock icon, plus springy open/maximize, staggered command results and springy dock/modal motion. Settings → Reduce motion disables all of it.
- **Overview** — daily stats, completion ring, today's focus list, schedule glance.
- **Tasks & Projects** — smart lists, projects, priorities, due dates, list + drag-and-drop kanban.
- **Calendar** — month grid, mini-calendar, day agenda, colored time-blocked events.
- **Notes** — searchable notes, tags, pinning, Markdown write/preview.
- **Command bar** — `Ctrl/⌘ + K` to jump anywhere or create something.

### AI Studio (the agentic layer)
- **Chat** — streaming chat with any discovered engine/model.
- **Agents** — define autonomous processes with instructions, an engine + model, a set of tools, and a trigger. Agents can create/complete tasks, add events and notes, append to notes, read your day, and control VRAM. Runs are logged step by step.
- **Scheduled automations** — interval or cron triggers; the API scheduler runs enabled agents in the background every 20 seconds.
- **Engines** — auto-discovery of Ollama, llama.cpp, Hermes, OpenCode, and any OpenAI-compatible endpoint. Shows model counts, loaded/GGUF models, GPU info from VRAM OPS, with a shortcut into VRAM Control.
- **Runs** — full history with tool calls and results.

### Agent Core
A JARVIS-style neural command center (Three.js + UnrealBloomPass) that visualizes your agents:
- **3D core** — 500-node neural web with dynamic glowing connections, four tilted dashed orbital rings, noise-driven particle dust, and orbiting sub-agent nodes for an agent's tools.
- **State-driven visuals** — IDLE, THINKING (accelerated spin + amber flashes), EXECUTING TOOL (spawns orbiting nodes), SPEAKING (waveform displacement). Live agent runs drive these states automatically through SSE.
- **Per-agent visuals** — every agent has its own core geometry (icosahedron, dodecahedron, octahedron, torus knot, sphere, helix, nebula), hue, ring count and speed, editable in AI Studio's agent editor or directly in Agent Core. The roster shows each agent's shape and color.
- **Watch a run** — a running agent shows a live banner; "Watch live" expands the core and opens a step-by-step run feed (assistant text, tool calls and results, streamed output for delegated Hermes/OpenCode runs). The result area scrolls. Recent runs are clickable for review. `Esc` closes watch mode.
- **Briefs** — successful runs are distilled into clean, self-contained reports (agents are instructed to end with a `## FINAL BRIEF` section). The right panel lists recent briefs; the **Brief library** opens a searchable list plus a scrollable Markdown reader. Terminal: `briefs`, `brief [name]`.
- **Personalities** — JARVIS (amber, harmonic motion) and ULTRON (cyan, twitchy motion).
- **HUD** — corner brackets, FPS/node/link telemetry, VRAM bar, tokens/sec, active tools, recent runs, and a working command terminal (`help`, `run <agent>`, `focus <agent>`, `state …`, `mode …`, `status`).
- Tune the visuals via `BLOOM_STRENGTH`, `PARTICLE_COUNT`, and `HUD_HUE` at the top of `src/apps/AgentCore.jsx`.

### Google Drive cloud backup
- **Cloud Backup app** — takes a full snapshot (FordOS state, agents, briefs) and uploads it as a JSON file to a folder in your own Google Drive.
- **Apps Script bridge** — `google/Code.gs` is a small script you paste into [script.google.com](https://script.google.com). Set a `FORDOS_SECRET` script property, deploy it as a **Web app** (execute as you, access "anyone with the link"), then paste its URL + secret into Cloud Backup → Setup. FordOS never sees your Google password, and the URL/secret are stored locally in `data/google.json` (gitignored).
- **Restore** any remote backup to replace current tasks/events/notes/agents/briefs; download a local copy; delete remote files. Optional auto-backup interval is checked every minute.

### Remote access & shared files
- **One-port server** (`npm run serve`) serves the built web app and the API together on port 8787, bound to all interfaces.
- **Access code** — generated on first run and required for every `/api` call; a phone remembers it after one login. Set `accessCode` in `server/config.json` to choose your own.
- **Shared Files app** — upload/download/delete files in `data/shared`; the same folder is writable directly from the desktop. Files are served with the access token in the URL.
- **Mobile layout** — windows go fullscreen on narrow screens, dock scales down, and the Agent Core watch feed stacks under the 3D core.

For internet access use a VPN or tunnel (Tailscale/Cloudflared) rather than port-forwarding. The access code is a simple LAN gate, not a full auth system.

### VRAM Control
A dedicated app backed by the VRAM OPS service on `:8765`:
- **Overview** — live GPU readings (VRAM used/total, temperature, load, power, fan, clocks), a usage sparkline, resident models, one-click unload-all, and Ollama pull progress.
- **Ollama models** — installed model list with residency state; load with a chosen **context size** (4K → 262K) and keep-alive, unload individually, or pull a model by name.
- **llama.cpp** — GGUF model list, context/KV-cache/MoE controls, VRAM fit planning before launch, and server start/stop/forget.
- **Hugging Face** — model search (GGUF filter, sorting), browse a repo's GGUF files, stream a download into `C:\llama.cpp` or the Hermes model folder with progress/cancel, or pull via Ollama.
- **Downloads** — live progress, speed and cancellation for GGUF downloads.
- **Delegation** — agents can run through the installed `hermes` and `opencode` CLIs instead of a direct model endpoint.

### Engines discovered on this machine
| Engine | How it's found | Models |
|---|---|---|
| Ollama | `GET /api/tags` on `127.0.0.1:11434` | 12 local models |
| llama.cpp | Running `/v1` servers + GGUF scan of `C:\llama.cpp` and Hermes models | 8 GGUF files, launchable via VRAM OPS on `:8765` |
| Hermes | `config.yaml` + `provider_models_cache.json` + CLI at `~\AppData\Local\hermes\bin` | configured default + cached providers |
| OpenCode | `~\.config\opencode\opencode.json` + `opencode models` via `opencode-cli.exe` | configured Ollama models plus the full CLI catalog, including all 9 free-tier models (marked `FREE TIER` in the UI) |
| Generic | `server/config.json` → `genericEndpoints` | any `/v1/models` endpoint |

To add another OpenAI-compatible engine (LM Studio, vLLM, a new llama.cpp port), edit `server/config.json`.

## Data

FordOS state lives in `data/fordos-state.json` on the server, mirrored in browser `localStorage`. Agents and scheduled runs act on that same server-side state, and the web app syncs via polling + SSE. Agents/runs are stored in `data/fordos-agents.json`.

Settings → **Your data** exports/imports a JSON backup of the FordOS data. Engine and agent config stay in `server/config.json` and `data/fordos-agents.json`.

## Stack

React 19 + Vite 7, `lucide-react`, hand-written CSS. The API is dependency-free Node (`node:http`, `fetch`, `child_process`). No external services or API keys required.
