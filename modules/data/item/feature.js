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
            }),
            // Activatable AP-cost action (effects-conditions.md §6). `passive`
            // features ignore this (they carry transfer ActiveEffects instead);
            // `active`/`reaction` features spend `apCost` and may apply an effect.
            activation: new fields.SchemaField({
                apCost: new fields.NumberField({ required: true, nullable: false, initial: 1, integer: true, min: 0 }),
                // Condition key / compendium effect uuid to apply when used.
                appliesEffect: new fields.StringField({ initial: "" }),
                target: new fields.StringField({ initial: "self", choices: ["self", "target"] }),
                description: new fields.HTMLField({ initial: "" })
            })
        };
    }
}
