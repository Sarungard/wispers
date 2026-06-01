import { baseFields, usesFields } from "./_helpers.js";

/**
 * Data schema for `consumable` items. The type was previously declared in
 * template.json's `types` array but had no field definition — this closes that
 * gap. Base inventory fields plus a uses counter.
 */
export default class ConsumableData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            ...baseFields(),
            ...usesFields()
        };
    }
}
