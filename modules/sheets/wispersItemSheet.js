import { installRelativeNumberInputs } from "../utils.js";

const api = foundry.applications.api;
const sheets = foundry.applications.sheets;

export default class WispersItemSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {

    static DEFAULT_OPTIONS = {
        tag: "form",
        classes: ["wispers", "sheet", "item"],
        position: { width: 500, height: "auto" },
        window: { resizable: true },
        form: {
            submitOnChange: true,
            closeOnSubmit: false
        }
    };

    static PARTS = {
        header: { template: "systems/wispers/templates/sheets/item/header.hbs" },
        body: { template: "systems/wispers/templates/sheets/item/body.hbs" }
    };

    // Per-type body partial. Add an entry here (and create the matching template)
    // as each item type gets its DataModel + sheet fields. Types without an entry
    // fall back to the shared fields only.
    static TYPE_PARTS = {
        weapon: "systems/wispers/templates/sheets/item/types/weapon.hbs",
        armor: "systems/wispers/templates/sheets/item/types/armor.hbs",
        shield: "systems/wispers/templates/sheets/item/types/shield.hbs",
        spell: "systems/wispers/templates/sheets/item/types/spell.hbs",
        consumable: "systems/wispers/templates/sheets/item/types/consumable.hbs",
        feature: "systems/wispers/templates/sheets/item/types/feature.hbs",
        wound: "systems/wispers/templates/sheets/item/types/wound.hbs"
        // loot has no type-specific fields — it renders the shared fields only.
    };

    get title() {
        return this.item.name;
    }

    /** @override */
    async _prepareContext(options) {
        const baseData = await super._prepareContext(options);
        const item = this.item;
        const W = CONFIG.WISPERS;
        // The WISPERS.* metadata maps are key -> { label, ... } objects; flatten to
        // key -> localizationKey so {{selectOptions ... localize=true}} can render
        // them.
        const flatLabels = map => Object.fromEntries(
            Object.entries(map ?? {}).map(([k, v]) => [k, v.label])
        );
        const sys = item.system ?? {};
        return {
            ...baseData,
            item,
            system: sys,
            config: W,
            saveChoices: flatLabels(W.savingthrows),
            schoolChoices: flatLabels(W.spellSchools),
            weaponCategoryChoices: flatLabels(W.weaponCategories),
            armorTypeChoices: flatLabels(W.armorTypes),
            targetChoices: { self: "CONSTANTS.Features.TargetSelf", target: "CONSTANTS.Features.TargetOther" },
            woundSeverityChoices: { light: "CONSTANTS.Wounds.Light", normal: "CONSTANTS.Wounds.Normal", heavy: "CONSTANTS.Wounds.Heavy" },
            // SetField -> array for the multi-select `selected=` argument.
            coversArray: sys.covers ? Array.from(sys.covers) : [],
            editable: this.isEditable,
            typePartial: WispersItemSheet.TYPE_PARTS[item.type] ?? null,
            // Features aren't physical inventory, so they have no quantity/weight/
            // price/source. Gate the shared inventory fieldset on their presence.
            hasInventoryFields: "quantity" in sys
        };
    }

    /** @override */
    _onFirstRender(context, options) {
        super._onFirstRender?.(context, options);
        // Honour the sheet-wide "+2 / -5" relative-number convention.
        installRelativeNumberInputs(this.element, this.item);
    }
}
