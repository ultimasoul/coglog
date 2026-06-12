# CogLog (Cognitive Logger) - Idea File

## Vision
During standard development with LLMs, the model generates thousands of "Thinking" tokens. These tokens contain the actual engineering value: architectural exploration, bug analysis, decision trees, and domain discoveries.
Currently, clients lose or hide this data. CogLog transforms the LLM from a "volatile interlocutor" to a "persistent knowledge generator". By saving and structuring these thought processes, CogLog builds an automated "Project Memory" that can be used for human reference, team onboarding, or as the foundation for downstream tools like Knowledge Graphs, RAG systems, and Markdown wikis.

## Design Principles

### Project-Scoped Ingestion
Ingest operates **only on the current project's cache**, not on all LLM conversations across all projects. This is the critical boundary: a project's knowledge base must reflect that project's reasoning history only.

### Temporal Awareness
Raw logs must carry timestamps so the knowledge base has a clear timeline. An architectural decision from session 1 that was revised in session 5 must be traceable as such. Without dates, it is impossible to know if a reasoning block reflects the current state of thinking or an abandoned approach.

### Context Anchoring
Every ingested thinking block is anchored to the **user's question** that triggered it. Without the question, the thought has no frame of reference — it is impossible to understand what problem was being reasoned about.

### Evolutionary Narrative
The knowledge base is not a snapshot — it is the story of how the project reached its current state. A bug fix that modified a threshold, an architectural decision that replaced an earlier one, a domain insight that clarified a constraint: each entry contributes to a timeline that explains *why* the context file says what it says today. Reading the knowledge base chronologically should answer the question "how did we get here?" for any aspect of the system.

This principle drives two concrete behaviours: wiki entries preserve the full history (original decision + all evolutions, never overwrite); and wiki entries carry explicit `context_refs` pointing to the sections of the project context file they relate to, together with a `context_last_verified` date. This makes the connection between historical reasoning and current documentation explicit and auditable — and enables automated drift detection when the context file evolves.

### LLM Agnosticism
CogLog is designed to be agnostic to the underlying LLM. The ingestion script locates session files via a configurable cache path (`cacheDir` in `config.json`) and processes them through pluggable parsers. Any LLM tool that stores session data locally in a structured format can be supported.

### Cross-Platform Paths
All path operations must use platform-aware libraries (e.g. Node.js `path` and `os` modules) to ensure correct behaviour on Windows, macOS, and Linux.

---

## The Architecture & Command Suite

The system operates in distinct phases, triggered by specific commands to manage token usage and context windows efficiently.

### Phase 0: Initialisation — `/cog-init`
**One-time setup per project.** Creates the `.cognitive/` directory structure, writes `state.json` and `config.json`, and prompts the user for the project context file (e.g. a instructions or rules file). Safe to re-run: if the structure already exists, it reports the current config without overwriting anything. Running `cog-init` explicitly before any other command ensures every subsequent step has a valid, explicit configuration rather than relying on implicit defaults.

### Phase 1: Cold Scraping — `/cog-ingest`
**Zero-token phase.** Extracts knowledge without consuming LLM generation tokens.

- Reads `config.json` to find the project-specific session cache folder. On first run, attempts auto-detection from the current working directory.
- **Script versioning**: the ingestion script carries a version header. On each `/cog-ingest` call, the skill compares the installed version with the expected one. If absent or outdated, the script is rewritten before execution. This ensures the script stays in sync with the skill without requiring manual deletion.
- **Size-based state tracking**: `state.json` tracks each ingested file by size rather than just path. If a file has grown since last ingest (session still in progress), the old raw file is deleted and the session is re-ingested in full. This makes `/cog-ingest` safe to run at any time, including mid-session.
- Scans **only** the current project's session files (including any subagent or parallel agent files within the same session).
- For each unprocessed session, extracts: the **user question**, the **thinking blocks**, and the **assistant's final response** (abbreviated), all with **timestamps**.
- Saves each session as a structured Markdown file in `.cognitive/raw/`.
- Tracks processed files in `state.json` under `ingestedFiles` to avoid reprocessing.
- Tracks pruned files in `state.json` under `prunedFiles` so pruned sessions are never re-ingested.
- **filterPatterns**: `config.json` can specify a list of case-insensitive substring patterns. Any exchange whose user message matches a pattern is excluded from the raw output — the session is recorded in `state.json` with `filtered: true` and no raw file is written. This prevents meta-conversations about CogLog itself from polluting the knowledge base. Default patterns are written by `cog-init`; use `/cog-erase` to add new ones automatically.

### Phase 2: Maintenance — `/cog-status`
Quick report on the current state of the knowledge base: raw files pending digest, wiki files produced, config status, and whether the context file is linked.

### Phase 3: Semantic Digest — `/cog-digest`
**LLM processing phase.** Synthesises raw knowledge into structured, durable documentation.

- Reads unprocessed files from `.cognitive/raw/`.
- Extracts only: architectural decisions, bug discoveries, edge cases, and domain logic.
- Critically: **traces architectural evolution** — if an earlier session made a decision that a later session revised, the wiki entry must capture both the original decision and the reason it changed, with dates.
- Output format in `.cognitive/wiki/`: `ADR_NNN_Title.md`, `BUG_NNN_Title.md`, `DOMAIN_NNN_Title.md`, each with YAML frontmatter (`sources`, `status`, `created`, `updated`, `context_refs`, `context_last_verified`) and sections: *Context*, *Problem*, *Reasoning*, *Decision*, *Evolution* (when applicable). `context_refs` lists the sections of the project context file this entry relates to (e.g. `"CLAUDE.md § Image Pipeline — Case B"`); `context_last_verified` records when those references were last confirmed as still valid.
- **Bidirectional traceability**: before moving a raw file to `archive/`, appends a `contributed_to` line listing the wiki files it generated. This creates an explicit link in both directions: wiki → raw sessions, raw session → wiki entries.
- Moves processed raw files to `.cognitive/raw/archive/`.

### Phase 4: Knowledge Map — `/cog-map`
**Synthesis phase.** Produces a single navigable document that represents the current state of the entire knowledge base.

Unlike digest (which is atomic and bottom-up: one session → one wiki entry), `/cog-map` is holistic and top-down: it reads *all* wiki files together and produces a coherent narrative. This is the "image on the box" — the document a new collaborator (human or LLM) reads first to understand the project's reasoning history without reading every individual ADR.

`KNOWLEDGE_MAP.md` is written to `.cognitive/` and contains:
- **Decision timeline**: all wiki entries in chronological order with status (active / evolved / superseded)
- **Thematic index**: decisions grouped by area (e.g., "Database", "Auth", "API") with links to wiki files
- **Cross-references**: explicit links between related or conflicting ADRs
- **Current architecture state**: a prose summary of *currently active* decisions only (excluding superseded ones)
- **Open questions**: thinking blocks that raised unresolved issues without a formal decision
- **Delta from context file**: decisions present in the knowledge base but absent from the project context file

`KNOWLEDGE_MAP.md` is **regenerated in full on each run** — it is a derived document, not an append log. The source of truth remains the individual wiki files.

### Phase 5: Context Check — `/cog-check`
**Convergence analysis.** Compares the project context file against the thinking in recent sessions to detect drift.

- Reads the configured context file (stored in `config.json`; asked on first run).
- Reads the most recent wiki files and/or recent raw files.
- Reports: which sections of the context file are confirmed by recent thinking, which are contradicted, and which topics in recent thinking are absent from the context file.
- **Stale reference check**: for each wiki file carrying `context_refs`, verifies that the referenced section headings still exist in the context file. Reports any references pointing to sections that have been renamed or removed — these signal that the context file has evolved in a way that may have left the knowledge base partially disconnected.
- Offers to update the context file with the detected discrepancies.

This command only makes sense with temporal awareness: a thinking trajectory changes over time, and the context file should reflect the **current** state, not the initial one.

### Phase 6: Pruning — `/cog-prune`
Removes low-value noise from the raw queue.

- Reads files in `.cognitive/raw/`.
- Permanently deletes files that contain only trivial content (very short, only syntax corrections, etc.).
- **Adds deleted files to `prunedFiles` in `state.json`** so they are never re-ingested.
- Reports which files were discarded.

### Phase 7: Full Pipeline — `/cog-sync`
Convenience command that runs the full pipeline in sequence: `ingest → status → digest → map → check → prune`.

### Phase 8: Knowledge Query — `/cog-help`
**Query layer.** The only purely read-only command in the suite — it never writes or modifies files.

This is the command that makes the knowledge base *useful in practice*. Without it, the knowledge base is a filing cabinet: well-organised but requiring manual navigation. With it, the user can query the accumulated project reasoning in natural language, from a high-level "what's the current state of the auth layer?" to a specific "when did we decide to stop using X and why?".

`KNOWLEDGE_MAP.md` is the **primary entry point**: `cog-help` loads it first as a fast index, then drills down into individual wiki files or recent raw sessions only when the question requires more depth. This keeps context usage efficient — the map is designed precisely for this role.

**What it can answer:**
- *System questions*: commands, pipeline, how the system works
- *Architecture queries*: current state of any component, active decisions
- *Timeline queries*: what changed, when, and why (leveraging Evolution sections)
- *Open questions*: unresolved issues raised in thinking but not yet decided
- *Session queries*: what was discussed recently, what triggered a given decision
- *Delta queries*: what's in the knowledge base but not in the context file

**Architectural distinction**: `cog-help` is **not part of `cog-sync`**. Pipeline commands are productive (they write, move, generate). `cog-help` is interrogative. Mixing them would break the interactive nature of the query interface.

### Phase 9: Intentional Erasure — `/cog-erase [pattern]`
**Destructive, irreversible.** Permanently removes a topic from the knowledge base and prevents future re-ingestion of matching sessions.

This command exists for intentional topic removal — for example, meta-conversations about CogLog itself that were ingested before filterPatterns were configured, confidential content, or off-topic sessions that should not persist. It is not a cleanup tool for low-value noise (use `cog-prune` for that).

Behaviour:
- Deletes matching raw files (both queue and archive) and records them in `prunedFiles` to block re-ingestion.
- Deletes wiki files whose **all** sources matched the pattern.
- **Flags but does not auto-edit** wiki files with mixed sources (some sources match, some don't) — these are marked with a warning comment for manual review, since automatic partial deletion risks hallucination.
- Adds the pattern to `filterPatterns` in `config.json` so future sessions matching it are silently excluded at ingest time.
- Regenerates `KNOWLEDGE_MAP.md` from surviving wiki files.

The safety gate is an explicit preview + confirmation step before any deletion occurs.

### Phase 10: Automatic Scheduling — `/cog-schedule`
**OS-native scheduling of the ingest script.** Sets up, inspects, or removes a recurring task that runs the zero-token ingest script automatically, without requiring an active LLM session.

The command detects the platform (Windows / macOS / Linux) using shell built-ins and registers the appropriate native task: Windows Task Scheduler, macOS launchd, or Linux crontab. Each project gets its own uniquely-named task so multiple CogLog projects coexist independently.

Sub-commands: `/cog-schedule [N]` (create/update, default 4 hours), `/cog-schedule status`, `/cog-schedule off`. Schedule metadata is stored in `config.json` for fast status queries without hitting the OS scheduler every time.

`cog-init` offers this as an optional step during setup. **This is the recommended safeguard against session data loss** — a scheduled ingest running every few hours makes any LLM-side retention window operationally irrelevant.

### Phase 11: Knowledge Base Rebuild — `/cog-rebuild`
**Versioned reset with full history preservation.** Regenerates the entire knowledge base from the original raw sessions using the current skill logic and schema.

Unlike a destructive reset, `/cog-rebuild` never discards anything: existing wiki files and `KNOWLEDGE_MAP.md` are moved to `.cognitive/_backup/YYYY-MM-DD[_N]/` before the re-digest. Multiple rebuilds on the same day produce `_backup/2026-06-12/`, `_backup/2026-06-12_2/`, etc. This makes the rebuild safe and reversible.

The primary use case is a **schema upgrade**: when the skill is updated and existing wiki files lack new frontmatter fields (e.g. `context_refs`), a rebuild re-digests all raw sessions with the current schema. The skill version is tracked as `coglogSkillVersion` in `config.json`; `/cog-sync` and `/cog-help` report a warning when the stored version is below the expected one, and suggest running `/cog-rebuild`.

File operations (backup, clear wiki, restore archive sessions) are handled by a zero-LLM script (`rebuild.js`) written during `cog-init` alongside `ingest.js`. The LLM is involved only for the subsequent digest → map → check pipeline.

---

## A Note on Automation

The ingest script has no LLM dependency — it can be triggered by any mechanism the user already has available. There is no prescribed approach; the right choice depends on the project and tooling ecosystem.

Common patterns, in increasing order of automation:
- **Manual**: run `/cog-ingest` explicitly at the start or end of a work session.
- **`/cog-schedule`**: use the built-in OS scheduling command (recommended — cross-platform, survives restarts).
- **OS-level cron / Task Scheduler**: equivalent to `/cog-schedule`, but configured manually.
- **Git pre-commit hook**: add the ingest script to `.git/hooks/pre-commit` for a natural, commit-aligned trigger.

Two-tier frequency is recommended: run **ingest alone** as often as convenient (every 2–4 hours is fine — it is cheap I/O with no token cost); run the **full pipeline** (`digest`, `map`, `check`) sparingly, once a day or before a significant session, since those commands consume LLM tokens.

**Automating ingest is the single most effective safeguard against data loss.** A scheduled ingest running at least daily makes any LLM-side session retention window irrelevant in practice — sessions are captured long before they expire.

## A Note on Session File Retention

Some LLM tools automatically delete local session files after a retention period, silently and permanently, with no recovery path. This makes ingest frequency operationally important: **if a session is not ingested before the retention window expires, the thinking it contains is lost forever.**

There are three approaches to managing this risk, each with trade-offs:

| Approach | Benefit | Risk |
|---|---|---|
| Rely on default retention | Disk stays clean automatically | Sessions expire silently if ingest cadence is too low |
| Extend retention period | More safety margin for infrequent ingest | Session files accumulate on disk |
| Automate ingest | Retention window becomes irrelevant | Requires one-time setup |

**Recommendation**: automate ingest via `/cog-schedule` and leave the LLM tool's retention at its default. The implementation skill documents the specific retention settings and workarounds for each supported LLM tool.

---

## Directory Structure

```
/project-root
└── .cognitive/
    ├── raw/                # Per-session structured logs (user question + thinking + output)
    │   └── archive/        # Processed sessions (with contributed_to appended) moved here after digest
    ├── wiki/               # Structured Markdown documents (ADRs, Bug Post-Mortems, Domain Logic)
    │                       # Each file has YAML frontmatter: sources, status, created, updated
    ├── KNOWLEDGE_MAP.md    # Master synthesis: timeline, thematic index, current state, open questions
    ├── scripts/            # Auto-generated ingestion scripts
    ├── _backup/            # Versioned snapshots created by /cog-rebuild (YYYY-MM-DD[_N]/)
    │   └── 2026-06-12/     # Each snapshot contains wiki/ subfolder + KNOWLEDGE_MAP.md
    ├── config.json         # User config: contextFile, cacheDir, filterPatterns, schedule, coglogSkillVersion
    └── state.json          # Tracks ingestedFiles and prunedFiles to avoid reprocessing
```

## Raw File Format (per session)

```markdown
# Raw Cognitive Log

**Source:** `path/to/session.jsonl`
**Session ID:** <uuid>
**Ingested:** <ISO 8601 timestamp with time>

---

### <human-readable timestamp>

**User:** <exact user question>

> **[Thinking]**
> <thinking block content>

**Assistant Output (summary):**
<first 500 chars of final response>

---
```
