import { baseFields, equipmentFields, damageFields } from "./_helpers.js";

const fields = foundry.data.fields;

/**
 * Data schema for `weapon` items. Replaces the template.json `weapon` block.
 * Registered via `CONFIG.Item.dataModels.weapon` in wispers.js — once registered,
 * Foundry uses this schema for weapons and ignores the template.json entry.
 */
export default class WeaponData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            ...baseFields(),
            ...equipmentFields(),
            ...damageFields(),
            weaponType: new fields.SchemaField({
                value: new fields.StringField({ required: true, nullable: false, initial: "melee", choices: ["melee", "ranged"] })
            }),
            range: new fields.SchemaField({
                value: new fields.NumberField({ required: true, nullable: false, initial: 5, min: 0 }),
                units: new fields.StringField({ initial: "feet" })
            }),
            properties: new fields.ArrayField(new fields.StringField())
        };
    }
}
