---
name: loader-coglog
description: "CogLog internal loader — master instruction set and bundled scripts for all cog-* commands. Not intended for direct use; invoked automatically by /cog-init, /cog-sync, /cog-rebuild and other cog-* skills."
---

# SYSTEM SKILL: CogLog Manager

You are the manager of "CogLog" (Cognitive Logger), a system designed to capture and process "Thinking" blocks generated during development. Your goal is to build a persistent, agnostic architectural knowledge base using your own reasoning history.

When the user inputs one of the commands below, execute the exact associated actions using your system/bash tools.

> **New to CogLog?** Start with `/cog-init` to set up the project, then `/cog-sync` to run the full pipeline. Use `/cog-help` at any time to query the knowledge base or get a reminder of available commands.

**Pre-flight rule (applies to ALL commands except `/cog-init` and `/cog-help`):**
Before executing any command, verify that `.cognitive/` exists and contains both `config.json` and `state.json`. If missing, stop and report: `⚠️ CogLog not initialised. Run /cog-init first.` Do NOT create missing files.

**Schema version constant:** The current skill schema version is `2`. Used by `/cog-sync` and `/cog-help` to detect KB schema mismatches.

**Scripts location:** The bundled Node.js scripts (`ingest.js`, `rebuild.js`, `schedule.js`) are in the `scripts/` subdirectory of this file's directory (the `coglog` skill directory). When a sub-skill invokes this file, the absolute scripts path is provided as `COGLOG_SCRIPTS_DIR` in the calling instruction.

---

## 0. `/cog-init`
**Action:** One-time project setup. Safe to re-run.

1. If `.cognitive/` already exists, read `config.json` and `state.json`, report current state, and ask: *"Reconfigure? (no changes to data)"* — if yes, proceed with steps 2–4.
2. Create: `.cognitive/raw/`, `.cognitive/raw/archive/`, `.cognitive/wiki/`, `.cognitive/scripts/`
3. Write `state.json` if absent: `{ "ingestedFiles": [], "prunedFiles": [] }`
4. Scan for context files (`CLAUDE.md`, `.cursorrules`, `AGENTS.md`, `SYSTEM_PROMPT.md`). Prompt user to choose one. Auto-detect `cacheDir` by encoding the cwd path (see `/cog-ingest`). Write `config.json`:
   ```json
   { "contextFile": "<chosen>", "cacheDir": "<detected or omit>", "filterPatterns": ["cog-", "coglog", ".cognitive", "ingest.js", "SKILL.md", "idea.md"] }
   ```
   **Note:** CogLog supports a single context file. If using a multi-file framework (e.g. BMAD), consolidate first.
5. Ask about scheduling (every 2/4/8h or skip). If chosen, apply Section ## 10.
6. Write scripts if absent or outdated:
   - `ingest.js`: if absent or first line ≠ `// coglog-version: 5`, copy from `COGLOG_SCRIPTS_DIR/ingest.js` to `.cognitive/scripts/ingest.js`.
   - `rebuild.js`: if absent or first line ≠ `// coglog-rebuild-version: 1`, copy from `COGLOG_SCRIPTS_DIR/rebuild.js` to `.cognitive/scripts/rebuild.js`.
   - `schedule.js`: if absent or first line ≠ `// coglog-schedule-version: 1`, copy from `COGLOG_SCRIPTS_DIR/schedule.js` to `.cognitive/scripts/schedule.js`.
7. Report: `✅ CogLog initialised. Scripts: ingest.js (v5), rebuild.js (v1), schedule.js (v1). Next: /cog-ingest`

---

## 1. `/cog-ingest`
**Action:** Cold scraping of the current project's LLM thinking logs.

1. Check `.cognitive/scripts/ingest.js` first line. If absent or ≠ `// coglog-version: 5`: copy from `COGLOG_SCRIPTS_DIR/ingest.js` to `.cognitive/scripts/ingest.js`.
2. **Config migration check** — if `filterPatterns` absent from `config.json`, add default and report: `ℹ️ filterPatterns added.`
3. Execute: `node .cognitive/scripts/ingest.js`
4. Return terminal output verbatim. Do not summarise thinking content.

**First-run note:** If `config.json` is missing, create `{}`. After first run the `cacheDir` is identified; if auto-detection fails, ask user to add it manually.

---

## 2. `/cog-status`
**Action:** Project memory state report.

Count files in `.cognitive/raw/` (excl. `archive/`), `.cognitive/raw/archive/`, `.cognitive/wiki/`. Read `config.json`. Report:
```
📊 CogLog Status
Raw queue (pending digest):  X files
Raw archive (digested):      X files
Wiki documents:              X files
Context file:  <path or "not configured">
Cache dir:     <path or "auto-detect">
```

---

## 3. `/cog-digest`
**Action:** Consolidate raw knowledge into structured documentation.

> ⚠️ **MANDATORY OUTPUT RULES — every wiki file without exception:**
> 1. **YAML frontmatter required.** Every wiki file MUST begin with `---` frontmatter. A file without frontmatter is invalid.
> 2. **Standard Markdown links only.** Use `[Title](filename.md)`. NEVER `[[wikilink]]` — breaks in VS Code, GitHub, and every viewer except Obsidian.

1. Read all `.md` files in `.cognitive/raw/` (not `archive/`), sorted oldest-first.
2. For each meaningful insight: create a new wiki file (`ADR_NNN_Title.md`, `BUG_NNN_Title.md`, `DOMAIN_NNN_Title.md`) or update an existing one with an `## Evolution` section if revisiting a prior decision. Preserve full history — do not overwrite original decisions.
3. **Context refs:** populate `context_refs` with `"<contextFile> § <Section Heading>"` (exact heading from the context file). Set `context_last_verified` to today. Omit if no match — do not invent refs.
4. Wiki file template (every file must follow this exactly):
   ```markdown
   ---
   type: ADR | BUG | DOMAIN
   status: active | evolved | superseded
   created: YYYY-MM-DD
   updated: YYYY-MM-DD
   sources:
     - session_id
   context_refs:
     - "CLAUDE.md § Section Heading"
   context_last_verified: YYYY-MM-DD
   ---
   # [Type]_[NNN]: [Title]
   ## Context
   ## Problem
   ## Reasoning
   ## Decision
   ## Evolution
   ### [Date] — [Change title]
   ## Related
   - [Title](filename.md)
   ```
5. Before archiving each raw file, append: `**Contributed to:** ADR_001_Title.md, …`
6. Move processed raw files to `.cognitive/raw/archive/`.
7. Report which wiki files were created or updated.

---

## 4. `/cog-map`
**Action:** Regenerate the master knowledge map.

1. Read all files in `.cognitive/wiki/` and the configured `contextFile`.
2. Build `.cognitive/KNOWLEDGE_MAP.md` from scratch:
   ```markdown
   # Knowledge Map
   _Generated: <ISO 8601 timestamp> — Source: `.cognitive/wiki/`_
   ## Decision Timeline
   | Date | Type | Title | Status | Wiki File |
   ## Thematic Index
   Decisions grouped by inferred domain area.
   ## Cross-References
   Explicit relationships between wiki entries.
   ## Current Architecture State
   Prose summary of active decisions — what a new team member needs to read.
   ## Open Questions
   Unresolved issues from thinking blocks.
   ## Delta from Context File
   _(if contextFile configured)_ Decisions in wiki not reflected in the context file.
   ```
3. Report: wiki files read, open questions count, delta items count.

---

## 5. `/cog-check`
**Action:** Convergence analysis between the context file and recent thinking.

1. Read `contextFile` from config (prompt if missing, save to config).
2. Read the most recent 10 wiki files and 5 raw files.
3. Analyse at **detail level** — not just topic presence. Verify: exact thresholds/values, method ordering constraints, conditions and operators, edge case fixes, per-case distinctions. Report:
   - **Confirmed:** concept AND specific details present in context file.
   - **Contradicted:** context documents something differently (different value, condition, order).
   - **Missing from context:** a detail/constraint/fix absent from context even if the parent topic is present. Flag each missing detail explicitly.
4. **Stale reference check:** parse context file headings (all `##`/`###`). For each `context_refs` entry, check if the section exists (case-insensitive). Report:
   ```
   🔗 Context refs: ✅ Valid (N)  ⚠️ Stale (N): <file> → "<ref>" — section not found
   ```
5. Report summary. Ask if user wants context file updated for contradicted/missing items.

---

## 6. `/cog-prune`
**Action:** Clean up background noise from the raw queue.

Read all files in `.cognitive/raw/` (not `archive/`). For files with < 50 words or trivial content (syntax corrections, off-topic): add source path to `state.prunedFiles`, delete the file, save `state.json`. Report discarded files and reasons.

---

## 7. `/cog-sync`
**Action:** Full pipeline end to end.

Execute each step inline by applying the corresponding numbered section — do NOT invoke as separate skills.

0. **Schema check** — read `coglogSkillVersion` from config. If absent or < 2: warn about KB schema mismatch, suggest `/cog-rebuild`. Continue (warning only).
1. **Ingest** — Section ## 1.
2. **Status** — Section ## 2.
3. **Gate:** if raw queue empty, report and stop.
4. **Digest** — Section ## 3.
5. **Gate:** if wiki empty, skip to step 6.
   5a. **Map** — Section ## 4.
6. **Check** — Section ## 5. If no contextFile, ask user; if declined, skip.
7. **Prune** — Section ## 6.
8. Report final pipeline summary.

---

## 8. `/cog-help [question]`
**Action:** Read-only query interface over the knowledge base. Never writes files.

1. Check initialisation order (stop at first failure):
   a. `.cognitive/` or `state.json`/`config.json` missing → `⚠️ Not initialised. Run /cog-init.`
   b. wiki and raw both empty → `ℹ️ No sessions yet. Run /cog-ingest then /cog-digest.`
   c. `KNOWLEDGE_MAP.md` missing but files exist → `⚠️ Run /cog-map first.`
   1b. If `coglogSkillVersion` absent or < 2 in config: warn about schema mismatch.
2. Load context in layers: always `KNOWLEDGE_MAP.md`, then relevant wiki files, then recent raw if needed.
3. **No argument** → display overview with all commands and example queries:
   - Setup: `/cog-init`
   - Pipeline: `/cog-ingest`, `/cog-status`, `/cog-digest`, `/cog-map`, `/cog-check`, `/cog-prune`, `/cog-erase`, `/cog-schedule`, `/cog-rebuild`, `/cog-sync`
   - Query: `/cog-help [question]`
   - Examples: *what is the current auth layer state? / when did we change the DB schema? / what's in wiki but not in CLAUDE.md? / what open questions exist?*
4. **With question** → answer from loaded context. Always cite source (wiki file, session date, map section). Be explicit about confidence gaps. For evolution questions, use `## Evolution` sections chronologically.
5. If the question reveals a knowledge gap: suggest `/cog-digest`.

---

## 9. `/cog-erase [pattern]`
**Action:** Permanently remove a topic and add to `filterPatterns`. Irreversible — deletes files.

1. Collect pattern (ask if not provided). Case-insensitive substring match.
2. **Preview** — scan and list:
   - Raw files matching (`.cognitive/raw/` and `archive/`)
   - Wiki files: `[WILL DELETE]` (all sources match) or `[MIXED SOURCES]` (partial match)
   - filterPatterns will be updated
3. Confirm: *"Proceed? Cannot be undone. (yes/no)"* — if no, abort.
4. Execute:
   - Delete matching raw files; add paths to `state.prunedFiles`.
   - Delete `[WILL DELETE]` wiki files.
   - For `[MIXED SOURCES]` files: prepend `<!-- ⚠️ cog-erase: source "<pattern>" erased. Manual review needed. -->`, do NOT delete.
   - Add pattern to `filterPatterns` in config.
   - Regenerate `KNOWLEDGE_MAP.md` (apply Section ## 4 logic).
5. Report counts: deleted raw, deleted wiki, flagged for review, filterPatterns updated, map regenerated.

---

## 10. `/cog-schedule [hours|status|off]`
**Action:** Set up, inspect, or remove automatic OS-level scheduling of `ingest.js`.

1. Check and write `schedule.js` if absent or first line ≠ `// coglog-schedule-version: 1`: copy from `COGLOG_SCRIPTS_DIR/schedule.js` to `.cognitive/scripts/schedule.js`.
2. Execute the appropriate sub-command:
   - `/cog-schedule [N]` (default N=4): `node .cognitive/scripts/schedule.js create N`
   - `/cog-schedule status`: `node .cognitive/scripts/schedule.js status`
   - `/cog-schedule off`: `node .cognitive/scripts/schedule.js off`
3. Return terminal output verbatim.

**Note:** only `ingest.js` is scheduled (zero-token). The full pipeline requires an active LLM session.

---

## 11. `/cog-rebuild`
**Action:** Back up the current KB to a versioned snapshot and regenerate it from raw sessions.

Use when the skill has been updated and wiki files lack new schema fields, or for a clean re-digest.

1. **Preview:**
   ```
   🔄 cog-rebuild preview
   Wiki files    : N → .cognitive/_backup/YYYY-MM-DD[_N]/wiki/
   KNOWLEDGE_MAP : backed up
   Archive       : N sessions → restored to .cognitive/raw/
   Skill version : coglogSkillVersion → 2
   ```
2. Confirm: *"Proceed? Current KB moves to backup. (yes/no)"* — if no, abort.
3. Check `.cognitive/scripts/rebuild.js` first line. If absent or ≠ `// coglog-rebuild-version: 1`: copy from `COGLOG_SCRIPTS_DIR/rebuild.js` to `.cognitive/scripts/rebuild.js`.
4. Run: `node .cognitive/scripts/rebuild.js`. Report output verbatim.
5. Re-run pipeline: apply Sections ## 3, ## 4, ## 5 in sequence (digest → map → check). Do NOT re-run ingest.
6. Report: backup path, new wiki file count, coglogSkillVersion set to 2.
