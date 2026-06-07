import { baseFields } from "./_helpers.js";
import { WISPERS } from "../../config.js";

const fields = foundry.data.fields;

/**
 * Data schema for `spell` items (v1 casting — spellcasting.md §6.2).
 *
 * Casting is gather → degree → resolve: a school check generates ephemeral
 * "gathered spellpower" (no stored pool); comparing it to the four authored
 * `degrees` thresholds picks a degree which sets the final spellpower (threat).
 * `castingTime.value` IS the AP cost (open-ended). Damaging spells (`resolution.
 * dealsWound`) reuse the weapons react/wound loop; effects are bespoke.
 */
export default class SpellData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            ...baseFields(),

            // Real school key so it lines up with the caster's school proficiency.
            school: new fields.SchemaField({
                value: new fields.StringField({
                    required: true, nullable: false,
                    initial: "arcana", choices: Object.keys(WISPERS.spellSchools)
                })
            }),

            // Organisational tier (spellbook buckets 1–5).
            level: new fields.SchemaField({
                value: new fields.NumberField({ required: true, nullable: false, initial: 1, integer: true, min: 1, max: 5 }),
                max: new fields.NumberField({ required: true, nullable: false, initial: 5, integer: true })
            }),

            // Casting time IS the AP cost — open-ended.
            castingTime: new fields.SchemaField({
                value: new fields.NumberField({ required: true, nullable: false, initial: 1, integer: true, min: 0 })
            }),

            range: new fields.SchemaField({ value: new fields.StringField({ initial: "touch" }) }),
            duration: new fields.SchemaField({ value: new fields.StringField({ initial: "instantaneous" }) }),
            components: new fields.SchemaField({
                verbal: new fields.BooleanField({ initial: false }),
                somatic: new fields.BooleanField({ initial: false }),
                material: new fields.BooleanField({ initial: false }),
                materialComponents: new fields.StringField({ initial: "" })
            }),

            // Per-spell degree thresholds: minimum gathered spellpower to reach
            // each degree. `success` is the static Spellpower requirement. Author
            // non-decreasing (criticalFailure ≤ failure ≤ success ≤ criticalSuccess).
            degrees: new fields.SchemaField({
                criticalFailure: new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true, min: 0 }),
                failure: new fields.NumberField({ required: true, nullable: false, initial: 1, integer: true, min: 0 }),
                success: new fields.NumberField({ required: true, nullable: false, initial: 10, integer: true, min: 0 }),
                criticalSuccess: new fields.NumberField({ required: true, nullable: false, initial: 18, integer: true, min: 0 })
            }),

            // Critical-success amplification hint (§3.2).
            scaling: new fields.SchemaField({
                spellpowerBonus: new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true }),
                spellpowerMult: new fields.NumberField({ required: true, nullable: false, initial: 1, min: 1 }),
                rider: new fields.StringField({ initial: "" })
            }),

            // Bespoke resolution (§4): optional wound block + optional effects hook.
            resolution: new fields.SchemaField({
                dealsWound: new fields.BooleanField({ initial: true }),
                targetSave: new fields.StringField({
                    required: true, nullable: false,
                    initial: "reflex", choices: Object.keys(WISPERS.savingthrows)
                }),
                // Optional per-spell wound modifier (parallels weapons' 1/1/4).
                wound: new fields.SchemaField({
                    light: new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true }),
                    normal: new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true }),
                    heavy: new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true })
                }),
                // §4.2 — permissive for now; `value` carries an amount/dice/condition key.
                effects: new fields.ArrayField(new fields.SchemaField({
                    kind: new fields.StringField(),
                    value: new fields.StringField({ initial: "" }),
                    duration: new fields.StringField({ initial: "" }),
                    description: new fields.StringField({ initial: "" })
                }))
            })
        };
    }
}
