import { baseFields, equippedField, gatedProperties } from "./_helpers.js";
import { WISPERS } from "../../config.js";

const fields = foundry.data.fields;

/**
 * Data schema for `armor` items (v1 combat — armor-shields.md §6.2).
 *
 * Armor is passive: while equipped it raises the defender's wound thresholds by
 * `armorValue`, but only against attacks targeting a save it `covers`. The boost
 * is computed per-hit at resolution time, not stored on the actor. Proficiency
 * lives on the actor (system.skills.armor[armorType]); under-proficiency imposes
 * penalties via the effects engine (authored as ActiveEffects on the item).
 */
export default class ArmorData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            ...baseFields(),
            ...equippedField(),
            armorType: new fields.SchemaField({
                value: new fields.StringField({
                    required: true, nullable: false,
                    initial: "light", choices: Object.keys(WISPERS.armorTypes)
                })
            }),
            // RETUNE (armor-shields.md §8): the old default of 10 was far too high
            // for a threshold-raise vs base thresholds 5/10. Expect small values (~1–5).
            armorValue: new fields.SchemaField({
                value: new fields.NumberField({ required: true, nullable: false, initial: 2, integer: true, min: 0 })
            }),
            // Saves this armor protects (subset of savingthrows); physical by default.
            covers: new fields.SetField(
                new fields.StringField({ choices: Object.keys(WISPERS.savingthrows) }),
                { initial: ["reflex", "toughness"] }
            ),
            // Minimum armor-type proficiency to wear cleanly; below it, the armor's
            // penalty effects apply (suppressed otherwise).
            requiredProficiency: new fields.SchemaField({
                value: new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true, min: 0, max: 5 })
            }),
            properties: gatedProperties()
        };
    }
}
