import { installRelativeNumberInputs } from "../utils.js";

const api = foundry.applications.api;
const sheets = foundry.applications.sheets;

export default class WispersItemSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {

    // Tracks the active body tab across the submitOnChange re-renders (mirrors the
    // character sheet) so editing a field doesn't snap the user back to Details.
    _activeTab = null;
    // Re-render when this item's own ActiveEffects change. Embedded-AE CRUD on the
    // Effects tab doesn't always trip ItemSheetV2's automatic re-render, so subscribe
    // explicitly (same workaround the character sheet uses for effect displays).
    _onEffectChange = null;

    static DEFAULT_OPTIONS = {
        tag: "form",
        classes: ["wispers", "sheet", "item"],
        position: { width: 500, height: "auto" },
        window: { resizable: true },
        actions: {
            createEffect: WispersItemSheet._onCreateEffect,
            editEffect: WispersItemSheet._onEditEffect,
            deleteEffect: WispersItemSheet._onDeleteEffect,
            toggleEffect: WispersItemSheet._onToggleEffect,
            addProperty: WispersItemSheet._onAddProperty,
            removeProperty: WispersItemSheet._onRemoveProperty
        },
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
            // Choices for the gated-properties editor (weapon/armor/shield).
            weaponPropertyChoices: flatLabels(W.weaponProperties),
            targetChoices: { self: "CONSTANTS.Features.TargetSelf", target: "CONSTANTS.Features.TargetOther" },
            woundSeverityChoices: { light: "CONSTANTS.Wounds.Light", normal: "CONSTANTS.Wounds.Normal", heavy: "CONSTANTS.Wounds.Heavy" },
            // SetField -> array for the multi-select `selected=` argument.
            coversArray: sys.covers ? Array.from(sys.covers) : [],
            // The item's ActiveEffects, for the Effects tab list.
            effects: Array.from(item.effects),
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

        // Re-render when this item's own ActiveEffects change (see field note above).
        this._onEffectChange = (effect) => {
            if (effect.parent?.id === this.item.id) this.render();
        };
        Hooks.on("createActiveEffect", this._onEffectChange);
        Hooks.on("updateActiveEffect", this._onEffectChange);
        Hooks.on("deleteActiveEffect", this._onEffectChange);
    }

    /** @override */
    _onRender(context, options) {
        super._onRender?.(context, options);
        // Bind the Details/Effects tab group, preserving the active tab across the
        // submitOnChange re-renders (mirrors the character sheet).
        const tabs = new foundry.applications.ux.Tabs({
            navSelector: ".tabs", contentSelector: ".sheet-content", initial: this._activeTab ?? "details"
        });
        tabs.bind(this.element);
        this.element.querySelectorAll(".tabs [data-tab]").forEach(el => {
            el.addEventListener("click", () => { this._activeTab = el.dataset.tab; });
        });
    }

    /** @override */
    close(options) {
        if (this._onEffectChange) {
            Hooks.off("createActiveEffect", this._onEffectChange);
            Hooks.off("updateActiveEffect", this._onEffectChange);
            Hooks.off("deleteActiveEffect", this._onEffectChange);
            this._onEffectChange = null;
        }
        return super.close(options);
    }

    /* -------------------------------------------- */
    /*  ActiveEffect CRUD (Effects tab)             */
    /* -------------------------------------------- */

    /** Create a new transfer ActiveEffect on this item and open its config. */
    static async _onCreateEffect(event, target) {
        event.preventDefault();
        const created = await this.item.createEmbeddedDocuments("ActiveEffect", [{
            name: game.i18n.localize("CONSTANTS.Effect.New"),
            img: "icons/svg/aura.svg",
            origin: this.item.uuid,
            transfer: true,
            disabled: false
        }]);
        created[0]?.sheet.render(true);
    }

    /** Open the clicked effect's config sheet. */
    static _onEditEffect(event, target) {
        event.preventDefault();
        const id = target.closest("[data-effect-id]")?.dataset.effectId;
        this.item.effects.get(id)?.sheet.render(true);
    }

    /** Delete the clicked effect. */
    static async _onDeleteEffect(event, target) {
        event.preventDefault();
        const id = target.closest("[data-effect-id]")?.dataset.effectId;
        if (id) await this.item.deleteEmbeddedDocuments("ActiveEffect", [id]);
    }

    /** Enable/disable the clicked effect. */
    static async _onToggleEffect(event, target) {
        event.preventDefault();
        const id = target.closest("[data-effect-id]")?.dataset.effectId;
        const effect = this.item.effects.get(id);
        if (effect) await effect.update({ disabled: !effect.disabled });
    }

    /* -------------------------------------------- */
    /*  Gated properties (weapon/armor/shield)      */
    /* -------------------------------------------- */

    /** Append a new gated-property row, defaulting to the first registry key. */
    static async _onAddProperty(event, target) {
        event.preventDefault();
        const list = foundry.utils.deepClone(this.item.system.properties ?? []);
        const firstKey = Object.keys(CONFIG.WISPERS.weaponProperties ?? {})[0] ?? "";
        list.push({ key: firstKey, minProficiency: 0 });
        await this.item.update({ "system.properties": list });
    }

    /** Remove the gated-property row at the clicked index. */
    static async _onRemoveProperty(event, target) {
        event.preventDefault();
        const index = Number(target.closest("[data-index]")?.dataset.index);
        if (Number.isNaN(index)) return;
        const list = foundry.utils.deepClone(this.item.system.properties ?? []);
        list.splice(index, 1);
        await this.item.update({ "system.properties": list });
    }
}
