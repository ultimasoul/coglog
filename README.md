# CogLog

**Persistent knowledge base from LLM thinking tokens.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Agent Skills](https://img.shields.io/badge/Agent_Skills-compatible-blue)](https://agentskills.io)
[![Install](https://img.shields.io/badge/Install-npx_skills_add-green)](#install)

During development with LLMs, the model generates thousands of "thinking" tokens containing real engineering value: architectural decisions, bug analyses, domain discoveries. Clients discard or hide this data. CogLog captures it, structures it, and builds an automated project memory that grows with every session.

---

## What's in this repo

### `skills/loader-coglog/` — Master instruction set + scripts
Full implementation: step-by-step instructions for every command, templates, and execution rules. Also contains the bundled Node.js scripts (`ingest.js`, `rebuild.js`, `schedule.js`) in `skills/loader-coglog/scripts/`. Not intended for direct use — invoked automatically by all `cog-*` skills.

### `skills/cog-*/` — Individual commands (12 total)
Each command is a separate skill with its own description, making it discoverable in autocomplete and invocable directly as `/cog-*`.

### `idea.md` — Architecture & Philosophy
The manifesto: vision, design principles, and the full command suite at a conceptual level.

---

## Commands

Three commands cover 90% of usage:

| Command | When to use |
|---|---|
| `/cog-init` | Once per project — sets up `.cognitive/`, config, and scripts |
| `/cog-sync` | Regularly — runs the full pipeline end to end |
| `/cog-help` | Any time — query the knowledge base in natural language |

Everything else is available when you need finer control:

**Pipeline** (what `/cog-sync` runs internally)

| Command | Description |
|---|---|
| `/cog-ingest` | Zero-token scrape of thinking blocks from the session cache |
| `/cog-status` | Raw queue, wiki file count, and config state |
| `/cog-digest` | Structure raw sessions into wiki documents (ADRs, Bug post-mortems, Domain logic) |
| `/cog-map` | Regenerate the master knowledge map (`KNOWLEDGE_MAP.md`) |
| `/cog-check` | Compare the context file against recent thinking — detect drift |
| `/cog-prune` | Remove low-value noise from the raw queue |

**Automation & maintenance**

| Command | Description |
|---|---|
| `/cog-schedule` | Set up OS-native automatic scheduling of `ingest.js` |
| `/cog-rebuild` | Back up the current KB to a versioned snapshot and regenerate from raw sessions |
| `/cog-erase` | Permanently remove a topic from the knowledge base |

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
