// Shared field groups for Actor DataModels.
//
// Mirrors modules/data/item/_helpers.js: DataModels have no template.json
// `"templates"` inheritance, so the old shared actor `base` + `skills` blocks
// are expressed here as functions returning fresh `foundry.data.fields.*`.
//
// Stored actor data holds ONLY the user's choices. The set of abilities / skills
// / spell schools / saving throws — and their static metadata (label,
// linkedAttribute) — lives in `CONFIG.WISPERS` (modules/config.js). The schema
// keys below are derived from those maps, so config is the single source of
// truth: add a skill there and both the schema and the sheet pick it up.

import { WISPERS } from "../../config.js";

const fields = foundry.data.fields;

/** Helper: a required, non-nullable integer with optional bounds. */
function intField(initial, { min, max } = {}) {
    const opts = { required: true, nullable: false, initial, integer: true };
    if (min !== undefined) opts.min = min;
    if (max !== undefined) opts.max = max;
    return new fields.NumberField(opts);
}

/** One ability score (open-ended value, so no upper bound). */
function abilityField() {
    return new fields.SchemaField({
        value: intField(2, { min: 0 }),
        start: intField(2, { min: 0 }),
        modifiers: new fields.ArrayField(new fields.ObjectField())
    });
}

/** One proficiency entry (skill / spell school / saving throw), 0–5 ladder. */
function proficiencyEntry({ withModifiers = false } = {}) {
    const schema = {
        proficiency: new fields.SchemaField({
            value: intField(0, { min: 0, max: 5 }),
            max: intField(5)
        })
    };
    if (withModifiers) schema.modifiers = new fields.ArrayField(new fields.ObjectField());
    return schema;
}

/** Build a SchemaField of proficiency entries, one per key in a config map. */
function proficiencyGroup(configMap, opts) {
    const out = {};
    for (const key of Object.keys(configMap ?? {})) {
        out[key] = new fields.SchemaField(proficiencyEntry(opts));
    }
    return new fields.SchemaField(out);
}

/** level / abilities / wounds / initiative / biography — the old `base` block. */
export function baseActorFields() {
    const abilities = {};
    for (const key of Object.keys(WISPERS.abilities ?? {})) abilities[key] = abilityField();

    return {
        level: new fields.SchemaField({
            value: intField(1, { min: 1 }),
            max: intField(20)
        }),
        abilities: new fields.SchemaField(abilities),
        wounds: new fields.SchemaField({
            modifier: new fields.SchemaField({ value: intField(0) }),
            lightThreshold: new fields.SchemaField({ value: intField(5, { min: 0 }) }),
            heavyThreshold: new fields.SchemaField({ value: intField(10, { min: 0 }) }),
            consequences: new fields.ArrayField(new fields.ObjectField())
        }),
        initiative: new fields.SchemaField({
            total: intField(0),
            remaining: intField(0)
        }),
        biography: new fields.HTMLField({ initial: "" })
    };
}

/** The full `skills` block: combat/social skills, spell schools, saving throws. */
export function skillsFields() {
    return {
        skills: new fields.SchemaField({
            skills: proficiencyGroup(WISPERS.skills),
            spellSchools: proficiencyGroup(WISPERS.spellSchools),
            savingthrows: proficiencyGroup(WISPERS.savingthrows, { withModifiers: true })
        })
    };
}
