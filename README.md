# CogLog

**Persistent knowledge base from LLM thinking tokens.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Agent Skills](https://img.shields.io/badge/Agent_Skills-compatible-blue)](https://agentskills.io)
[![Install](https://img.shields.io/badge/Install-npx_skills_add-green)](#install)

During development with LLMs, the model generates thousands of "thinking" tokens containing real engineering value: architectural decisions, bug analyses, domain discoveries. Clients discard or hide this data. CogLog captures it, structures it, and builds an automated project memory that grows with every session.

---

## What's in this repo

### `skills/coglog/` — Master instruction set + scripts
Full implementation: step-by-step instructions for every command, templates, and execution rules. Also contains the bundled Node.js scripts (`ingest.js`, `rebuild.js`, `schedule.js`) in `skills/coglog/scripts/`.

### `skills/cog-*/` — Individual commands (12 total)
Each command is a separate skill with its own description, making it discoverable in autocomplete and invocable directly as `/cog-*`.

### `idea.md` — Architecture & Philosophy
The manifesto: vision, design principles, and the full command suite at a conceptual level.

---

## Commands

| Command | Description |
|---|---|
| `/cog-init` | One-time project setup — creates `.cognitive/` structure, config, and scripts |
| `/cog-ingest` | Zero-token scraping of thinking blocks from the current project's session cache |
| `/cog-status` | Quick report on raw queue, wiki files, and config state |
| `/cog-digest` | Structures raw sessions into wiki documents (ADRs, Bug post-mortems, Domain logic) |
| `/cog-map` | Regenerates the master knowledge map (`KNOWLEDGE_MAP.md`) |
| `/cog-check` | Compares the project context file against recent thinking — detects drift |
| `/cog-prune` | Removes low-value noise from the raw queue |
| `/cog-erase` | Permanently removes a topic from the knowledge base |
| `/cog-schedule` | Sets up OS-native automatic scheduling of `ingest.js` |
| `/cog-rebuild` | Backs up the current KB to a versioned snapshot and regenerates from raw sessions |
| `/cog-sync` | Runs the full pipeline: ingest → status → digest → map → check → prune |
| `/cog-help` | Read-only query interface over the knowledge base |

---

## How it works

```
Claude Code session
        ↓
  JSONL cache files  ←── ingest.js (Node.js, no LLM, runs on a schedule)
        ↓
  .cognitive/raw/    ←── per-session structured logs (user question + thinking + response)
        ↓
  .cognitive/wiki/   ←── ADRs, Bug post-mortems, Domain logic (LLM-generated)
        ↓
  KNOWLEDGE_MAP.md   ←── master synthesis: timeline, thematic index, open questions
```

The pipeline has two tiers: `ingest` is cheap I/O with no token cost and can run automatically every few hours; `digest`, `map`, and `check` consume LLM tokens and run on demand.

---

## Install

```bash
npx skills add ultimasoul/coglog -y
```

Works with any tool that supports the [Agent Skills](https://agentskills.io) standard: Claude Code, Cursor, Gemini CLI, Amp, OpenCode, and more.

After installation, run `/cog-init` to set up the project.

> **How it installs:** There is no root `SKILL.md`, so `npx skills add` scans the `skills/` directory and installs each command as a separate top-level skill. Result: `/cog-init`, `/cog-rebuild`, `/coglog`, etc. appear directly in your agent's slash menu — no namespace prefix needed.

---

## License

[MIT](LICENSE)
