# Spec: Armor & Shields

> **Status:** Design finalized; **schema layer implemented** (armor/shield schemas with `covers`/`requiredProficiency`/`block`, the actor armor-proficiency track, `equippedField`, the clamp extension, retuned `armorValue`). The `_effectiveWoundThresholds` resolver, the block reaction, penalty suppression, the proficiency-editor UI, and authored content remain — see §10. Closes the combat loop by defining how
> `armorValue` and shields enter the threat → react → wound pipeline. References:
> `weapons-combat.md` (the loop, equipment fields, proficiency pattern), `wound-tables.md`
> (severity from thresholds), `effects-conditions.md` (penalties, activatable reactions,
> suppression). **[USER]** = decided by the project owner; **[ASSUMED]** = inference to confirm.
> Targets the v13 DataModel architecture in `CLAUDE.md`.

## 1. Summary

- **Armor** is **passive**: while worn, its `armorValue` **raises the defender's wound
  thresholds** — but **only against attacks targeting a save the armor covers** (per-armor
  configurable, default physical). Because coverage is per-save, the boost is **computed at
  resolution time from the incoming attack's `targetSave`**, not stored on the actor.
- **Shields** are **active-only**: they do nothing passively. The defender may spend AP to
  **block** as a reaction to a specific attack, applying the shield's `armorValue` (same
  threshold-raising mechanic) for that hit only. Block is an activatable reaction
  (`effects-conditions.md` §6).
- **Armor proficiency** is a new actor track (by type: light/medium/heavy, 0–5). Wearing armor
  you're under-proficient in imposes **penalties** via the effects engine.

### 1.1 Where it plugs into the loop

This modifies two steps of `weapons-combat.md` §1.1 (and the identical spell path,
`spellcasting.md` §1.1):

- **React step (4):** in addition to spending AP to roll the targeted save, the defender may
  spend AP to **block with a shield** (if equipped and it covers the `targetSave`).
- **Severity step (5):** the thresholds the `effectiveThreat` is compared against are now
  **effective thresholds** = base ± effects, **plus** the `armorValue` of every worn armor that
  covers this attack's `targetSave`, **plus** the shield's `armorValue` if a block reaction was
  taken and the shield covers the `targetSave`.

```
effectiveThreat = threat − saveResult                       // unchanged
effThresholds   = { light: wounds.lightThreshold + Σarmor + shieldBlock,
                    heavy: wounds.heavyThreshold + Σarmor + shieldBlock }
severity        = band(effectiveThreat, effThresholds)      // no-wound / light / normal / heavy
```

where `Σarmor` / `shieldBlock` only count sources whose `covers` set includes the attack's
`targetSave`. **[ASSUMED]** a source's single `armorValue` raises **both** the light and heavy
thresholds equally (sliding the whole severity window up); confirm vs separate light/heavy
armor values.

### 1.2 Worked example

Defender wears **Chainmail** (`armorType heavy`, `armorValue 3`, `covers {reflex, toughness}`),
has **heavy-armor proficiency 2** (meets the armor's requirement → no penalty), carries a
**Buckler** (`armorValue 2`, `covers {reflex}`, `block.apCost 1`). Base thresholds light 5 / heavy 10.

- Hit by a sword (`targetSave reflex`, threat 14). Chainmail covers reflex → light 8 / heavy 13.
- Defender spends AP, rolls Reflex save = 4 → `effectiveThreat = 14 − 4 = 10`.
- Defender also spends 1 AP to **block** with the buckler (covers reflex) → +2 → light 10 / heavy 15.
- `10 ≥ light(10)` and `< heavy(15)` → **normal** wound. *(Without armor/shield: 10 ≥ heavy 10 →
  a **heavy** wound. The defences downgraded it two bands.)*
- **Contrast:** a spell targeting **Resolve** — neither the chainmail nor buckler covers resolve,
  so no threshold boost; armor is bypassed, as intended.

## 2. Armor (passive, coverage-gated threshold boost)

- **`armorValue`** — the integer added to the covered thresholds while worn.
- **`covers`** — **[USER]** per-armor set of saves it protects (subset of
  `reflex`/`toughness`/`resolve`), **default `{reflex, toughness}`** (physical). Enchanted armor
  can include `resolve`.
- **Applies only while `equipped`** and (per §4) **not suppressed by an under-proficiency
  penalty** that disables protection — *(open: does under-proficiency reduce `armorValue`, or
  only impose roll penalties? See §4 / §7.)*
- **Multiple armors:** if the design ever allows layering, covering armors' `armorValue`s sum;
  typically one armor is worn.

## 3. Shields (active block reaction) **[USER]**

A shield contributes **nothing passively**. It adds an **activatable reaction** ("block") to the
defender's options in the react step:

- `block.apCost` — AP to block (an integer on the shield, like a weapon's `attack.apCost`).
- `covers` — saves the block can protect (subset, default `{reflex, toughness}`).
- On block, the shield's `armorValue` is added to the effective thresholds **for that attack
  only**, if it covers the `targetSave`.
- Implemented as an activatable reaction per `effects-conditions.md` §6 — surfaced in the react
  prompt alongside reaction features and the save roll. Spending the AP and resolving the block
  is the "active maneuver" path.

**[ASSUMED]** a shield can be used to block multiple times per round so long as AP remains
(no once-per-turn cap); confirm. **[OPEN]** shield proficiency — the proficiency question (§4)
was answered for *armor types*; shields aren't a light/medium/heavy type. v1: shields need no
proficiency. Revisit if shields should scale with a proficiency.

## 4. Armor proficiency track **[USER]**

Add an actor-side armor proficiency, **by type**, on the 0–5 ladder (mirrors weapon
categories). The set of types is already `WISPERS.armorTypes` (`light`/`medium`/`heavy`), so the
schema is config-derived exactly like skills/weapon categories:

```js
// in skillsFields() (modules/data/actor/_helpers.js), alongside weapons.* from weapons-combat.md
armor: proficiencyGroup(WISPERS.armorTypes)   // { light:{proficiency}, medium:{proficiency}, heavy:{proficiency} }
```

- An armor item's `armorType.value` selects which proficiency track applies.
- **Under-proficiency imposes penalties.** Each armor declares a `requiredProficiency` (the
  minimum armor-type proficiency to wear it cleanly); **[ASSUMED]** defaults by type
  (light 0 / medium 1 / heavy 2 — i.e. heavier armor demands training). When
  `actor armor-proficiency[type] < requiredProficiency`, the armor's **penalty effects** apply.
- **Item-level proficiency dropped.** As with weapons (`weapons-combat.md` §2.2, §3.4), remove
  the shared `equipmentFields().proficiency` from armor — proficiency now lives on the actor.
- Extend `_prepareSubmitData`'s 0–5 clamp to cover `system.skills.armor.*` (and the
  `weapons.*` added by the weapons spec).

## 5. Under-proficiency penalties (via the effects engine)

Penalties are realized through `effects-conditions.md`, not bespoke code:

- The armor carries **penalty ActiveEffect(s)** (authored on the armor item) using the effects
  vocabulary — e.g. a `flags.wispers.tierShift.skill.stealth` / `…tierShift.save.reflex`
  penalty, an AP penalty, or reduced movement.
- These effects are **suppressed unless `equipped && armorProficiency[type] <
  requiredProficiency`** — the same equip+gate suppression mechanism weapon properties use
  (`effects-conditions.md` §7).
- **[ASSUMED]** binary (penalty on/off below the requirement). A scaled version (penalty grows
  with the proficiency deficit) is possible later.

## 6. Data model & content changes

### 6.1 Shared equipment fields (`modules/data/item/_helpers.js`)

`equipmentFields()` currently bundles `proficiency` + `equipped` + `type`. With weapons and
armor both dropping item-level `proficiency`, and each type carrying its own type field
(`weaponType`/`armorType`), reduce the shared group to just **`equipped`**:

```js
export function equippedField() {
  return { equipped: new fields.SchemaField({ value: new fields.BooleanField({ initial: false }) }) };
}
```

Weapons (`weapons-combat.md` §3.4), armor (§6.2), and shields (§6.3) spread `equippedField()`.
Remove the old `equipmentFields()` once all three are migrated.

### 6.2 Armor item schema (`modules/data/item/armor.js`)

```js
export default class ArmorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...baseFields(),
      ...equippedField(),
      armorType: new fields.SchemaField({
        value: new fields.StringField({ required: true, nullable: false,
          initial: "light", choices: Object.keys(WISPERS.armorTypes) })
      }),
      armorValue: new fields.SchemaField({
        // RETUNE: see §8 — the old default of 10 is far too high for a threshold-raise vs base
        // thresholds 5/10. Expect small values (≈1–5).
        value: new fields.NumberField({ required: true, nullable: false, initial: 2, integer: true, min: 0 })
      }),
      covers: new fields.SetField(
        new fields.StringField({ choices: Object.keys(WISPERS.savingthrows) }),
        { initial: ["reflex", "toughness"] }                 // physical by default
      ),
      requiredProficiency: new fields.SchemaField({
        value: new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true, min: 0, max: 5 })
      }),
      properties: new fields.ArrayField(new fields.SchemaField({   // same gated-property model as weapons
        key:            new fields.StringField(),
        minProficiency: new fields.NumberField({ initial: 0, integer: true, min: 0, max: 5 })
      }))
    };
  }
}
```

> Penalty effects (§5) are **ActiveEffects on the armor item**, not schema fields.

### 6.3 Shield item schema (`modules/data/item/shield.js`)

```js
export default class ShieldData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...baseFields(),
      ...equippedField(),
      armorValue: new fields.SchemaField({
        value: new fields.NumberField({ required: true, nullable: false, initial: 2, integer: true, min: 0 })
      }),
      covers: new fields.SetField(
        new fields.StringField({ choices: Object.keys(WISPERS.savingthrows) }),
        { initial: ["reflex", "toughness"] }
      ),
      block: new fields.SchemaField({                      // the activatable reaction (§3)
        apCost: new fields.NumberField({ required: true, nullable: false, initial: 1, integer: true, min: 0 })
      }),
      properties: new fields.ArrayField(new fields.SchemaField({
        key:            new fields.StringField(),
        minProficiency: new fields.NumberField({ initial: 0, integer: true, min: 0, max: 5 })
      }))
    };
  }
}
```

### 6.4 Actor schema (`modules/data/actor/_helpers.js`)
- Add `armor: proficiencyGroup(WISPERS.armorTypes)` to the skills block (§4).
- Extend the `_prepareSubmitData` clamp regex/loop to include `system.skills.armor.*`.

### 6.5 `CONFIG.WISPERS`
- `WISPERS.armorTypes` already exists — reused for both the armor proficiency track keys and the
  `armorType` choices. No new map needed; `covers` choices reuse `Object.keys(savingthrows)`.

## 7. Resolver integration (`modules/sheets/wispersCharacterSheet.js`)

- **`_effectiveWoundThresholds(defender, targetSave, { shieldBlocked = false } = {})`** →
  `{ light, heavy }`: base thresholds (+ any `flags.wispers.flatBonus`-style threshold effects)
  plus the `armorValue` of each equipped armor whose `covers` includes `targetSave`, plus the
  blocking shield's `armorValue` if `shieldBlocked` and it covers `targetSave`. Called in the
  severity step of both the weapon and spell react handlers.
- **React prompt** gains a **block** option when a shield is equipped and covers the
  `targetSave`: spending `shield.block.apCost` sets `shieldBlocked = true` for the threshold
  computation. Offered alongside the save roll and any reaction features
  (`effects-conditions.md` §6).
- **Penalty suppression:** when preparing actor effects, suppress an armor's penalty effects
  unless `equipped && armorProficiency[armorType] < requiredProficiency` (§5, reusing the §7
  gate of `effects-conditions.md`).

## 8. Tuning note (important)

`armorValue` **raises thresholds**, so its scale must be commensurate with the threat scale
(threats are roughly `weaponDie + proficiencyDie`, ~2–22, commonly ~8–16) and the base
thresholds (5/10). The **pre-existing defaults — armor 10, shield 2 — are wrong** for this
mechanic: +10 to thresholds makes a wearer nearly immune. Retune to small values (≈1–5) when
authoring the armor compendium, and sanity-check against typical threats. This is a balance
pass, flagged so it isn't shipped as-is.

> **[LOCKED]** Authoring convention agreed with the project owner: author armor at
> **light 1 / medium 2 / heavy 3** and shields at **1–2**. (Schema defaults stay `armorValue 2`,
> i.e. a medium value, so a fresh armor is sane out of the box.) Revisit only if play shows
> these are too weak/strong vs typical threats.

## 9. Open questions / deferred

- **Light vs heavy threshold boost** (§1.1) — single `armorValue` raises both equally vs separate
  values. Spec assumes equal.
- **Under-proficiency: penalty only, or also reduced protection?** (§4–5) — spec applies roll
  penalties but keeps `armorValue` working; confirm whether being untrained should also cut the
  threshold boost.
- **Shield proficiency** (§3) — none in v1; revisit.
- **Shield block cap** (§3) — once-per-turn vs AP-limited; spec assumes AP-limited.
- **Layering armor** (§2) — typically one; confirm whether multiple armors stack.
- **`armorValue` retune** (§8) — content/balance pass.
- **Movement / encumbrance from armor** — heavy armor likely also feeds the Strength-derived
  encumbrance cap (TODO.md) and/or a movement penalty; wire when those land.

## 10. Implementation checklist

- [x] `_helpers.js` (item): add `equippedField()`; retire `equipmentFields()` (and `damageFields()`).
- [x] `armor.js`: new schema (§6.2) — drop item proficiency; add `covers`, `requiredProficiency`,
      `properties`; retune `armorValue` default (10 → 2).
- [x] `shield.js`: new schema (§6.3) — `covers`, `block.apCost`, `properties`; drop item proficiency.
- [x] `_helpers.js` (actor): add `armor: proficiencyGroup(WISPERS.armorTypes)`.
- [x] `wispersCharacterSheet._prepareSubmitData`: extend clamp to `skills.armor.*`.
- [ ] `wispersCharacterSheet`: `_effectiveWoundThresholds`; add the **block** reaction to the
      react prompt; armor-penalty suppression.
- [~] Sheet UI: the armor/shield **item** sheets edit `covers`/`requiredProficiency`/`block` ✓.
      The actor-side armor-proficiency editor + equip/coverage display + block control are pending.
- [ ] Author armor/shield content with retuned values + penalty ActiveEffects (compendium).
- [x] `weapons-combat.md` / `spellcasting.md` already cross-reference `_effectiveWoundThresholds`
      and the block reaction (the runtime call lands with the react handler).
- [x] Update `CLAUDE.md` (combat, item types) and `TODO.md`.

## 11. Touched/affected files (for the implementer)

- `modules/data/item/_helpers.js` — `equippedField()`, retire `equipmentFields()`.
- `modules/data/item/armor.js`, `modules/data/item/shield.js` — new schemas.
- `modules/data/actor/_helpers.js` — armor proficiency track.
- `modules/sheets/wispersCharacterSheet.js` — effective thresholds, block reaction, clamp,
  penalty suppression.
- `templates/sheets/item/types/armor.hbs`, `shield.hbs` — coverage/requirement/block fields.
- `templates/partials/character/*` — armor proficiency editor, block control.
- `lang/en.json`, `lang/hu.json` — coverage/block/armor-proficiency strings.
- **Depends on:** `effects-conditions.md` (penalties, activatable block, suppression),
  `wound-tables.md` (severity bands), `weapons-combat.md` (loop, equipment fields).
