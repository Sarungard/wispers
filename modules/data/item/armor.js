import { baseFields, equipmentFields } from "./_helpers.js";

const fields = foundry.data.fields;

/** Data schema for `armor` items. Replaces the template.json `armor` block. */
export default class ArmorData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            ...baseFields(),
            ...equipmentFields(),
            armorType: new fields.SchemaField({
                value: new fields.StringField({ required: true, nullable: false, initial: "light", choices: ["light", "medium", "heavy"] })
            }),
            armorValue: new fields.SchemaField({
                value: new fields.NumberField({ required: true, nullable: false, initial: 10, integer: true, min: 0 })
            }),
            properties: new fields.ArrayField(new fields.StringField())
        };
    }
}
