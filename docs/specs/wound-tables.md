# Spec: Wound Tables

> **Status:** Design finalized; **schema + plumbing implemented** (the `wound` item type + sheet partial, the trimmed `wounds` block, the declared packs, and the `CONFIG.WISPERS.woundTables` placeholder). The `applyWound` resolver, the wounds display/recovery UI, and the authored content (wound Items + RollTables) remain — see §8. Source of truth for how a determined
> wound becomes a concrete consequence. This is the shared dependency referenced by
> `weapons-combat.md` §6 and `spellcasting.md` §4.1 — both call into the resolver defined here.
> **[USER]** = decided by the project owner; **[ASSUMED]** = inference to confirm.
> Targets the v13 DataModel architecture in `CLAUDE.md`.

## 1. Summary

By the time this spec's resolver runs, the attack/cast pipeline has already determined a
**severity** — `light`, `normal`, or `heavy` — from `effectiveThreat` vs the defender's
`wounds.lightThreshold` / `heavyThreshold` (see `weapons-combat.md` §1.1). This spec answers
"*which* wound": roll on the severity's table, apply modifiers, and the matched row yields a
**wound Item** that is embedded on the defender, carrying an **ActiveEffect** that applies the
mechanical penalty. Wounds **stack freely** and are cleared by **manual recovery** (deleting
the wound Item).

### 1.1 The wound roll **[USER]**

```
woundRoll = 1d8  +  source.wound[severity]  +  defender.system.wounds.modifier.value  ( + effect mods )
```

- **`1d8`** is the base die, indexed into a **~20-row table** per severity. The key design
  consequence: a bare `1d8` (1–8) can only reach the table's **milder** rows. The attacker's
  per-severity modifier and the defender's accumulated `wounds.modifier` are what push the
  result up into the **worse** rows. Higher total = worse wound.
- **`source.wound[severity]`** is the attacker's per-severity modifier — weapons author a
  triple (e.g. dagger `1/1/4` for light/normal/heavy, `weapon.system.attack.wound.*`); spells
  optionally do too (`spell.system.resolution.wound.*`, default 0). Within e.g. the *heavy*
  table, the *heavy* modifier is added.
- **`defender.system.wounds.modifier.value`** is the actor-side modifier (effects, and
  optionally the weight of existing wounds, can raise it — making the already-hurt take worse
  results).
- The total is **clamped** to the table's row range before lookup (see §3.3).

> **[ASSUMED]** three separate ~20-row tables (one per severity), each rolled with the same
> `1d8 + mods` mechanic but themed to its severity (a heavy table's worst row is far nastier
> than a light table's). The owner said "roll on the *corresponding* table," which implies
> one table per severity. Confirm vs a single shared 20-row table where severity only changes
> the modifier tier.

### 1.2 Worked example

Heavy wound determined (`effectiveThreat 12 ≥ heavyThreshold 10`). Attacker is a dagger
(`wound.heavy = 4`); defender already carries effects pushing `wounds.modifier.value = 1`.

- `woundRoll = 1d8 + 4 + 1`. Roll `1d8 = 5` → total **10**, clamped into the heavy table's
  range [1, 20] → 10.
- Heavy table row covering 10 → e.g. the **"Shattered Arm"** wound Item.
- The system embeds a copy of *Shattered Arm* on the defender; its `transfer: true`
  ActiveEffect auto-applies (e.g. "cannot wield two-handed weapons; −1 die tier to Strength
  checks").
- A chat card reports the wound. Later, recovery deletes the embedded item, removing the effect.

## 2. Storage mechanism **[USER]** — hybrid RollTable → wound Items

Three layers, all shipped in **system compendium packs** (`packs/`, currently empty; declare
them in `system.json`, see §6.4):

1. **Wound Items** — a compendium of Item documents of a new **`wound`** type (§4). Each wound
   carries its description + an embedded **ActiveEffect** (the mechanical payload, §3 Q-answer:
   *linked ActiveEffect*). This is the editable, structured source of truth for what a wound
   *is*.
2. **RollTables** — three Foundry **RollTable** documents (`Wounds — Light`, `Wounds — Normal`,
   `Wounds — Heavy`), each ~20 rows. Each row's `range: [min, max]` maps to a **document
   result** pointing at a wound Item in the compendium (1). GM-editable in the native UI.
3. **A severity → table lookup** in `CONFIG.WISPERS.woundTables` (§6.1) so the resolver can
   find the right RollTable at runtime.

This gives the **native roll + GM-editable tables** of RollTables *and* the **structured,
auto-applied mechanical effects** of Items — the best of both, at the cost of more authoring
setup.

## 3. Resolver flow

A single shared function both the weapon attack and the spell cast call after they've
produced a `severity` and identified the `source` (weapon/spell) and `defender` actor.

**`applyWound({ defender, severity, sourceWound /* {light,normal,heavy} */ })`:**

1. **Build & evaluate the roll.**
   `mod = (sourceWound?.[severity] ?? 0) + (defender.system.wounds.modifier.value ?? 0)` (+ any
   transient effect mods). `roll = new Roll("1d8 + @mod", { mod })`; `await roll.evaluate()`.
2. **Resolve the table.** `table = await fromUuid(CONFIG.WISPERS.woundTables[severity])` (a
   RollTable UUID/lookup, §6.1).
3. **Clamp & look up the row.** `total = Math.clamp(roll.total, tableMin, tableMax)` (the
   table's lowest/highest row bounds). Use `table.getResultsForRoll(total)` — **[ASSUMED]**
   author the top and bottom rows as open-ended ranges (e.g. last row `[18, 999]`) so an
   over-modified total never falls through to "no result". (If using `table.draw({roll})`,
   pre-clamp by constructing the roll's total; simplest is `getResultsForRoll(total)`.)
4. **Resolve the wound Item.** Each matched TableResult is a document reference →
   `await fromUuid(result.documentUuid)` → the wound Item.
5. **Apply.** `await defender.createEmbeddedDocuments("Item", [woundItem.toObject()])`.
   Embedding copies the wound onto the actor; its `transfer: true` ActiveEffect(s) auto-apply
   the penalty. The embedded item **is** the persistent record of the wound (no separate log
   array needed — see §5.3).
6. **Announce.** Post a chat card: defender, severity, the rolled total (and its breakdown),
   and the resulting wound name/description.

> `Math.clamp` is available in Foundry's global `Math` extensions; otherwise inline
> `Math.min(max, Math.max(min, x))`.

## 4. The `wound` item type (new) — `modules/data/item/wound.js`

Adding a type means doing the five steps in `CLAUDE.md` ("To add a new item type"). Wounds are
**not physical inventory** (no `baseFields()`), like `feature`.

```js
const fields = foundry.data.fields;

/**
 * Data schema for `wound` items. Wounds are the result rows of the wound tables: a
 * description, which severity table they belong to, and a recovery note. Their mechanical
 * payload lives in the document's ActiveEffects (transfer:true), not in this schema, so
 * embedding the wound on an actor auto-applies the penalty.
 */
export default class WoundData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      severity: new fields.SchemaField({
        value: new fields.StringField({ required: true, nullable: false,
          initial: "light", choices: ["light", "normal", "heavy"] })
      }),
      // How this wound clears. Phase 1: descriptive (rest / treatment / time). A later
      // recovery system can key off a structured field.
      recovery: new fields.SchemaField({ value: new fields.StringField({ initial: "" }) })
    };
  }
}
```

- The **mechanical penalty** is one or more **ActiveEffects on the wound Item** (authored in
  the compendium via the item sheet's Effects tab), with `transfer: true` so they apply to the
  owning actor automatically. **[USER]** payload = linked ActiveEffect/condition.
- **Conditions & change vocabulary:** a wound's ActiveEffect uses the change vocabulary defined
  in **`effects-conditions.md`** — flat stat mods via `.bonus` accumulators (§3 there) and/or
  roll-time `flags.wispers.*` levers (§4 there), and it may apply a named condition (§5 there,
  e.g. "Bleeding"). A wound is just an ActiveEffect-bearing document like any other effect source.

## 5. Actor-side: wounds block, display, recovery

### 5.1 Wounds are embedded Items, not an array

**Supersedes `weapons-combat.md` §3.3.** With the hybrid model, an actor's wounds are simply
its embedded Items of type `wound`. The previously-proposed `wounds.consequences[]` schema is
**dropped** — querying `actor.items.filter(i => i.type === "wound")` is the source of truth,
and the ActiveEffect transfer handles the mechanics. The `wounds` block keeps only:

```js
wounds: new fields.SchemaField({
  modifier:       new fields.SchemaField({ value: intField(0) }),                 // wound-roll modifier (effects, accumulated severity)
  lightThreshold: new fields.SchemaField({ value: intField(5,  { min: 0 }) }),
  heavyThreshold: new fields.SchemaField({ value: intField(10, { min: 0 }) })
})
```

(Remove the `consequences` ArrayField from `_helpers.js`’s `baseActorFields()` wounds block.)

### 5.2 Sheet display

Add a **Wounds** display listing `actor.items` of type `wound`, grouped by `severity.value`,
each with its description and a **remove (recover)** control. **[ASSUMED]** placement: a panel
on the **character** tab near the wound thresholds, or a section on the **effects** tab (which
already lists ActiveEffects — wounds' transferred effects will show there too). Build it in
`_prepareContext` alongside the existing `inventory`/`featureSections` collections and exclude
`wound` from the inventory groupings (it isn't loot).

### 5.3 Lifecycle **[USER]** — stack freely, manual recovery

- No hard cap; each inflicted wound is another embedded wound Item (effects stack).
- **Recovery** = deleting the wound Item (`deleteEmbeddedDocuments("Item", [id])`), which
  removes its transferred ActiveEffect. Phase 1: a manual remove button + GM discretion. A
  later **recovery/rest action** can automate removal based on `recovery.value`.
- **Death / incapacitation** is **out of scope** here (handled narratively / a later rule).
  Note it as a gap — "stack freely" means nothing currently stops infinite wounds.

## 6. Data model & content changes

### 6.1 `CONFIG.WISPERS` (`modules/config.js`)

```js
// Severity -> wound RollTable. Values are compendium UUIDs (or {pack, name} to resolve at
// ready-time). Filled once the compendium packs exist (§6.4).
WISPERS.woundTables = {
  light:  "Compendium.wispers.wound-tables.RollTable.<id>",
  normal: "Compendium.wispers.wound-tables.RollTable.<id>",
  heavy:  "Compendium.wispers.wound-tables.RollTable.<id>"
};
```

> Because the UUIDs aren't known until the packs are built, resolve lazily in the resolver
> (`fromUuid` at call time), and consider a `ready`-hook validation that warns if a table is
> missing.

### 6.2 Item type registration (per `CLAUDE.md`)

- `template.json`: add `"wound"` to `Item.types`.
- `wispers.js`: register `WoundData` in `CONFIG.Item.dataModels.wound`.
- `WispersItemSheet.TYPE_PARTS`: add a `wound` partial (description + severity + recovery), and
  add it to the preload list. The shared `hasInventoryFields` gate already hides quantity/
  weight/price for types without `baseFields()`, so wounds render clean.
- Lang: `CONSTANTS.Wounds.*` (the `Wounds` namespace already exists) — add severity labels,
  item-type label, recovery label.

### 6.3 Actor schema (`modules/data/actor/_helpers.js`)

- Trim the `wounds` block to `modifier`/`lightThreshold`/`heavyThreshold` (§5.1) — drop
  `consequences`.

### 6.4 Compendium packs (`system.json` + `packs/`)

Declare packs so Foundry loads them (currently `packs/` is empty and undeclared):

```jsonc
"packs": [
  { "name": "wounds",        "label": "Wounds",        "path": "packs/wounds",        "type": "Item",      "system": "wispers" },
  { "name": "wound-tables",  "label": "Wound Tables",  "path": "packs/wound-tables",  "type": "RollTable", "system": "wispers" }
]
```

Author the ~20 light/normal/heavy wound Items and the three RollTables in those packs. This is
the first real **content** authoring — and the proof-of-concept for the JSON-compendium goal:
once the schemas here are settled, these tables are authored as compendium data and won't need
re-migration.

## 7. Open questions / deferred

- **One table per severity vs one shared 20-row table** (§1.1) — spec assumes three; confirm.
- **Table tail handling** — open-ended top/bottom rows vs code clamp (§3.3); spec does both
  (clamp + recommend open-ended rows).
- **Does accumulated wound count feed `wounds.modifier`?** (i.e. the more wounded you are, the
  worse new wounds roll). Tempting and the field supports it, but it's an effect-design choice
  — undecided.
- **Death / incapacitation** (§5.3) — no cap currently; needs its own rule.
- **Conditions vocabulary** for wound ActiveEffects (§4) — part of the effects/conditions
  system, a separate spec.
- **Recovery automation** — Phase 1 is manual delete; a rest/treatment action keyed off
  `recovery.value` is future.
- **Crit-failure backfire** (from `spellcasting.md` §3.1) may route a wound onto the *caster*
  via this same resolver — confirm when the backfire rule is decided.

## 8. Implementation checklist

- [x] `template.json`: add `wound` to `Item.types`.
- [x] `modules/data/item/wound.js`: `WoundData` per §4.
- [x] `wispers.js`: register `CONFIG.Item.dataModels.wound`; add the wound item-sheet partial
      to the preload list.
- [x] `WispersItemSheet.TYPE_PARTS`: add `wound`; create `templates/sheets/item/types/wound.hbs`.
- [x] `config.js`: add `WISPERS.woundTables` (placeholder `null` UUIDs — fill after packs exist).
- [x] `_helpers.js`: trim the `wounds` block (drop `consequences`).
- [x] `system.json`: declare the `wounds` and `wound-tables` packs.
- [ ] Author content: ~20 wound Items per severity (with ActiveEffects) + 3 RollTables.
- [ ] `wispersCharacterSheet`: `applyWound(...)` resolver (called by the weapon/spell react
      handler); a Wounds display + recover button. (Note: `wound` is already naturally excluded
      from inventory groupings — it isn't in any inventory bucket.)
- [x] Update `weapons-combat.md` §3.3 and `spellcasting.md` to reference embedded wound Items
      (drop `consequences[]`).
- [x] Update `CLAUDE.md` (item types, wounds) and `TODO.md`.

## 9. Touched/affected files (for the implementer)

- `template.json` — `wound` type.
- `modules/data/item/wound.js` — new schema.
- `modules/data/actor/_helpers.js` — trimmed `wounds` block.
- `modules/config.js` — `woundTables` lookup.
- `wispers.js` — item DataModel registration + partial preload.
- `modules/sheets/wispersItemSheet.js` + `templates/sheets/item/types/wound.hbs` — wound sheet.
- `modules/sheets/wispersCharacterSheet.js` — `applyWound` resolver, wounds display, recovery.
- `system.json` — pack declarations.
- `packs/wounds/`, `packs/wound-tables/` — authored content.
- `lang/en.json`, `lang/hu.json` — `CONSTANTS.Wounds.*` additions.
- **Shared:** called by the weapon attack + spell cast react handlers (`weapons-combat.md` §5,
  `spellcasting.md` §7).
