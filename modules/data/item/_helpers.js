// Shared field groups for Item DataModels.
//
// DataModels have no equivalent of template.json's `"templates"` inheritance,
// so the fields that used to live in the shared `base` / `equipment` / `damage`
// templates are expressed here as functions returning a fresh object of
// `foundry.data.fields.*` instances. Each item DataModel spreads the groups it
// needs into its own `defineSchema()`. The resulting `system` shapes match the
// old template.json exactly, so existing documents and the inventory templates
// keep working.

const fields = foundry.data.fields;

/** Description / source / quantity / weight / price — shared by every item. */
export function baseFields() {
    return {
        description: new fields.HTMLField({ initial: "" }),
        source: new fields.StringField({ initial: "" }),
        quantity: new fields.SchemaField({
            value: new fields.NumberField({ required: true, nullable: false, initial: 1, integer: true, min: 0 })
        }),
        weight: new fields.SchemaField({
            // Base weight of 1 = one encumbrance slot. Slot-based carry capacity
            // sums weight × quantity across carried items (see the character sheet).
            value: new fields.NumberField({ required: true, nullable: false, initial: 1, min: 0 })
        }),
        price: new fields.SchemaField({
            value: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
            currency: new fields.StringField({ initial: "gold", choices: ["iron", "copper", "silver", "gold"] })
        })
    };
}

/**
 * `equipped` flag — shared by weapons, armor, shields. The old `equipmentFields()`
 * group (item-level proficiency + a free `type` string) was retired in the v1
 * combat migration: proficiency now lives on the actor (weapon categories/slugs,
 * armor types) and each type carries its own typed field. See armor-shields.md §6.1.
 */
export function equippedField() {
    return {
        equipped: new fields.SchemaField({
            value: new fields.BooleanField({ initial: false })
        })
    };
}

/**
 * Proficiency-gated property list — shared by weapons, armor, shields. Each entry
 * references a key in a config registry (e.g. WISPERS.weaponProperties) and is
 * active for a wielder only when their effective proficiency >= minProficiency
 * (weapons-combat.md §4). Mechanics are realized by the effects engine.
 */
export function gatedProperties() {
    return new fields.ArrayField(new fields.SchemaField({
        key: new fields.StringField(),
        minProficiency: new fields.NumberField({ initial: 0, integer: true, min: 0, max: 5 })
    }));
}

/** Limited-use counter — shared by consumables and features. */
export function usesFields() {
    return {
        uses: new fields.SchemaField({
            value: new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true, min: 0 }),
            max: new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true, min: 0 })
        })
    };
}
