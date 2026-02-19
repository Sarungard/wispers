export default class WispersActor extends Actor {
  prepareData() {
    super.prepareData();
  }

  prepareDerivedData() {
    const actorData = this.system;
    // Switch on the type of Actor to prepare the data differently
    this._prepareCharacterData(actorData);
  }

  _prepareCharacterData(actorData) {
    // Make separate variables for convenience

    this._setCharacterDetails(actorData);
  }

  async _setCharacterDetails(data) {

    // Calculations should done here and then update the Actor with the new details
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
