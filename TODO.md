# TODO

Tracking intentional scaffolding and known inconsistencies in the Wispers FoundryVTT system. CLAUDE.md points here so the architectural doc stays focused; this file is where mutable project state lives.

## Design specs — implementation status

**Foundation phase landed (schemas + effects engine).** The data-layer half of all five specs
is implemented: every actor/item schema is final and editable, `wispersActor.prepareDerivedData`
computes base→effective, roll-time `flags.wispers.*` levers feed the roll pipeline, the `wound`
item type exists, and the `wounds` / `wound-tables` / `conditions` packs are declared (empty). See
the approved foundation plan for the exact surface. **Schemas are now settled — safe to author
content against them.**

**Still to do (deferred, in dependency order):**
- **Runtime combat/cast flow** — The roll triggers and chat cards for attacks/casts are done
  (`_rollWeaponAttack`, `_castSpell`, `_spellDegree`, degree/threat cards). Remaining: the defender
  **react** handler (subtractive mitigation: `effectiveThreat = max(0, threat − saveResult)`),
  `_effectiveWoundThresholds` + shield **block** reaction, and the shared `applyWound(...)` resolver.
  React UX is single-client / GM-mediated (mirror `wispersCombat._isResponsibleUser`).
- **Effect application** — weapon-property + armor under-proficiency **suppression**: **equip-gate
  implemented** (`wispersActor.allApplicableEffects()` suppresses effects from unequipped items).
  **Proficiency gate pending** (layer onto the same method per `effects-conditions.md` §7).
  (Weapon proficiency resolution `_resolveWeaponProficiency` is done. The `ready` hook that
  builds `CONFIG.statusEffects` from the conditions compendium **now exists** —
  `buildConditionRegistry()` in `wispers.js`; it's a safe no-op until the pack has content.)
- **Content** — author wound Items / RollTables / conditions in the packs and fill
  `WISPERS.woundTables` UUIDs; an actor-side sheet UI for weapon/armor proficiency editing,
  the wounds display + recover button, and the `.rollable` attack/cast/activate controls.
  (The **item-side** gated-property editor and the item Effects tab now exist — see below.)
- **`WispersItem.roll()` redirect** — weapons → attack flow, spells → cast flow (currently both
  fall through to the description card, since their `damage` blocks are gone).

**Content-authoring prerequisites landed (item-templating pass).** Before authoring the
compendium content, three sheet/config gaps were closed and three design choices locked:

- **Item sheet now has an Effects tab.** `wispersItemSheet` renders Details/Effects tabs
  (`templates/sheets/item/body.hbs` + `effects.hbs`) with ActiveEffect create/edit/delete/toggle
  actions. This unblocks authoring **wounds**, **passive features**, and **conditions** — their
  mechanical payload is `transfer:true` ActiveEffects on the item, which previously had no UI.
- **Gated-properties editor.** `WISPERS.weaponProperties` now carries a starter vocabulary
  (versatile/twoHanded/light/finesse/reach/thrown/cleave/piercing/guard/loading — display-only
  keywords for phase 1, shared by weapons/armor/shields). The shared editor partial
  (`templates/sheets/item/partials/properties.hbs`) is included by all three type sheets, wired to
  `addProperty`/`removeProperty` actions. Mechanical wiring still comes with the effects engine.
- **Conditions pack fixed + loader built.** The `conditions` pack was declared
  `type: "ActiveEffect"` — **not a valid Foundry compendium type**; changed to `Item`
  (effect-bearing Items, the effects-conditions.md §5 fallback). `buildConditionRegistry()` in
  `wispers.js` reads the pack at `ready` and registers `CONFIG.statusEffects` + `WISPERS.conditions`
  from each condition Item's transfer effects. **Author conditions first**, then wounds that
  reference them.

**Locked design decisions (authoring conventions):**
- **`armorValue` scale** — base thresholds are 5/10; author armor at **light 1 / medium 2 /
  heavy 3** and shields at **1–2** (small threshold-raises vs the threat scale, armor-shields.md §8).
- **Wound tables: three per severity** — separate ~20-row Light/Normal/Heavy RollTables (not one
  shared table), confirming wound-tables.md §1.1's assumption.
- **Conditions authored before wounds** — wound ActiveEffects may apply named conditions, so the
  conditions compendium is the first content authored.

Resolution rules decided by the project owner, written up for implementation. The long-term
goal is to finalize all actor/item templates, then author content as JSON compendiums — so
these schemas must be settled *before* authoring to avoid re-migrating data.

- **[Weapons & Combat](docs/specs/weapons-combat.md)** — the threat → react → wound combat
  loop, weapon categories + specific-weapon proficiencies, AP attack costs, proficiency-gated
  properties, and the actor/weapon schema changes they require. Removes the `combat` skill.
  Depends on a separate wound-table spec (TBD).
- **[Spellcasting](docs/specs/spellcasting.md)** — gather → degree → resolve: a school check
  generates ephemeral spellpower vs per-spell thresholds, yielding one of four degrees; the
  degree sets the final spellpower (threat). Casting time = AP cost. Damaging spells reuse the
  weapons react/wound loop; effects are bespoke per spell. Shares the wound-table dependency.
- **[Wound Tables](docs/specs/wound-tables.md)** — resolves a determined severity into a
  concrete wound: roll `1d8 + source modifier + actor wounds.modifier` into a ~20-row table
  per severity. Hybrid storage (RollTables → `wound`-type Items carrying ActiveEffects). Wounds
  are embedded Items that stack and clear by manual recovery. Adds a `wound` item type and the
  first compendium packs. **Supersedes the `wounds.consequences[]` idea** in the weapons spec.
- **[Effects & Conditions](docs/specs/effects-conditions.md)** — the effect engine wounds,
  weapon properties, and spell effects all depend on. Everything is a native ActiveEffect; flat
  stat mods land on `.bonus` accumulators (NOT editable base fields) folded into `effective`
  values by a (finally-implemented) `prepareDerivedData`; roll-time levers (Boon/Bane, die-tier
  shift, flat-to-total) are `flags.wispers.*` accumulators read by the roll pipeline. Conditions
  are a compendium surfaced as token statuses. Active/reaction features become activatable
  AP-cost actions. Resolves the "TBD effect vocabulary" left open by the three prior specs.
- **[Armor & Shields](docs/specs/armor-shields.md)** — closes the combat loop. Armor passively
  **raises wound thresholds**, but only against attacks targeting a save it **covers**
  (per-armor, default physical) — so the boost is computed per-hit from the attack's targetSave.
  Shields are **active-only**: spend AP to block as a reaction. Adds an actor **armor proficiency
  track** (by type); under-proficiency imposes penalties via the effects engine. Consolidates
  the shared equipment fields to just `equipped`. Flags the `armorValue` default retune.

## Known WIP / scaffolding

These are intentional placeholders, not bugs to fix opportunistically — flag them when relevant but don't silently rewrite:

- **Level-up button is a placeholder.** The header now carries a `.level-up-btn` button in the `.level-row` that increments `system.level.value` by one. `_onLevelUp` has a TODO comment; it should open a full level-up dialog or flow (ability/proficiency gains) once designed. For now, clicking the button bumps the level with no other changes.
- **Hotbar item macros silently fail.** `createItemMacro` writes the command `game.wisperssystem.rollItemMacro(uuid)`, but `game.wisperssystem` is never assigned (the `rollItemMacro` function in `wispers.js` is module-local). To fix: expose it on the `init` or `ready` hook (e.g., `game.wisperssystem = { rollItemMacro };`). **Note:** the new `_rollWeaponAttack` and `_castSpell` sheet methods now handle weapon/spell clicks; `rollItemMacro` redirects remain (deferred until `WispersItem.roll()` is repointed).
- **`wispersActor.prepareDerivedData()` now folds base→effective.** It computes `abilities.<x>.effective = value + bonus` and `…proficiency.effective = clamp(value + bonus, 0..5)` for every proficiency ladder (skills/schools/saves/weapon categories/weapon specifics/armor). Rolls and die icons read `.effective`. **Still a stub for richer derived stats** (a full derived *save total* = proficiency + ability + situational, an HP/threshold derivation, Strength-derived encumbrance) — those remain to implement here.
- **Save/school "bonus" is the linked attribute's *effective* value.** `header.hbs` and `_prepareContext` now use `system.abilities.<linkedAttribute>.effective` (was raw `.value`). Still a passable stand-in — a true derived save value (proficiency + ability + situational) is future work in `prepareDerivedData`.
- **Empty stub modules**: `modules/dice.js`, `modules/dialog.js`, `modules/listeners.js`. Their names indicate intended responsibility (currently the roll/dialog logic lives inline in `wispersCharacterSheet.js`). The `wounds` / `wound-tables` / `conditions` packs are now **declared** in `system.json` but their `packs/` databases are still empty (content phase). (`modules/combat/` holds the initiative/action-point system — see CLAUDE.md.)
- **Action-point costs are not configured.** `wispersActor.spendActionPoints(cost)` is the spend primitive, but nothing calls it yet — per-action costs (move/attack/cast) still need a config + UI to deduct AP. Initiative itself is "currently unbound": the prompt accepts any integer with no min/max.
- **Encumbrance cap is a hard-coded `10`.** `_prepareContext` computes slot-based load (`weight × quantity`) against a static `ENCUMBRANCE_MAX = 10`. A later pass should derive the cap from Strength.

## Known inconsistencies

- **`system.json` token attributes don't exist.** It declares `primaryTokenAttribute: "health"` and `secondaryTokenAttribute: "mental"`, but neither field exists in the actor schema — health-equivalent data lives under `wounds`. Reconcile before relying on token bars.
- **`WispersItem.roll()` is now description-only for weapons & spells.** The `damage` blocks were removed from both schemas (weapons → attack/threat model, spells → spellpower/degree model), so `roll()` no longer finds `system.damage.dice.value` and posts a description card for every type. This is intentional pending the deferred `roll()` redirect (weapons → `_rollWeaponAttack`, spells → `_castSpell`). The old weapon/spell damage-path mismatch is resolved by the schema rewrite.
- **Nested `details` pattern.** The character sheet reads/writes `system.details.biography` + the new identity/personality strings (race, background, alignment, homeRegion, appearance, trait, ideal, bond, flaw) under `details.*` to avoid colliding with the unrelated numeric top-level `system.race` / `system.background` fields (spec character-tab-merge.md §3.1). The top-level `system.biography` defined in `baseActorFields()` is currently dead — a future cleanup pass could consolidate or remove it, but it's left intact now to minimize churn.
- **`system.class.name` has no placeholder default anymore.** `CharacterData.class.name` initializes to `""` (the old `template.json` `"dingus"` placeholder is gone with the DataModel migration). Listed only so the old note isn't missed — nothing to do here.
