# TODO

Tracking intentional scaffolding and known inconsistencies in the Wispers FoundryVTT system. CLAUDE.md points here so the architectural doc stays focused; this file is where mutable project state lives.

## Known WIP / scaffolding

These are intentional placeholders, not bugs to fix opportunistically — flag them when relevant but don't silently rewrite:

- **Hotbar item macros silently fail.** `createItemMacro` writes the command `game.wisperssystem.rollItemMacro(uuid)`, but `game.wisperssystem` is never assigned (the `rollItemMacro` function in `wispers.js` is module-local). To fix: expose it on the `init` or `ready` hook (e.g., `game.wisperssystem = { rollItemMacro };`).
- **`wispersActor.prepareDerivedData()` is a stub.** It calls `_preparePlayerCharacterData` → `_setCharacterDetails`, which has only a comment. All derived stats (modifiers, computed saves, etc.) need to be implemented here. Until then, the sheet reads bonuses straight from `system.abilities.<x>.value` — see next item.
- **Save/school "bonus" is just the raw attribute value.** `header.hbs` and `_prepareContext` both use `system.abilities.<linkedAttribute>.value` directly as the save/school bonus. This is a passable stand-in but will need to become a derived value (proficiency + ability + situational) once `prepareDerivedData` is implemented.
- **Empty stub modules**: `modules/dice.js`, `modules/dialog.js`, `modules/listeners.js`. Their names indicate intended responsibility (currently the roll/dialog logic lives inline in `wispersCharacterSheet.js`). `packs/` exists but is empty. (`modules/combat/` now holds the initiative/action-point system — see CLAUDE.md.)
- **Action-point costs are not configured.** `wispersActor.spendActionPoints(cost)` is the spend primitive, but nothing calls it yet — per-action costs (move/attack/cast) still need a config + UI to deduct AP. Initiative itself is "currently unbound": the prompt accepts any integer with no min/max.
- **Encumbrance cap is a hard-coded `10`.** `_prepareContext` computes slot-based load (`weight × quantity`) against a static `ENCUMBRANCE_MAX = 10`. A later pass should derive the cap from Strength.

## Known inconsistencies

- **`system.json` token attributes don't exist.** It declares `primaryTokenAttribute: "health"` and `secondaryTokenAttribute: "mental"`, but neither field exists in the actor schema — health-equivalent data lives under `wounds`. Reconcile before relying on token bars.
- **`system.json` asset paths use the wrong folder.** `media` and `background` reference `systems/wispers-system/assets/...`, but the system `id` is `wispers` and all templates reference `systems/wispers/...`. The canonical install folder is `systems/wispers/` — update the `wispers-system` paths when next touched.
- **Weapon damage path mismatch.** `WispersItem.roll()` reads `system.damage.dice.value`, which only the `spell` schema provides (its inline `damage` block). Weapons store their damage under `system.dice.value` (via the shared `damageFields()` group), so a weapon's `roll()` skips the damage roll and posts a description card instead. Reconcile the path (or normalize the schemas) before wiring weapon attacks.
- **Two biography fields.** `baseActorFields()` defines a top-level `system.biography`, but the character sheet reads/writes `system.details.biography` (from `CharacterData`). The base-level field is currently dead — remove it or repoint the sheet.
- **`system.class.name` has no placeholder default anymore.** `CharacterData.class.name` initializes to `""` (the old `template.json` `"dingus"` placeholder is gone with the DataModel migration). Listed only so the old note isn't missed — nothing to do here.
