const api = foundry.applications.api;
const sheets = foundry.applications.sheets;

export default class wispersCharacterSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {

    sheetContext = {};

    static DEFAULT_OPTIONS = {

        tag: "form",
        classes: ["wispers", "sheet", "character"],
        actions: {
            
        },
        form: {
            submitOnChange: true,
            closeOnSubmit: false
        },
        position: {
            width: 650
        }
    }

    static PARTS = {

        header: { template: "systems/wispers/templates/sheets/character/header.hbs" },
        body: { template: "systems/wispers/templates/sheets/character/body.hbs" },
        // footer: { template: "systems/wispers/templates/sheets/character/footer.hbs" }
    }

    get title() {
        
        return this.actor.name;
    }
            
    /** @override */
    _configureRenderOptions(options) {

        if (this.document.limited) options.parts = ["header"]
        else options.parts = ["header", "body"];

        super._configureRenderOptions(options);
    }
    
    /** @override */
    async _prepareContext(options) {

        const baseData = await super._prepareContext();
        const actor = baseData.document;
        const items = Array.from(actor.items);

        const inventory = {
            weapons: items.filter(i => i.type === "weapon"),
            armor: items.filter(i => i.type === "armor"),
            shields: items.filter(i => i.type === "shield"),
            consumables: items.filter(i => i.type === "consumable"),
            loot: items.filter(i => i.type === "loot")
        };

        const spellList = items.filter(i => i.type === "spell");
        const spells = {};
        for (let lvl = 1; lvl <= 5; lvl++) {
            spells[lvl] = spellList.filter(s => (s.system?.level?.value ?? 1) === lvl);
        }

        const features = [];

        const allEffects = Array.from(actor.effects);
        const effects = [
            { label: "CONSTANTS.Effect.Temporary", type: "temporary", effects: allEffects.filter(e => !e.disabled && e.duration?.seconds) },
            { label: "CONSTANTS.Effect.Passive", type: "passive", effects: allEffects.filter(e => !e.disabled && !e.duration?.seconds) },
            { label: "CONSTANTS.Effect.Inactive", type: "inactive", effects: allEffects.filter(e => e.disabled) }
        ];

        const enrich = foundry.applications.ux.TextEditor?.implementation?.enrichHTML
            ?? globalThis.TextEditor?.enrichHTML
            ?? (s => s);
        const biographyHTML = await enrich(actor.system?.details?.biography ?? "", {
            secrets: actor.isOwner,
            relativeTo: actor
        });

        const context = {
            owner: actor.isOwner,
            editable: baseData.editable,
            actor,
            system: actor.system,
            items: actor.items,
            config: CONFIG.WISPERS,
            isGM: baseData.user.isGM,
            inventory,
            spells,
            features,
            effects,
            biographyHTML
        };

        this.sheetContext = context;
        return context;
    }

    /** @override */
    _onRender(context, options) {
        const tabs = new foundry.applications.ux.Tabs({navSelector: ".tabs", contentSelector: ".sheet-content", initial: "character"});
        tabs.bind(this.element);
    }


}