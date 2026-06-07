import { baseFields, equippedField, gatedProperties } from "./_helpers.js";
import { WISPERS } from "../../config.js";

const fields = foundry.data.fields;

/**
 * Data schema for `weapon` items (v1 combat — weapons-combat.md §3.4).
 *
 * Weapons no longer carry item-level proficiency or a damage block. An attack
 * rolls weapon die + the wielder's resolved proficiency die (specific slug, else
 * category — §2.1) into a *threat value*; the per-severity `attack.wound` triple
 * modifies the wound-table roll once a severity is determined.
 */
export default class WeaponData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            ...baseFields(),
            ...equippedField(),

            // Weapon category — fixed key into WISPERS.weaponCategories, mirrors
            // the actor's category proficiency group.
            category: new fields.SchemaField({
                value: new fields.StringField({
                    required: true, nullable: false,
                    initial: "swords", choices: Object.keys(WISPERS.weaponCategories)
                })
            }),
            // Stable id for specific-weapon proficiency (every scimitar shares
            // "scimitar"). Empty = category-only weapon.
            slug: new fields.SchemaField({ value: new fields.StringField({ initial: "" }) }),

            attack: new fields.SchemaField({
                weaponDie: new fields.SchemaField({ value: new fields.StringField({ initial: "1d6" }) }),
                targetSave: new fields.SchemaField({
                    value: new fields.StringField({
                        required: true, nullable: false,
                        initial: "reflex", choices: Object.keys(WISPERS.savingthrows)
                    })
                }),
                apCost: new fields.SchemaField({
                    value: new fields.NumberField({ required: true, nullable: false, initial: 1, integer: true, min: 0 })
                }),
                // Wound-table roll modifier per severity, e.g. dagger = 1 / 1 / 4.
                wound: new fields.SchemaField({
                    light: new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true }),
                    normal: new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true }),
                    heavy: new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true })
                })
            }),

            range: new fields.SchemaField({
                value: new fields.NumberField({ required: true, nullable: false, initial: 5, min: 0 }),
                units: new fields.StringField({ initial: "feet" })
            }),

            // Proficiency-gated properties (§4); each references WISPERS.weaponProperties.
            properties: gatedProperties()
        };
    }
}
