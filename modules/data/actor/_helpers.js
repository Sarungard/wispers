// Shared field groups for Actor DataModels.
//
// Mirrors modules/data/item/_helpers.js: DataModels have no template.json
// `"templates"` inheritance, so the old shared actor `base` + `skills` blocks
// are expressed here as functions returning fresh `foundry.data.fields.*`.
// Character and NPC each spread the groups they need.
//
// NOTE: per the migration plan, static per-entry metadata (`label`,
// `linkedAttribute`, ability `id`) is kept in stored data for this pass — a 1:1
// match with the pre-migration shapes so the character sheet and roll pipeline
// keep working unchanged. Moving that metadata to CONFIG.WISPERS is a planned
// follow-up.

const fields = foundry.data.fields;

/** Helper: a required, non-nullable integer with optional bounds. */
function intField(initial, { min, max } = {}) {
    const opts = { required: true, nullable: false, initial, integer: true };
    if (min !== undefined) opts.min = min;
    if (max !== undefined) opts.max = max;
    return new fields.NumberField(opts);
}

/** One ability score (open-ended value, so no upper bound). */
function abilityField(id) {
    return new fields.SchemaField({
        id: new fields.StringField({ required: true, blank: false, initial: id }),
        value: intField(2, { min: 0 }),
        start: intField(2, { min: 0 }),
        modifiers: new fields.ArrayField(new fields.ObjectField())
    });
}

/** One proficiency entry (skill / spell school / saving throw), 0–5 ladder. */
function proficiencyEntry(label, linkedAttribute, { withModifiers = false } = {}) {
    const schema = {
        proficiency: new fields.SchemaField({
            value: intField(0, { min: 0, max: 5 }),
            max: intField(5)
        }),
        linkedAttribute: new fields.StringField({ initial: linkedAttribute }),
        label: new fields.StringField({ initial: label })
    };
    if (withModifiers) schema.modifiers = new fields.ArrayField(new fields.ObjectField());
    return new fields.SchemaField(schema);
}

/** level / abilities / wounds / initiative / biography — the old `base` block. */
export function baseActorFields() {
    return {
        level: new fields.SchemaField({
            value: intField(1, { min: 1 }),
            max: intField(20)
        }),
        abilities: new fields.SchemaField({
            str: abilityField("Str"),
            agi: abilityField("Agi"),
            con: abilityField("Con"),
            kno: abilityField("Kno"),
            pre: abilityField("Pre"),
            spi: abilityField("Spi")
        }),
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
            skills: new fields.SchemaField({
                combat: proficiencyEntry("Combat", "str"),
                athletics: proficiencyEntry("Athletics", "str"),
                stealth: proficiencyEntry("Stealth", "agi"),
                academics: proficiencyEntry("Academics", "kno"),
                persuasion: proficiencyEntry("Persuasion", "pre"),
                willpower: proficiencyEntry("Willpower", "spi")
            }),
            spellSchools: new fields.SchemaField({
                arcana: proficiencyEntry("Arcana", "pre"),
                elementalism: proficiencyEntry("Elementalism", "pre"),
                entropy: proficiencyEntry("Entropy", "pre"),
                sacratropy: proficiencyEntry("Sacratrope", "pre"),
                sinistrope: proficiencyEntry("Sinistrope", "pre"),
                primalism: proficiencyEntry("Primalism", "pre"),
                scriptomancy: proficiencyEntry("Scriptomancy", "kno"),
                "rune-scribe": proficiencyEntry("Rune-Scribe", "kno")
            }),
            savingthrows: new fields.SchemaField({
                reflex: proficiencyEntry("Reflex", "agi", { withModifiers: true }),
                toughness: proficiencyEntry("Toughness", "con", { withModifiers: true }),
                resolve: proficiencyEntry("Resolve", "spi", { withModifiers: true })
            })
        })
    };
}
