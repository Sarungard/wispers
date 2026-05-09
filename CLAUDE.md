# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Wispers** is a custom game system for [FoundryVTT v13](https://foundryvtt.com/) (a web-based tabletop RPG platform). It implements a d20-based RPG with 6 core attributes, skill proficiencies measured in dice tiers, spell schools, and saving throws. Currently v0.0.1 and in active early development — much of the gameplay logic is stubbed out and ready for implementation.

## Build & Deploy

**LESS compilation**: `less/wispers.less` is the entry point and `@import`s all partials. It compiles to `wispers.css` at the repo root. There is no npm/build tool — compile with an IDE LESS plugin or the LESS CLI.

**Deploying to FoundryVTT** (the VSCode default build task in `.vscode/tasks.json`):
```powershell
cd F:\_Gamer1_adatai\Desktop\Wispers5e\wispers; cp -Force -r . C:\Users\zolta\AppData\Local\FoundryVTT\Data\systems
```
After deploying, reload FoundryVTT in the browser (or restart the world) to pick up changes.

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
- Stores `CONFIG.WISPERS` (currently empty config object from `modules/config.js`) and toggles `CONFIG.INIT` as a load-phase lock.
- Registers `wispersActor` as `CONFIG.Actor.documentClass`.
- Unregisters the core ActorSheet and registers `wispersCharacterSheet` as the default Wispers sheet via `DocumentSheetConfig`.
- Preloads Handlebars partials from `templates/partials/character/`.
- Registers Handlebars helpers: `attributeDie`, `proficiencyDie`, `toLowerCase`, `log`.

There are **two `Hooks.once("ready", ...)` registrations** in `wispers.js` — one for GM-only init logic, one to attach the `hotbarDrop` listener. Both run; this is intentional, not a duplicate.

### Data schema: `template.json`

The single source of truth for what fields exist on each Actor and Item type. Foundry uses this at the database level — adding a new field anywhere requires editing this file. Key shape:

- **Actors**: `Character`, `NPC`. Both reference shared templates `["base", "skills"]`. The `base` template defines the 6 abilities (Str/Agi/Con/Kno/Pre/Spi), wounds, initiative, and the full `skills` block (combat/social skills, spell schools, saving throws — each with a `proficiency.value` 0–5).
- **Items**: `weapon`, `armor`, `shield`, `spell`, `consumable`, `loot`. Shared templates: `base` (description/quantity/weight/price), `equipment` (proficiency/equipped/type), `damage` (dice/circumstanceDice/damageType).

Note: `system.json` declares `primaryTokenAttribute: "health"` and `secondaryTokenAttribute: "mental"`, but neither `health` nor `mental` exist in `template.json` — health-equivalent data lives under `wounds`. Reconcile before relying on token bars.

### Sheet rendering: `wispersCharacterSheet`

`PARTS` declares `header` and `body`. `_configureRenderOptions` reduces parts to just `header` for users with limited permissions. `_prepareContext` builds the template context (`actor`, `system`, `items`, `effects`, `config`, ownership flags) and stashes a copy on `this.sheetContext` for later use.

`body.hbs` contains the main tab nav (`.tabs`, group `primary`) which switches between 6 tab partials in `templates/partials/character/`: `attributes`, `inventory`, `features`, `spellbook`, `effects`, `biography`. `_onRender` binds **two** tab groups — `.tabs` (primary, initial `tab1`) and `.tabs2` (initial `tab2-1`) — so any new nested tab UI should target `.tabs2`/`.content2`.

### Attribute & proficiency dice tiers

Attributes and proficiency levels are stored as integers but displayed as dice icons. The mapping lives in private helpers in `wispers.js`:

- **`attributeDie(value)`**: 0 → `noDie`, 1–4 → `d4`, 5–6 → `d6`, 7–8 → `d8`, 9–10 → `d10`, 11+ → `d12`. Used in `header.hbs` and the sidebar.
- **`proficiencyDie(value)`**: 0 → `noDie`, 1 → `d4`, 2 → `d6`, 3 → `d8`, 4 → `d10`, 5 → `d12`. **Throws on values outside 0–5** — proficiencies are a fixed 0–5 ladder, attributes are open-ended.

The returned strings are CSS class names (matching dice background images in `assets/img/`). Don't change one tier without updating the corresponding LESS rule in `less/dice.less`.

### Localization

User-facing strings flow through `game.i18n.localize()` (or `{{localize "KEY"}}` in templates). Keys live in `lang/en.json` (primary) and `lang/hu.json` (Hungarian). Templates use namespaces like `CONSTANTS.Tabs.*` and `CONSTANTS.Attributes.*.long`. Add new keys to **both** files.

## Known WIP / scaffolding

These are intentional placeholders, not bugs to fix opportunistically — flag them when relevant but don't silently rewrite:

- **Hotbar item macros silently fail.** `createItemMacro` writes the command `game.wisperssystem.rollItemMacro(uuid)`, but `game.wisperssystem` is never assigned (the `rollItemMacro` function in `wispers.js` is module-local). To fix: expose it on the `init` or `ready` hook (e.g., `game.wisperssystem = { rollItemMacro };`).
- **No custom Item document class.** `CONFIG.Item.documentClass = WispersItem;` and the corresponding sheet registration are commented out in `wispers.js`. Items use the core Foundry classes for now.
- **`wispersActor.prepareDerivedData()` is a stub.** It calls `_preparePlayerCharacterData` → `_setCharacterDetails`, which has only a comment. All derived stats (modifiers, computed saves, etc.) need to be implemented here.
- **Saving throw bonuses are hardcoded** as `+3`/`+4`/`+5` strings in `templates/sheets/character/header.hbs`. They aren't computed from data yet.
- **Empty stub modules**: `modules/dice.js`, `modules/dialog.js`, `modules/listeners.js`, `modules/utils.js`, `modules/apps/`, `modules/combat/`, `packs/`. Their names indicate intended responsibility.

## Known inconsistency

`system.json` references `systems/wispers-system/assets/...` for `media` and `background`, but the system `id` is `wispers` and all template files reference `systems/wispers/...`. The canonical install folder is `systems/wispers/` — the `wispers-system` paths in `system.json` are stale and should be updated to `wispers` when next touched.
