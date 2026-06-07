import { baseFields, equippedField, gatedProperties } from "./_helpers.js";
import { WISPERS } from "../../config.js";

const fields = foundry.data.fields;

/**
 * Data schema for `shield` items (v1 combat — armor-shields.md §6.3).
 *
 * Shields contribute nothing passively. The defender may spend `block.apCost` AP
 * to block as a reaction to a specific attack, adding `armorValue` to the
 * effective thresholds for that hit only (if it covers the attack's targetSave).
 * Implemented as an activatable reaction (effects-conditions.md §6). No shield
 * proficiency in v1.
 */
export default class ShieldData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            ...baseFields(),
            ...equippedField(),
            armorValue: new fields.SchemaField({
                value: new fields.NumberField({ required: true, nullable: false, initial: 2, integer: true, min: 0 })
            }),
            covers: new fields.SetField(
                new fields.StringField({ choices: Object.keys(WISPERS.savingthrows) }),
                { initial: ["reflex", "toughness"] }
            ),
            // The activatable block reaction (§3).
            block: new fields.SchemaField({
                apCost: new fields.NumberField({ required: true, nullable: false, initial: 1, integer: true, min: 0 })
            }),
            properties: gatedProperties()
        };
    }
}
