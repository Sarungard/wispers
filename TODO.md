# TODO

Tracking intentional scaffolding and known inconsistencies in the Wispers FoundryVTT system. CLAUDE.md points here so the architectural doc stays focused; this file is where mutable project state lives.

## Known WIP / scaffolding

These are intentional placeholders, not bugs to fix opportunistically — flag them when relevant but don't silently rewrite:

- **Hotbar item macros silently fail.** `createItemMacro` writes the command `game.wisperssystem.rollItemMacro(uuid)`, but `game.wisperssystem` is never assigned (the `rollItemMacro` function in `wispers.js` is module-local). To fix: expose it on the `init` or `ready` hook (e.g., `game.wisperssystem = { rollItemMacro };`).
- **No custom Item document class.** `CONFIG.Item.documentClass = WispersItem;` and the corresponding sheet registration are commented out in `wispers.js`. Items use the core Foundry classes for now.
- **`wispersActor.prepareDerivedData()` is a stub.** It calls `_preparePlayerCharacterData` → `_setCharacterDetails`, which has only a comment. All derived stats (modifiers, computed saves, etc.) need to be implemented here. Until then, the sheet reads bonuses straight from `system.abilities.<x>.value` — see next item.
- **Save/school "bonus" is just the raw attribute value.** `header.hbs` and `_prepareContext` both use `system.abilities.<linkedAttribute>.value` directly as the save/school bonus. This is a passable stand-in but will need to become a derived value (proficiency + ability + situational) once `prepareDerivedData` is implemented.
- **Empty stub modules**: `modules/dice.js`, `modules/dialog.js`, `modules/listeners.js`, `modules/apps/`, `packs/`. Their names indicate intended responsibility. (`modules/combat/` now holds the initiative/action-point system — see below.)
- **Action-point costs are not configured.** `wispersActor.spendActionPoints(cost)` is the spend primitive, but nothing calls it yet — per-action costs (move/attack/cast) still need a config + UI to deduct AP. Initiative itself is "currently unbound": the prompt accepts any integer with no min/max.
- **`system.class.name` defaults to the string `"dingus"`** in `template.json`. Placeholder — new characters will display "dingus" under their name until this is replaced with a real default (probably `""`).

## Known inconsistency

`system.json` references `systems/wispers-system/assets/...` for `media` and `background`, but the system `id` is `wispers` and all template files reference `systems/wispers/...`. The canonical install folder is `systems/wispers/` — the `wispers-system` paths in `system.json` are stale and should be updated to `wispers` when next touched.
