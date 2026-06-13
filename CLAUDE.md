# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Nested guides.** This file covers the repo-wide picture (overview, build, the v13 API rules, the `wispers.js` entry point, schemas, localization). Subsystem detail lives in nested `CLAUDE.md` files that load automatically when you touch those folders — consult them rather than duplicating their content here:
> - `modules/data/CLAUDE.md` — actor & item **DataModel** layer (`CONFIG.WISPERS` metadata, base→effective split, how to add a skill / item type).
> - `modules/sheets/CLAUDE.md` — character & item **sheets**: rendering, interactions, roll flow, chat cards, proficiency groups, relative numeric inputs.
> - `modules/combat/CLAUDE.md` — **combat & initiative** (AP-as-initiative model).

## Project Overview

**Wispers** is a custom game system for [FoundryVTT v13](https://foundryvtt.com/) (a web-based tabletop RPG platform). It implements a d20-based RPG with 6 core attributes, skill proficiencies measured in dice tiers, spell schools, and saving throws. Currently v0.0.1 and in active early development — much of the gameplay logic is stubbed out and ready for implementation.

## Build & Deploy

**LESS compilation**: `less/wispers.less` is the entry point and `@import`s all partials. It compiles to `wispers.css` at the repo root. There is no npm/build tool — compile with an IDE LESS plugin or the LESS CLI.

**Deploying to FoundryVTT**: see `.vscode/tasks.json` (default build task) for the exact command — a recursive copy into the local FoundryVTT systems folder. Reload FoundryVTT in the browser after deploying.

There are no automated tests and no linter configured.

## FoundryVTT v13 API — Important

This codebase targets the **modern v13 ApplicationV2 API**. When suggesting code, use the `foundry.applications.*` namespaces, **not** the legacy globals:

| Use this (v13)                              | Not this (legacy v1)         |
|---------------------------------------------|------------------------------|
| `foundry.applications.api.HandlebarsApplicationMixin` | `FormApplication` mixins    |
| `foundry.applications.sheets.ActorSheetV2`  | `ActorSheet`                 |
| `foundry.applications.apps.DocumentSheetConfig` | `Actors.unregisterSheet(...)` |
| `foundry.applications.handlebars.loadTemplates` | `loadTemplates` global    |
| `foundry.applications.ux.Tabs`              | `Tabs` global                |

Sheets define `static DEFAULT_OPTIONS` and `static PARTS` (a map of part name → template path), override `_prepareContext()` to assemble template data, and override `_onRender()` to wire up post-render behavior like tab bindings.

## Architecture

### Entry point: `wispers.js`

The sole ES module entry (declared in `system.json` `esmodules`). On the `init` hook it:
- Stores `CONFIG.WISPERS` (config object from `modules/config.js`) and toggles `CONFIG.INIT` as a load-phase lock. `CONFIG.WISPERS` holds select-choice maps (`weaponTypes`, `armorTypes`, `featureTypes`, `currencies`), the actor proficiency/ability metadata maps (`abilities`, `skills`, `spellSchools`, `savingthrows`), and the v1 combat registries (`weaponCategories`, `weaponProperties`, `spellDegrees` + `spellDegreeOrder`, `effectScopes`, `conditions`, `woundTables`) — see `modules/data/CLAUDE.md` and the spec docs.
- Registers `wispersActor` as `CONFIG.Actor.documentClass`, `WispersItem` as `CONFIG.Item.documentClass`, and `WispersCombat` as `CONFIG.Combat.documentClass`.
- Registers a DataModel for **every** actor type via `CONFIG.Actor.dataModels` and **every** item type via `CONFIG.Item.dataModels` (see `modules/data/CLAUDE.md`).
- Unregisters the core Actor **and** Item sheets and registers `wispersCharacterSheet` and `WispersItemSheet` as the defaults via `DocumentSheetConfig`.
- Preloads Handlebars partials from `templates/partials/character/`, `templates/actors/partials/`, and `templates/sheets/item/` (including every `types/<type>.hbs`). **Any new partial must be added to this preload list** or dynamic `{{> (lookup …)}}` includes will fail.
- Registers Handlebars helpers: `attributeDie`, `proficiencyDie`, `proficiencyPips`, `proficiencyTerm`, `toLowerCase`, `log`, `dieClass`. `proficiencyPips(value)` returns an array of `{level: 1–5, active: boolean}` used to render the 5-pip proficiency widgets. `proficiencyTerm(value)` returns the localized tier name (`"Untrained"` … `"Master"`, derived from `CONSTANTS.Proficiency.*` in the lang files) for a proficiency value 0–5; used in UI displays and expandable description cards. `dieClass(formula)` maps a die formula string (e.g. `"1d8"`) to a die CSS class (e.g. `"d8"`) for dice-icon backgrounds; used by inventory and spellbook roll controls.

There are **two `Hooks.once("ready", ...)` registrations** in `wispers.js` — the first releases the `CONFIG.INIT` load lock, calls `buildConditionRegistry()` (loads the `conditions` compendium and registers `CONFIG.statusEffects` + `WISPERS.conditions` from each condition Item's transfer effects — a no-op until the pack has content; see `effects-conditions.md` §5), then runs GM-only init logic; the second attaches both the `hotbarDrop` listener **and** the `combatTurnChange` initiative re-prompt hook (see `modules/combat/CLAUDE.md`). Both run; this is intentional, not a duplicate.

### Attribute & proficiency dice tiers

Attributes and proficiency levels are stored as integers but displayed as dice icons. The mapping lives in private helpers in `wispers.js`:

- **`attributeDie(value)`**: 0 → `noDie`, 1–4 → `d4`, 5–6 → `d6`, 7–8 → `d8`, 9–10 → `d10`, 11+ → `d12`. Used in `header.hbs` and the sidebar.
- **`proficiencyDie(value)`**: 0 → `noDie`, 1 → `d4`, 2 → `d6`, 3 → `d8`, 4 → `d10`, 5 → `d12`. **Throws on values outside 0–5** — proficiencies are a fixed 0–5 ladder, attributes are open-ended.

The returned strings are CSS class names (matching dice background images in `assets/img/`). Don't change one tier without updating the corresponding LESS rule in `less/dice.less`. The roll-flow formula helpers in the character sheet (`_attributeDieFormula` / `_proficiencyDieFormula`) mirror these tables exactly — keep all three in sync (see `modules/sheets/CLAUDE.md`).

### Data schemas — everything is a DataModel

Both actors and items use `foundry.abstract.TypeDataModel` schemas registered in `CONFIG.Actor.dataModels` / `CONFIG.Item.dataModels`. `template.json` is now **only** the list of valid types:

```json
"Actor": { "types": ["Character", "NPC"] },
"Item":  { "types": ["weapon", "armor", "shield", "spell", "consumable", "loot", "feature", "wound"] }
```

A registered DataModel **fully overrides** any template.json field block for that type, so don't re-add field definitions to `template.json` — they'd be dead and misleading. `template.json` now contains nothing but the two `types` arrays.

Note: `system.json` declares `primaryTokenAttribute: "health"` and `secondaryTokenAttribute: "mental"`, but neither `health` nor `mental` exist in the actor schema — health-equivalent data lives under `wounds`. Reconcile before relying on token bars.

The schema field groups, the `CONFIG.WISPERS` metadata pattern, the base→effective effects split, and the recipes for adding a skill / spell school / saving throw / item type all live in **`modules/data/CLAUDE.md`**.

### Localization

User-facing strings flow through `game.i18n.localize()` (or `{{localize "KEY"}}` in templates). Keys live in `lang/en.json` (primary) and `lang/hu.json` (Hungarian). Templates use namespaces like `CONSTANTS.Tabs.*` and `CONSTANTS.Attributes.*.long`. Add new keys to **both** files.

## Open scaffolding & inconsistencies

See `TODO.md` for the current list of intentional placeholders and known schema/path inconsistencies — don't silently rewrite anything listed there without checking.
