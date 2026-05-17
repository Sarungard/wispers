# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- Stores `CONFIG.WISPERS` (currently empty config object from `modules/config.js`) and toggles `CONFIG.INIT` as a load-phase lock.
- Registers `wispersActor` as `CONFIG.Actor.documentClass`.
- Unregisters the core ActorSheet and registers `wispersCharacterSheet` as the default Wispers sheet via `DocumentSheetConfig`.
- Preloads Handlebars partials from `templates/partials/character/`.
- Registers Handlebars helpers: `attributeDie`, `proficiencyDie`, `proficiencyPips`, `toLowerCase`, `log`. `proficiencyPips(value)` returns an array of `{level: 1–5, active: boolean}` used to render the 5-pip proficiency widgets.

There are **two `Hooks.once("ready", ...)` registrations** in `wispers.js` — one for GM-only init logic, one to attach the `hotbarDrop` listener. Both run; this is intentional, not a duplicate.

### Data schema: `template.json`

The single source of truth for what fields exist on each Actor and Item type. Foundry uses this at the database level — adding a new field anywhere requires editing this file. Key shape:

- **Actors**: `Character`, `NPC`. Both reference shared templates `["base", "skills"]`. The `base` template defines the 6 abilities (Str/Agi/Con/Kno/Pre/Spi), `wounds` (with `lightThreshold.value`, `heavyThreshold.value`, `modifier.value`, and a `consequences` array), `initiative`, and the full `skills` block (combat/social skills, spell schools, saving throws — each with a `proficiency.value` 0–5 and a `linkedAttribute` key into `abilities`).
- **Items**: `weapon`, `armor`, `shield`, `spell`, `consumable`, `loot`. Shared templates: `base` (description/quantity/weight/price), `equipment` (proficiency/equipped/type), `damage` (dice/circumstanceDice/damageType).

Note: `system.json` declares `primaryTokenAttribute: "health"` and `secondaryTokenAttribute: "mental"`, but neither `health` nor `mental` exist in `template.json` — health-equivalent data lives under `wounds`. Reconcile before relying on token bars.

### Sheet rendering: `wispersCharacterSheet`

`PARTS` declares `header` and `body`. `_configureRenderOptions` reduces parts to just `header` for users with limited permissions.

`DEFAULT_OPTIONS` registers four `actions` mapped to static handlers: `toggleAllSkills`, `toggleAllSchools`, `addSkill`, `addSchool`. Wire new sheet buttons by adding a `data-action="…"` attribute and a matching entry in this map — the ApplicationV2 framework does the dispatch.

`_prepareContext` builds the template context (`actor`, `system`, `items`, `config`, ownership flags) plus several pre-shaped collections used by the partials:

- `inventory` — items pre-grouped by type (`weapons`, `armor`, `shields`, `consumables`, `loot`).
- `spells` — spell items bucketed by `system.level.value` 1..5.
- `effects` — three categories: temporary (enabled + has duration), passive (enabled + no duration), inactive (disabled).
- `biographyHTML` — `actor.system.details.biography` run through `foundry.applications.ux.TextEditor.enrichHTML` (with a legacy/identity fallback).
- `skillRows` / `schoolRows` / `saveRows` — flattened arrays from `system.skills.{skills,spellSchools,savingthrows}`, each row carrying `key`, `label`, `linkedAttribute`, `value`/`proficiency`, and (for schools/saves) a `bonus` read from the linked ability. `skillRows` and `schoolRows` are filtered to trained-only (`value ≥ 1`) unless the per-instance flags `_showAllSkills` / `_showAllSchools` are toggled on. The unfiltered counts are also exposed as `untrainedSkillCount` / `untrainedSchoolCount` so the "Add skill/school" buttons can disable when there's nothing left to learn.

A copy of the final context is stashed on `this.sheetContext`.

`body.hbs` contains the main tab nav (`.tabs`, group `primary`) which switches between 6 tab partials in `templates/partials/character/`: `character` (the `attributes.hbs` partial — character details + skills + schools + saves), `inventory`, `features`, `spellbook`, `effects`, `biography`. `_onRender` binds a **single** `foundry.applications.ux.Tabs` instance against `.tabs` / `.sheet-content` with `initial: "character"`. The previous `.tabs2`/`.content2` nested tab UI no longer exists — don't reintroduce it without updating this doc.

### Sheet interactions

The sheet uses two render hooks for event wiring:

- **`_onFirstRender`** installs a single delegated click listener on `this.element`. It looks for the closest `.ability-label[data-roll-ability]` (→ `_rollAbility(key, value)`) or `.save-label[data-roll-save]` (→ `_rollSave(label, proficiency, bonus)`). Both roll handlers use static helpers `_attributeDieFormula` / `_proficiencyDieFormula`, which mirror the dice tiers in the Handlebars helpers and return e.g. `"1d8"`. Add new click-rollable elements by giving them one of these `data-roll-*` attributes (and the `.rollable` class for styling) — no per-element listeners needed.
- **`_onRender`** re-binds the tab group and wires every `.skill-pips` container. Clicking a pip writes `system.skills.<group>.<key>.proficiency.value` via `actor.update()`. Clicking the currently-active highest pip _decrements_ by one — this is the only way to demote a proficiency via the UI.

The **"Learn at Novice"** dialog (`_promoteToNovice`) is a `foundry.applications.api.DialogV2.prompt` that lists currently-untrained entries in a `<select>` and writes `proficiency.value = 1` on confirmation. Both `_onAddSkill` and `_onAddSchool` delegate to it.

`_prepareSubmitData` clamps every `system.skills.{skills|spellSchools|savingthrows}.*.proficiency.value` to `[0, 5]` (truncated to int). It handles both shapes Foundry can submit: flat dot-keyed fields and the expanded nested object. Any new 0–5 ladder field should be added to the regex / nested loop here.

### Attribute & proficiency dice tiers

Attributes and proficiency levels are stored as integers but displayed as dice icons. The mapping lives in private helpers in `wispers.js`:

- **`attributeDie(value)`**: 0 → `noDie`, 1–4 → `d4`, 5–6 → `d6`, 7–8 → `d8`, 9–10 → `d10`, 11+ → `d12`. Used in `header.hbs` and the sidebar.
- **`proficiencyDie(value)`**: 0 → `noDie`, 1 → `d4`, 2 → `d6`, 3 → `d8`, 4 → `d10`, 5 → `d12`. **Throws on values outside 0–5** — proficiencies are a fixed 0–5 ladder, attributes are open-ended.

The returned strings are CSS class names (matching dice background images in `assets/img/`). Don't change one tier without updating the corresponding LESS rule in `less/dice.less`.

### Rollable UI elements

Any UI element that triggers a die roll when clicked **must** have the `.rollable` CSS class. This applies to labels, spans, buttons, or any other element wired up with a roll handler — whether via direct event listeners or event delegation. The class is used for consistent cursor and hover styling across the sheet.

### Localization

User-facing strings flow through `game.i18n.localize()` (or `{{localize "KEY"}}` in templates). Keys live in `lang/en.json` (primary) and `lang/hu.json` (Hungarian). Templates use namespaces like `CONSTANTS.Tabs.*` and `CONSTANTS.Attributes.*.long`. Add new keys to **both** files.

## Open scaffolding & inconsistencies

See `TODO.md` for the current list of intentional placeholders and known schema/path inconsistencies — don't silently rewrite anything listed there without checking.
