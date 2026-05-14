# TODO

Tracking intentional scaffolding and known inconsistencies in the Wispers FoundryVTT system. CLAUDE.md points here so the architectural doc stays focused; this file is where mutable project state lives.

## Known WIP / scaffolding

These are intentional placeholders, not bugs to fix opportunistically — flag them when relevant but don't silently rewrite:

- **Hotbar item macros silently fail.** `createItemMacro` writes the command `game.wisperssystem.rollItemMacro(uuid)`, but `game.wisperssystem` is never assigned (the `rollItemMacro` function in `wispers.js` is module-local). To fix: expose it on the `init` or `ready` hook (e.g., `game.wisperssystem = { rollItemMacro };`).
- **No custom Item document class.** `CONFIG.Item.documentClass = WispersItem;` and the corresponding sheet registration are commented out in `wispers.js`. Items use the core Foundry classes for now.
- **`wispersActor.prepareDerivedData()` is a stub.** It calls `_preparePlayerCharacterData` → `_setCharacterDetails`, which has only a comment. All derived stats (modifiers, computed saves, etc.) need to be implemented here.
- **Saving throw bonuses are hardcoded** as `+3`/`+4`/`+5` strings in `templates/sheets/character/header.hbs`. They aren't computed from data yet.
- **Empty stub modules**: `modules/dice.js`, `modules/dialog.js`, `modules/listeners.js`, `modules/utils.js`, `modules/apps/`, `modules/combat/`, `packs/`. Their names indicate intended responsibility.

## Known inconsistency

`system.json` references `systems/wispers-system/assets/...` for `media` and `background`, but the system `id` is `wispers` and all template files reference `systems/wispers/...`. The canonical install folder is `systems/wispers/` — the `wispers-system` paths in `system.json` are stale and should be updated to `wispers` when next touched.
