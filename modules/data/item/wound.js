const fields = foundry.data.fields;

/**
 * Data schema for `wound` items (wound-tables.md §4). Wounds are the result rows
 * of the wound tables: a description, which severity table they belong to, and a
 * recovery note. Their mechanical payload lives in the document's ActiveEffects
 * (transfer:true), not in this schema — so embedding the wound on an actor
 * auto-applies the penalty. Wounds are not physical inventory (no baseFields()).
 */
export default class WoundData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            description: new fields.HTMLField({ initial: "" }),
            severity: new fields.SchemaField({
                value: new fields.StringField({
                    required: true, nullable: false,
                    initial: "light", choices: ["light", "normal", "heavy"]
                })
            }),
            // How this wound clears. Phase 1: descriptive (rest / treatment / time).
            recovery: new fields.SchemaField({ value: new fields.StringField({ initial: "" }) })
        };
    }
}
