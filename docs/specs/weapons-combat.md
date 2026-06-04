# Spec: Weapons & Combat

> **Status:** Design finalized, **not yet implemented**. This document is the source of
> truth for the weapon/combat data model and resolution flow. It exists so the work can
> be picked up cold in a later session. Decisions marked **[USER]** were made by the
> project owner; decisions marked **[ASSUMED]** are inferred to fill a gap and should be
> confirmed before/while implementing (they are reasonable defaults, not commitments).
>
> Targets the v13 ApplicationV2 / DataModel architecture described in `CLAUDE.md`.

## 1. Summary of the combat model

Wispers combat is a **threat → react → wound** loop, not a hit/miss-then-damage loop.
There is no "to-hit" roll and no hit points. An attack produces a *threat value*; the
defender may spend Action Points (AP) to mitigate it with a save; whatever threat
survives is converted into a **wound** of some severity, and the defender rolls on the
matching wound table to find out what the wound actually is.

### 1.1 End-to-end flow

1. **Declare attack.** Attacker spends the weapon's AP cost (`attack.apCost`) from their
   pool (`system.initiative.remaining`, see the combat/AP section of `CLAUDE.md`). If they
   can't afford it, the attack is blocked.
2. **Roll threat.** Attacker rolls **weapon die + proficiency die**, summed = the
   **threat value**.
   - *weapon die* = `weapon.system.attack.weaponDie.value` (e.g. `"1d8"`), baked into the
     weapon's stat block.
   - *proficiency die* = `_proficiencyDieFormula(prof)` where `prof` is the wielder's
     resolved proficiency with this weapon (see §2). A proficiency of 0 yields `"0"`
     (no die — weapon die only).
   - **[USER]** Boon/Bane may shift one die a tier; **no difficulty die** on attacks (the
     defender's reaction is the opposing force). Reuse `_showRollDialog(label, { showDifficulty: false })`.
3. **Target a save.** The weapon (or the feature, for non-weapon attacks) names which save
   it targets: `reflex`, `toughness`, or `resolve` (`weapon.system.attack.targetSave.value`).
4. **Offer reaction.** The defender is offered the chance to spend AP to **react**.
   Reacting rolls the targeted save (its proficiency die, via the existing
   `_rollProficiency` path, no difficulty die); the save result **mitigates** the threat.
   The defender may also spend AP to **block with a shield** (`armor-shields.md` §3) and may
   trigger reaction features (`effects-conditions.md` §6).
   - **[USER]** No AP spent ⇒ the wound is computed from the *raw* threat.
   - **[ASSUMED]** Mitigation is subtractive: `effectiveThreat = threat − saveResult`,
     floored at 0. This satisfies "negates the wound or lowers its severity" — a big save
     can drop the effective threat into a lower band or to nothing. (Alternative read:
     compare-not-subtract. Confirm before coding.)
5. **Determine severity** from `effectiveThreat` vs the **effective** wound thresholds. Base
   thresholds are `system.wounds.lightThreshold.value` (5) / `heavyThreshold.value` (10), but
   the comparison uses `_effectiveWoundThresholds(defender, targetSave, {shieldBlocked})`
   (`armor-shields.md` §7), which adds worn **armor** + a **blocked shield**'s `armorValue`
   when they cover this attack's `targetSave`, plus any threshold effects:
   - `effectiveThreat <= 0` → **no wound** (fully mitigated). **[ASSUMED]** floor.
   - `0 < effectiveThreat < light` → **light** wound.
   - `light <= effectiveThreat < heavy` → **normal** wound.
   - `effectiveThreat >= heavy` → **heavy** wound.
   - **[USER]** Effects/armor may raise/lower the thresholds, directly changing which band a
     given threat lands in.
6. **Roll the wound.** The defender rolls on the wound table for that severity, **adding
   the weapon's wound modifier for that severity**.
   - **[USER]** Each weapon carries a light/normal/heavy modifier triple, e.g. a dagger is
     `1/1/4`. Stored as `weapon.system.attack.wound.{light,normal,heavy}`.
   - **[USER]** Effects can increase/decrease this modifier (and, per step 5, the
     thresholds). A global per-actor modifier already exists at `system.wounds.modifier.value`.
   - The table result becomes a **consequence** pushed onto `system.wounds.consequences[]`
     (see §3.3 for the entry shape).

### 1.2 Worked example

Attacker wields a **scimitar** (`weaponDie 1d8`, `targetSave reflex`, `wound 1/1/4`,
`apCost 2`). Wielder has Scimitar specific proficiency 4 → proficiency die `1d10`.

- Threat roll: `1d8 + 1d10` → say 6 + 7 = **13 threat**.
- Defender (lightThreshold 5, heavyThreshold 10) spends AP to react, rolls Reflex
  (save proficiency 3 → `1d8`) → 4. `effectiveThreat = 13 − 4 = 9`.
- `5 <= 9 < 10` → **normal** wound.
- Defender rolls the Normal Wound table + `wound.normal` (1) → result recorded as a
  consequence.

## 2. Weapon proficiency model

**[USER]** Two layers of proficiency, both on the **0–5 ladder** (so they reuse
`_proficiencyDieFormula`):

- **Categories** — a fixed set of 8: `maces`, `daggers`, `axes`, `swords`, `bows`,
  `crossbows`, `hammers`, `polearms`. Every weapon belongs to exactly one
  (`weapon.system.category.value`).
- **Specific weapons** — open-ended; any weapon may grant its own proficiency track,
  identified by a **slug** the weapon declares (`weapon.system.slug.value`, e.g.
  `"scimitar"`). A character can be proficient in scimitars without being proficient in
  swords generally.

### 2.1 Precedence (which die is used)

**[USER] Specific overrides category.** Resolution order when attacking with a weapon:

1. If the wielder has a specific-weapon entry for `weapon.system.slug.value`, use **that**
   proficiency — even if it is lower than the category's.
2. Else, use the **category** proficiency for `weapon.system.category.value`.
3. Else, proficiency 0 (weapon die only).

> Note: this differs from "highest wins" — a specific entry is authoritative once it
> exists. Authoring/UX should make it clear that learning a specific weapon *replaces* the
> category die for that weapon.

### 2.2 The old `combat` skill is removed

**[USER]** Delete `combat` from `WISPERS.skills` (and from both lang files'
`CONSTANTS.Skills`). Weapon proficiencies fully replace it. Unarmed/improvised attacks have
no proficiency fallback yet — see Open Questions §7.

## 3. Data model changes

### 3.1 `CONFIG.WISPERS` additions (`modules/config.js`)

```js
// Fixed weapon categories. Like WISPERS.skills, these become schema keys on the actor
// (the category proficiency group) AND the choices for weapon.system.category.
WISPERS.weaponCategories = {
  maces:      "CONSTANTS.WeaponCategories.Maces",
  daggers:    "CONSTANTS.WeaponCategories.Daggers",
  axes:       "CONSTANTS.WeaponCategories.Axes",
  swords:     "CONSTANTS.WeaponCategories.Swords",
  bows:       "CONSTANTS.WeaponCategories.Bows",
  crossbows:  "CONSTANTS.WeaponCategories.Crossbows",
  hammers:    "CONSTANTS.WeaponCategories.Hammers",
  polearms:   "CONSTANTS.WeaponCategories.Polearms"
};

// Registry of weapon property definitions. Properties are keyword-coded; mechanical
// triggers/active features are implemented later, but the registry pins down the
// vocabulary so compendium weapons reference keys, not free strings.
WISPERS.weaponProperties = {
  // key: { label, description, (later) hooks/triggers }
  // e.g. cleave: { label: "CONSTANTS.WeaponProperties.Cleave.Label",
  //                description: "CONSTANTS.WeaponProperties.Cleave.Desc" }
};

// Saves a weapon/feature can target. Reuses the existing savingthrows keys.
// (No new map strictly needed — weapon.system.attack.targetSave choices are
//  Object.keys(WISPERS.savingthrows): ["reflex","toughness","resolve"].)
```

Also: **remove** the `combat` entry from `WISPERS.skills`.

### 3.2 Actor schema — weapon proficiencies (`modules/data/actor/_helpers.js`)

Add a weapon-proficiency block. Categories are config-derived fixed keys (mirrors the
existing `proficiencyGroup` pattern); specific weapons are an **open map** keyed by slug,
so they need a `TypedObjectField` (v13) rather than a fixed `SchemaField`.

```js
// in skillsFields() or a new weaponProficiencyFields():
weapons: new fields.SchemaField({
  // Fixed: one entry per WISPERS.weaponCategories key, 0–5 ladder.
  categories: proficiencyGroup(WISPERS.weaponCategories),
  // Open: slug -> { proficiency: { value, max } }. Authored as the player learns weapons.
  specific: new fields.TypedObjectField(
    new fields.SchemaField(proficiencyEntry())  // proficiencyEntry() already returns { proficiency:{value,max} }
  )
})
```

Placement: either nest under the existing `system.skills` block (alongside
`skills`/`spellSchools`/`savingthrows`) or hang a new top-level `system.proficiencies`.
**[ASSUMED]** nest under `system.skills.weapons` to keep all proficiency ladders together
and let `_prepareSubmitData`'s clamp regex extend naturally. Confirm.

> `_prepareSubmitData` currently clamps `system.skills.{skills|spellSchools|savingthrows}.*`
> to [0,5]. Extend its regex/loop to include `weapons.categories.*` and `weapons.specific.*`.

### 3.3 Actor schema — wounds (`_helpers.js`)

> **SUPERSEDED by `wound-tables.md` §5.1.** The earlier plan to store wounds as a typed
> `consequences[]` array was dropped once the wound-table mechanism was decided: wounds are
> **embedded `wound` Items** on the actor (their `transfer:true` ActiveEffects apply the
> penalty), so `actor.items.filter(i => i.type === "wound")` is the source of truth and no
> array is needed. The `wounds` block keeps only the wound-roll modifier and the severity
> thresholds:

```js
wounds: new fields.SchemaField({
  modifier:       new fields.SchemaField({ value: intField(0) }),   // wound-roll modifier (effects)
  lightThreshold: new fields.SchemaField({ value: intField(5,  { min: 0 }) }),
  heavyThreshold: new fields.SchemaField({ value: intField(10, { min: 0 }) })
})
```

There is **no HP counter** — `effectiveThreat` vs these thresholds picks a severity, then the
wound-table resolver (`wound-tables.md` §3) produces the actual wound.
```

### 3.4 Weapon item schema (`modules/data/item/weapon.js`)

Replace the current weapon schema. The shared `damageFields()`
(`dice`/`circumstanceDice`/`damageType`) and the item-level `equipmentFields().proficiency`
**no longer apply** — proficiency lives on the actor (§2), and damage is replaced by the
weapon die + wound model.

```js
export default class WeaponData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...baseFields(),                 // description/source/quantity/weight/price — keep
      equipped: new fields.SchemaField({ value: new fields.BooleanField({ initial: false }) }),

      category: new fields.SchemaField({
        value: new fields.StringField({ required: true, nullable: false,
          initial: "swords", choices: Object.keys(WISPERS.weaponCategories) })
      }),
      // Stable id for specific-weapon proficiency. Multiple weapon items may share a slug
      // (every scimitar uses "scimitar"). Empty = category-only weapon.
      slug: new fields.SchemaField({ value: new fields.StringField({ initial: "" }) }),

      attack: new fields.SchemaField({
        weaponDie: new fields.SchemaField({ value: new fields.StringField({ initial: "1d6" }) }),
        targetSave: new fields.SchemaField({
          value: new fields.StringField({ required: true, nullable: false,
            initial: "reflex", choices: Object.keys(WISPERS.savingthrows) })
        }),
        apCost: new fields.SchemaField({
          value: new fields.NumberField({ required: true, nullable: false, initial: 1, integer: true, min: 0 })
        }),
        // Wound-table roll modifier per severity, e.g. dagger = 1 / 1 / 4.
        wound: new fields.SchemaField({
          light:  new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true }),
          normal: new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true }),
          heavy:  new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true })
        })
      }),

      range: new fields.SchemaField({
        value: new fields.NumberField({ required: true, nullable: false, initial: 5, min: 0 }),
        units: new fields.StringField({ initial: "feet" })
      }),

      // Proficiency-gated properties (§4). Each references a key in WISPERS.weaponProperties.
      properties: new fields.ArrayField(new fields.SchemaField({
        key:           new fields.StringField(),                       // -> WISPERS.weaponProperties
        minProficiency: new fields.NumberField({ initial: 1, integer: true, min: 0, max: 5 })
      }))
    };
  }
}
```

> **Migration note:** dropping `damageFields()`/`equipmentFields()` from weapons means the
> existing `WispersItem.roll()` (which reads `system.damage.dice.value`) no longer applies to
> weapons — it is superseded by the attack flow in §5. Also resolves the weapon-damage-path
> inconsistency tracked in `TODO.md`. **Armor and shields still use `equipmentFields()`** —
> if their item-level `proficiency` is also unwanted, split `equipmentFields()` rather than
> editing it in place (it is shared).

## 4. Weapon properties

**[USER]** Properties are keyword-coded info / triggers / active features, **gated per
property by a proficiency threshold**.

- A weapon lists `properties: [{ key, minProficiency }]`.
- A property is **active** for a given wielder only when their *effective* proficiency
  (resolved per §2.1) `>= minProficiency`.
- The `key` resolves into `WISPERS.weaponProperties[key]`, which (per `effects-conditions.md`
  §7) points at either a **passive effect** (an ActiveEffect granted while equipped) or an
  **active maneuver** (an activatable AP-cost action).
- **Mechanics are realized by the effects engine** (`effects-conditions.md`): a passive
  property grants its AE — suppressed unless `equipped && effectiveProficiency >= minProficiency`
  (§7 there); an active-maneuver property is offered on the sheet only when the gate passes.
  Roll-affecting properties (e.g. "grants Boon on attacks", "shifts the attack die a tier") use
  the `flags.wispers.*` levers (§4 there).
- **Phase 1:** properties may ship as display-only keywords (greyed-out below threshold) until
  the effects engine lands; the gating logic is the same either way.

## 5. Roll-pipeline integration (`modules/sheets/wispersCharacterSheet.js`)

Reuse the existing roll plumbing — do **not** build a parallel dialog.

- **`_resolveWeaponProficiency(item)`** → integer 0–5: specific slug entry, else category,
  else 0 (§2.1).
- **`_rollWeaponAttack(item)`** (new):
  1. Check/spend AP: `await this.actor.spendActionPoints(item.system.attack.apCost.value)`;
     abort with a notification if it returns `false`.
  2. `prof = this._resolveWeaponProficiency(item)`; `profDie = _proficiencyDieFormula(prof) ?? "0"`.
  3. `weaponDie = item.system.attack.weaponDie.value`.
  4. `config = await _showRollDialog(label, { showDifficulty: false })`; abort if `null`.
  5. `pool = _applyBoonBane([weaponDie, profDie], config.boonBane)`; `threat = sum`.
  6. Post an **attack chat card** carrying: attacker, weapon name, `threat`, `targetSave`,
     the `wound` triple, and a button to react. (The card is the hand-off to the defender.)
- **Reaction** (defender side):
  - Spend AP, then roll the targeted save through the existing
    `_rollProficiencyFromGroup("savingthrows", targetSave)` path (no difficulty die).
  - `effectiveThreat = max(0, threat − saveResult)`; derive severity (§1.1 step 5);
    if a wound results, roll the wound table (§6), append the consequence (§3.3).
- The card/dialog interaction is **cross-client** (attacker and defender may be different
  users). Phase 1 may implement this GM-mediated or single-client (like the initiative
  prompt's `_isResponsibleUser` gate in `wispersCombat.js`); full networked reaction UX is
  Phase 2. See Open Questions §7.

Add a `.rollable` weapon-attack control on the inventory/features sheet wired to
`_rollWeaponAttack` (per the `.rollable` convention in `CLAUDE.md`).

## 6. Wound tables (dependency, not fully specified here)

The light/normal/heavy **wound tables** map a roll (`severity die + weapon wound modifier +
actor wounds.modifier`) to a concrete consequence. **Open:** the table mechanism is
undecided — candidates:

- Foundry **RollTable** documents shipped in a compendium (most native; GMs can edit).
- A `CONFIG.WISPERS.woundTables` data structure (fully code-controlled).

This is its own resolution to be written down separately (like this spec). Until decided,
`_rollWeaponAttack`'s reaction step can record `{severity, roll}` and leave `result` blank.

## 7. Open questions / deferred decisions

- **Unarmed / improvised attacks.** With `combat` removed there is no proficiency fallback.
  Decide: a fixed "unarmed" weapon item with its own slug, or a default category, or
  always proficiency 0.
- **Reaction AP cost.** Is reacting a flat cost (e.g. 1 AP) or scalable (more AP = Boon on
  the save / multiple save dice)? Where is it stored — on the save, the actor, or global
  config? **[ASSUMED]** flat 1 AP for Phase 1.
- **Mitigation math.** Confirm subtractive (`threat − saveResult`) vs compare-against
  (threat as a target number the save must meet). Spec assumes subtractive.
- **No-wound floor.** Confirm `effectiveThreat <= 0 ⇒ no wound`, and whether a *minimum*
  threat (e.g. always at least a light wound on any hit) is wanted.
- **Wound table mechanism** (§6).
- **Cross-client reaction UX** (§5) — networking/targeting model.
- **Armor/shield `armorValue`** — how (if at all) armor interacts with this loop is not
  specified here (this spec is weapons-only). Armor may shift thresholds, grant mitigation,
  or be its own resolution.
- **Multi-target / area attacks**, **ranged vs melee AP differences**, **range/cover** —
  not modeled (the "no difficulty die on attacks" decision removed the obvious hook for
  range penalties; revisit if needed).

## 8. Implementation checklist

- [ ] `config.js`: add `weaponCategories`, `weaponProperties`; remove `combat` from `skills`.
- [ ] Lang (`en.json` + `hu.json`): add `CONSTANTS.WeaponCategories.*`,
      `CONSTANTS.WeaponProperties.*`; remove `CONSTANTS.Skills.Combat`.
- [ ] Actor `_helpers.js`: add `system.skills.weapons.{categories, specific}`; tighten
      `wounds.consequences` entry schema.
- [ ] `wispersCharacterSheet._prepareSubmitData`: extend the 0–5 clamp to weapon proficiencies.
- [ ] `weapon.js`: replace schema per §3.4.
- [ ] `wispersCharacterSheet`: `_resolveWeaponProficiency`, `_rollWeaponAttack`, attack
      chat card, reaction handler; wire a `.rollable` attack control.
- [ ] Character sheet UI: weapon-proficiency editor (categories + learned specifics);
      proficiency-gated property display on weapons.
- [ ] `WispersItem.roll()`: redirect weapons to the attack flow (or leave for spells/items).
- [ ] Decide & implement the wound-table mechanism (§6) — separate spec.
- [ ] Update `CLAUDE.md` (combat/roll sections) and `TODO.md` once implemented.

## 9. Touched/affected files (for the implementer)

- `modules/config.js` — categories, properties, remove `combat`.
- `modules/data/actor/_helpers.js` — weapon proficiencies, wounds consequences.
- `modules/data/item/weapon.js` — new schema.
- `modules/data/item/_helpers.js` — possibly split `equipmentFields()` so weapons stop
  inheriting `proficiency`.
- `modules/sheets/wispersCharacterSheet.js` — attack/reaction roll flow.
- `modules/objects/wispersItem.js` — weapon `roll()` redirect.
- `templates/partials/character/inventory.hbs` / `features.hbs` and item sheet templates —
  attack control, proficiency editor, gated properties.
- `lang/en.json`, `lang/hu.json` — new keys, removed `combat`.
