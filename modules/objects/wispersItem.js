export default class WispersItem extends Item {

    prepareDerivedData() {
        super.prepareDerivedData();
        // Per-type derived values go here as the system grows (e.g. effective
        // range, total weight = quantity * weight). Kept empty for now.
    }

    /**
     * Post the item to chat. Weapons (and anything carrying a damage formula)
     * roll their damage dice; everything else posts a simple description card.
     * Wired up by the hotbar-drop macro in wispers.js.
     */
    async roll() {
        const speaker = ChatMessage.getSpeaker({ actor: this.actor });
        const damageFormula = this.system?.damage?.dice?.value;

        if (damageFormula) {
            const roll = new Roll(damageFormula);
            await roll.evaluate();
            return roll.toMessage({ speaker, flavor: this.name });
        }

        return ChatMessage.create({
            speaker,
            content: `<h3>${foundry.utils.escapeHTML(this.name)}</h3>${this.system?.description ?? ""}`
        });
    }
}
