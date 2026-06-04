# Spec: Spellcasting

> **Status:** Design finalized, **not yet implemented**. Source of truth for the spell data
> model and casting resolution. Companion to `weapons-combat.md` — spells reuse its
> **threat → react → wound** loop and its (still-undecided) wound-table mechanism.
> **[USER]** = decided by the project owner; **[ASSUMED]** = reasonable inference filling a
> gap, confirm before/while implementing. Targets the v13 DataModel architecture in `CLAUDE.md`.

## 1. Summary of the casting model

Casting is a **gather → degree → resolve** flow. There is no spell-attack roll separate from
casting and **no stored spellpower pool** — spellpower is generated fresh by a school check
each cast. The check total is "gathered spellpower"; how it compares to the spell's authored
thresholds picks one of **four degrees**; the degree decides the **final spellpower** (the
threat) and how the spell behaves. Damaging spells then hand off to the same defender-react /
wound-threshold loop as weapons, but each spell's effect is otherwise **bespoke**.

### 1.1 End-to-end flow

1. **Pay AP.** Casting costs the spell's **casting time**, which *is* its AP cost
   (`spell.system.castingTime.value`). **[USER]** Open-ended integer (the old 1–6 bound was a
   draft remnant — drop it). Spend via `actor.spendActionPoints(castingTime)`; abort if it
   returns `false`.
2. **School check → gather spellpower.** The caster rolls a check on the spell's **school**
   (`spell.system.school.value`). This is exactly the existing
   `_rollProficiencyFromGroup("spellSchools", school)` roll: school **proficiency die +
   linked-attribute die**, plus the linked attribute's **value as a flat bonus when school
   proficiency ≥ 4**, with **Boon/Bane** allowed and **no difficulty die** (matches current
   spell-school behavior). **[USER]** The roll **total = gathered spellpower** (ephemeral).
3. **Determine degree** by comparing gathered spellpower to the spell's four authored
   thresholds (§2). The result is one of: **Critical Failure / Failure / Success / Critical
   Success**.
4. **Degree sets final spellpower & behavior** (§3):
   - *Critical Failure* → spell **backfires**; AP already spent; no threat produced.
   - *Failure* → spell **fizzles**; AP already spent; no threat, no effect.
   - *Success* → spell resolves its normal effect; **final spellpower = gathered**.
   - *Critical Success* → normal effect, **scaled** per the spell's scaling hint; final
     spellpower is amplified.
5. **Resolve the effect** (§4), which is **bespoke per spell**:
   - *Damaging spells* set `final spellpower = threat`, name a targeted save, and run the
     **same loop as weapons** (defender may spend AP to roll the save → `effectiveThreat`
     vs the **effective** wound thresholds → light/normal/heavy → wound-table roll, optionally
     + the spell's own wound modifier). See `weapons-combat.md` §1. **Armor applies only if it
     covers the spell's `targetSave`** (`armor-shields.md` §1–2) — e.g. physical armor does
     nothing against a Resolve-targeting spell.
   - *Non-damaging spells* (heal/buff/condition/utility) apply their authored effects
     instead of (or in addition to) a wound.

### 1.2 Worked example

Spell **Flame Lash** — school `elementalism` (linked attribute `pre`), `castingTime 2`,
degree thresholds `{criticalFailure: 0, failure: 8, success: 14, criticalSuccess: 22}`,
damaging: `targetSave reflex`, `wound 0/1/3`.

Caster: `pre` value 7 → attribute die `1d8`; elementalism proficiency 4 → proficiency die
`1d10` and (prof ≥ 4) a `+7` flat bonus.

- Pay 2 AP. School check `1d10 + 1d8 + 7` → 6 + 5 + 7 = **18 gathered spellpower**.
- `14 ≤ 18 < 22` → **Success**. Final spellpower = 18 = **threat**.
- Defender (lightThreshold 5, heavyThreshold 10) spends AP, reacts with Reflex → 6.
  `effectiveThreat = 18 − 6 = 12 ≥ 10` → **heavy** wound → rolls Heavy Wound table + `wound.heavy` (3).
- Had the check totalled ≥ 22 → **Critical Success**: scaled per the scaling hint (higher
  final spellpower / extra rider, §3.2). Had it been `8 ≤ total < 14` → **Failure** (fizzle,
  2 AP gone). Below 8 → **Critical Failure** (backfire).

## 2. Spellpower & the four degrees

**[USER]** Degree cutoffs are **authored per spell** (not global margin bands, not derived
from a single requirement). Model as four ascending minimum-total thresholds; the gathered
spellpower lands in the **highest degree whose threshold it meets**:

| Degree           | Reached when gathered spellpower ≥ … |
|------------------|--------------------------------------|
| Critical Failure | `degrees.criticalFailure` (default 0 — always reachable) |
| Failure          | `degrees.failure`                    |
| Success          | `degrees.success` ← the spell's **static Spellpower requirement** |
| Critical Success | `degrees.criticalSuccess`            |

- `degrees.success` is the headline **"Spellpower requirement"** the owner described — the
  minimum to actually cast the spell's effect.
- Thresholds must be authored non-decreasing (`criticalFailure ≤ failure ≤ success ≤
  criticalSuccess`); validate on the DataModel or in an authoring check.
- **[ASSUMED]** four explicit thresholds (one per degree) rather than 3 cutoffs, to honor
  "four thresholds … for each degree" and leave room for spells that, say, can't critically
  fail (set `criticalFailure` and `failure` equal). Confirm if you'd rather store 3 cutoffs.

**Gathered vs final spellpower** **[USER]**: gathered = raw school-check total (ephemeral, no
actor pool). The **degree** maps gathered → **final spellpower** (the threat): Critical
Failure / Failure → no threat (0); Success → final = gathered; Critical Success → final =
gathered amplified by the scaling hint (§3.2).

## 3. Degree behavior (global framework + per-spell payload)

**[USER]** What each degree *means* is a **global framework**; each spell only authors its
**normal effect** plus a **scaling hint** for critical success.

### 3.1 Global meaning of each degree

- **Critical Failure** — **backfire**. AP is spent; the spell does not take effect and a
  generic negative consequence triggers. **[ASSUMED/OPEN]** the backfire is global (e.g. the
  caster takes a wound, or the cast produces a threat *against the caster*). Exact backfire
  rule is undecided — see Open Questions §7.
- **Failure** — **fizzle**. AP is spent; nothing else happens.
- **Success** — the spell's authored **normal effect** resolves (§4); final spellpower =
  gathered.
- **Critical Success** — the normal effect, **scaled** by the spell's scaling hint (§3.2);
  final spellpower amplified.

These four are defined once in `CONFIG.WISPERS.spellDegrees` (labels + the structural rule),
so all spells share the framework and only spells differ in numbers/effect text.

### 3.2 Per-spell scaling hint

**[ASSUMED]** A small per-spell structure describing how Critical Success amplifies the
normal effect. Candidates (pick during implementation):
- a **flat/multiplier bonus to final spellpower** (e.g. `+50%`, or `+X`), and/or
- an **extra rider** (an added effect / extra wound severity step / second target).

Modelled below as `spell.system.scaling` with a `spellpower` multiplier/bonus plus a free
`rider` description (structured effects come with the effects system, §4.2). Refine the exact
shape when the effects system is specced.

## 4. Effect resolution (bespoke per spell)

**[USER]** Spells are less generalized than weapons — the effect is chosen per spell. The
schema carries an **optional wound block** *and* a **general effects hook**; a spell uses
either or both.

### 4.1 Damaging spells (reuse the weapon loop)

When `spell.system.resolution.dealsWound` is true:
- `threat = final spellpower` (from the degree).
- `spell.system.resolution.targetSave` ∈ `reflex|toughness|resolve`.
- Hand off to the **identical** defender-react → `effectiveThreat` → wound-threshold →
  wound-table flow defined in `weapons-combat.md` §1.1 steps 4–6.
- **[USER]** Spells *may* carry their own wound modifier triple
  (`resolution.wound.{light,normal,heavy}`), parallel to weapons' `1/1/4`. It is optional
  (default 0/0/0) — a spell can drive severity by threat alone.

### 4.2 Non-damaging / mixed spells (effects hook)

A flexible `spell.system.resolution.effects[]` list for heal/buff/condition/utility outcomes.
The effect vocabulary is now defined by **`effects-conditions.md`**: an entry references a
**condition key** (compendium-backed token status) or a compendium ActiveEffect, plus an
optional `target` (self/target) — applied on Success (and scaled on Critical Success). Keep
`effects[]` permissive (`kind`/`ref`/`value`/`duration`/`description`) and resolve `ref`
through `effects-conditions.md` §5–6. A spell may both deal a wound (§4.1) and apply effects.

## 5. AP cost

**[USER]** `castingTime.value` is the AP cost, **open-ended** (drop the draft 1–6 bound). AP
is spent up front (step 1) and is **not refunded** on Failure or Critical Failure (fizzle /
backfire still cost the AP). Reaction AP (defender's save) follows the weapons-combat rule
(`weapons-combat.md` §7 — flat cost, TBD).

## 6. Data model changes

### 6.1 `CONFIG.WISPERS` additions (`modules/config.js`)

```js
// The four casting degrees: labels + (documentation of) the global structural rule.
WISPERS.spellDegrees = {
  criticalFailure: "CONSTANTS.SpellDegrees.CriticalFailure",  // backfire
  failure:         "CONSTANTS.SpellDegrees.Failure",          // fizzle, AP spent
  success:         "CONSTANTS.SpellDegrees.Success",          // normal effect
  criticalSuccess: "CONSTANTS.SpellDegrees.CriticalSuccess"   // scaled effect
};
// (Optional, later) WISPERS.spellEffectTypes = { heal, buff, condition, ... } for §4.2.
```

`spell.system.school.value` choices reuse `Object.keys(WISPERS.spellSchools)`; `targetSave`
choices reuse `Object.keys(WISPERS.savingthrows)`.

### 6.2 Spell item schema (`modules/data/item/spell.js`)

Revise `SpellData`. Keep `baseFields()`, `level`, `range`, `duration`, `components`. **Fix**
`school` to use real choices. **Repurpose** `castingTime` as AP (open-ended). **Replace** the
old `damage{dice,damageType}` block with the spellpower/degree/resolution model.

```js
export default class SpellData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...baseFields(),                         // description/source/quantity/weight/price

      // FIX: was a free StringField with initial "". Must be a real school key so it lines
      // up with the caster's school proficiency.
      school: new fields.SchemaField({
        value: new fields.StringField({ required: true, nullable: false,
          initial: "arcana", choices: Object.keys(WISPERS.spellSchools) })
      }),

      level: new fields.SchemaField({              // organisational tier (spellbook buckets 1–5)
        value: new fields.NumberField({ required: true, nullable: false, initial: 1, integer: true, min: 1, max: 5 }),
        max:   new fields.NumberField({ required: true, nullable: false, initial: 5, integer: true })
      }),

      // REPURPOSED: casting time IS the AP cost. Drop the old 1–6 min/max draft bounds.
      castingTime: new fields.SchemaField({
        value: new fields.NumberField({ required: true, nullable: false, initial: 1, integer: true, min: 0 })
      }),

      range:    new fields.SchemaField({ value: new fields.StringField({ initial: "touch" }) }),
      duration: new fields.SchemaField({ value: new fields.StringField({ initial: "instantaneous" }) }),
      components: new fields.SchemaField({
        verbal:   new fields.BooleanField({ initial: false }),
        somatic:  new fields.BooleanField({ initial: false }),
        material: new fields.BooleanField({ initial: false }),
        materialComponents: new fields.StringField({ initial: "" })
      }),

      // Per-spell degree thresholds: minimum gathered spellpower to reach each degree.
      // `success` is the static Spellpower requirement. Author non-decreasing.
      degrees: new fields.SchemaField({
        criticalFailure: new fields.NumberField({ required: true, nullable: false, initial: 0,  integer: true, min: 0 }),
        failure:         new fields.NumberField({ required: true, nullable: false, initial: 1,  integer: true, min: 0 }),
        success:         new fields.NumberField({ required: true, nullable: false, initial: 10, integer: true, min: 0 }),
        criticalSuccess: new fields.NumberField({ required: true, nullable: false, initial: 18, integer: true, min: 0 })
      }),

      // Critical-success amplification hint (§3.2). Refine when the effects system is specced.
      scaling: new fields.SchemaField({
        spellpowerBonus: new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true }), // flat add to final spellpower
        spellpowerMult:  new fields.NumberField({ required: true, nullable: false, initial: 1, min: 1 }),         // multiplier on final spellpower
        rider:           new fields.StringField({ initial: "" })                                                 // extra effect description
      }),

      // Bespoke resolution (§4): optional wound block + optional effects hook.
      resolution: new fields.SchemaField({
        dealsWound: new fields.BooleanField({ initial: true }),
        targetSave: new fields.StringField({ required: true, nullable: false,
          initial: "reflex", choices: Object.keys(WISPERS.savingthrows) }),
        wound: new fields.SchemaField({   // optional per-spell wound modifier (parallels weapons' 1/1/4)
          light:  new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true }),
          normal: new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true }),
          heavy:  new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true })
        }),
        effects: new fields.ArrayField(new fields.SchemaField({   // §4.2 — permissive for now
          kind:        new fields.StringField(),                  // -> future WISPERS.spellEffectTypes
          value:       new fields.StringField({ initial: "" }),   // amount/dice/condition key
          duration:    new fields.StringField({ initial: "" }),
          description: new fields.StringField({ initial: "" })
        }))
      })
    };
  }
}
```

> **Migration note:** removing `damage.dice`/`damageType` means spells no longer match
> `WispersItem.roll()`'s `system.damage.dice.value` path — combined with the weapon change in
> `weapons-combat.md`, `roll()` is fully superseded by the attack/cast flows and should be
> redirected per item type.

### 6.3 Actor schema

**No new actor fields required.** Spellpower is ephemeral (no pool), school proficiencies and
linked attributes already exist (`system.skills.spellSchools`, `system.abilities`), and wounds
reuse the same `system.wounds` block tightened in `weapons-combat.md` §3.3.

## 7. Roll-pipeline integration (`modules/sheets/wispersCharacterSheet.js`)

Reuse the existing plumbing — don't fork the dialog.

- **`_castSpell(item)`** (new):
  1. `await this.actor.spendActionPoints(item.system.castingTime.value)`; abort on `false`.
  2. Run the school check by reusing the spell-school roll path
     (`_rollProficiencyFromGroup("spellSchools", item.system.school.value)`), but capture the
     **total** (refactor `_rollProficiency` to return the evaluated `Roll`/total, or factor the
     pool-build + Boon/Bane + evaluate into a shared helper the cast flow can call). Total =
     **gathered spellpower**.
  3. `degree = _spellDegree(total, item.system.degrees)` → one of the four.
  4. `finalSpellpower` per §2/§3 (0 on fail/crit-fail; gathered on success; scaled on
     crit-success using `item.system.scaling`).
  5. Post a **cast chat card**: caster, spell, degree, final spellpower, and — if
     `resolution.dealsWound` and degree ≥ Success — the `targetSave` + `wound` triple and a
     **react** button, identical to the weapon attack card (`weapons-combat.md` §5). Crit
     failure shows the backfire; failure shows the fizzle.
- **`_spellDegree(total, degrees)`** → returns the highest degree whose threshold `total` meets.
- **Defender reaction** is the *same handler* as weapons (`weapons-combat.md` §5): spend AP,
  roll `targetSave` via `_rollProficiencyFromGroup("savingthrows", …)`, `effectiveThreat`,
  wound severity, then `applyWound(...)` per `wound-tables.md` §3 (embeds a wound Item).
- Add a `.rollable` cast control on the spellbook tab wired to `_castSpell` (per the
  `.rollable` convention in `CLAUDE.md`).

> Refactor opportunity: the weapon attack flow and the spell cast flow share "build a die
> pool → Boon/Bane → evaluate → produce a threat → hand off to the react/wound resolver."
> Factor a common `_resolveThreat(...)` + `_applyReactionAndWound(...)` so both call it.

## 8. Open questions / deferred decisions

- **Critical-failure backfire** (§3.1) — what actually happens? (caster takes a wound; a
  threat is turned on the caster; lose extra AP; school-specific mishap?) Undecided.
- **Scaling hint shape** (§3.2) — flat bonus vs multiplier vs rider, and whether Critical
  Success can also bump wound severity a step. Schema offers all three knobs; pick the rule.
- **Effects vocabulary & wiring** (§4.2) — heal/buff/condition types and their link to
  ActiveEffects is a separate spec.
- **Wound-table mechanism** — shared dependency with `weapons-combat.md` §6 (RollTable
  compendium vs `CONFIG.WISPERS` data); still undecided.
- **Boon/Bane / difficulty on the school check** — spec keeps current behavior (Boon/Bane
  yes, difficulty die no). Confirm spells shouldn't ever take a difficulty die.
- **`level`'s role** — purely organisational here (independent of the static requirement).
  Confirm it has no mechanical effect on casting.
- **Cross-client cast/react UX** — same networking/targeting question as weapons.
- **Concentration / duration upkeep / multi-target** — not modeled.

## 9. Implementation checklist

- [ ] `config.js`: add `spellDegrees` (and later `spellEffectTypes`).
- [ ] Lang (`en.json` + `hu.json`): `CONSTANTS.SpellDegrees.*` (+ any effect/casting strings).
- [ ] `spell.js`: revise schema per §6.2 (fix `school` choices; repurpose `castingTime`;
      add `degrees`/`scaling`/`resolution`; remove old `damage` block).
- [ ] `wispersCharacterSheet`: `_castSpell`, `_spellDegree`, cast chat card; refactor the
      roll core so cast + weapon attack share threat building and the react/wound resolver.
- [ ] Spellbook tab UI: a `.rollable` cast control; show degree thresholds / requirement.
- [ ] `WispersItem.roll()`: redirect spells to the cast flow.
- [ ] Resolve the shared wound-table mechanism (separate spec).
- [ ] Update `CLAUDE.md` (roll/spell sections) and `TODO.md` once implemented.

## 10. Touched/affected files (for the implementer)

- `modules/config.js` — `spellDegrees`, school/save choice reuse.
- `modules/data/item/spell.js` — new schema.
- `modules/sheets/wispersCharacterSheet.js` — cast flow + shared threat/react refactor.
- `modules/objects/wispersItem.js` — spell `roll()` redirect.
- `templates/partials/character/spellbook.hbs` + item sheet spell template — cast control,
  degree thresholds, resolution fields.
- `lang/en.json`, `lang/hu.json` — new keys.
- **Shared with `weapons-combat.md` and `wound-tables.md`:** the react/save handler, the
  wound thresholds, and the wound-table resolver (`applyWound`).
