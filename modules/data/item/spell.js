import { baseFields } from "./_helpers.js";

const fields = foundry.data.fields;

/**
 * Data schema for `spell` items. Replaces the template.json `spell` block.
 * Spell damage has no circumstance die, so it's defined inline rather than via
 * the shared `damageFields()` helper.
 */
export default class SpellData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            ...baseFields(),
            school: new fields.SchemaField({ value: new fields.StringField({ initial: "" }) }),
            level: new fields.SchemaField({
                value: new fields.NumberField({ required: true, nullable: false, initial: 1, integer: true, min: 1, max: 5 }),
                max: new fields.NumberField({ required: true, nullable: false, initial: 5, integer: true })
            }),
            castingTime: new fields.SchemaField({
                value: new fields.NumberField({ required: true, nullable: false, initial: 1, integer: true, min: 1, max: 6 }),
                min: new fields.NumberField({ initial: 1, integer: true }),
                max: new fields.NumberField({ initial: 6, integer: true })
            }),
            range: new fields.SchemaField({ value: new fields.StringField({ initial: "touch" }) }),
            duration: new fields.SchemaField({ value: new fields.StringField({ initial: "instantaneous" }) }),
            components: new fields.SchemaField({
                verbal: new fields.BooleanField({ initial: false }),
                somatic: new fields.BooleanField({ initial: false }),
                material: new fields.BooleanField({ initial: false }),
                materialComponents: new fields.StringField({ initial: "" })
            }),
            damage: new fields.SchemaField({
                dice: new fields.SchemaField({ value: new fields.StringField({ initial: "1d6" }) }),
                damageType: new fields.SchemaField({ value: new fields.StringField({ initial: "fire" }) })
            })
        };
    }
}
