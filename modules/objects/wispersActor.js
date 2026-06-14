export default class wispersActor extends Actor {
  prepareData() {
    super.prepareData();
  }

  /**
   * Gated effect suppression (effects-conditions.md §7, armor-shields.md §5).
   *
   * Foundry applies an item's `transfer:true` ActiveEffects to the actor as soon as
   * the item is owned, regardless of whether it is worn/wielded or the wielder is
   * trained enough to use it. We drop suppressed effects from the generator core
   * iterates in `applyActiveEffects()`. See `_isEffectSuppressed` for the gates.
   *
   * Non-equippable sources are unaffected: a wound, a passive feature, or a condition
   * placed directly on the actor has no `equipped` flag, so it always applies while
   * present. Because this runs on every `prepareData` cycle and the gating inputs
   * (equip toggle, proficiency edits) update the actor, the gates are live with no
   * extra wiring.
   */
  *allApplicableEffects() {
    for (const effect of super.allApplicableEffects()) {
      if (this._isEffectSuppressed(effect)) continue;
      yield effect;
    }
  }

  /**
   * Whether an effect from an owned item should be suppressed. Two stacking gates:
   *
   * 1. **Equip gate** — an effect from an equippable item (one whose `system` carries
   *    an `equipped` flag: weapons/armor/shields) is suppressed while unequipped.
   * 2. **Proficiency gate** (effects-conditions.md §7) — an effect declares its gate via
   *    `flags.wispers`:
   *    - `minProficiency` (0–5): suppressed unless the wielder's proficiency with the
   *      item ≥ this (a proficiency-gated weapon/armor property).
   *    - `underProficiency` (bool): suppressed unless the wearer's proficiency is *below*
   *      the armor's `requiredProficiency` (an under-training penalty — on while untrained).
   *
   * Proficiency reads the base `.value` (this runs before `prepareDerivedData` folds
   * `.effective`), so effect-driven proficiency changes don't feed the gate — avoiding
   * circular suppression.
   */
  _isEffectSuppressed(effect) {
    const source = effect.parent;
    if (source?.documentName !== "Item") return false;
    const sys = source.system ?? {};

    // 1. Equip gate.
    if (("equipped" in sys) && !sys.equipped?.value) return true;

    // 2. Proficiency gate.
    const flags = effect.flags?.wispers ?? {};
    const min = Number(flags.minProficiency) || 0;
    const underProf = !!flags.underProficiency;
    if (!min && !underProf) return false;

    const prof = this._itemProficiency(source);
    if (prof === null) return false;   // no proficiency track (e.g. shield) — gate inert

    if (underProf) {
      const required = sys.requiredProficiency?.value ?? 0;
      if (prof >= required) return true;   // trained enough → penalty off
    }
    if (min && prof < min) return true;    // under-trained → property effect off
    return false;
  }

  /**
   * This actor's proficiency with `item` on the 0–5 ladder, or `null` when the item's
   * type has no proficiency track. Weapons: specific slug overrides category
   * (weapons-combat.md §2.1). Armor: by `armorType`. Reads base `.value` (see
   * `_isEffectSuppressed`); falls back to `.effective` when already folded.
   */
  _itemProficiency(item) {
    const sys = item?.system ?? {};
    const profOf = entry => entry?.proficiency?.value ?? entry?.proficiency?.effective ?? 0;
    if (item.type === "weapon") {
      const weapons = this.system?.skills?.weapons ?? {};
      const slug = sys.slug?.value;
      if (slug && weapons.specific?.[slug]) return profOf(weapons.specific[slug]);
      return profOf(weapons.categories?.[sys.category?.value]);
    }
    if (item.type === "armor") {
      return profOf(this.system?.skills?.armor?.[sys.armorType?.value]);
    }
    return null;   // shield and non-equipment have no proficiency track
  }

  /**
   * Fold effect accumulators into `effective` values. Effects ADD into the
   * separate `.bonus` field (never the editable `.value` the sheet binds to —
   * see effects-conditions.md §1.1), and this is where `effective = base + bonus`
   * is computed. Rolls and die-icon display read `effective`, not the raw base.
   */
  prepareDerivedData() {
    super.prepareDerivedData();
    const sys = this.system;
    if (!sys) return;

    // Abilities: open-ended, no clamp.
    for (const a of Object.values(sys.abilities ?? {})) {
      a.effective = (a.value ?? 0) + (a.bonus ?? 0);
    }

    // Proficiency ladders: effective is clamped to the 0–5 ladder.
    const clampProf = v => Math.max(0, Math.min(5, v));
    const foldGroup = group => {
      for (const entry of Object.values(group ?? {})) {
        const p = entry?.proficiency;
        if (p) p.effective = clampProf((p.value ?? 0) + (p.bonus ?? 0));
      }
    };
    const skills = sys.skills ?? {};
    foldGroup(skills.skills);
    foldGroup(skills.spellSchools);
    foldGroup(skills.savingthrows);
    foldGroup(skills.weapons?.categories);
    foldGroup(skills.weapons?.specific);
    foldGroup(skills.armor);
  }

  /**
   * Reset initiative + action points to a freshly chosen number (start of a new
   * turn). `total` is the chosen number and the AP cap; `remaining` is the live
   * pool. Any unspent AP from the previous turn is discarded by this overwrite.
   */
  async resetInitiative(value) {
    return this.update({
      "system.initiative.total": value,
      "system.initiative.remaining": value
    });
  }

  /**
   * Spend `cost` action points from the remaining pool. Action costs are not yet
   * configured per-action — this is the spend primitive they will call.
   * @returns {Promise<boolean>} false (without spending) if the pool is too low.
   */
  async spendActionPoints(cost) {
    const remaining = this.system?.initiative?.remaining ?? 0;
    if (cost > remaining) return false;
    await this.update({ "system.initiative.remaining": remaining - cost });
    return true;
  }

  setNote(note) {

        // Methode to update Character Notes

        this.update({ "system.note": note});
    }

    addLogEntry(Entry) {

        // Add a Log Entry to the Charakter Event Log

        let log = this.system.log;
        log.push(Entry);
        this.update({ "system.log": log});
    }
}