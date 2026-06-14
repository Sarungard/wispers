# Spec: Effects & Conditions

> **Status:** Design finalized; **base→effective + roll-time levers implemented** (`prepareDerivedData`, `.bonus` accumulators, `flags.wispers.*` lever folding in the roll pipeline, the `feature.activation` block, widened effect bucketing). Effect suppression, `_onActivateFeature`, the `CONFIG.statusEffects` registry, and authored conditions remain — see §10. Source of truth for the effect engine
> that wounds, weapon properties, and spell effects all depend on. References: `wound-tables.md`
> (wound ActiveEffects), `weapons-combat.md` §4 (proficiency-gated properties), `spellcasting.md`
> §4.2 (spell effects). **[USER]** = decided by the project owner; **[ASSUMED]** = inference to
> confirm. Targets the v13 ApplicationV2 / DataModel architecture in `CLAUDE.md`.

## 1. Architecture **[USER]** — everything is an ActiveEffect; custom keys for roll-time

Every persistent effect is a **native Foundry ActiveEffect** document. This gives, for free:
native **duration**, **enable/disable**, **token status icons**, transfer-from-item, and the
character sheet's existing **Effects tab** (temporary / passive / inactive buckets). On top of
that, two *kinds* of change are layered:

1. **Stat mods** — native ActiveEffect `changes` (mode `ADD`, etc.) targeting real numeric
   data paths.
2. **Roll-time levers** — Boon/Bane, die-tier shift, flat-to-total (§4). These can't be a flat
   change to a stored stat, so they are expressed as native `ADD`-mode changes onto
   **system-defined accumulator flags** under `flags.wispers.*`. Foundry sums them across all
   active effects automatically; the **roll pipeline reads the summed flags at roll time**.

Beyond persistent effects, **active/triggered features are activatable AP-cost actions**
(§6) — clickable on the sheet, *not* themselves ActiveEffects, though using one may *apply* an
effect.

### 1.1 THE pitfall: never target an editable sheet field

The character sheet uses `submitOnChange` and binds inputs directly to source paths like
`system.abilities.str.value`. If an ActiveEffect ALSO targets that path, Foundry mutates the
in-memory value *after* `prepareBaseData` and *before* the sheet renders — so the input shows
the **effected** value, and the next edit writes that effected value back as the new base,
**permanently corrupting the stat**. (The relative-input `+2/-5` convention in `utils.js`
reads the same stored value, so it corrupts too.)

**Rule:** effects must **never** target a field bound to an editable input. Instead:

- **Editable base** stays the source field the input binds to (`abilities.str.value`,
  proficiency `.value`, etc.).
- **Effects add to a separate accumulator** — a dedicated `.bonus` field (for stats) or a
  `flags.wispers.*` key (for roll levers), which no input binds to.
- **`prepareDerivedData()`** (currently a stub on `wispersActor` — see `TODO.md`) folds
  `effective = base + Σ bonus` and exposes it for rolls and die-icon display.

This finally gives the project the base→effective split it has lacked, and is **prerequisite**
to any flat stat effect working safely.

### 1.2 Two-lane change model (summary)

| Change kind            | Stored where (AE change `key`)            | Applied by            | Read by |
|------------------------|-------------------------------------------|-----------------------|---------|
| Flat stat mod          | a `*.bonus` accumulator field (NOT base)  | Foundry native ADD    | `prepareDerivedData` → effective |
| Roll-time lever        | `flags.wispers.<lever>.<scope>`           | Foundry native ADD    | roll pipeline at roll time |
| Threshold / resource   | `system.wounds.modifier.value`, etc. (non-editable-display fields) | Foundry native | combat / wound resolver |

## 2. Where effects come from

**Everything is authored on an Item's Effects tab.** There is no actor-authored effect path —
the effect source is always an Item, and the *item type* decides how the effect reaches an actor
(`transfer` flag set at creation time by `WispersItemSheet._onCreateEffect`):

- **Equipment** (weapon/armor/shield) — `transfer:true`, but **equip-gated**: applies to the
  wearer/wielder only while `equipped` (suppression in `wispersActor.allApplicableEffects()`, §7).
- **Features** (`feature` item — race/class/character features), **wounds**, and actor-placed
  **conditions** — `transfer:true`, **no equip gate** (these item types have no `equipped` flag),
  so they apply to the owning actor while present.
- **Spells** (`spellcasting.md` §4.2) — `transfer:false` so they never buff the caster; on a
  successful cast the cast flow **copies** the enabled effects onto the **target** actor(s)
  (`_applySpellEffects`, self if no target). Cross-client targeting is GM-mediated/Phase 2.
- **Conditions** (§5) — named, reusable (Bleeding, Prone, Stunned, Staggered…). Authored as
  effect-bearing Items, surfaced as token-toggleable statuses.
- **Active/reaction features & weapon maneuvers** (§6) — activatable actions that, when used,
  may apply a (often short-duration) effect.

**Implemented:** the equipment equip-gate (`allApplicableEffects()` override), feature/wound
owner-application (native transfer), and spell→target application (`_castSpell`). **Pending:** the
proficiency half of the equip gate (weapon-property / armor under-proficiency suppression, §7).

## 3. Stat mods (native, on `.bonus` accumulators)

`prepareDerivedData` computes effective values from base + bonus. Add `.bonus` accumulator
sub-fields wherever effects should modify a stat, e.g.:

```js
// abilities: keep editable `value` (+ chargen `start`); add an effect accumulator `bonus`.
str: new fields.SchemaField({
  value:  intField(2, { min: 0 }),   // editable base (sheet input binds here — effects MUST NOT target it)
  start:  intField(2, { min: 0 }),   // chargen starting value
  bonus:  intField(0),               // effect accumulator — ActiveEffects ADD here
  // effective = value + bonus, computed in prepareDerivedData (see below)
})
```

> The schema already has unused `modifiers: ArrayField` on abilities/saves. Arrays don't sum
> under AE `ADD`, so a numeric `.bonus` field is the right accumulator; drop or repurpose the
> `modifiers` arrays.

`wispersActor.prepareDerivedData()` (fill the stub):

```js
prepareDerivedData() {
  const sys = this.system;
  for (const a of Object.values(sys.abilities ?? {})) a.effective = (a.value ?? 0) + (a.bonus ?? 0);
  // proficiency groups likewise: effectiveProficiency = value + bonus, clamped 0..5
  // ...
}
```

**Rolls and die icons use the effective value.** The die-tier helpers in `wispers.js`
(`attributeDie`/`proficiencyDie`) and the roll-formula helpers
(`_attributeDieFormula`/`_proficiencyDieFormula`) must read `effective`, not the raw base, once
this lands. (Today they read `system.abilities.<k>.value` directly — switch to `.effective`.)

## 4. Roll-time levers **[USER]** (Boon/Bane, die-tier shift, flat-to-total)

v1 supports exactly these three (the difficulty-die lever was **excluded**). All are additive
numeric flags Foundry sums for us.

### 4.1 Flag taxonomy

`flags.wispers.<lever>.<scope>` where:

- **`<lever>`** ∈ `boon`, `bane`, `tierShift`, `flatBonus`.
  - `boon` / `bane` — counts that combine with the dialog's Boon/Bane choice (§4.2).
  - `tierShift` — signed int: steps to move the roll's relevant die along `[1d4,1d6,1d8,1d10,1d12]`
    (distinct from Boon/Bane; clamped at the ends).
  - `flatBonus` — signed number added to the final roll total.
- **`<scope>`** ∈ `all`, `attack`, `cast`, `save`, `save.<key>`, `skill`, `skill.<key>`,
  `school`, `school.<key>`, `ability`, `ability.<key>`. A roll gathers `all` + its general
  scope + its keyed scope (e.g. a Reflex save reads `all`, `save`, `save.reflex`).

Example condition **Staggered** (its compendium AE `changes`):

```
{ key: "flags.wispers.tierShift.attack",      mode: ADD, value: "-1" }   // attacks roll one tier lower
{ key: "flags.wispers.flatBonus.save.reflex", mode: ADD, value: "-2" }   // -2 to Reflex saves
```

### 4.2 Application order in the roll pipeline

Add `_collectRollMods(scope)` to `wispersCharacterSheet` (or a shared roll module): reads the
summed `flags.wispers.*` for `all` + `scope` + keyed scope. Then, generalizing the current
`_applyBoonBane` / flat-bonus handling, every roller (`_rollAbility`, `_rollProficiency`, the
weapon attack and spell cast flows) does:

1. Build the die pool (as today).
2. **tierShift** — shift the pool's relevant die by `mods.tierShift` steps (clamped).
3. **Boon/Bane** — `net = dialogChoice(+1/0/−1) + mods.boon − mods.bane`; apply `_applyBoonBane`
   in the net direction `|net|` times (**[ASSUMED]** multi-step rule — confirm; the alternative
   is clamp net to ±1).
4. **flatBonus** — add `mods.flatBonus` to the total (alongside existing flat bonuses like the
   school's attribute bonus).

> Keep `_applyBoonBane` and `_proficiencyDieFormula`/`_attributeDieFormula` as the single
> source for the ladder — see the warning in `CLAUDE.md`'s roll-flow section.

## 5. Conditions **[USER]** — hybrid: status registry → compendium

Conditions are authored as **content in a compendium** (the JSON-compendium goal, GM-editable)
and surfaced as **token status icons** via `CONFIG.statusEffects` (one-click toggle, visible on
tokens).

- **Compendium** `packs/conditions` of **effect-bearing Items** (pack `type: "Item"`), each
  authored with one or more transfer ActiveEffects carrying its `changes` (flat mods and/or
  `flags.wispers.*` levers from §3–4), plus `img`, `name`, and a stable id.
  - **[CORRECTION]** The earlier "ActiveEffect documents, simplest" assumption is **invalid** —
    `ActiveEffect` is not a compendium-eligible document type in Foundry (packs hold
    Actor/Item/JournalEntry/RollTable/Scene/Macro/Playlist/Cards/Adventure only). The pack is
    therefore `Item`; the condition's status id is read from `flags.wispers.conditionId`, else
    derived from the item name (`name.slugify`).
- **Registry built from the compendium at `ready`:** `buildConditionRegistry()` (in `wispers.js`)
  loads the condition Items and registers `CONFIG.statusEffects` entries
  (`{ id, name, img, changes }`, merging the changes from each Item's transfer effects) plus
  `WISPERS.conditions[id] = { uuid }`, so the canonical data lives in the editable compendium and
  the token UI is generated from it. **Implemented** — a safe no-op until the pack has content.
- **Toggling** a status on a token/actor applies/removes the full effect (native). Because the
  registry carries the real `changes`, the standard toggle applies them — no per-condition code.

```js
// modules/config.js — filled at ready from the compendium
WISPERS.conditions = {
  // key -> { uuid: "Compendium.wispers.conditions.ActiveEffect.<id>" }
  bleeding:  { uuid: "..." },
  prone:     { uuid: "..." },
  staggered: { uuid: "..." },
  stunned:   { uuid: "..." }
};
```

**Stacking** **[ASSUMED]**: re-applying a condition **refreshes** it by default; conditions
that should stack (e.g. Bleeding ×N) carry a `stacking` flag and track a count. Confirm.

## 6. Active / triggered features **[USER]** — activatable AP-cost actions

The existing `feature` item type (`featureType: active | passive | reaction`, `uses{value,max}`)
splits cleanly:

- **`passive`** — carries transfer ActiveEffect(s); applied while owned. No activation.
- **`active` / `reaction`** — **activatable actions**: a sheet control spends AP (and a use, if
  limited) and performs the feature's outcome.

Extend `FeatureData` with an `activation` block:

```js
activation: new fields.SchemaField({
  apCost: new fields.NumberField({ required: true, nullable: false, initial: 1, integer: true, min: 0 }),
  // What using it does. Phase 1 keeps this small; richer outcomes come with the trigger engine.
  appliesEffect: new fields.StringField({ initial: "" }),   // condition key / compendium effect uuid to apply
  target:        new fields.StringField({ initial: "self", choices: ["self", "target"] }),
  description:   new fields.HTMLField({ initial: "" })       // free text for outcomes not yet mechanized
})
```

Sheet: an **activate** `data-action` on active/reaction features (and §7 weapon maneuvers):

```
_onActivateFeature(item):
  if (!await actor.spendActionPoints(item.system.activation.apCost.value)) return notify();
  if (limited uses) decrement uses;          // item.system.uses
  if (appliesEffect) apply it to self/target (create AE from the condition/compendium effect);
  post a chat card (always — describes the action / outcome for manual cases).
```

- **Reaction** features are the AP the defender spends in the weapon/spell react step
  (`weapons-combat.md` §1.1 / `spellcasting.md` §1.1) — e.g. a "Parry" reaction that grants Boon
  on the targeted save. The react prompt offers eligible reaction features.
- **Triggered** effects (onTurnStart/onHit/onWounded…) are **out of v1**: author them as the
  `description` text and resolve manually. A future trigger-dispatch engine is the natural
  follow-up (§9).

## 7. Weapon properties via this system (`weapons-combat.md` §4)

A weapon property `{ key, minProficiency }` resolves through `WISPERS.weaponProperties[key]` to
either:

- a **passive effect** (an AE granted while the weapon is equipped), or
- an **active maneuver** (an activatable AP-cost action, §6).

**Proficiency-gated, equip-gated suppression — implemented.** Native AE transfer is
unconditional, so a weapon-granted effect must be **suppressed** unless the wielder is equipped
and trained enough. Suppression lives in `wispersActor.allApplicableEffects()`, which overrides
the generator core iterates in `applyActiveEffects()` and drops effects via
`_isEffectSuppressed(effect)` (mirrors how dnd5e suppresses unequipped-item effects). Two stacking
gates:

- **Equip gate** — an effect whose parent Item carries an `equipped` flag (weapon/armor/shield) is
  dropped while unequipped.
- **Proficiency gate** — the effect declares its requirement via `flags.wispers`:
  - `minProficiency` (0–5): dropped unless the wielder's proficiency with the item ≥ this (a
    proficiency-gated property). Proficiency resolves via `wispersActor._itemProficiency(item)`
    (weapon: specific slug → category → 0; armor: by `armorType`; shield/other: no track → gate
    inert).
  - `underProficiency` (bool): the armor **penalty** gate — dropped unless the wearer's proficiency
    is *below* the armor's `requiredProficiency` (on while untrained).

The gate reads the **base** proficiency `.value` (suppression runs before `prepareDerivedData`
folds `.effective`), so effect-driven proficiency changes don't feed the gate — avoiding circular
suppression. The flags are authored per-effect on the item Effects tab (a min-proficiency input,
plus an under-proficiency checkbox for armor). Active maneuvers are simply **not offered** on the
sheet when the gate fails (that UI is still future work).

## 8. Data model & content changes

### 8.1 `CONFIG.WISPERS` (`modules/config.js`)
- `WISPERS.effectScopes` — the scope vocabulary (§4.1), for authoring/validation.
- `WISPERS.conditions` — built at `ready` from the conditions compendium (§5).
- `WISPERS.weaponProperties` — (from the weapons spec) each entry now points at a passive-effect
  definition or an active maneuver (§7).

### 8.2 Actor schema (`modules/data/actor/_helpers.js`)
- Add `.bonus` accumulator sub-fields to abilities and proficiency entries (§3); drop/repurpose
  the unused `modifiers` arrays.
- Implement `wispersActor.prepareDerivedData()` to compute `effective` values (§3).

### 8.3 Item schema (`modules/data/item/feature.js`)
- Add the `activation` block (§6).

### 8.4 Roll pipeline (`modules/sheets/wispersCharacterSheet.js`)
- `_collectRollMods(scope)`; fold tierShift / flag-Boon-Bane / flatBonus into every roller (§4.2).
- Switch die-formula reads to `effective` (§3).
- `_onActivateFeature` + activate controls (§6).

### 8.5 Token / status wiring (`wispers.js`)
- At `ready`, populate `CONFIG.statusEffects` from the conditions compendium (§5).
- Widen the sheet's effect bucketing: `_prepareContext` currently splits temporary/passive by
  `duration?.seconds` only — also treat `duration.rounds`/`turns` as temporary.

### 8.6 Compendium packs (`system.json`)
- Declare `packs/conditions` (`type: "Item"` — see §5 correction; **not** `ActiveEffect`)
  alongside the wound packs from `wound-tables.md` §6.4. Author the starter conditions
  (Bleeding, Prone, Stunned, Staggered, …) as effect-bearing Items.

## 9. Open questions / deferred

- **Trigger-dispatch engine** (onTurnStart/onHit/onWounded/onReact/onCast) — explicitly out of
  v1 (§6); the biggest follow-up. v1 leans on activatable actions + descriptive text.
- **Multi-step Boon/Bane** (§4.2 step 3) — confirm net magnitude applies multiple shifts vs
  clamp to ±1.
- **Condition stacking** (§5) — refresh vs stack-with-count default.
- **`ActiveEffect` vs effect-Item for compendium conditions** (§5) — assumed AE documents.
- **Effective-value plumbing** — every consumer of ability/proficiency values (die icons, rolls,
  encumbrance-from-Strength later) must move to `effective`; audit when implementing.
- **Does the trigger engine eventually own wounds-feed-modifier** (the "more wounded → worse
  rolls" idea from `wound-tables.md` §7)? Likely an effect/trigger once this exists.
- **Duration mapping** to the AP-initiative combat (rounds/turns vs "until end of your turn") —
  use native AE duration; confirm the turn-boundary semantics against the end-of-turn re-prompt.

## 10. Implementation checklist

- [x] `wispersActor.prepareDerivedData()`: base→effective for abilities + proficiencies (§3).
- [x] `_helpers.js`: add `.bonus` accumulators; drop unused `modifiers` arrays.
- [x] Sheet die-formula reads + die-icon call sites: use `.effective` (§3).
- [x] `config.js`: `effectScopes`; `conditions` (`{}` placeholder, ready-populated later); `weaponProperties` (`{}`).
- [x] `wispersCharacterSheet`: `_collectRollMods`, fold levers into all rollers via `_buildRollFormula` (§4.2).
- [~] `feature.js`: `activation` block ✓. **`_onActivateFeature` + activate controls pending.**
- [x] Weapon-effect suppression by equip + proficiency gate (§7). Both gates done in
      `wispersActor._isEffectSuppressed` (`minProficiency` + armor `underProficiency`, via
      `_itemProficiency`); authored per-effect on the item Effects tab.
- [x] `ready` hook: build `CONFIG.statusEffects` from `packs/conditions` (`buildConditionRegistry()`).
- [x] `system.json`: declare `packs/conditions` (corrected `ActiveEffect` → `Item`). **Authoring
      starter conditions pending.**
- [x] Widen effect bucketing in `_prepareContext` (rounds/turns, not just seconds).
- [ ] Wire dependents: wound AEs, weapon properties, spell `effects[]` (their TBD vocab is now
      this spec's §3–4 changes + §5 conditions).
- [x] Update `CLAUDE.md` (effects, roll flow, prepareDerivedData) and `TODO.md`.

## 11. Touched/affected files (for the implementer)

- `modules/objects/wispersActor.js` — `prepareDerivedData` (base→effective), effect suppression.
- `modules/data/actor/_helpers.js` — `.bonus` accumulators.
- `modules/data/item/feature.js` — `activation` block.
- `modules/config.js` — `effectScopes`, `conditions`, `weaponProperties`.
- `wispers.js` — `CONFIG.statusEffects` from compendium; die helpers → effective.
- `modules/sheets/wispersCharacterSheet.js` — roll-mod collection + folding, activate controls,
  effect bucketing.
- `system.json` — `packs/conditions` declaration.
- `packs/conditions/` — authored conditions.
- `templates/partials/character/features.hbs` / `effects.hbs` — activate controls, effect display.
- `lang/en.json`, `lang/hu.json` — condition + activation strings.
- **Underpins:** `wound-tables.md` (wound AE changes), `weapons-combat.md` §4 (properties),
  `spellcasting.md` §4.2 (spell effects).
