export default class wispersActor extends Actor {
  prepareData() {
    super.prepareData();
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