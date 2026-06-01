import { baseFields, equipmentFields } from "./_helpers.js";

const fields = foundry.data.fields;

/** Data schema for `shield` items. Replaces the template.json `shield` block. */
export default class ShieldData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            ...baseFields(),
            ...equipmentFields(),
            armorValue: new fields.SchemaField({
                value: new fields.NumberField({ required: true, nullable: false, initial: 2, integer: true, min: 0 })
            }),
            properties: new fields.ArrayField(new fields.StringField())
        };
    }
}
