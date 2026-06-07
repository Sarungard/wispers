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

/**
 * One ability score. `value` is the editable base the sheet input binds to;
 * `bonus` is the effect accumulator ActiveEffects ADD into (effects MUST NOT
 * target `value` — see effects-conditions.md §1.1). `prepareDerivedData` folds
 * `effective = value + bonus`.
 */
function abilityField() {
    return new fields.SchemaField({
        value: intField(2, { min: 0 }),
        start: intField(2, { min: 0 }),
        bonus: intField(0)
    });
}

/**
 * One proficiency entry (skill / spell school / saving throw / weapon category /
 * armor type), 0–5 ladder. `value` is editable base; `bonus` is the effect
 * accumulator (folded to `effective`, clamped 0–5, in prepareDerivedData).
 */
function proficiencyEntry() {
    return {
        proficiency: new fields.SchemaField({
            value: intField(0, { min: 0, max: 5 }),
            max: intField(5),
            bonus: intField(0)
        })
    };
}

/** Build a SchemaField of proficiency entries, one per key in a config map. */
function proficiencyGroup(configMap) {
    const out = {};
    for (const key of Object.keys(configMap ?? {})) {
        out[key] = new fields.SchemaField(proficiencyEntry());
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
        // No HP counter. `effectiveThreat` vs these thresholds picks a wound
        // severity; the wound-table resolver produces the actual wound, embedded
        // as a `wound` Item (wound-tables.md §5.1). `modifier` is the wound-roll
        // modifier accumulated by effects.
        wounds: new fields.SchemaField({
            modifier: new fields.SchemaField({ value: intField(0) }),
            lightThreshold: new fields.SchemaField({ value: intField(5, { min: 0 }) }),
            heavyThreshold: new fields.SchemaField({ value: intField(10, { min: 0 }) })
        }),
        initiative: new fields.SchemaField({
            total: intField(0),
            remaining: intField(0)
        }),
        biography: new fields.HTMLField({ initial: "" })
    };
}

/**
 * The full `skills` block: social/utility skills, spell schools, saving throws,
 * plus the v1 combat proficiency tracks — weapon categories + open per-slug
 * specific-weapon entries (weapons-combat.md §3.2) and armor-type proficiencies
 * (armor-shields.md §4). All ride the same 0–5 proficiency ladder.
 */
export function skillsFields() {
    return {
        skills: new fields.SchemaField({
            skills: proficiencyGroup(WISPERS.skills),
            spellSchools: proficiencyGroup(WISPERS.spellSchools),
            savingthrows: proficiencyGroup(WISPERS.savingthrows),
            weapons: new fields.SchemaField({
                // Fixed: one entry per WISPERS.weaponCategories key.
                categories: proficiencyGroup(WISPERS.weaponCategories),
                // Open: slug -> { proficiency: { value, max, bonus } }, authored
                // as the player learns specific weapons. Specific overrides
                // category at attack time (weapons-combat.md §2.1).
                specific: new fields.TypedObjectField(
                    new fields.SchemaField(proficiencyEntry())
                )
            }),
            // Armor proficiency by weight class (light/medium/heavy).
            armor: proficiencyGroup(WISPERS.armorTypes)
        })
    };
}
