---
name: cog-ingest
description: "Cold-scrape LLM thinking logs from the current project's session cache into .cognitive/raw/. Zero token cost, safe to run often."
---

Coglog skill directory: `${CLAUDE_SKILL_DIR}/../loader-coglog/`
Scripts directory (COGLOG_SCRIPTS_DIR): `${CLAUDE_SKILL_DIR}/../loader-coglog/scripts/`

Read `${CLAUDE_SKILL_DIR}/../loader-coglog/SKILL.md` for the full CogLog instruction set, then execute the `/cog-ingest` instructions (Section ## 1). When the instructions reference `COGLOG_SCRIPTS_DIR`, use the scripts directory path above.
