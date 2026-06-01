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

/** Proficiency / equipped / type — shared by weapons, armor, shields. */
export function equipmentFields() {
    return {
        proficiency: new fields.SchemaField({
            value: new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true, min: 0, max: 5 }),
            max: new fields.NumberField({ required: true, nullable: false, initial: 5, integer: true })
        }),
        equipped: new fields.SchemaField({
            value: new fields.BooleanField({ initial: false })
        }),
        type: new fields.StringField({ initial: "" })
    };
}

/** Damage dice / circumstance dice / damage type. */
export function damageFields() {
    return {
        dice: new fields.SchemaField({ value: new fields.StringField({ initial: "1d6" }) }),
        circumstanceDice: new fields.SchemaField({ value: new fields.StringField({ initial: "1d6" }) }),
        damageType: new fields.SchemaField({ value: new fields.StringField({ initial: "physical" }) })
    };
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
