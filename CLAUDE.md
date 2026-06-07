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
- Stores `CONFIG.WISPERS` (config object from `modules/config.js`) and toggles `CONFIG.INIT` as a load-phase lock. `CONFIG.WISPERS` holds select-choice maps (`weaponTypes`, `armorTypes`, `featureTypes`, `currencies`), the actor proficiency/ability metadata maps (`abilities`, `skills`, `spellSchools`, `savingthrows`), and the v1 combat registries (`weaponCategories`, `weaponProperties`, `spellDegrees` + `spellDegreeOrder`, `effectScopes`, `conditions`, `woundTables`) — see the actor data-layer and spec sections.
- Registers `wispersActor` as `CONFIG.Actor.documentClass`, `WispersItem` as `CONFIG.Item.documentClass`, and `WispersCombat` as `CONFIG.Combat.documentClass`.
- Registers a DataModel for **every** actor type via `CONFIG.Actor.dataModels` and **every** item type via `CONFIG.Item.dataModels` (see the data-layer sections below).
- Unregisters the core Actor **and** Item sheets and registers `wispersCharacterSheet` and `WispersItemSheet` as the defaults via `DocumentSheetConfig`.
- Preloads Handlebars partials from `templates/partials/character/`, `templates/actors/partials/`, and `templates/sheets/item/` (including every `types/<type>.hbs`). **Any new partial must be added to this preload list** or dynamic `{{> (lookup …)}}` includes will fail.
- Registers Handlebars helpers: `attributeDie`, `proficiencyDie`, `proficiencyPips`, `proficiencyTerm`, `toLowerCase`, `log`, `dieClass`. `proficiencyPips(value)` returns an array of `{level: 1–5, active: boolean}` used to render the 5-pip proficiency widgets. `proficiencyTerm(value)` returns the localized tier name (`"Untrained"` … `"Master"`, derived from `CONSTANTS.Proficiency.*` in the lang files) for a proficiency value 0–5; used in UI displays and expandable description cards. `dieClass(formula)` maps a die formula string (e.g. `"1d8"`) to a die CSS class (e.g. `"d8"`) for dice-icon backgrounds; used by inventory and spellbook roll controls.

There are **two `Hooks.once("ready", ...)` registrations** in `wispers.js` — one for GM-only init logic, one that attaches both the `hotbarDrop` listener **and** the `combatTurnChange` initiative re-prompt hook (see the combat section). Both run; this is intentional, not a duplicate.

### Data schemas — everything is a DataModel

Both actors and items use `foundry.abstract.TypeDataModel` schemas registered in `CONFIG.Actor.dataModels` / `CONFIG.Item.dataModels`. `template.json` is now **only** the list of valid types:

```json
"Actor": { "types": ["Character", "NPC"] },
"Item":  { "types": ["weapon", "armor", "shield", "spell", "consumable", "loot", "feature", "wound"] }
```

A registered DataModel **fully overrides** any template.json field block for that type, so don't re-add field definitions to `template.json` — they'd be dead and misleading. `template.json` now contains nothing but the two `types` arrays.

Note: `system.json` declares `primaryTokenAttribute: "health"` and `secondaryTokenAttribute: "mental"`, but neither `health` nor `mental` exist in the actor schema — health-equivalent data lives under `wounds`. Reconcile before relying on token bars.

### Actor data layer: `modules/data/actor/` + `CONFIG.WISPERS`

`CharacterData` and `NPCData` (registered as `CONFIG.Actor.dataModels.Character` / `.NPC`) compose shared field groups from `modules/data/actor/_helpers.js`: `baseActorFields()` (level/abilities/wounds/initiative/biography) and `skillsFields()` (the `skills` block: `skills`/`spellSchools`/`savingthrows` **plus** the v1 combat tracks `weapons.categories` (config-derived), `weapons.specific` (an open `TypedObjectField` keyed by weapon slug), and `armor` (per `WISPERS.armorTypes`)).

**Base→effective split (effects engine).** Every ability and every proficiency entry carries an editable base `value` **and** a `.bonus` accumulator that ActiveEffects ADD into (effects must **never** target the editable `value` — that corrupts the base via `submitOnChange`; see effects-conditions.md §1.1). `wispersActor.prepareDerivedData()` folds `effective = value + bonus` (proficiencies clamped 0–5). **Rolls and die icons read `.effective`, not `.value`** — the `_prepareContext` rows expose both (`value`/`proficiency` for the editable pips/inputs, `effective`/`effectiveProficiency` for the die-icon and roll). The old unused `modifiers` arrays and the `wounds.consequences` ArrayField were removed; the `combat` skill was removed (weapon proficiencies replace it). On top of those, `CharacterData` adds `currency` (`iron`/`copper`/`silver`/`gold`, each `.value` — powers the coin-add/remove dialogs), `race`, `class`, `background`, and a `details` block (`age`/`height`/`weight`/`biography`/`notes`); `NPCData` adds a smaller `details` block (`description`/`special`). Note `baseActorFields()` already defines a top-level `system.biography`, but the sheet reads/writes **`system.details.biography`** (the `CharacterData` field) — the base-level one is currently dead (see `TODO.md`).

**Stored actor data holds only the user's choices** — `proficiency.value`, ability `value`/`start`, etc. The set of abilities/skills/schools/saves that *exist* and their **static metadata** (display `label` as a localization key, and `linkedAttribute`) live in `CONFIG.WISPERS.{abilities,skills,spellSchools,savingthrows}` (in `modules/config.js`). `_helpers.js` **imports `WISPERS` and derives the schema keys from those maps**, so config is the single source of truth: adding a skill there gives both the schema slot and the sheet row. This also means **labels are localizable** (they were previously frozen English strings baked into each actor's data) — `CONSTANTS.Skills.*`, `CONSTANTS.SpellSchools.*`, `CONSTANTS.SavingThrows.*`, `CONSTANTS.Attributes.*.long` in both lang files.

The character sheet reads metadata from config, never from stored data: `_prepareContext` builds `abilityRows`/`skillRows`/`schoolRows`/`saveRows` by merging `CONFIG.WISPERS` metadata (localized label, linkedAttribute) with the live stored value; `_rollAbility`, `_rollProficiencyFromGroup`, and `_promoteToNovice` all look up label/linkedAttribute from `CONFIG.WISPERS`. **Never read `label`/`linkedAttribute`/ability `id` off `actor.system`** — those fields no longer exist there.

**To add a skill / spell school / saving throw**: add one entry to the relevant `CONFIG.WISPERS` map (with a `label` localization key + `linkedAttribute`) and add that key to both lang files. The schema slot and the sheet row follow automatically.

### Item data layer: `modules/data/item/`

Each item type has a `TypeDataModel` subclass (`weapon`, `armor`, `shield`, `spell`, `consumable`, `loot`, `feature`), registered in `wispers.js` under `CONFIG.Item.dataModels`. DataModels have **no equivalent of template.json's `"templates"` inheritance**, so shared field groups live in `modules/data/item/_helpers.js` as functions returning fresh `foundry.data.fields.*` objects:

- `baseFields()` — description/source/quantity/weight/price (the old `base` template). On every physical type (**not** `feature` or `wound`).
- `equippedField()` — just `equipped.value` (weapons, armor, shields). Replaced the old `equipmentFields()` (item-level proficiency + free `type` string) in the v1 combat migration: proficiency now lives on the actor (weapon categories/slugs, armor types) and each type carries its own typed field. `damageFields()` is likewise **gone** — weapons use the attack/threat model, spells the spellpower/degree model.
- `gatedProperties()` — an `ArrayField` of `{ key, minProficiency }`, shared by weapons/armor/shields (proficiency-gated property list; `key` → `WISPERS.weaponProperties`).
- `usesFields()` — `uses.{value,max}` (consumables; `feature` defines its own inline).

A DataModel's `defineSchema()` **spreads** the groups it needs and adds its own fields — e.g. `WeaponData` is `{ ...baseFields(), ...equippedField(), category, slug, attack{weaponDie,targetSave,apCost,wound{light,normal,heavy}}, range, properties }`. The `wound` type (wound-tables.md) has no `baseFields()` — just `description`/`severity`/`recovery`; its mechanical payload is transfer-`true` ActiveEffects, so embedding it on an actor auto-applies the penalty.

**To add a new item type**, do all five: (1) add the type to `template.json` `Item.types`; (2) create `modules/data/item/<type>.js`; (3) register it in the `CONFIG.Item.dataModels` map in `wispers.js`; (4) create `templates/sheets/item/types/<type>.hbs` and add it to both the preload list in `wispers.js` **and** the `WispersItemSheet.TYPE_PARTS` map; (5) add localization keys to **both** `lang/en.json` and `lang/hu.json`. A type with no type-specific fields (like `loot`) can skip the partial — omit it from `TYPE_PARTS` and the sheet renders shared fields only.

### Item document & sheet: `WispersItem` / `WispersItemSheet`

`WispersItem` (`modules/objects/wispersItem.js`) is the `CONFIG.Item.documentClass`. Its `roll()` posts the item to chat — rolling `system.damage.dice.value` when present, otherwise a description card — and is what the `hotbarDrop` macro in `wispers.js` invokes. **As of the v1 schema migration, no type carries a `damage` block** (weapons → attack/threat model, spells → spellpower/degree model), so `roll()` now posts a description card for everything. It still needs to be redirected per type (weapons → `_rollWeaponAttack`, spells → `_castSpell`) — deferred (see `TODO.md`).

`WispersItemSheet` (`modules/sheets/wispersItemSheet.js`) is an ApplicationV2 sheet mirroring the character sheet's shape (`DEFAULT_OPTIONS` / `PARTS`, `submitOnChange`). `PARTS` is `header` + `body`; `body.hbs` injects a per-type partial via `{{> (lookup . "typePartial")}}`, where `typePartial` comes from the static `TYPE_PARTS` map keyed by `item.type`. `_prepareContext` also exposes `hasInventoryFields` (`"quantity" in item.system`) which gates the shared quantity/weight/price/source fieldset so **features** (no base fields) don't render inputs for fields they lack. The sheet calls `installRelativeNumberInputs(this.element, this.item)` in `_onFirstRender` so item number fields support the same `+2`/`-5` relative-expression convention as the actor sheet (see below).

### Relative numeric inputs: `modules/utils.js`

`installRelativeNumberInputs(root, doc)` installs a **capture-phase** `change` listener: typing `+2` / `-5` into any `<input data-dtype="Number">` resolves to the current stored value ± the delta before Foundry's bubble-phase `submitOnChange` reads the form; a plain number sets absolutely. Both `wispersCharacterSheet` and `wispersItemSheet` call it — don't duplicate the logic inline. Any new numeric field that should accept expressions just needs `type="text"` + `data-dtype="Number"` and a `name` that is a data path on the bound document.

### Sheet rendering: `wispersCharacterSheet`

`PARTS` declares `header` and `body`. `_configureRenderOptions` calls `super` **first** and then sets `options.parts` to `["header"]` for limited-permission users or `["header", "body"]` otherwise. The order matters: the parent class can populate `options.parts` with a partial-render subset, and our explicit assignment needs to win so both parts always re-render together (otherwise displays in the header that depend on body fields — e.g. save bonuses derived from sidebar ability scores — go stale).

`DEFAULT_OPTIONS` registers `actions` mapped to static handlers: `toggleAllSkills`, `toggleAllSchools`, `toggleAllWeapons`, `toggleAllArmor`, `addSkill`, `addSchool`, `addWeapon`, `addArmor`, `addCoins`, `removeCoins`, `createItem`, `editItem`, `deleteItem`, `toggleEquipped`, `toggleDescription`, `toggleSkillDescription`. Wire new sheet buttons by adding a `data-action="…"` attribute and a matching entry in this map — the ApplicationV2 framework does the dispatch. `createItem` reads `data-type` (item type) and optional `data-feature-type` / `data-spell-level`; the latter two are applied via `foundry.utils.setProperty` into nested `system.featureType.value` / `system.level.value` because document **creation** data is not run through `expandObject` (unlike `update()`), so a flat dotted key would be silently dropped. `toggleEquipped` flips `system.equipped.value` on equippable items (weapons/armor/shields). `addCoins`/`removeCoins` open `_showCoinDialog` (a four-denomination number form) and apply the deltas to `system.currency.<denom>.value` (remove clamps at 0). `toggleAllSkills`/`toggleAllSchools`/`toggleAllWeapons`/`toggleAllArmor` flip the corresponding instance flags to show/hide untrained entries. `addSkill`/`addSchool`/`addWeapon`/`addArmor` open the "Learn at Novice" dialog to promote an untrained entry.

`_prepareContext` builds the template context (`actor`, `system`, `items`, `config`, ownership flags) plus several pre-shaped collections used by the partials:

All items are first sorted by their `sort` field (drag-and-drop reordering writes `sort`; the raw collection iterates in insertion order) before being grouped.

- `inventory` — items pre-grouped by type (`weapons`, `armor`, `shields`, `consumables`, `loot`). `inventorySections` is the same data re-shaped as an ordered array of `{type, labelKey, items}` for the inventory partial's section loop.
- `encumbrance` — **slot-based** carry load: `{value, max, pct, over}`. Each carried item occupies `weight.value × quantity.value` slots; `max` is a static `10` for now (a later pass derives it from Strength), `pct` is the clamped percentage, `over` flags exceeding the cap.
- `spells` — spell items bucketed by `system.level.value` 1..5, each as a `{item, schoolProf}` entry (`schoolProf` is the caster's *effective* proficiency in the spell's school, so the spellbook can render the cast die icon via `{{proficiencyDie entry.schoolProf}}`).
- `featureSections` — feature items bucketed by `system.featureType.value` into an ordered array of `{type, labelKey, items}` for `active`/`passive`/`reaction`.
- `effects` — three categories: temporary (enabled + has duration), passive (enabled + no duration), inactive (disabled).
- `biographyHTML` — `actor.system.details.biography` run through `foundry.applications.ux.TextEditor.enrichHTML` (with a legacy/identity fallback).
- `abilityRows` / `skillRows` / `schoolRows` / `saveRows` / `weaponRows` / `armorRows` — built by iterating the `CONFIG.WISPERS` metadata maps (see the actor data-layer section) and merging each entry's localized `label` (+ `linkedAttribute` where it applies) with the live value read from `actor.system`. Each row carries **both** the editable base (`value`/`proficiency`, bound by the pips/inputs) **and** the derived `effective`/`effectiveProficiency` (used by the die icon + roll) — see the base→effective split. The rows are **not** uniform — each carries only what its section needs: `abilityRows` = `{key, label, value, effective}`; `skillRows` = `{key, label, value, effective, trained}` (no `linkedAttribute`/`bonus` — skills pick their linked attribute at roll time, not display time); `schoolRows` = `{key, label, linkedAttribute, value, effective, bonus, showBonus, trained}` where `bonus` is the linked ability's **effective** value and `showBonus` is `effective proficiency ≥ 4`; `saveRows` = `{key, label, linkedAttribute, proficiency, effectiveProficiency, bonus}`; `weaponRows` / `armorRows` = `{key, label, value, effective, trained}` (not rollable — attacks roll via the weapon item, armor is passive). `skillRows`, `schoolRows`, `weaponRows`, and `armorRows` are all filtered to trained-only (`proficiency ≥ 1`) unless toggled by per-instance flags `_showAllSkills` / `_showAllSchools` / `_showAllWeapons` / `_showAllArmor`. The unfiltered counts are exposed as `untrainedSkillCount` / `untrainedSchoolCount` / `untrainedWeaponCount` / `untrainedArmorCount` so the corresponding "Add" buttons can disable when there's nothing left to learn.

A copy of the final context is stashed on `this.sheetContext`.

`body.hbs` contains the main tab nav (`.tabs`, group `primary`) which switches between 6 tab partials in `templates/partials/character/`: `character` (the `attributes.hbs` partial — character details + abilities + skills + schools + saves + weapon/armor proficiencies), `inventory`, `features`, `spellbook`, `effects`, `biography`. `_onRender` binds a **single** `foundry.applications.ux.Tabs` instance against `.tabs` / `.sheet-content` with `initial: this._activeTab ?? "character"`. The active tab is tracked on `this._activeTab` (updated by a click listener on each `[data-tab]`) so a re-render — which happens on every field change via the `updateActor`/`updateItem` hooks — keeps the user on the tab they were viewing instead of snapping back to `character`. The previous `.tabs2`/`.content2` nested tab UI no longer exists — don't reintroduce it without updating this doc.

### Sheet interactions

The sheet uses two render hooks for event wiring, plus hook listeners for several document-change events:

- **`_onFirstRender`** installs a single delegated click listener on `this.element`. It dispatches by **`data-roll-*` attribute** (matched against any element carrying it — die icon, label, etc.), not by element class. Current handlers: `[data-roll-ability]` → `_rollAbility(key, value)`; `[data-roll-save]`, `[data-roll-skill]`, `[data-roll-school]` → `_rollProficiencyFromGroup(group, key)` (where `group` is `"savingthrows"`, `"skills"`, or `"spellSchools"`); `[data-roll-weapon]` → `_rollWeaponAttack(item)` (threat roll, resolved proficiency via `_resolveWeaponProficiency`); `[data-roll-spell]` → `_castSpell(item)` (school check + degree calculation). The `data-roll-*` value carries: for proficiencies, the lookup key (e.g. `data-roll-save="reflex"`); for items, the item UUID/ID (e.g. `data-roll-weapon="<uuid>"`). Metadata like `label` and `linkedAttribute` are read live at click time from `CONFIG.WISPERS` or the item's system data. **Never bake derived values into `data-*` attributes** — they snapshot the model at render time and go stale. Add new rollables by tagging an element with the relevant `data-roll-*` attribute (+ the `.rollable` class for styling) — the dispatcher will match it.
- **`_onFirstRender` registers re-render listeners** for `updateActor` (calls `this.render()` when this actor changes) and `createItem` / `updateItem` / `deleteItem` (re-render when an owned item changes — used so e.g. the equipped-toggle icon and inventory list refresh). Additionally, it listens to `createActiveEffect` / `updateActiveEffect` / `deleteActiveEffect` to re-render when effects on this actor **directly** or on one of its **embedded items** change. Because proficiency displays read `.effective` values (base + effect `.bonus`), toggling or editing an embedded effect changes what die icons and tiers show — but effects fire `updateActiveEffect`, not `updateActor`, so explicit hook listeners are necessary. The handler checks parent ownership: `const parent = effect.parent; if (parent?.id === this.actor.id || parent?.parent?.id === this.actor.id) this.render()` — this catches both direct actor effects (wounds, buffs) and transfer effects propagated from items. The matching `close()` override removes all seven hooks. This is the **load-bearing** workaround for the re-render problem: ApplicationV2's automatic re-render after `submitOnChange` form submission isn't reliable for displays computed from other fields (save bonuses derived from linked ability scores, proficiency modifiers from effects, etc.), so we subscribe explicitly. The pip click handler in `_onRender` works around the same issue with an explicit `this.render()`. If you remove the hook listeners, manually verify that changing an ability score immediately updates every derived display (header save bonuses, the saves and spell-schools sections in the character tab) **and** that toggling an effect modifying a proficiency updates the die icons and tier text without reopening the sheet.
- **`_onFirstRender` also wires drag-and-drop** for the whole sheet (`dragover`/`drop` on `this.element` → `_handleDrop`). A drop of an item **already owned by this actor** reorders it within its type section via `foundry.utils.performIntegerSort` (writing `sort`); a drop from **elsewhere** creates a copy on this actor (`createEmbeddedDocuments` with `sourceItem.toObject()`).
- **`_onRender`** re-binds the tab group (see active-tab note above) and wires: every `input[type='search']` (a per-tab name filter — each search is scoped to its own `.tab` so typing in one tab doesn't hide rows in another); the inventory `dragstart`/`dragover`/`dragleave` indicators (the `.drag-above`/`.drag-below` drop markers); and every `.skill-pips` container. Clicking a pip writes `system.skills.<group>.<key>.proficiency.value` via `actor.update()` then calls `this.render()` explicitly (see above). Clicking the currently-active highest pip _decrements_ by one — this is the only way to demote a proficiency via the UI.

### Chat cards: enriched rolls & description-only messages

All die/icon rolls now post to chat with a **shared card flavor** showing the icon, title/name, a subtitle (proficiency tier or threat level), optional meta (target save + wound mods, spellpower + degree), and description. Non-rollable items (features, loot, armor, shields, consumables) also post a description-only card when their image is clicked. All cards are **public** (no whisper).

**Implementation:**
- `_cardFlavor({ imgSrc, title, subtitle, metaHTML, descriptionHTML })` builds the enriched HTML (unscoped classes `wispers-chat-card`, `wispers-chat-icon`, etc. in `less/chat.less` since chat messages render outside the sheet root). Used as the `flavor` of roll messages (dice result renders below) and as full content of non-rollable item cards.
- **Rollable cards** (proficiencies, weapons, spells): the roll's flavor is now a card with the die icon (`_proficiencyDieImg`), name/label, proficiency tier (`_proficiencyTierText`), and localized description (from `CONFIG.WISPERS` or `item.system.description`, run through `_enrich` for UUID links).
- **Description-only cards** (`_postItemCard`): triggered by `[data-item-card]` clicks on non-rollable item images (features, etc.). Posts a card with the item image, name, and description.
- **Static helpers** on `WispersCharacterSheet`: `_enrich(text, doc)` (handles `TextEditor.enrichHTML` across Foundry versions with `secrets: false` to keep chats public), `_proficiencyDieImg(prof)` (maps 0–5 to asset paths), `_proficiencyTierText(prof)` (localized tier name + level).

### Roll flow

Four roll methods assemble a pool of dice strings, apply effect-engine levers, and post to chat: `_rollAbility` (ability checks), `_rollProficiency` (saves/skills/schools), `_rollWeaponAttack` (weapon threat), and `_castSpell` (spell school check → degree). All feed through `_buildRollFormula` which applies the effect roll-time levers (scope-keyed `flags.wispers.*` accumulators) **before** rolling. The roll is the **sum** of every part in the pool.

1. **Resolve the base die.** `_attributeDieFormula(value)` / `_proficiencyDieFormula(value)` map the integer stat to a dice string (`"1d4"` … `"1d12"`). Both mirror the Handlebars tier tables exactly. `_attributeDieFormula` returns `null` for `value ≤ 0`; `_proficiencyDieFormula` returns `null` for `value = 0` (untrained). Both call sites coerce `null` to the literal string `"0"` via `?? "0"`, so the dialog still opens for untrained rolls and the result is the rest of the pool with no base die contribution — "bonus only" rather than blocked. All dice are read from `.effective` (base + effect bonus) so effects apply.
2. **Prompt the user via `_showRollDialog(label, { showDifficulty = true })`.** A `DialogV2.prompt` returns `{ boonBane, difficultyDie }`:
   - **Boon/Bane** — a `<select>` of `bane` / `none` (default) / `boon`. This is the system's advantage mechanic (it replaced the old fixed `±2` die-tier modifier).
   - **Difficulty die** — a `<select>` of levels `0`–`5` mapping to `null` / `1d4` / `1d6` / `1d8` / `1d10` / `1d12`, representing the task's difficulty as an **extra die added to the pool**. Rendered only when `showDifficulty` is true.

   The dialog has `rejectClose: false`, so closing without confirming returns `null` and the caller aborts. All strings live under `CONSTANTS.Roll.*` in both lang files: `Title` (formatted with `game.i18n.format` and a `{label}` placeholder — keep the token when translating), `BoonBane`, `Boon`, `BoonBaneNone`, `Bane`, `DifficultyDie`, `DifficultyNone`, `Difficulty1`…`Difficulty5`, `Roll`.
3. **Apply effect levers, then join and roll.** `_buildRollFormula(parts, boonBaneChoice, scope, scopeKey, extraFlat)` orchestrates the pipeline: (a) `_applyTierShift` (shift the primary die N tiers per `flags.wispers.tierShift`); (b) `_applyBoonBaneNet` (net Boon/Bane = dialog choice + `flags.wispers.boon` − `flags.wispers.bane`); (c) flat bonuses (extraFlat + `flags.wispers.flatBonus.<scope>`). The levers are sourced by `_collectRollMods(scope, scopeKey)` which sums the `all` + `<scope>` + `<scope>.<key>` flag accumulators (effects-conditions.md §4.1). `_applyBoonBane(parts, mode)` walks the fixed ladder `["1d4", "1d6", "1d8", "1d10", "1d12"]`: on **boon** it shifts the *smallest* die **up** one tier; on **bane** it shifts the *largest* die **down** one tier (both clamped); `none` is a no-op. Only one die is shifted per call, and `_applyBoonBaneNet` applies it multi-step for net bonuses ≠ ±1. Dice that are on the ladder are eligible — flat bonuses and the `"0"` untrained fallback pass through untouched. The formula is joined with `+`, rolled, and posted via `toMessage`.

The four rollers build their pools differently but all feed through `_buildRollFormula`:

- **`_rollAbility(key, value)`** — `[attributeDie, difficultyDie?]`, scope `"ability"`. No proficiency or flat bonus. Called by `[data-roll-ability]` clicks. Posts a basic roll message (no flavor card).
- **`_rollProficiency(label, proficiency, { attributeDie, applyAttrBonus, linkedAttr, showDifficulty, scope, scopeKey, description })`** — pool is `[proficiencyDie, attributeDie?, difficultyDie?]`, scope passed to `_buildRollFormula` for lever application. If `applyAttrBonus`, the linked ability's `.effective` value is passed as `extraFlat`. Builds a card flavor with the proficiency die icon, label, tier text, and description (escaped plain text). Called by `_rollProficiencyFromGroup`.
- **`_rollProficiencyFromGroup(group, key)`** dispatches saves/skills/schools into `_rollProficiency`: **skills** → `scope="skill"`, `showDifficulty: true`, no attribute die, no flat bonus; **savingthrows** → `scope="save"`, proficiency die only (no difficulty, no attribute die); **spellSchools** → `scope="school"`, linked-attribute *die* + *value* flat (when `proficiency ≥ 4`). Looks up metadata (label, description, linkedAttribute) from `CONFIG.WISPERS` at roll time. Called by `[data-roll-save]` / `[data-roll-skill]` / `[data-roll-school]` clicks.
- **`_rollWeaponAttack(item)`** — `[weaponDie, profDie?]` where `profDie` is resolved by `_resolveWeaponProficiency(item)` (specific slug → category → 0), scope `"attack"`, no difficulty, no attribute die. Builds a card flavor with the weapon image, name, threat level + proficiency tier, target save + wound mods (meta), and description (run through `_enrich` for UUID links). Called by `[data-roll-weapon]` clicks.
- **`_castSpell(item)`** — `[profDie, attrDie?]` where profDie is the spell's school proficiency and attrDie is the linked ability, scope `"cast"`, no difficulty. Gathers spellpower (the roll total), then calls `_spellDegree(total, item.system.degrees)` to get the result degree (highest threshold met). Builds a card flavor with the spell image, name, school + proficiency tier, spellpower + degree (meta), and description (enriched). Called by `[data-roll-spell]` clicks.

**Adding new rollables.** Tag an element with `data-roll-*`, add `.rollable` for styling, and implement a handler in the delegated listener. Reuse `_showRollDialog` + `_buildRollFormula` to get consistent UX/lever application. Don't change the ladder without updating `_applyBoonBane`, `_applyTierShift`, and the Handlebars tier helpers.

### Proficiency groups: skills, schools, saves, weapons, armor (SKILL_GROUPS map)

All five proficiency tracks (skills, spell schools, saving throws, weapon categories, armor types) share the same UI pattern: a filtered list of trained entries, a show-all toggle, expandable description cards, and a "Learn at Novice" button. The difference is where they live in actor data:

- **Skills, schools, saves**: `system.skills.{skills|spellSchools|savingthrows}`
- **Weapons, armor**: `system.skills.weapons.categories` / `system.skills.armor`

The static `SKILL_GROUPS` map on `WispersCharacterSheet` resolves each group by its template identifier (e.g., `data-skill-group="weaponCategories"`) to both the CONFIG metadata key and the actor-data path:

```js
static SKILL_GROUPS = {
    skills:           { config: "skills",           path: "skills.skills" },
    spellSchools:     { config: "spellSchools",      path: "skills.spellSchools" },
    savingthrows:     { config: "savingthrows",      path: "skills.savingthrows" },
    weaponCategories: { config: "weaponCategories",  path: "skills.weapons.categories" },
    armorTypes:       { config: "armorTypes",        path: "skills.armor" }
}
```

This allows `_promoteToNovice(group)` and other shared handlers to work uniformly: look up the group, resolve its CONFIG metadata and actor-data path, then merge them into a row or apply an update. **Adding a new proficiency type:** (1) add it to `CONFIG.WISPERS` in `modules/config.js` with a `label` key; (2) add an entry to `SKILL_GROUPS` pointing to the correct config key and actor-data path; (3) add its row-building logic to `_prepareContext` (following the `skillRows` / `schoolRows` / `weaponRows` pattern); (4) wire the toggle/add handlers to call the shared `_onToggleSkillGroup(group)` and `_promoteToNovice(group)` with the correct group name; (5) add template markup using `data-skill-group="<groupName>"` and the usual toolbar/filter/description-card pattern.

The **"Learn at Novice"** dialog (`_promoteToNovice(group)`) is a separate `foundry.applications.api.DialogV2.prompt` that lists currently-untrained entries in a `<select>` and writes `proficiency.value = 1` on confirmation. It takes a `group` parameter (one of `"skills"`, `"spellSchools"`, `"savingthrows"`, `"weaponCategories"`, `"armorTypes"`) and uses the static `SKILL_GROUPS` map to resolve both the CONFIG metadata (`config` key) and the actor-data path (`path` key) — this is necessary because weapons/armor store under different paths (`skills.weapons.categories` / `skills.armor`) than skills/schools/saves (`skills.skills` / `skills.spellSchools` / `skills.savingthrows`). Four handlers delegate to it: `_onAddSkill`, `_onAddSchool`, `_onAddWeapon`, `_onAddArmor`.

`_prepareSubmitData` clamps every `system.skills.{skills|spellSchools|savingthrows|armor}.*.proficiency.value` **and** `system.skills.weapons.{categories|specific}.*.proficiency.value` to `[0, 5]` (truncated to int). It handles both shapes Foundry can submit: flat dot-keyed fields and the expanded nested object. Any new 0–5 ladder field should be added to the regex / nested loop here.

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

### Rollable UI elements & dispatch

Any UI element that triggers a die roll when clicked **must** have the `.rollable` CSS class (for consistent cursor/hover styling). Roll dispatch is **attribute-based**: the delegated click listener in `_onFirstRender` matches `[data-roll-*]` attributes, not element classes or IDs. This allows a single die icon or row label (or any element) to fire a roll. Both the icon and the label can carry the same `data-roll-*` attribute so either can be clicked to roll. Don't create class-based dispatch patterns — keep roll matching attribute-only.

### Proficiency inline description cards (all groups)

Clicking a proficiency **name** (not the die icon) in the Character tab expands a read-only card beneath that row, showing the entry's **description** and its current **effective proficiency** (die icon + `N / 5`). Clicking the name again collapses it. The die icon still triggers its normal roll. This works identically for all five proficiency groups: skills, spell schools, saving throws, weapon categories, and armor types.

**Implementation:**
- `modules/config.js` — each `WISPERS.{skills,spellSchools,savingthrows,weaponCategories,armorTypes}` entry carries an optional `description` localization key (e.g. `"AthleticsDesc"` → `lang/en.json` entry).
- `_expandedSkills` Set on the sheet tracks which rows have open cards (keyed `"<group>:<key>"`), re-applied in `_onRender` so cards survive frequent sheet re-renders.
- `_expandSkillSummary()` renders the card (description + effective proficiency die + level), localized via config + lang files. `_collapseSkillSummary()` removes it.
- `_onToggleSkillDescription` is the action handler (group-agnostic). Templates use `data-action="toggleSkillDescription"` + `data-skill-group="<group>"` + `data-skill-key="<key>"` on each row's name span (now `.skill-toggle` instead of `.rollable`). The die icon retains `[data-roll-*]`.

**Handler is shared across all groups:** The JS/CSS and re-render persistence logic already iterate all `_expandedSkills` regardless of group, and `.skill-row.expanded` / `.skill-summary` styles apply to any group. The template just tags the row with the correct group and key. Weapon categories and armor types use the same logic but are not rollable (attacks roll via the weapon item, armor is passive).

### Localization

User-facing strings flow through `game.i18n.localize()` (or `{{localize "KEY"}}` in templates). Keys live in `lang/en.json` (primary) and `lang/hu.json` (Hungarian). Templates use namespaces like `CONSTANTS.Tabs.*` and `CONSTANTS.Attributes.*.long`. Add new keys to **both** files.

## Open scaffolding & inconsistencies

See `TODO.md` for the current list of intentional placeholders and known schema/path inconsistencies — don't silently rewrite anything listed there without checking.
