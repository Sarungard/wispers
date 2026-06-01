const fields = foundry.data.fields;

/**
 * Data schema for `feature` items. Replaces the template.json `feature` block.
 * Features are not physical inventory (no quantity/weight/price) — just a
 * description, an activation type, and a uses counter. `featureType` choices
 * match the categories rendered on the character sheet's Features tab.
 */
export default class FeatureData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            description: new fields.HTMLField({ initial: "" }),
            featureType: new fields.SchemaField({
                value: new fields.StringField({ required: true, nullable: false, initial: "active", choices: ["active", "passive", "reaction"] })
            }),
            uses: new fields.SchemaField({
                value: new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true, min: 0 }),
                max: new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true, min: 0 })
            })
        };
    }
}
