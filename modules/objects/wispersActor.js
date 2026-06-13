export default class wispersActor extends Actor {
  prepareData() {
    super.prepareData();
  }

  /**
   * Equip-gated effect suppression (effects-conditions.md §7, armor-shields.md §5).
   *
   * Foundry applies an item's `transfer:true` ActiveEffects to the actor as soon as
   * the item is owned, regardless of whether it is worn/wielded. For *equippable*
   * items (weapons/armor/shields — those whose `system` carries an `equipped` flag)
   * we only want the effect to apply while the item is actually equipped, so we drop
   * suppressed effects from the generator core iterates in `applyActiveEffects()`.
   *
   * Non-equippable sources are unaffected: a wound, a passive feature, or a condition
   * placed directly on the actor has no `equipped` flag, so it always applies while
   * present. Because this runs on every `prepareData` cycle and toggling `equipped`
   * updates the item (re-preparing the actor), the gate is live with no extra wiring.
   */
  *allApplicableEffects() {
    for (const effect of super.allApplicableEffects()) {
      if (wispersActor._isEquipSuppressed(effect)) continue;
      yield effect;
    }
  }

  /** True when `effect` is transferred from an equippable item that isn't equipped. */
  static _isEquipSuppressed(effect) {
    const source = effect.parent;
    if (source?.documentName !== "Item") return false;
    const sys = source.system ?? {};
    if (!("equipped" in sys)) return false;   // not an equippable item — never gated
    return !sys.equipped?.value;              // suppress while unequipped
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