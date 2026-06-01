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
        feature: "systems/wispers/templates/sheets/item/types/feature.hbs"
        // loot has no type-specific fields — it renders the shared fields only.
    };

    get title() {
        return this.item.name;
    }

    /** @override */
    async _prepareContext(options) {
        const baseData = await super._prepareContext(options);
        const item = this.item;
        return {
            ...baseData,
            item,
            system: item.system,
            config: CONFIG.WISPERS,
            editable: this.isEditable,
            typePartial: WispersItemSheet.TYPE_PARTS[item.type] ?? null,
            // Features aren't physical inventory, so they have no quantity/weight/
            // price/source. Gate the shared inventory fieldset on their presence.
            hasInventoryFields: "quantity" in (item.system ?? {})
        };
    }

    /** @override */
    _onFirstRender(context, options) {
        super._onFirstRender?.(context, options);
        // Honour the sheet-wide "+2 / -5" relative-number convention.
        installRelativeNumberInputs(this.element, this.item);
    }
}
