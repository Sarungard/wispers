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
- Stores `CONFIG.WISPERS` (config object from `modules/config.js`) and toggles `CONFIG.INIT` as a load-phase lock. `CONFIG.WISPERS` holds both select-choice maps (`weaponTypes`, `armorTypes`, `featureTypes`, `currencies`) **and** the actor proficiency/ability metadata maps (`abilities`, `skills`, `spellSchools`, `savingthrows`) — see the actor data-layer section.
- Registers `wispersActor` as `CONFIG.Actor.documentClass`, `WispersItem` as `CONFIG.Item.documentClass`, and `WispersCombat` as `CONFIG.Combat.documentClass`.
- Registers a DataModel for **every** actor type via `CONFIG.Actor.dataModels` and **every** item type via `CONFIG.Item.dataModels` (see the data-layer sections below).
- Unregisters the core Actor **and** Item sheets and registers `wispersCharacterSheet` and `WispersItemSheet` as the defaults via `DocumentSheetConfig`.
- Preloads Handlebars partials from `templates/partials/character/`, `templates/actors/partials/`, and `templates/sheets/item/` (including every `types/<type>.hbs`). **Any new partial must be added to this preload list** or dynamic `{{> (lookup …)}}` includes will fail.
- Registers Handlebars helpers: `attributeDie`, `proficiencyDie`, `proficiencyPips`, `toLowerCase`, `log`. `proficiencyPips(value)` returns an array of `{level: 1–5, active: boolean}` used to render the 5-pip proficiency widgets.

There are **two `Hooks.once("ready", ...)` registrations** in `wispers.js` — one for GM-only init logic, one that attaches both the `hotbarDrop` listener **and** the `combatTurnChange` initiative re-prompt hook (see the combat section). Both run; this is intentional, not a duplicate.

### Data schemas — everything is a DataModel

Both actors and items use `foundry.abstract.TypeDataModel` schemas registered in `CONFIG.Actor.dataModels` / `CONFIG.Item.dataModels`. `template.json` is now **only** the list of valid types:

```json
"Actor": { "types": ["Character", "NPC"] },
"Item":  { "types": ["weapon", "armor", "shield", "spell", "consumable", "loot", "feature"] }
```

A registered DataModel **fully overrides** any template.json field block for that type, so don't re-add field definitions to `template.json` — they'd be dead and misleading. `template.json` now contains nothing but the two `types` arrays.

Note: `system.json` declares `primaryTokenAttribute: "health"` and `secondaryTokenAttribute: "mental"`, but neither `health` nor `mental` exist in the actor schema — health-equivalent data lives under `wounds`. Reconcile before relying on token bars.

### Actor data layer: `modules/data/actor/` + `CONFIG.WISPERS`

`CharacterData` and `NPCData` (registered as `CONFIG.Actor.dataModels.Character` / `.NPC`) compose shared field groups from `modules/data/actor/_helpers.js`: `baseActorFields()` (level/abilities/wounds/initiative/biography) and `skillsFields()` (the `skills` block: `skills`/`spellSchools`/`savingthrows`). On top of those, `CharacterData` adds `currency` (`iron`/`copper`/`silver`/`gold`, each `.value` — powers the coin-add/remove dialogs), `race`, `class`, `background`, and a `details` block (`age`/`height`/`weight`/`biography`/`notes`); `NPCData` adds a smaller `details` block (`description`/`special`). Note `baseActorFields()` already defines a top-level `system.biography`, but the sheet reads/writes **`system.details.biography`** (the `CharacterData` field) — the base-level one is currently dead (see `TODO.md`).

**Stored actor data holds only the user's choices** — `proficiency.value`, ability `value`/`start`, etc. The set of abilities/skills/schools/saves that *exist* and their **static metadata** (display `label` as a localization key, and `linkedAttribute`) live in `CONFIG.WISPERS.{abilities,skills,spellSchools,savingthrows}` (in `modules/config.js`). `_helpers.js` **imports `WISPERS` and derives the schema keys from those maps**, so config is the single source of truth: adding a skill there gives both the schema slot and the sheet row. This also means **labels are localizable** (they were previously frozen English strings baked into each actor's data) — `CONSTANTS.Skills.*`, `CONSTANTS.SpellSchools.*`, `CONSTANTS.SavingThrows.*`, `CONSTANTS.Attributes.*.long` in both lang files.

The character sheet reads metadata from config, never from stored data: `_prepareContext` builds `abilityRows`/`skillRows`/`schoolRows`/`saveRows` by merging `CONFIG.WISPERS` metadata (localized label, linkedAttribute) with the live stored value; `_rollAbility`, `_rollProficiencyFromGroup`, and `_promoteToNovice` all look up label/linkedAttribute from `CONFIG.WISPERS`. **Never read `label`/`linkedAttribute`/ability `id` off `actor.system`** — those fields no longer exist there.

**To add a skill / spell school / saving throw**: add one entry to the relevant `CONFIG.WISPERS` map (with a `label` localization key + `linkedAttribute`) and add that key to both lang files. The schema slot and the sheet row follow automatically.

### Item data layer: `modules/data/item/`

Each item type has a `TypeDataModel` subclass (`weapon`, `armor`, `shield`, `spell`, `consumable`, `loot`, `feature`), registered in `wispers.js` under `CONFIG.Item.dataModels`. DataModels have **no equivalent of template.json's `"templates"` inheritance**, so shared field groups live in `modules/data/item/_helpers.js` as functions returning fresh `foundry.data.fields.*` objects:

- `baseFields()` — description/source/quantity/weight/price (the old `base` template). On every type **except `feature`** (features aren't physical inventory).
- `equipmentFields()` — proficiency/equipped/type (weapons, armor, shields).
- `damageFields()` — dice/circumstanceDice/damageType (weapons; spells define their own damage inline because they have no circumstance die).
- `usesFields()` — `uses.{value,max}` (consumables, features).

A DataModel's `defineSchema()` **spreads** the groups it needs and adds its own fields — e.g. `WeaponData` is `{ ...baseFields(), ...equipmentFields(), ...damageFields(), weaponType, range, properties }`. The resulting `system` shapes match the pre-migration template.json exactly, so existing documents and the actor-sheet inventory/spellbook displays keep working unchanged.

**To add a new item type**, do all five: (1) add the type to `template.json` `Item.types`; (2) create `modules/data/item/<type>.js`; (3) register it in the `CONFIG.Item.dataModels` map in `wispers.js`; (4) create `templates/sheets/item/types/<type>.hbs` and add it to both the preload list in `wispers.js` **and** the `WispersItemSheet.TYPE_PARTS` map; (5) add localization keys to **both** `lang/en.json` and `lang/hu.json`. A type with no type-specific fields (like `loot`) can skip the partial — omit it from `TYPE_PARTS` and the sheet renders shared fields only.

### Item document & sheet: `WispersItem` / `WispersItemSheet`

`WispersItem` (`modules/objects/wispersItem.js`) is the `CONFIG.Item.documentClass`. Its `roll()` posts the item to chat — rolling `system.damage.dice.value` when present, otherwise a description card — and is what the `hotbarDrop` macro in `wispers.js` invokes. **Caveat:** only `spell` stores its damage at `system.damage.dice.value` (its inline `damage` block); `weapon` uses the shared `damageFields()` group, which lives at `system.dice.value`. So `roll()` currently fires the damage roll for spells but falls through to the description card for weapons — the path is inconsistent (see `TODO.md`).

`WispersItemSheet` (`modules/sheets/wispersItemSheet.js`) is an ApplicationV2 sheet mirroring the character sheet's shape (`DEFAULT_OPTIONS` / `PARTS`, `submitOnChange`). `PARTS` is `header` + `body`; `body.hbs` injects a per-type partial via `{{> (lookup . "typePartial")}}`, where `typePartial` comes from the static `TYPE_PARTS` map keyed by `item.type`. `_prepareContext` also exposes `hasInventoryFields` (`"quantity" in item.system`) which gates the shared quantity/weight/price/source fieldset so **features** (no base fields) don't render inputs for fields they lack. The sheet calls `installRelativeNumberInputs(this.element, this.item)` in `_onFirstRender` so item number fields support the same `+2`/`-5` relative-expression convention as the actor sheet (see below).

### Relative numeric inputs: `modules/utils.js`

`installRelativeNumberInputs(root, doc)` installs a **capture-phase** `change` listener: typing `+2` / `-5` into any `<input data-dtype="Number">` resolves to the current stored value ± the delta before Foundry's bubble-phase `submitOnChange` reads the form; a plain number sets absolutely. Both `wispersCharacterSheet` and `wispersItemSheet` call it — don't duplicate the logic inline. Any new numeric field that should accept expressions just needs `type="text"` + `data-dtype="Number"` and a `name` that is a data path on the bound document.

### Sheet rendering: `wispersCharacterSheet`

`PARTS` declares `header` and `body`. `_configureRenderOptions` calls `super` **first** and then sets `options.parts` to `["header"]` for limited-permission users or `["header", "body"]` otherwise. The order matters: the parent class can populate `options.parts` with a partial-render subset, and our explicit assignment needs to win so both parts always re-render together (otherwise displays in the header that depend on body fields — e.g. save bonuses derived from sidebar ability scores — go stale).

`DEFAULT_OPTIONS` registers `actions` mapped to static handlers: `toggleAllSkills`, `toggleAllSchools`, `addSkill`, `addSchool`, `addCoins`, `removeCoins`, `createItem`, `editItem`, `deleteItem`, `toggleEquipped`. Wire new sheet buttons by adding a `data-action="…"` attribute and a matching entry in this map — the ApplicationV2 framework does the dispatch. `createItem` reads `data-type` (item type) and an optional `data-feature-type`; the latter is applied via `foundry.utils.setProperty` into a nested `system.featureType.value` because document **creation** data is not run through `expandObject` (unlike `update()`), so a flat dotted key would be silently dropped. `toggleEquipped` flips `system.equipped.value` on equippable items (weapons/armor/shields). `addCoins`/`removeCoins` open `_showCoinDialog` (a four-denomination number form) and apply the deltas to `system.currency.<denom>.value` (remove clamps at 0).

`_prepareContext` builds the template context (`actor`, `system`, `items`, `config`, ownership flags) plus several pre-shaped collections used by the partials:

All items are first sorted by their `sort` field (drag-and-drop reordering writes `sort`; the raw collection iterates in insertion order) before being grouped.

- `inventory` — items pre-grouped by type (`weapons`, `armor`, `shields`, `consumables`, `loot`). `inventorySections` is the same data re-shaped as an ordered array of `{type, labelKey, items}` for the inventory partial's section loop.
- `encumbrance` — **slot-based** carry load: `{value, max, pct, over}`. Each carried item occupies `weight.value × quantity.value` slots; `max` is a static `10` for now (a later pass derives it from Strength), `pct` is the clamped percentage, `over` flags exceeding the cap.
- `spells` — spell items bucketed by `system.level.value` 1..5.
- `featureSections` — feature items bucketed by `system.featureType.value` into an ordered array of `{type, labelKey, items}` for `active`/`passive`/`reaction`.
- `effects` — three categories: temporary (enabled + has duration), passive (enabled + no duration), inactive (disabled).
- `biographyHTML` — `actor.system.details.biography` run through `foundry.applications.ux.TextEditor.enrichHTML` (with a legacy/identity fallback).
- `abilityRows` / `skillRows` / `schoolRows` / `saveRows` — built by iterating the `CONFIG.WISPERS` metadata maps (see the actor data-layer section) and merging each entry's localized `label` (+ `linkedAttribute` where it applies) with the live value read from `actor.system`. The rows are **not** uniform — each carries only what its section needs: `abilityRows` = `{key, label, value}`; `skillRows` = `{key, label, value, trained}` (no `linkedAttribute`/`bonus` — skills pick their linked attribute at roll time, not display time); `schoolRows` = `{key, label, linkedAttribute, value, bonus, showBonus, trained}` where `bonus` is the linked ability value and `showBonus` is `proficiency ≥ 4`; `saveRows` = `{key, label, linkedAttribute, proficiency, bonus}`. `skillRows` and `schoolRows` are filtered to trained-only (`value ≥ 1`) unless the per-instance flags `_showAllSkills` / `_showAllSchools` are toggled on. The unfiltered counts are also exposed as `untrainedSkillCount` / `untrainedSchoolCount` so the "Add skill/school" buttons can disable when there's nothing left to learn.

A copy of the final context is stashed on `this.sheetContext`.

`body.hbs` contains the main tab nav (`.tabs`, group `primary`) which switches between 6 tab partials in `templates/partials/character/`: `character` (the `attributes.hbs` partial — character details + skills + schools + saves), `inventory`, `features`, `spellbook`, `effects`, `biography`. `_onRender` binds a **single** `foundry.applications.ux.Tabs` instance against `.tabs` / `.sheet-content` with `initial: this._activeTab ?? "character"`. The active tab is tracked on `this._activeTab` (updated by a click listener on each `[data-tab]`) so a re-render — which happens on every field change via the `updateActor`/`updateItem` hooks — keeps the user on the tab they were viewing instead of snapping back to `character`. The previous `.tabs2`/`.content2` nested tab UI no longer exists — don't reintroduce it without updating this doc.

### Sheet interactions

The sheet uses two render hooks for event wiring, plus `updateActor` / `createItem` / `updateItem` / `deleteItem` Hook listeners:

- **`_onFirstRender`** installs a single delegated click listener on `this.element`. It dispatches by attribute: `.ability-label[data-roll-ability]` → `_rollAbility(key, value)`; `.save-label[data-roll-save]`, `.skill-name[data-roll-skill]`, and `.skill-name[data-roll-school]` all route through `_rollProficiencyFromGroup(group, key)` (where `group` is `"savingthrows"`, `"skills"`, or `"spellSchools"`), which reads the entry live from `this.actor.system.skills[group][key]`, looks up `label`/`linkedAttribute` from `CONFIG.WISPERS[group][key]`, and forwards the shaped options to `_rollProficiency`. The `data-roll-*` value is always the document **lookup key** (e.g. `data-roll-save="reflex"`, `data-roll-skill="athletics"`, `data-roll-ability="agi"`); the handler reads proficiency, `linkedAttribute`, and label live at click time. **Never bake derived values into `data-*` attributes** (no `data-bonus`, no `data-proficiency`) — they snapshot the model at render time, go stale on the next field change, and cause rolls to fire with the wrong numbers. Add new click-rollable proficiency-style elements by giving them one of these `data-roll-*` attributes (plus the `.rollable` class for styling) and, if it's a new group, adding a branch in the delegated handler that calls `_rollProficiencyFromGroup` with the right group key — no per-element listeners needed.
- **`_onFirstRender` also registers re-render listeners**: `Hooks.on("updateActor", …)` (calls `this.render()` when this actor changes) plus `createItem` / `updateItem` / `deleteItem` (re-render when an owned item changes — used so e.g. the equipped-toggle icon and inventory list refresh). The matching `close()` override removes all four. This is the **load-bearing** workaround for the re-render problem: ApplicationV2's automatic re-render after `submitOnChange` form submission isn't reliable for displays computed from other fields (save bonuses derived from linked ability scores, etc.), so we subscribe explicitly. The pip click handler in `_onRender` works around the same issue with an explicit `this.render()`. If you remove the hook listeners, manually verify that changing an ability score immediately updates every derived display (header save bonuses, the saves and spell-schools sections in the character tab) without reopening the sheet.
- **`_onFirstRender` also wires drag-and-drop** for the whole sheet (`dragover`/`drop` on `this.element` → `_handleDrop`). A drop of an item **already owned by this actor** reorders it within its type section via `foundry.utils.performIntegerSort` (writing `sort`); a drop from **elsewhere** creates a copy on this actor (`createEmbeddedDocuments` with `sourceItem.toObject()`).
- **`_onRender`** re-binds the tab group (see active-tab note above) and wires: every `input[type='search']` (a per-tab name filter — each search is scoped to its own `.tab` so typing in one tab doesn't hide rows in another); the inventory `dragstart`/`dragover`/`dragleave` indicators (the `.drag-above`/`.drag-below` drop markers); and every `.skill-pips` container. Clicking a pip writes `system.skills.<group>.<key>.proficiency.value` via `actor.update()` then calls `this.render()` explicitly (see above). Clicking the currently-active highest pip _decrements_ by one — this is the only way to demote a proficiency via the UI.

### Roll flow

Both `_rollAbility` and `_rollProficiency` (used by saves, skills, and spell schools — see the click-handler dispatch above) assemble a pool of dice strings, run it through the **Boon/Bane** transform, append any flat bonus, and post to chat. The roll is the **sum** of every part in the pool.

1. **Resolve the base die.** `_attributeDieFormula(value)` / `_proficiencyDieFormula(value)` map the integer stat to a dice string (`"1d4"` … `"1d12"`). Both mirror the Handlebars tier tables exactly. `_attributeDieFormula` returns `null` for `value ≤ 0`; `_proficiencyDieFormula` returns `null` for `value = 0` (untrained). Both call sites coerce `null` to the literal string `"0"` via `?? "0"`, so the dialog still opens for untrained rolls and the result is the rest of the pool (difficulty die, attribute die, flat bonus) with no proficiency/ability die contribution — "bonus only" rather than blocked.
2. **Prompt the user via `_showRollDialog(label, { showDifficulty = true })`.** A `DialogV2.prompt` returns `{ boonBane, difficultyDie }`:
   - **Boon/Bane** — a `<select>` of `bane` / `none` (default) / `boon`. This is the system's advantage mechanic (it replaced the old fixed `±2` die-tier modifier).
   - **Difficulty die** — a `<select>` of levels `0`–`5` mapping to `null` / `1d4` / `1d6` / `1d8` / `1d10` / `1d12`, representing the task's difficulty as an **extra die added to the pool**. Rendered only when `showDifficulty` is true.

   The dialog has `rejectClose: false`, so closing without confirming returns `null` and the caller aborts. All strings live under `CONSTANTS.Roll.*` in both lang files: `Title` (formatted with `game.i18n.format` and a `{label}` placeholder — keep the token when translating), `BoonBane`, `Boon`, `BoonBaneNone`, `Bane`, `DifficultyDie`, `DifficultyNone`, `Difficulty1`…`Difficulty5`, `Roll`.
3. **Apply Boon/Bane, then bonus, then roll.** `_applyBoonBane(parts, mode)` walks the fixed ladder `["1d4", "1d6", "1d8", "1d10", "1d12"]`: on **boon** it shifts the *smallest* die in the pool **up** one tier; on **bane** it shifts the *largest* die **down** one tier (both clamped at the ends); `none` is a no-op. Only one die is shifted, and only dice that are on the ladder are eligible — flat bonuses and the `"0"` untrained fallback pass through untouched. Any flat bonus is appended after the shift, and the pool is joined with `+` into a single `Roll`, evaluated, and posted via `toMessage({ speaker, flavor: label })`.

The three rollers differ only in what they put in the pool:

- **`_rollAbility(key, value)`** — `[attributeDie, difficultyDie?]`, Boon/Bane applied. No proficiency and no flat bonus: an ability click is the unmodified attribute check (plus chosen difficulty). The asymmetry with proficiency rolls is by design — don't fold a proficiency into `_rollAbility` without a rules decision.
- **`_rollProficiency(label, proficiency, { attributeDie, applyAttrBonus, linkedAttr, showDifficulty })`** — pool is `[proficiencyDie, attributeDie?, difficultyDie?]`; if `applyAttrBonus` is set, the linked ability's `value` is appended as a flat bonus *after* Boon/Bane.
- **`_rollProficiencyFromGroup(group, key)`** dispatches the three groups into that signature: **skills** → `showDifficulty: true`, no attribute die, no flat bonus; **savingthrows** → proficiency die plus Boon/Bane only (no difficulty, no attribute die); **spellSchools** → always adds the linked-attribute *die* to the pool, and additionally adds the linked attribute *value* as a flat bonus **only when `proficiency ≥ 4`** (`applyAttrBonus`) — this `≥ 4` threshold is the same one `schoolRows.showBonus` surfaces in the UI.

If you add a new rollable that needs the same UX, call `_showRollDialog` and `_applyBoonBane` — don't reinvent the dialog locally, and don't change the ladder in `_applyBoonBane` without also updating `_attributeDieFormula` / `_proficiencyDieFormula` and the Handlebars tier helpers in `wispers.js`.

The **"Learn at Novice"** dialog (`_promoteToNovice`) is a separate `foundry.applications.api.DialogV2.prompt` that lists currently-untrained entries in a `<select>` and writes `proficiency.value = 1` on confirmation. Both `_onAddSkill` and `_onAddSchool` delegate to it.

`_prepareSubmitData` clamps every `system.skills.{skills|spellSchools|savingthrows}.*.proficiency.value` to `[0, 5]` (truncated to int). It handles both shapes Foundry can submit: flat dot-keyed fields and the expanded nested object. Any new 0–5 ladder field should be added to the regex / nested loop here.

### Combat & initiative: `modules/combat/wispersCombat.js`

Initiative is **not rolled** — it's a number the controller *chooses*, and that number is two things at once: the combatant's place in the turn order **and** their action-point pool for the turn. `WispersCombat` (registered as `CONFIG.Combat.documentClass`) overrides:

- **`_sortCombatants`** — orders **lowest initiative first** (the reverse of Foundry's default). A low number means you act sooner but bank fewer action points; unset initiative sorts last. This is a deliberate tradeoff mechanic, not a bug — don't "fix" it to descending.
- **`rollInitiative`** — replaces the dice flow with `promptInitiative` (a `DialogV2` number input). The chosen value is written to `combatant.initiative` (turn order) **and** the actor's `system.initiative.{total, remaining}` (AP pool) via `actor.resetInitiative(value)`.

**AP lives on the actor** in `system.initiative.total` (the chosen number / AP cap) and `.remaining` (live pool) — these fields predate this system in the actor schema (`_helpers.js`). `wispersActor.resetInitiative(value)` sets both (discarding any leftover AP — picking a new number *overwrites*, never adds); `wispersActor.spendActionPoints(cost)` is the spend primitive. **Per-action AP costs are not yet wired** — nothing calls `spendActionPoints` yet (see `TODO.md`).

**Re-prompt cadence is end-of-turn, not start.** A combatant re-chooses their number the moment their turn *ends*, so it's locked in and available for **reaction** spending before their next turn begins. This is driven by the `combatTurnChange` hook in `wispers.js` (fires on every client) → `WispersCombat.onTurnEnd(endedCombatant)`. The first turn's numbers come from `rollInitiative` at combat start.

**Exactly one client prompts per combatant** — `_isResponsibleUser` returns the first *active player owner*, or the GM when no player owns it. Both `rollInitiative` and the `combatTurnChange` handler gate on it, so a GM "Roll All" sets only NPC numbers (players pick their own) and the end-of-turn dialog never opens on two screens. Consequence: a GM "Roll All" intentionally **skips** combatants an active player owns.

The character-sheet header shows AP read-only (`system.initiative.remaining / .total`); the `updateActor` hook in the sheet re-renders it when AP changes.

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
