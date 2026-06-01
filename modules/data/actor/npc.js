import { baseActorFields, skillsFields } from "./_helpers.js";

const fields = foundry.data.fields;

/**
 * Data schema for `NPC` actors. Replaces the template.json `Actor.NPC` block
 * (base + skills + NPC-specific details).
 */
export default class NPCData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            ...baseActorFields(),
            ...skillsFields(),
            details: new fields.SchemaField({
                description: new fields.HTMLField({ initial: "" }),
                special: new fields.HTMLField({ initial: "" })
            })
        };
    }
}
