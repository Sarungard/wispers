import { baseActorFields, skillsFields } from "./_helpers.js";

const fields = foundry.data.fields;

function coinField() {
    return new fields.SchemaField({
        value: new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true, min: 0 })
    });
}

/**
 * Data schema for `Character` actors. Replaces the template.json
 * `Actor.Character` block (base + skills + character-specific fields).
 */
export default class CharacterData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            ...baseActorFields(),
            ...skillsFields(),
            currency: new fields.SchemaField({
                iron: coinField(),
                copper: coinField(),
                silver: coinField(),
                gold: coinField()
            }),
            // Placeholder numeric reference (was `race: 0` in template.json).
            race: new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true }),
            class: new fields.SchemaField({
                name: new fields.StringField({ initial: "" }),
                description: new fields.HTMLField({ initial: "" })
            }),
            background: new fields.SchemaField({
                socialBackground: new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true }),
                culturalBackground: new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true })
            }),
            details: new fields.SchemaField({
                age: new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true, min: 0 }),
                height: new fields.StringField({ initial: "" }),
                weight: new fields.StringField({ initial: "" }),
                biography: new fields.HTMLField({ initial: "" }),
                notes: new fields.HTMLField({ initial: "" })
            })
        };
    }
}
