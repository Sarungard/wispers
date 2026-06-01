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
- Stores `CONFIG.WISPERS` (config object from `modules/config.js` — holds select-choice maps like `weaponTypes`, `armorTypes`, `featureTypes`, `currencies`) and toggles `CONFIG.INIT` as a load-phase lock.
- Registers `wispersActor` as `CONFIG.Actor.documentClass` and `WispersItem` as `CONFIG.Item.documentClass`.
- Registers an item DataModel for **every** item type via `CONFIG.Item.dataModels` (see the item data-layer section below).
- Unregisters the core Actor **and** Item sheets and registers `wispersCharacterSheet` and `WispersItemSheet` as the defaults via `DocumentSheetConfig`.
- Preloads Handlebars partials from `templates/partials/character/`, `templates/actors/partials/`, and `templates/sheets/item/` (including every `types/<type>.hbs`). **Any new partial must be added to this preload list** or dynamic `{{> (lookup …)}}` includes will fail.
- Registers Handlebars helpers: `attributeDie`, `proficiencyDie`, `proficiencyPips`, `toLowerCase`, `log`. `proficiencyPips(value)` returns an array of `{level: 1–5, active: boolean}` used to render the 5-pip proficiency widgets.

There are **two `Hooks.once("ready", ...)` registrations** in `wispers.js` — one for GM-only init logic, one to attach the `hotbarDrop` listener. Both run; this is intentional, not a duplicate.

### Data schemas — a deliberate split

The system uses **two different schema mechanisms**, on purpose:

- **Actors → `template.json`.** The `Actor` block is the source of truth for `Character` / `NPC` fields. Both reference shared templates `["base", "skills"]`. The `base` template defines the 6 abilities (Str/Agi/Con/Kno/Pre/Spi), `wounds` (with `lightThreshold.value`, `heavyThreshold.value`, `modifier.value`, and a `consequences` array), `initiative`, and the full `skills` block (combat/social skills, spell schools, saving throws — each with a `proficiency.value` 0–5 and a `linkedAttribute` key into `abilities`). Adding an actor field means editing `template.json`.
- **Items → DataModels** (see next section). The `Item` block in `template.json` is now **only** `"types": [...]` — the list of valid item types. It carries **no field definitions**; every type's schema lives in a `foundry.abstract.TypeDataModel` class registered in `CONFIG.Item.dataModels`. A registered DataModel fully overrides any template.json entry for that type, so don't re-add item field blocks to `template.json` — they'd be dead and misleading.

Note: `system.json` declares `primaryTokenAttribute: "health"` and `secondaryTokenAttribute: "mental"`, but neither `health` nor `mental` exist in the actor schema — health-equivalent data lives under `wounds`. Reconcile before relying on token bars.

### Item data layer: `modules/data/item/`

Each item type has a `TypeDataModel` subclass (`weapon`, `armor`, `shield`, `spell`, `consumable`, `loot`, `feature`), registered in `wispers.js` under `CONFIG.Item.dataModels`. DataModels have **no equivalent of template.json's `"templates"` inheritance**, so shared field groups live in `modules/data/item/_helpers.js` as functions returning fresh `foundry.data.fields.*` objects:

- `baseFields()` — description/source/quantity/weight/price (the old `base` template). On every type **except `feature`** (features aren't physical inventory).
- `equipmentFields()` — proficiency/equipped/type (weapons, armor, shields).
- `damageFields()` — dice/circumstanceDice/damageType (weapons; spells define their own damage inline because they have no circumstance die).
- `usesFields()` — `uses.{value,max}` (consumables, features).

A DataModel's `defineSchema()` **spreads** the groups it needs and adds its own fields — e.g. `WeaponData` is `{ ...baseFields(), ...equipmentFields(), ...damageFields(), weaponType, range, properties }`. The resulting `system` shapes match the pre-migration template.json exactly, so existing documents and the actor-sheet inventory/spellbook displays keep working unchanged.

**To add a new item type**, do all five: (1) add the type to `template.json` `Item.types`; (2) create `modules/data/item/<type>.js`; (3) register it in the `CONFIG.Item.dataModels` map in `wispers.js`; (4) create `templates/sheets/item/types/<type>.hbs` and add it to both the preload list in `wispers.js` **and** the `WispersItemSheet.TYPE_PARTS` map; (5) add localization keys to **both** `lang/en.json` and `lang/hu.json`. A type with no type-specific fields (like `loot`) can skip the partial — omit it from `TYPE_PARTS` and the sheet renders shared fields only.

### Item document & sheet: `WispersItem` / `WispersItemSheet`

`WispersItem` (`modules/objects/wispersItem.js`) is the `CONFIG.Item.documentClass`. Its `roll()` posts the item to chat — rolling `system.damage.dice.value` when present, otherwise a description card — and is what the `hotbarDrop` macro in `wispers.js` invokes.

`WispersItemSheet` (`modules/sheets/wispersItemSheet.js`) is an ApplicationV2 sheet mirroring the character sheet's shape (`DEFAULT_OPTIONS` / `PARTS`, `submitOnChange`). `PARTS` is `header` + `body`; `body.hbs` injects a per-type partial via `{{> (lookup . "typePartial")}}`, where `typePartial` comes from the static `TYPE_PARTS` map keyed by `item.type`. `_prepareContext` also exposes `hasInventoryFields` (`"quantity" in item.system`) which gates the shared quantity/weight/price/source fieldset so **features** (no base fields) don't render inputs for fields they lack. The sheet calls `installRelativeNumberInputs(this.element, this.item)` in `_onFirstRender` so item number fields support the same `+2`/`-5` relative-expression convention as the actor sheet (see below).

### Relative numeric inputs: `modules/utils.js`

`installRelativeNumberInputs(root, doc)` installs a **capture-phase** `change` listener: typing `+2` / `-5` into any `<input data-dtype="Number">` resolves to the current stored value ± the delta before Foundry's bubble-phase `submitOnChange` reads the form; a plain number sets absolutely. Both `wispersCharacterSheet` and `wispersItemSheet` call it — don't duplicate the logic inline. Any new numeric field that should accept expressions just needs `type="text"` + `data-dtype="Number"` and a `name` that is a data path on the bound document.

### Sheet rendering: `wispersCharacterSheet`

`PARTS` declares `header` and `body`. `_configureRenderOptions` calls `super` **first** and then sets `options.parts` to `["header"]` for limited-permission users or `["header", "body"]` otherwise. The order matters: the parent class can populate `options.parts` with a partial-render subset, and our explicit assignment needs to win so both parts always re-render together (otherwise displays in the header that depend on body fields — e.g. save bonuses derived from sidebar ability scores — go stale).

`DEFAULT_OPTIONS` registers `actions` mapped to static handlers: `toggleAllSkills`, `toggleAllSchools`, `addSkill`, `addSchool`, `addCoins`, `removeCoins`, `createItem`, `editItem`, `deleteItem`. Wire new sheet buttons by adding a `data-action="…"` attribute and a matching entry in this map — the ApplicationV2 framework does the dispatch. `createItem` reads `data-type` (item type) and an optional `data-feature-type`; the latter is applied via `foundry.utils.setProperty` into a nested `system.featureType.value` because document **creation** data is not run through `expandObject` (unlike `update()`), so a flat dotted key would be silently dropped.

`_prepareContext` builds the template context (`actor`, `system`, `items`, `config`, ownership flags) plus several pre-shaped collections used by the partials:

- `inventory` — items pre-grouped by type (`weapons`, `armor`, `shields`, `consumables`, `loot`).
- `spells` — spell items bucketed by `system.level.value` 1..5.
- `effects` — three categories: temporary (enabled + has duration), passive (enabled + no duration), inactive (disabled).
- `biographyHTML` — `actor.system.details.biography` run through `foundry.applications.ux.TextEditor.enrichHTML` (with a legacy/identity fallback).
- `skillRows` / `schoolRows` / `saveRows` — flattened arrays from `system.skills.{skills,spellSchools,savingthrows}`, each row carrying `key`, `label`, `linkedAttribute`, `value`/`proficiency`, and a `bonus` read from the linked ability. (Skills don't currently use the bonus in display logic beyond the inline `+{{bonus}}` shown on each row — see `attributes.hbs` — but it's pulled the same way as schools/saves so the click-to-roll handler can include it.) `skillRows` and `schoolRows` are filtered to trained-only (`value ≥ 1`) unless the per-instance flags `_showAllSkills` / `_showAllSchools` are toggled on. The unfiltered counts are also exposed as `untrainedSkillCount` / `untrainedSchoolCount` so the "Add skill/school" buttons can disable when there's nothing left to learn.

A copy of the final context is stashed on `this.sheetContext`.

`body.hbs` contains the main tab nav (`.tabs`, group `primary`) which switches between 6 tab partials in `templates/partials/character/`: `character` (the `attributes.hbs` partial — character details + skills + schools + saves), `inventory`, `features`, `spellbook`, `effects`, `biography`. `_onRender` binds a **single** `foundry.applications.ux.Tabs` instance against `.tabs` / `.sheet-content` with `initial: "character"`. The previous `.tabs2`/`.content2` nested tab UI no longer exists — don't reintroduce it without updating this doc.

### Sheet interactions

The sheet uses two render hooks for event wiring, plus an `updateActor` Hook listener:

- **`_onFirstRender`** installs a single delegated click listener on `this.element`. It dispatches by attribute: `.ability-label[data-roll-ability]` → `_rollAbility(key, value)`; `.save-label[data-roll-save]`, `.skill-name[data-roll-skill]`, and `.skill-name[data-roll-school]` all route through `_rollProficiencyFromGroup(group, key)` (where `group` is `"savingthrows"`, `"skills"`, or `"spellSchools"`), which reads the entry live from `this.actor.system.skills[group][key]` and forwards `(label, proficiency, linked-attribute bonus)` to `_rollProficiency`. The `data-roll-*` value is always the document **lookup key** (e.g. `data-roll-save="reflex"`, `data-roll-skill="athletics"`, `data-roll-ability="agi"`); the handler reads proficiency, `linkedAttribute`, bonus, and label live from `this.actor.system` at click time. **Never bake derived values into `data-*` attributes** (no `data-bonus`, no `data-proficiency`) — they snapshot the model at render time, go stale on the next field change, and cause rolls to fire with the wrong numbers. Add new click-rollable proficiency-style elements by giving them one of these `data-roll-*` attributes (plus the `.rollable` class for styling) and, if it's a new group, adding a branch in the delegated handler that calls `_rollProficiencyFromGroup` with the right `system.skills.<group>` key — no per-element listeners needed.
- **`_onFirstRender` also registers a `Hooks.on("updateActor", …)`** listener that calls `this.render()` whenever this actor changes, and the matching `close()` override removes it. This is the **load-bearing** workaround for the re-render problem: ApplicationV2's automatic re-render after `submitOnChange` form submission isn't reliable for displays computed from other fields (save bonuses derived from linked ability scores, etc.), so we subscribe explicitly. The pip click handler in `_onRender` works around the same issue with an explicit `this.render()`. If you remove the hook listener, manually verify that changing an ability score immediately updates every derived display (header save bonuses, the saves and spell-schools sections in the character tab) without reopening the sheet.
- **`_onRender`** re-binds the tab group and wires every `.skill-pips` container. Clicking a pip writes `system.skills.<group>.<key>.proficiency.value` via `actor.update()` then calls `this.render()` explicitly (see above). Clicking the currently-active highest pip _decrements_ by one — this is the only way to demote a proficiency via the UI.

### Roll flow

Both `_rollAbility` and `_rollProficiency` (used by saves, skills, and spell schools — see the click-handler dispatch above) go through the same three-stage pipeline before posting to chat:

1. **Resolve the base die.** `_attributeDieFormula(value)` / `_proficiencyDieFormula(value)` map the integer stat to a dice string (`"1d4"` … `"1d12"`). Both mirror the Handlebars tier tables exactly. `_attributeDieFormula` returns `null` for `value ≤ 0` (and `_rollAbility` aborts on `null`); `_proficiencyDieFormula` returns `null` for `value = 0` (untrained), which `_rollProficiency` coerces to the literal string `"0"` via `?? "0"`. The dialog still opens for untrained saves/skills/schools and the resulting roll is the flat bonus alone with no die — intentional, so untrained rolls are "bonus only" rather than blocked entirely.
2. **Prompt the user via `_showRollDialog(label, baseDie, abilityOptions?)`.** A `DialogV2.prompt` returns `{ dieMod, flatBonus, attribute }`: `dieMod` is an integer in `[-2, +2]` selected from a `<select>`, `flatBonus` is a free-form number input, and `attribute` is the chosen ability key when the selector was shown (or `null` otherwise). The dialog has `rejectClose: false`, so closing without confirming returns `null` and the caller aborts the roll. All strings live under `CONSTANTS.Roll.*` in `lang/en.json` and `lang/hu.json` (`Title`, `DieTier`, `NoChange`, `Upgrade1`/`Upgrade2`, `Downgrade1`/`Downgrade2`, `FlatBonus`, `Roll`, `LinkedAttribute`). `Title` and `NoChange` are formatted with `game.i18n.format` and take `{label}` / `{die}` placeholders — keep those tokens when translating.

   When the dialog is called with an `abilityOptions = { selected, list }` argument it renders an additional **Linked Attribute** `<select>` populated from `list` (built once per click via `_abilityChoices()`, which enumerates `actor.system.abilities` and pulls localized long names via `CONSTANTS.Attributes.<id>.long`). `_rollProficiencyFromGroup` only passes `abilityOptions` when `group === "skills"` — saves and spell schools are locked to their `template.json` `linkedAttribute`. When `attribute` comes back non-null, `_rollProficiency` recomputes the bonus from `actor.system.abilities[attribute].value` instead of using the originally-passed bonus.
3. **Shift the die and roll.** `_shiftDie(dieFormula, mod)` walks the fixed ladder `["1d4", "1d6", "1d8", "1d10", "1d12"]` by `mod` steps, clamped at both ends. A formula not in the ladder (notably the `"0"` fallback above) passes through unchanged, so tier shifts on untrained rolls are a no-op. The final formula is `die` or `${die} + ${totalBonus}` (where `totalBonus = bonus + flatBonus` for saves/skills/schools, or just `flatBonus` for abilities — see next paragraph). It's posted via `new Roll(...).toMessage({ speaker, flavor: label })`.

**Ability rolls are intentionally "raw"** — they sum the attribute die plus the dialog's flat bonus only, with no proficiency or skill input. The asymmetry with saves (which add the linked-attribute value on top of the proficiency die) is by design: ability clicks are the unmodified attribute check. Don't fold a proficiency into `_rollAbility` without a corresponding rules decision.

If you add a new rollable that needs the same UX, call `_showRollDialog` and `_shiftDie` — don't reinvent the dialog locally, and don't change the ladder in `_shiftDie` without also updating `_attributeDieFormula` / `_proficiencyDieFormula` and the Handlebars tier helpers in `wispers.js`.

The **"Learn at Novice"** dialog (`_promoteToNovice`) is a separate `foundry.applications.api.DialogV2.prompt` that lists currently-untrained entries in a `<select>` and writes `proficiency.value = 1` on confirmation. Both `_onAddSkill` and `_onAddSchool` delegate to it.

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
