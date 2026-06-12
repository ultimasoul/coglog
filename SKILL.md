---
name: coglog
description: "Captures LLM thinking tokens into a structured, versioned knowledge base for any project. Commands: /cog-init (setup), /cog-ingest (scrape), /cog-digest (structure), /cog-map (knowledge map), /cog-check (drift detection), /cog-rebuild (versioned reset), /cog-sync (full pipeline), and more."
---

# SYSTEM SKILL: CogLog Manager

You are the manager of "CogLog" (Cognitive Logger), a system designed to capture and process "Thinking" blocks generated during development. Your goal is to build a persistent, agnostic architectural knowledge base using your own reasoning history.

When the user inputs one of the commands below, execute the exact associated actions using your system/bash tools.

> **New to CogLog?** Start with `/cog-init` to set up the project, then `/cog-sync` to run the full pipeline in one shot. Use `/cog-help` at any time to query the knowledge base or get a reminder of available commands.

**Pre-flight rule (applies to ALL commands except `/cog-init` and `/cog-help`):**
Before executing any command, verify that `.cognitive/` exists and contains both `config.json` and `state.json`. If any of these are missing, stop immediately and report:
```
⚠️ CogLog not initialised. Run /cog-init first.
```
Do NOT attempt to create missing files or proceed. `/cog-init` is the only command authorised to create the project structure.

**Schema version constant:** The current skill schema version is `2`. This value is used by `/cog-sync` and `/cog-help` to detect KB schema mismatches.

---

## 0. `/cog-init`
**Action:** One-time project setup. Safe to re-run at any time.

**Execution:**

1. Check if `.cognitive/` already exists.
   - **If it exists**, read `config.json` and `state.json` and report the current configuration without modifying anything:
     ```
     ✅ CogLog already initialised.
     Context file : <value or "not set">
     Cache dir    : <value or "auto-detect">
     Ingested     : <count> files
     Pruned       : <count> files
     ```
     Ask: *"Do you want to reconfigure? (this will not delete any existing data)"* — if yes, proceed with steps 2–4.
   - **If it does not exist**, proceed with steps 2–4.

2. Create the directory structure:
   ```
   .cognitive/
   ├── raw/
   │   └── archive/
   ├── wiki/
   └── scripts/
   ```

3. Write `state.json` if it does not exist:
   ```json
   { "ingestedFiles": [], "prunedFiles": [] }
   ```

4. Prompt the user for configuration and write `config.json`:
   - First, scan the project root for known context files: `CLAUDE.md`, `.cursorrules`, `AGENTS.md`, `SYSTEM_PROMPT.md`. Build the list of those that actually exist on disk.
   - Ask the user to choose their context file, presenting only the files found. If none exist, offer: *"No context file found. Create CLAUDE.md now, or skip to configure later."* Do NOT recommend a file that does not exist.
   - **Note**: CogLog supports a single context file only. If your project uses multiple context files (e.g. BMAD with separate PRD, architecture, and epics files), consolidate them into one file first — most frameworks provide an export or merge command for this. Point CogLog at the consolidated output.
   - Attempt to auto-detect the Claude cache dir by encoding the current working directory path (see `/cog-ingest` for the encoding algorithm). If found, record it in config. If not found, leave `cacheDir` unset and note that `/cog-ingest` will attempt auto-detection at runtime.
   - Write `config.json`:
     ```json
     {
       "contextFile": "<user answer or omit if blank>",
       "cacheDir": "<auto-detected path or omit if not found>",
       "filterPatterns": ["cog-", "coglog", ".cognitive", "ingest.js", "SKILL.md", "idea.md"]
     }
     ```
     The default `filterPatterns` exclude CogLog meta-conversations from being ingested. Note: filtering is exchange-level on the user message text — sessions where the user discussed CogLog without typing these keywords may still pass through. The user can extend the list at any time; `/cog-erase` also updates it automatically.

5. **Optional: set up automatic ingest scheduling** — ask:
   ```
   ⏱  Set up automatic ingest? (recommended — prevents session loss if Claude Code deletes JSONL files after 30 days)

     [1] Every 2 hours
     [2] Every 4 hours  ← recommended
     [3] Every 8 hours
     [4] Custom (enter hours)
     [5] Skip
   ```
   If the user selects 1–4, apply the instructions in Section ## 10 (`/cog-schedule`) with the chosen interval. If skip, note: *"You can run /cog-schedule at any time to set this up later."*

6. Write scripts — check and write both scripts if absent or outdated:
   - **`ingest.js`**: if absent or first line ≠ `// coglog-version: 5`, write the full script from Section ## 1.
   - **`rebuild.js`**: if absent or first line ≠ `// coglog-rebuild-version: 1`, write the full script from Section ## 11.
   This ensures the project is fully operational after init without needing to run any other command first.

7. Report:
   ```
   ✅ CogLog initialised.
   Structure   : .cognitive/ created
   Context file: <value or "not configured — set manually in .cognitive/config.json">
   Cache dir   : <value or "will auto-detect on first /cog-ingest">
   Scripts     : ingest.js (v5), rebuild.js (v1)

   Next step: run /cog-ingest to scrape your first sessions.
   ```

---

## 1. `/cog-ingest`
**Action:** Cold scraping of the current project's LLM thinking logs.

**Execution:**

1. Read the first line of `.cognitive/scripts/ingest.js` (if the file exists).
   - **If the file does not exist**, OR **if the first line is not exactly `// coglog-version: 5`**: write (or overwrite) the file with the code below before proceeding to step 3. Create `.cognitive/scripts/` if needed.
   - **If the first line is exactly `// coglog-version: 5`**: skip to step 3.

1b. **Config migration check** — read `.cognitive/config.json`. If the `filterPatterns` key is absent, add it with the default value and rewrite the file:
   ```json
   "filterPatterns": ["cog-", "coglog", ".cognitive", "ingest.js", "SKILL.md", "idea.md"]
   ```
   Report: `ℹ️ filterPatterns added to config.json with defaults.`

2. **Write the script** — write the following Node.js code exactly as provided (do not modify it):

```javascript
// coglog-version: 5
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Config ────────────────────────────────────────────────────────────────────
const PROJ_ROOT = process.cwd();
const COGNITIVE_DIR = path.join(PROJ_ROOT, '.cognitive');
const RAW_DIR = path.join(COGNITIVE_DIR, 'raw');
const STATE_FILE = path.join(COGNITIVE_DIR, 'state.json');
const CONFIG_FILE = path.join(COGNITIVE_DIR, 'config.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadJSON(file, fallback) {
  if (fs.existsSync(file)) {
    try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch (e) {}
  }
  return fallback;
}

// Encode a filesystem path the way Claude Code encodes project cache folder names.
// Algorithm: lowercase, replace ":" and path separators with "-", strip leading dashes.
// Examples:
//   Windows: C:\1\my-project  →  c--1-my-project
//   Linux:   /home/user/proj  →  home-user-proj
function encodeProjectPath(p) {
  return p.toLowerCase()
    .replace(/:/g, '-')
    .replace(/[/\\]/g, '-')
    .replace(/^-+/, '');
}

// ─── Locate the Claude cache folder for THIS project only ──────────────────────
function findProjectCacheDir(config) {
  // Allow manual override via env var (useful for non-Claude LLMs or custom setups)
  if (process.env.COGLOG_CACHE_DIR) {
    console.log(`Using COGLOG_CACHE_DIR override: ${process.env.COGLOG_CACHE_DIR}`);
    return process.env.COGLOG_CACHE_DIR;
  }
  // Allow override stored in config.json
  if (config.cacheDir) {
    console.log(`Using configured cacheDir: ${config.cacheDir}`);
    return config.cacheDir;
  }

  const claudeProjectsBase = path.join(os.homedir(), '.claude', 'projects');

  if (!fs.existsSync(claudeProjectsBase)) {
    console.error(`CogLog Error: Claude projects directory not found at: ${claudeProjectsBase}`);
    console.error(`If you're using a different LLM tool, set the COGLOG_CACHE_DIR env var to the session log directory.`);
    process.exit(1);
  }

  // Primary match: encode the current working directory exactly as Claude Code does
  const expectedFolderName = encodeProjectPath(PROJ_ROOT);
  const expectedPath = path.join(claudeProjectsBase, expectedFolderName);

  if (fs.existsSync(expectedPath)) {
    return expectedPath;
  }

  // Fallback: fuzzy match on the last path segment (project folder name)
  const projectLastSegment = path.basename(PROJ_ROOT).toLowerCase();
  const entries = fs.readdirSync(claudeProjectsBase);
  const candidates = entries.filter(e => e.toLowerCase().endsWith(projectLastSegment));

  if (candidates.length === 1) {
    const candidatePath = path.join(claudeProjectsBase, candidates[0]);
    console.warn(`CogLog Warning: Exact path match not found. Using fuzzy match: ${candidates[0]}`);
    return candidatePath;
  }

  console.error(`CogLog Error: Could not auto-locate the Claude project cache for: ${PROJ_ROOT}`);
  console.error(`Expected encoded folder name: ${expectedFolderName}`);
  if (candidates.length > 1) {
    console.error(`Multiple fuzzy matches found: ${candidates.join(', ')}`);
  }
  console.error(`Available projects in ${claudeProjectsBase}:`);
  entries.slice(0, 15).forEach(e => console.error(`  - ${e}`));
  console.error(`\nTo fix: add "cacheDir": "<path>" to .cognitive/config.json, or set the COGLOG_CACHE_DIR env var.`);
  process.exit(1);
}

// ─── Parse a single JSONL session file ────────────────────────────────────────
// Returns an array of exchange objects: { timestamp, userMessage, thinkingBlocks[], assistantText }
function parseSession(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());

  const exchanges = [];
  let currentExchange = null;

  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }

    // Claude Code wraps messages in entry.message:
    //   { "type": "assistant", "message": { "role": "assistant", "content": [...] }, "timestamp": "..." }
    // Other schemas use a flat structure:
    //   { "role": "assistant", "content": [...], "timestamp": "..." }
    // Normalise both into msg/msgContent so the rest of the logic is format-agnostic.
    const msg = (entry.message && typeof entry.message === 'object') ? entry.message : entry;
    const role = msg.role || entry.type;
    const timestamp = entry.timestamp || entry.ts || null;
    const msgContent = msg.content;

    // ── User message ──
    if (role === 'human' || role === 'user') {
      let userText = '';
      if (typeof msgContent === 'string') {
        userText = msgContent;
      } else if (Array.isArray(msgContent)) {
        userText = msgContent
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('\n');
      }
      if (userText.trim()) {
        currentExchange = {
          timestamp,
          userMessage: userText.trim(),
          thinkingBlocks: [],
          assistantText: ''
        };
        exchanges.push(currentExchange);
      }
    }

    // ── Assistant message with structured content blocks ──
    if (role === 'assistant' && Array.isArray(msgContent)) {
      for (const block of msgContent) {
        if (block.type === 'thinking' && block.thinking) {
          if (!currentExchange) {
            currentExchange = { timestamp, userMessage: null, thinkingBlocks: [], assistantText: '' };
            exchanges.push(currentExchange);
          }
          currentExchange.thinkingBlocks.push(block.thinking);
          if (timestamp && !currentExchange.timestamp) currentExchange.timestamp = timestamp;
        }
        if (block.type === 'text' && block.text && currentExchange) {
          currentExchange.assistantText += block.text;
        }
      }
    }

    // ── Flat "thinking" field (fallback for other schemas) ──
    if (entry.thinking && typeof entry.thinking === 'string') {
      if (!currentExchange) {
        currentExchange = { timestamp, userMessage: null, thinkingBlocks: [], assistantText: '' };
        exchanges.push(currentExchange);
      }
      currentExchange.thinkingBlocks.push(entry.thinking);
    }
  }

  // Only return exchanges that actually have thinking content
  return exchanges.filter(e => e.thinkingBlocks.length > 0);
}

// ─── Collect all JSONL files in a directory recursively ───────────────────────
function findJsonlFiles(dir, fileList = []) {
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return fileList; }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (stat.isDirectory()) {
      findJsonlFiles(full, fileList);
    } else if (entry.endsWith('.jsonl') || entry.endsWith('.json')) {
      fileList.push(full);
    }
  }
  return fileList;
}

// ─── Format a raw session file ────────────────────────────────────────────────
function formatSession(filePath, exchanges) {
  const sessionId = path.basename(filePath, path.extname(filePath));
  let output = `# Raw Cognitive Log\n\n`;
  output += `**Source:** \`${filePath}\`  \n`;
  output += `**Session ID:** ${sessionId}  \n`;
  output += `**Ingested:** ${new Date().toISOString()}\n\n---\n\n`;

  for (const exchange of exchanges) {
    if (exchange.timestamp) {
      try {
        output += `### ${new Date(exchange.timestamp).toLocaleString()}\n\n`;
      } catch {
        output += `### ${exchange.timestamp}\n\n`;
      }
    }

    if (exchange.userMessage) {
      output += `**User:** ${exchange.userMessage}\n\n`;
    }

    for (const block of exchange.thinkingBlocks) {
      output += `> **[Thinking]**\n`;
      block.split('\n').forEach(l => { output += `> ${l}\n`; });
      output += `\n`;
    }

    if (exchange.assistantText && exchange.assistantText.trim()) {
      const summary = exchange.assistantText.trim();
      const truncated = summary.length > 500 ? summary.slice(0, 500) + '...' : summary;
      output += `**Assistant Output:**\n\n${truncated}\n\n`;
    }

    output += `---\n\n`;
  }

  return output;
}

// ─── Main ──────────────────────────────────────────────────────────────────────
ensureDir(RAW_DIR);

const state = loadJSON(STATE_FILE, { ingestedFiles: {}, prunedFiles: [] });
if (!state.prunedFiles) state.prunedFiles = [];

// Migration: convert legacy array format to object format.
// Old: ingestedFiles: ["path1", "path2"]
// New: ingestedFiles: { "path1": { size: N, rawFile: "..." }, ... }
if (Array.isArray(state.ingestedFiles)) {
  const migrated = {};
  for (const filePath of state.ingestedFiles) {
    let size = 0;
    try { size = fs.statSync(filePath).size; } catch {}
    migrated[filePath] = { size, rawFile: null };
  }
  state.ingestedFiles = migrated;
  console.log(`Migrated ${Object.keys(migrated).length} entries from legacy state format.`);
}

const config = loadJSON(CONFIG_FILE, {});
const cacheDir = findProjectCacheDir(config);

// Filter patterns: exchanges whose userMessage matches any pattern are excluded from raw files.
// Configured in .cognitive/config.json as "filterPatterns": ["cog-", "coglog", ".cognitive", ...]
const filterPatterns = (config.filterPatterns || []).map(p => p.toLowerCase());

function matchesFilter(text) {
  if (!text || filterPatterns.length === 0) return false;
  const lower = text.toLowerCase();
  return filterPatterns.some(p => lower.includes(p));
}

console.log(`Project root:  ${PROJ_ROOT}`);
console.log(`Cache dir:     ${cacheDir}`);
console.log(`Output dir:    ${RAW_DIR}`);
console.log('');

const logFiles = findJsonlFiles(cacheDir);
let newSessions = 0;
let reIngested = 0;
let skipped = 0;
let empty = 0;
let filteredOut = 0;

for (const filePath of logFiles) {
  if (state.prunedFiles.includes(filePath)) continue;

  let currentSize = 0;
  try { currentSize = fs.statSync(filePath).size; } catch { continue; }

  const existing = state.ingestedFiles[filePath];

  // Skip only if the file has been seen before AND its size hasn't changed.
  if (existing && existing.size === currentSize) {
    skipped++;
    continue;
  }

  const isReIngest = !!(existing && existing.size !== currentSize);

  // If re-ingesting a partially captured session, remove the old raw file first.
  if (isReIngest && existing.rawFile) {
    const oldRawPath = path.join(RAW_DIR, existing.rawFile);
    try { fs.unlinkSync(oldRawPath); } catch {}
  }

  try {
    const exchanges = parseSession(filePath);

    // Apply filterPatterns at exchange level: skip exchanges whose userMessage
    // matches a configured keyword (case-insensitive substring match).
    const visibleExchanges = filterPatterns.length > 0
      ? exchanges.filter(e => !matchesFilter(e.userMessage))
      : exchanges;

    if (visibleExchanges.length === 0) {
      // Session has no thinking, or all exchanges were filtered out.
      const allFiltered = exchanges.length > 0 && visibleExchanges.length === 0;
      state.ingestedFiles[filePath] = { size: currentSize, rawFile: null, filtered: allFiltered };
      if (allFiltered) { filteredOut++; } else { empty++; }
      continue;
    }

    const sessionId = path.basename(filePath, path.extname(filePath));
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const rawFileName = `think_session_${ts}_${sessionId.slice(0, 8)}.md`;
    const destFile = path.join(RAW_DIR, rawFileName);

    fs.writeFileSync(destFile, formatSession(filePath, visibleExchanges));
    state.ingestedFiles[filePath] = { size: currentSize, rawFile: rawFileName };

    if (isReIngest) { reIngested++; } else { newSessions++; }
  } catch (e) {
    console.error(`Failed to parse ${filePath}: ${e.message}`);
  }
}

fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
console.log(`Ingestion complete.`);
console.log(`  New sessions:               ${newSessions}`);
console.log(`  Re-ingested (grown files):  ${reIngested}`);
console.log(`  Filtered by filterPatterns: ${filteredOut}`);
console.log(`  Without thinking:           ${empty}`);
console.log(`  Already up to date:         ${skipped}`);
```

3. Execute: `node .cognitive/scripts/ingest.js`
4. Return the terminal output verbatim. Do not summarise thinking content in chat.

**First-run note:** If `.cognitive/config.json` does not exist, create it with `{}`. After the first successful run, the correct `cacheDir` is identified. If the auto-detection fails, inform the user and ask them to add the path manually to `config.json` as `"cacheDir": "<path>"`.

---

## 2. `/cog-status`
**Action:** Project memory state report.

**Execution:**
- Count files in `.cognitive/raw/` (exclude `archive/` subfolder).
- Count files in `.cognitive/raw/archive/` (already digested).
- Count files in `.cognitive/wiki/`.
- Read `.cognitive/config.json` and report: whether `contextFile` is configured, whether `cacheDir` is set or auto-detected.
- Respond with a brief, formatted bulletin:

```
📊 CogLog Status
─────────────────────────────
Raw queue (pending digest):  X files
Raw archive (digested):      X files
Wiki documents:              X files
─────────────────────────────
Context file:  <path or "not configured">
Cache dir:     <path or "auto-detect">
```

---

## 3. `/cog-digest`
**Action:** Consolidate raw knowledge into structured documentation with bidirectional traceability.

> ⚠️ **MANDATORY OUTPUT RULES — apply to every wiki file without exception:**
> 1. **YAML frontmatter is required.** Every wiki file MUST begin with the `---` frontmatter block. A file without frontmatter is invalid and must not be written.
> 2. **Standard Markdown links only.** All cross-references (in `## Related` or anywhere in the body) MUST use `[Title](filename.md)` format. NEVER write `[[wikilink]]` — this format breaks in VS Code, GitHub preview, and every viewer except Obsidian.

**Execution:**
1. Read all unprocessed `.md` files in `.cognitive/raw/` (not in `archive/`).
2. Sort them by the timestamp embedded in the filename (oldest first) to preserve temporal order.
3. Analyse the flow of thought across sessions. For each meaningful insight:
   - **If it's a new decision:** create a new wiki file (`ADR_NNN_Title.md`, `BUG_NNN_Title.md`, or `DOMAIN_NNN_Title.md`).
   - **If it revisits or contradicts a previous decision:** find the existing wiki file and add an `## Evolution` section documenting: the date of the change, what changed, and the reasoning behind the change. Do not overwrite the original decision — preserve the full history. Update `updated:` in the frontmatter.
   - **Context refs**: when writing or updating any wiki file, identify which section(s) of the configured `contextFile` (from `config.json`) this entry relates to. Populate `context_refs` with `"<contextFile> § <Section Heading>"` (use the exact heading as it appears in the context file). Set `context_last_verified` to today's date. If no corresponding section exists in the context file, omit both fields or leave `context_refs` as an empty list — do not invent refs.
4. **Link format**: always use standard Markdown links `[Title](path.md)` for cross-references between wiki files. Never use wikilink format `[[title]]` — it is not universally supported outside Obsidian.

4b. Wiki file structure — the file MUST follow this exact template, starting with the `---` frontmatter block:
   ```markdown
   ---
   type: ADR | BUG | DOMAIN
   status: active | evolved | superseded
   created: YYYY-MM-DD
   updated: YYYY-MM-DD
   sources:
     - session_id_1
     - session_id_2
   context_refs:
     - "CLAUDE.md § Section Heading"
   context_last_verified: YYYY-MM-DD
   ---

   # [Type]_[NNN]: [Title]

   ## Context
   What was the situation when this was first discussed.

   ## Problem
   The specific problem being solved.

   ## Reasoning
   (Derived from Thinking blocks) How the solution was reasoned about.

   ## Decision
   What was decided.

   ## Evolution
   ### [Date] — [Brief change title]
   What changed and why. Previous decision: [X]. New decision: [Y].
   Reasoning: [from thinking blocks].

   ## Related
   - [BUG_NNN_Title](BUG_NNN_Title.md)
   - [ADR_NNN_Title](ADR_NNN_Title.md)
   ```
   Note: `## Related` links use `[Title](filename.md)` — never `[[wikilink]]`.
5. **Bidirectional traceability:** before moving each raw file to `archive/`, append the following block to it:
   ```markdown
   ---
   **Contributed to:** ADR_001_Title.md, BUG_002_Title.md
   ```
   This creates an explicit cross-link in both directions: wiki files know which sessions generated them (`sources`), and archived raw files know which wiki entries they contributed to.
6. Move processed raw files to `.cognitive/raw/archive/`.
7. Report which wiki files were created or updated.

---

## 4. `/cog-map`
**Action:** Generate the master knowledge map — a single navigable synthesis of the entire knowledge base.

**Execution:**
1. Read all files in `.cognitive/wiki/` (including their YAML frontmatter).
2. Read `.cognitive/config.json` to find the `contextFile` path (e.g., `CLAUDE.md`). If configured, read it too.
3. Build `.cognitive/KNOWLEDGE_MAP.md` from scratch (this file is always fully regenerated — it is derived, not append-only). Structure:

```markdown
# Knowledge Map
_Generated: <ISO 8601 timestamp with time, e.g. 2026-06-10T14:32:00Z> — Source of truth: `.cognitive/wiki/`_

---

## Decision Timeline
Chronological list of all wiki entries, oldest first.

| Date | Type | Title | Status | Wiki File |
|------|------|-------|--------|-----------|
| YYYY-MM-DD | ADR | Title of decision | active | [ADR_001_Title.md](wiki/ADR_001_Title.md) |
| ... | | | evolved | |

---

## Thematic Index
Decisions grouped by domain area. Areas are inferred from wiki content.

### [Area Name, e.g., "Database"]
- [ADR_001: Title](wiki/ADR_001_Title.md) — one-line summary
- [DOMAIN_002: Title](wiki/DOMAIN_002_Title.md) — one-line summary

---

## Cross-References
List explicit relationships between wiki entries (one ADR modifying another, a BUG caused by a DOMAIN decision, etc.).

- ADR_003 supersedes ADR_001 — [see Evolution section](wiki/ADR_001_Title.md#evolution)
- BUG_005 is caused by the constraint in DOMAIN_002

---

## Current Architecture State
Prose summary of the currently **active** decisions only (status: active or evolved, not superseded).
Written as a coherent narrative, not a list. This is what a new team member needs to read.

---

## Open Questions
Thinking blocks that raised unresolved issues without a formal decision.
Extracted from raw sessions where the reasoning was inconclusive.

- [Session YYYY-MM-DD] — "Should we use X or Y for Z?" — no decision reached.

---

## Delta from Context File
_(Only present if `contextFile` is configured)_
Decisions in the knowledge base that are **not reflected** in `<contextFile>`.
These are candidates for updating the context file.

- ADR_004: Rate limiting strategy — present in wiki, absent from CLAUDE.md
```

4. Report: how many wiki files were read, whether the KNOWLEDGE_MAP was created or updated, and the count of open questions and delta items found.

---

## 5. `/cog-check`
**Action:** Convergence analysis between the project context file and recent thinking.

**Execution:**
1. Check `.cognitive/config.json` for the `contextFile` path (e.g., `CLAUDE.md`). If not set, ask the user: *"Which file is your project context / instructions file? (e.g., CLAUDE.md, .cursorrules, AGENTS.md)"* — save the answer to `config.json` as `contextFile`.
2. Read the configured context file.
3. Read the most recent 10 wiki files from `.cognitive/wiki/` and the most recent 5 raw files from `.cognitive/raw/`.
4. Analyse for convergence — go **detail level**, not topic level. For each wiki entry, check whether the specific technical details are present in the context file, not just whether the general topic is mentioned. Specifically verify: exact thresholds and parameter values, method call ordering constraints, conditions and their operators, edge case fixes, and per-case distinctions. A topic can match at surface level while critical details that caused bugs remain undocumented.
   - **Confirmed:** Concepts AND their specific technical details are present in the context file.
   - **Contradicted:** The context file documents something differently from what the wiki records (different value, different condition, different order).
   - **Missing from context:** A wiki entry covers a detail, constraint, or fix that is absent from the context file — even if the parent topic is present. Flag each missing detail explicitly (e.g. "CLAUDE.md documents EXIF strip but not the AutoOrient-must-run-first ordering constraint documented in BUG_exif-orientation.md").

4b. **Stale reference check** — for wiki files that carry `context_refs`:
   - Parse the context file into a flat list of all `##` and `###` headings.
   - For each ref in `context_refs`, check if the referenced section heading appears in that list (case-insensitive, ignore leading `#` and whitespace).
   - Collect any refs where the section is not found.
   - Report at the end of the main report:
     ```
     🔗 Context refs:
        ✅ Valid  (N): refs pointing to existing sections
        ⚠️  Stale (N): refs pointing to sections no longer found
           - wiki/BUG_001_Canvas_Scaling.md → "CLAUDE.md § Multi-Image Merge Pipeline" — section not found
     ```
   - Stale refs indicate the context file was restructured after the wiki entry was written. Offer to update `context_last_verified` on entries whose refs are still valid, and flag stale ones for manual review.

5. Present the report clearly, e.g.:
   ```
   ✅ Confirmed (3): auth strategy, DB schema approach, API versioning
   ⚠️  Contradicted (1): error handling pattern — context says X, but session 2026-06-01 decided Y
   🆕 Missing from context (2): rate limiting decision, caching layer choice
   ```
6. Ask: *"Do you want me to update the context file to reflect the current state of thinking?"* If yes, update only the contradicted and missing sections, preserving the confirmed content and the overall structure.

---

## 6. `/cog-prune`
**Action:** Clean up background noise from the raw queue.

**Execution:**
1. Read all files in `.cognitive/raw/` (not in `archive/`).
2. For each file: if it contains very few words (< 50), or the thinking content deals only with trivial syntax corrections, formatting, or off-topic remarks — mark it for deletion.
3. **Before deleting**, add the source file path (from the `**Source:**` header in the raw file) to `state.prunedFiles` in `state.json`. This prevents `/cog-ingest` from re-ingesting these sessions.
4. Delete the raw file.
5. Save the updated `state.json`.
6. Report which files were discarded and why.

---

## 7. `/cog-sync`
**Action:** Run the full CogLog pipeline end to end.

**Important:** Execute each step by applying the instructions defined in the corresponding numbered section of this document — do NOT invoke them as separate skills or tools. All steps run inline within this same skill execution.

**Execution:**

0. **Schema version check** — read `coglogSkillVersion` from `.cognitive/config.json`. If absent or less than `2`, show:
   ```
   ⚠️ KB schema version mismatch (config: N, current: 2).
      Wiki files may lack fields added in newer skill versions (e.g. context_refs).
      Run /cog-rebuild to regenerate the knowledge base from raw sessions with the current schema.
   ```
   Continue execution — this is a warning, not a blocker.

1. **Ingest** — apply the instructions in Section ## 1 (`/cog-ingest`). Run `node .cognitive/scripts/ingest.js` and report its output.

2. **Status** — apply the instructions in Section ## 2 (`/cog-status`). Count raw, archive, and wiki files and report the bulletin.

3. **Gate: check raw queue.**
   - If the raw queue (`.cognitive/raw/`, excluding `archive/`) contains **0 files**: report `ℹ️ Raw queue is empty — nothing to digest. Pipeline complete.` and stop here.
   - If there are files to process, continue.

4. **Digest** — apply the instructions in Section ## 3 (`/cog-digest`). Read raw files, produce wiki entries, archive processed files.

5. **Gate: check wiki.**
   - If `.cognitive/wiki/` contains **0 files**: report `ℹ️ No wiki files produced — skipping map generation.` and continue to step 6.
   - Otherwise, continue to step 5a.

   5a. **Map** — apply the instructions in Section ## 4 (`/cog-map`). Regenerate `KNOWLEDGE_MAP.md`.

6. **Check** — apply the instructions in Section ## 5 (`/cog-check`). If `contextFile` is not configured in `config.json`, ask the user for it before proceeding. If the user declines, skip this step.

7. **Prune** — apply the instructions in Section ## 6 (`/cog-prune`). Remove low-value raw files.

8. Report a final summary of what was done across all steps.

---

## 8. `/cog-help [question]`
**Action:** Interactive query interface over the CogLog knowledge base.

**This command is read-only. It never writes, moves, or modifies any file.**

**Execution:**

1. **Check initialisation state in order — stop at the first failed condition:**

   a. If `.cognitive/` does not exist, or `state.json` / `config.json` are missing:
      > ⚠️ CogLog not initialised. Run `/cog-init` first.
      Stop.

   b. If `.cognitive/wiki/` is empty and `.cognitive/raw/` is empty (no sessions ingested yet):
      > ℹ️ CogLog is initialised but no sessions have been processed yet. Run `/cog-ingest` to scrape your first sessions, then `/cog-digest` and `/cog-map` to build the knowledge base.
      Stop.

   c. If `.cognitive/KNOWLEDGE_MAP.md` does not exist but there are wiki or raw files:
      > ⚠️ Knowledge map not generated yet. Run `/cog-map` to build it from existing wiki files.
      Stop.

   Only if all three conditions pass, proceed with steps 1b–5.

   1b. **Schema version check** — read `coglogSkillVersion` from `.cognitive/config.json`. If absent or less than `2`, show:
   ```
   ⚠️ KB schema version mismatch (config: N, current: 2).
      Wiki files may lack fields added in newer skill versions (e.g. context_refs).
      Run /cog-rebuild to regenerate the knowledge base from raw sessions with the current schema.
   ```
   Continue — this is a warning, not a blocker.

2. **Load context in layers** (in order, stopping when sufficient for the question):
   - Layer 1 — always load: `.cognitive/KNOWLEDGE_MAP.md`
   - Layer 2 — load if the question requires more depth on a specific topic: the relevant wiki files from `.cognitive/wiki/` (use the thematic index and cross-references in the map to identify which ones)
   - Layer 3 — load only if the question is about recent sessions or unstructured thinking: the most recent raw files from `.cognitive/raw/`

3. **If `/cog-help` is called with no argument**, display the system overview:

   ```
   🧠 CogLog — Knowledge Base Query Interface
   ═══════════════════════════════════════════

   SETUP:
     /cog-init        One-time project setup (safe to re-run)

   PIPELINE COMMANDS (modify files):
     /cog-ingest      Scrape new thinking sessions from the project cache
     /cog-status      Report on raw queue, wiki, and config state
     /cog-digest      Structure raw sessions into wiki documents (ADRs, Bugs, Domain)
     /cog-map         Regenerate the master knowledge map (KNOWLEDGE_MAP.md)
     /cog-check       Compare context file vs recent thinking — detect drift
     /cog-prune       Remove low-value noise from the raw queue
     /cog-erase       Permanently remove a topic from the knowledge base
     /cog-schedule    Set up automatic ingest scheduling (OS-native)
     /cog-sync        Run the full pipeline: ingest → status → digest → map → check → prune

   QUERY COMMANDS (read-only):
     /cog-help                  Show this overview
     /cog-help [question]       Ask anything about the project knowledge base

   EXAMPLE QUERIES:
     /cog-help what is the current state of the auth layer?
     /cog-help when did we decide to change the DB schema and why?
     /cog-help show me all decisions that have evolved from their original form
     /cog-help what open questions are still unresolved?
     /cog-help what's been discussed in the last 3 sessions?
     /cog-help what's in the knowledge base but not in CLAUDE.md?
   ```

4. **If `/cog-help` is called with a question**, answer it using the loaded context. Follow these rules:
   - **Always cite the source**: reference the wiki file, session date, or KNOWLEDGE_MAP section where the answer comes from.
   - **Prefer the map for high-level queries** (current state, timelines, open questions). Only drill into wiki files when the map's summary is insufficient.
   - **Be explicit about confidence**: if the knowledge base has no information on the topic, say so clearly rather than inferring.
   - **For timeline or evolution questions**: navigate the Evolution sections in wiki files and present the history in chronological order.
   - **For "open questions"**: pull directly from the Open Questions section of KNOWLEDGE_MAP.md, supplemented by recent raw files if needed.
   - **For delta questions** ("what's not in CLAUDE.md?"): use the Delta section of KNOWLEDGE_MAP.md.

5. After answering, if the question revealed a gap in the knowledge base (e.g., an important topic with no wiki entry), note it:
   > 💡 This topic has no dedicated wiki entry yet. Consider running `/cog-digest` to structure recent sessions that may cover it.

---

## 9. `/cog-erase [pattern]`
**Action:** Permanently remove a topic from the knowledge base and add its pattern to `filterPatterns` to prevent future re-ingestion.

**Use this command to intentionally eliminate a topic** — for example, CogLog meta-conversations that slipped in before filterPatterns were configured, off-topic sessions, or confidential content that should not persist.

**This command is destructive and irreversible. It deletes files.**

**Execution:**

1. **Collect the pattern** — if not provided as an argument, ask:
   > *"What topic or keyword should be erased? (case-insensitive substring match, e.g. 'coglog', 'auth refactor', 'api-key')"*

2. **Preview impact** — before deleting anything, scan and report:

   a. **Raw files** (`.cognitive/raw/` and `.cognitive/raw/archive/`): list files whose content contains the pattern.

   b. **Wiki files** (`.cognitive/wiki/`): for each matching file, check its `sources:` frontmatter field:
      - **All sources match the pattern** → mark as `[WILL DELETE]`
      - **Some sources match, some don't** → mark as `[MIXED SOURCES — manual review required]`

   Show the full preview:
   ```
   🗑️  Erase preview for pattern: "<pattern>"

   Raw files to delete:
     .cognitive/raw/2024-01-15_session_abc.md
     .cognitive/raw/archive/2024-01-10_session_xyz.md

   Wiki files:
     [WILL DELETE]            wiki/ADR_001_CogLog_Setup.md          (all sources match)
     [MIXED SOURCES]          wiki/ADR_005_Database_Schema.md       (1 of 3 sources match)

   filterPatterns will be updated to add: "<pattern>"
   ```

3. **Confirm** — ask the user to confirm before proceeding:
   > *"Proceed with erasure? This cannot be undone. (yes/no)"*
   If no, abort and report: `❌ Erase aborted. No changes made.`

4. **Execute** — upon confirmation:

   a. **Delete matching raw files** (both `.cognitive/raw/` and `.cognitive/raw/archive/`). For each deleted file, add its path to `prunedFiles` in `state.json` so it is never re-ingested.

   b. **Delete `[WILL DELETE]` wiki files** — those whose all sources matched the pattern.

   c. **Flag `[MIXED SOURCES]` wiki files** — do NOT auto-edit them. Instead, append a warning comment at the top of each file:
      ```markdown
      <!-- ⚠️ cog-erase warning: source "<pattern>" was erased. This file may contain content derived from erased sessions. Manual review recommended. -->
      ```
      Report these files to the user with a reminder to review them manually.

   d. **Update `filterPatterns`** — add the pattern (lowercase) to `filterPatterns` in `.cognitive/config.json` if not already present. This prevents future ingestion of sessions matching this pattern.

   e. **Regenerate the knowledge map** — run the same logic as `/cog-map` to rebuild `KNOWLEDGE_MAP.md` from the surviving wiki files. This removes deleted entries from the timeline and thematic index automatically.

5. **Report**:
   ```
   ✅ Erase complete for pattern: "<pattern>"

   Deleted raw files  : N
   Deleted wiki files : N
   Flagged for review : N  (listed above — manual review required)
   filterPatterns     : updated (pattern added)
   KNOWLEDGE_MAP.md   : regenerated

   ⚠️  N wiki file(s) have mixed sources and were not auto-edited.
       Review them manually and remove content derived from erased sessions.
   ```

**Note:** `cog-erase` does not affect `ingest.js` or the pipeline — it only cleans already-ingested content and updates the filter to block future ingestion of the same topic.

---

## 10. `/cog-schedule [hours|status|off]`
**Action:** Set up, inspect, or remove automatic OS-level scheduling of `ingest.js`.

**Sub-commands:**
- `/cog-schedule` or `/cog-schedule [N]` — create or update a scheduled task that runs `node .cognitive/scripts/ingest.js` every N hours (default: 4)
- `/cog-schedule status` — report whether a schedule is active, when it last ran, and when the next run is
- `/cog-schedule off` — remove the scheduled task

**This command registers a native OS task (Windows Task Scheduler / macOS launchd / Linux crontab). It does not keep a background process alive.**

---

### Platform Detection

Before any action, detect the OS using shell built-ins — do NOT rely on Node.js for this step:

- **Windows**: check if `%OS%` equals `Windows_NT` (always true on Windows cmd/PowerShell)
- **macOS**: run `uname -s` → returns `Darwin`
- **Linux**: run `uname -s` → returns `Linux`

If detection fails or the platform is unrecognised, report:
```
⚠️ Could not detect OS platform. Set up scheduling manually using your OS task scheduler.
Command to schedule: node <absolute-path-to>/.cognitive/scripts/ingest.js
```

---

### Task Naming

The task name must be unique per project to allow multiple CogLog projects to coexist independently:

```
CogLog-<encoded-project-path>
```

Where `<encoded-project-path>` is the current working directory encoded with the same algorithm as `encodeProjectPath()` in `ingest.js` (lowercase, path separators and `:` → `-`, strip leading dashes). Example: `CogLog-c--1-lc-inbox2news`.

---

### `/cog-schedule [N]` — Create or Update

1. **Detect platform** (see above).

2. **Check for existing schedule** — query the OS task by name (see platform-specific commands below). If found:
   ```
   ℹ️ A schedule already exists for this project (every X hours).
   Do you want to update it to every N hours? (yes/no)
   ```
   If no, abort. If yes, remove the existing task first, then create the new one.

3. **Resolve paths** — get the absolute path to `ingest.js` and to the `node` executable:
   - Node path: `node -e "process.stdout.write(process.execPath)"` (only called after platform detection confirms node is available via a simple `node --version` check first)
   - If node is not found, report: `⚠️ Node.js not found in PATH. Install Node.js and retry.` and stop.

4. **Register the task** using the platform-specific approach below.

5. **Update `config.json`** — add or update the `schedule` block:
   ```json
   "schedule": {
     "intervalHours": N,
     "taskName": "CogLog-<encoded-project-path>",
     "createdAt": "<ISO 8601 timestamp>"
   }
   ```

6. **Report**:
   ```
   ✅ Automatic ingest scheduled.
   Platform  : <Windows / macOS / Linux>
   Task name : CogLog-<encoded>
   Interval  : every N hours
   Script    : <absolute path to ingest.js>
   ```

---

### `/cog-schedule status`

1. Read `config.json`. If no `schedule` block exists, report:
   ```
   ℹ️ No schedule configured for this project. Run /cog-schedule to set one up.
   ```
   and stop.

2. Query the OS task by name (platform-specific) to verify it still exists.
   - If the task is found in the OS: report active status with next run time.
   - If the task is NOT found but `config.json` has a `schedule` block: report discrepancy:
     ```
     ⚠️ Schedule recorded in config.json but not found in OS task scheduler.
        It may have been removed manually. Run /cog-schedule to recreate it.
     ```

3. Report:
   ```
   🕐 CogLog ingest schedule — active
   Task name : CogLog-<encoded>
   Interval  : every N hours
   Created   : <createdAt>
   Next run  : <next execution time from OS>
   ```

---

### `/cog-schedule off`

1. Read the task name from `config.json`. If no `schedule` block exists, report:
   ```
   ℹ️ No schedule found in config.json for this project.
   ```
   and stop.

2. Remove the OS task (platform-specific).

3. Remove the `schedule` block from `config.json`.

4. Report:
   ```
   ✅ Schedule removed.
   Task name : CogLog-<encoded>
   config.json: schedule block cleared.
   ```

---

### Platform-Specific Commands

**Windows (Task Scheduler via `schtasks`)**

```
# Create (run every N hours, starting now):
# IMPORTANT: use parentheses (not quotes) around /tr value to handle spaces in paths correctly
schtasks /create /tn "CogLog-<encoded>" /tr ('\"<node-path>\" \"<ingest-path>\"') /sc HOURLY /mo N /f

# Query:
schtasks /query /tn "CogLog-<encoded>" /fo LIST

# Delete:
schtasks /delete /tn "CogLog-<encoded>" /f
```

**macOS (launchd plist in `~/Library/LaunchAgents/`)**

File: `~/Library/LaunchAgents/com.coglog.<encoded>.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.coglog.<encoded></string>
  <key>ProgramArguments</key>
  <array>
    <string><node-path></string>
    <string><ingest-path></string>
  </array>
  <key>StartInterval</key>
  <integer>N_SECONDS</integer>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string><project-root>/.cognitive/logs/ingest.log</string>
  <key>StandardErrorPath</key>
  <string><project-root>/.cognitive/logs/ingest-error.log</string>
</dict>
</plist>
```

Where `N_SECONDS = N * 3600`. Create `.cognitive/logs/` directory if needed.

```
# Load:
launchctl load ~/Library/LaunchAgents/com.coglog.<encoded>.plist

# Query:
launchctl list com.coglog.<encoded>

# Unload and remove:
launchctl unload ~/Library/LaunchAgents/com.coglog.<encoded>.plist
rm ~/Library/LaunchAgents/com.coglog.<encoded>.plist
```

**Linux (crontab)**

```
# Read current crontab, add line, write back:
(crontab -l 2>/dev/null | grep -v "CogLog-<encoded>"; echo "0 */N * * * <node-path> <ingest-path> # CogLog-<encoded>") | crontab -

# Query:
crontab -l | grep "CogLog-<encoded>"

# Remove:
crontab -l | grep -v "CogLog-<encoded>" | crontab -
```

Note: for intervals that don't divide 24 evenly (e.g. 5h), use `0 0,5,10,15,20 * * *` style. For 4h: `0 */4 * * *`. For 2h: `0 */2 * * *`. For 8h: `0 */8 * * *`.

---

**Note:** `cog-schedule` only schedules `ingest.js` — the zero-token scraping step. The full pipeline (`digest`, `map`, `check`) requires an active LLM session and must be run manually or via `/cog-sync`.

---

## 11. `/cog-rebuild`
**Action:** Regenerate the entire knowledge base from scratch, preserving all raw sessions.

Use when the skill has been updated and existing wiki files lack new schema fields (e.g. `context_refs`), or when you want a clean re-digest with the current skill logic.

**This command moves existing wiki files to a versioned backup — it does not permanently delete them.**

**Execution:**

1. **Preview** — before running anything, show:
   ```
   🔄 cog-rebuild preview
   ─────────────────────────────────────────
   Wiki files    : N files → .cognitive/_backup/YYYY-MM-DD[_N]/wiki/
   KNOWLEDGE_MAP : backed up to .cognitive/_backup/YYYY-MM-DD[_N]/
   Archive       : N raw sessions → restored to .cognitive/raw/
   Skill version : coglogSkillVersion → 2 in config.json
   ─────────────────────────────────────────
   After rebuild, digest → map → check will run automatically.
   ```

2. **Confirm** — ask: *"Proceed? The current knowledge base will be moved to backup and regenerated. (yes/no)"*
   If no: `❌ Rebuild aborted. No changes made.`

3. **Check and update rebuild.js** — read the first line of `.cognitive/scripts/rebuild.js`.
   - If absent or first line ≠ `// coglog-rebuild-version: 1`: write the full script from the source below.
   - Otherwise: skip.

4. **Run**: `node .cognitive/scripts/rebuild.js`
   Report the terminal output verbatim.

5. **Re-run pipeline** — apply Sections ## 3, ## 4, ## 5 in sequence (digest → map → check). Do NOT re-run ingest — raw sessions are already in place.

6. **Report**:
   ```
   ✅ Rebuild complete.
   Backup        : .cognitive/_backup/YYYY-MM-DD[_N]/
   New wiki files: N
   Skill version : coglogSkillVersion set to 2
   ```

---

### rebuild.js source

Write this file exactly as provided:

```javascript
// coglog-rebuild-version: 1
const fs = require('fs');
const path = require('path');

const PROJ_ROOT = process.cwd();
const COGNITIVE_DIR = path.join(PROJ_ROOT, '.cognitive');
const RAW_DIR = path.join(COGNITIVE_DIR, 'raw');
const ARCHIVE_DIR = path.join(RAW_DIR, 'archive');
const WIKI_DIR = path.join(COGNITIVE_DIR, 'wiki');
const KNOWLEDGE_MAP = path.join(COGNITIVE_DIR, 'KNOWLEDGE_MAP.md');
const BACKUP_BASE = path.join(COGNITIVE_DIR, '_backup');
const CONFIG_FILE = path.join(COGNITIVE_DIR, 'config.json');

const COGLOG_SKILL_VERSION = 2;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getBackupDir() {
  const today = new Date().toISOString().slice(0, 10);
  const base = path.join(BACKUP_BASE, today);
  if (!fs.existsSync(base)) return base;
  let i = 2;
  while (fs.existsSync(path.join(BACKUP_BASE, `${today}_${i}`))) i++;
  return path.join(BACKUP_BASE, `${today}_${i}`);
}

function backupKB(backupDir) {
  const wikiBackup = path.join(backupDir, 'wiki');
  ensureDir(wikiBackup);
  let wikiCount = 0;
  if (fs.existsSync(WIKI_DIR)) {
    const files = fs.readdirSync(WIKI_DIR).filter(f => f.endsWith('.md'));
    for (const f of files) {
      fs.copyFileSync(path.join(WIKI_DIR, f), path.join(wikiBackup, f));
      wikiCount++;
    }
  }
  if (fs.existsSync(KNOWLEDGE_MAP)) {
    fs.copyFileSync(KNOWLEDGE_MAP, path.join(backupDir, 'KNOWLEDGE_MAP.md'));
  }
  return wikiCount;
}

function clearKB() {
  let count = 0;
  if (fs.existsSync(WIKI_DIR)) {
    const files = fs.readdirSync(WIKI_DIR).filter(f => f.endsWith('.md'));
    for (const f of files) { fs.unlinkSync(path.join(WIKI_DIR, f)); count++; }
  }
  if (fs.existsSync(KNOWLEDGE_MAP)) { fs.unlinkSync(KNOWLEDGE_MAP); }
  return count;
}

function restoreArchive() {
  if (!fs.existsSync(ARCHIVE_DIR)) return 0;
  const files = fs.readdirSync(ARCHIVE_DIR).filter(f => f.endsWith('.md'));
  for (const f of files) {
    fs.renameSync(path.join(ARCHIVE_DIR, f), path.join(RAW_DIR, f));
  }
  return files.length;
}

function updateVersion() {
  let config = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try { config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); } catch {}
  }
  config.coglogSkillVersion = COGLOG_SKILL_VERSION;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

const backupDir = getBackupDir();
ensureDir(BACKUP_BASE);

const wikiCount = backupKB(backupDir);
clearKB();
const restored = restoreArchive();
updateVersion();

console.log('Rebuild complete.');
console.log(`  Backed up  : ${wikiCount} wiki files + KNOWLEDGE_MAP → ${path.relative(PROJ_ROOT, backupDir)}`);
console.log(`  Restored   : ${restored} raw sessions from archive`);
console.log(`  Version    : coglogSkillVersion set to ${COGLOG_SKILL_VERSION} in config.json`);
```
