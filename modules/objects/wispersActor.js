export default class wispersActor extends Actor {
  prepareData() {
    super.prepareData();
  }

  prepareDerivedData() {
    const actorData = this.system;
    // Switch on the type of Actor to prepare the data differently
    this._preparePlayerCharacterData(actorData);
  }

  _preparePlayerCharacterData(actorData) {
    // Make separate variables for convenience

    this._setCharacterDetails(actorData);
  }

  async _setCharacterDetails(data) {

    // Calculations should done here and then update the Actor with the new details
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