---
name: cog-rebuild
description: "Back up the current CogLog knowledge base to a versioned snapshot (.cognitive/_backup/YYYY-MM-DD/) and regenerate from raw sessions. Use after skill updates to pick up new schema fields (e.g. context_refs)."
---

Coglog skill directory: `${CLAUDE_SKILL_DIR}/../coglog/`
Scripts directory (COGLOG_SCRIPTS_DIR): `${CLAUDE_SKILL_DIR}/../coglog/scripts/`

Read `${CLAUDE_SKILL_DIR}/../coglog/SKILL.md` for the full CogLog instruction set, then execute the `/cog-rebuild` instructions (Section ## 11). When the instructions reference `COGLOG_SCRIPTS_DIR`, use the scripts directory path above.
