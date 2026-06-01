import { baseFields } from "./_helpers.js";

/**
 * Data schema for `loot` items. Like `consumable`, this type was declared but
 * undefined in template.json. Loot is plain valuables — base inventory fields
 * only, no equipment or special behavior.
 */
export default class LootData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            ...baseFields()
        };
    }
}
