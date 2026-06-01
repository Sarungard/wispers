import { installRelativeNumberInputs } from "../utils.js";

const api = foundry.applications.api;
const sheets = foundry.applications.sheets;

export default class WispersCharacterSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {

    sheetContext = {};
    _showAllSkills = false;
    _showAllSchools = false;
    _activeTab = null;
    _onItemChange = null;

    static DEFAULT_OPTIONS = {

        tag: "form",
        classes: ["wispers", "sheet", "character"],
        actions: {
            toggleAllSkills: WispersCharacterSheet._onToggleAllSkills,
            toggleAllSchools: WispersCharacterSheet._onToggleAllSchools,
            addSkill: WispersCharacterSheet._onAddSkill,
            addSchool: WispersCharacterSheet._onAddSchool,
            addCoins: WispersCharacterSheet._onAddCoins,
            removeCoins: WispersCharacterSheet._onRemoveCoins,
            createItem: WispersCharacterSheet._onCreateItem,
            editItem: WispersCharacterSheet._onEditItem,
            deleteItem: WispersCharacterSheet._onDeleteItem,
            toggleEquipped: WispersCharacterSheet._onToggleEquipped
        },
        form: {
            submitOnChange: true,
            closeOnSubmit: false
        },
        position: {
            width: 650
        },
        window: {
            resizable: true
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

        super._configureRenderOptions(options);

        if (this.document.limited) options.parts = ["header"];
        else options.parts = ["header", "body"];
    }

    /** @override */
    async _prepareContext(options) {

        const baseData = await super._prepareContext();
        const actor = baseData.document;
        // Sort by the `sort` field so drag-and-drop reordering is reflected in
        // the rendered list — the items collection iterates in id/insertion
        // order, not sort order.
        const items = Array.from(actor.items).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

        const inventory = {
            weapons: items.filter(i => i.type === "weapon"),
            armor: items.filter(i => i.type === "armor"),
            shields: items.filter(i => i.type === "shield"),
            consumables: items.filter(i => i.type === "consumable"),
            loot: items.filter(i => i.type === "loot")
        };

        const inventorySections = [
            { type: "weapon",     labelKey: "CONSTANTS.Inventory.Weapons",     items: inventory.weapons     },
            { type: "armor",      labelKey: "CONSTANTS.Inventory.Armor",       items: inventory.armor       },
            { type: "shield",     labelKey: "CONSTANTS.Inventory.Shields",     items: inventory.shields     },
            { type: "consumable", labelKey: "CONSTANTS.Inventory.Consumables", items: inventory.consumables },
            { type: "loot",       labelKey: "CONSTANTS.Inventory.Loot",        items: inventory.loot        },
        ];

        // Slot-based encumbrance. Every carried item occupies slots equal to its
        // weight (base 1) times its quantity. The cap is a static 10 for now;
        // a later pass will derive it from Strength.
        const ENCUMBRANCE_MAX = 10;
        const carried = [...inventory.weapons, ...inventory.armor, ...inventory.shields,
                         ...inventory.consumables, ...inventory.loot];
        const usedSlots = carried.reduce(
            (sum, i) => sum + (i.system?.weight?.value ?? 0) * (i.system?.quantity?.value ?? 1), 0);
        const encumbrance = {
            value: usedSlots,
            max: ENCUMBRANCE_MAX,
            pct: Math.min(100, Math.round((usedSlots / ENCUMBRANCE_MAX) * 100)),
            over: usedSlots > ENCUMBRANCE_MAX
        };

        const spellList = items.filter(i => i.type === "spell");
        const spells = {};
        for (let lvl = 1; lvl <= 5; lvl++) {
            spells[lvl] = spellList.filter(s => (s.system?.level?.value ?? 1) === lvl);
        }

        const featureList = items.filter(i => i.type === "feature");
        const featureSections = [
            { type: "active",   labelKey: "CONSTANTS.Features.Active",   items: featureList.filter(f => f.system?.featureType?.value === "active")   },
            { type: "passive",  labelKey: "CONSTANTS.Features.Passive",  items: featureList.filter(f => f.system?.featureType?.value === "passive")  },
            { type: "reaction", labelKey: "CONSTANTS.Features.Reaction", items: featureList.filter(f => f.system?.featureType?.value === "reaction") },
        ];

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

        // Static metadata (labels, linked attributes, the set of entries that
        // exist) lives in CONFIG.WISPERS; stored actor data holds only values.
        // Each row merges the config metadata with the live proficiency/ability
        // value read from actor.system.
        const cfg = CONFIG.WISPERS ?? {};
        const abilityData = actor.system?.abilities ?? {};
        const abilityRows = Object.entries(cfg.abilities ?? {}).map(([key, meta]) => ({
            key,
            label: game.i18n.localize(meta.label),
            value: abilityData[key]?.value ?? 0
        }));

        const skillData = actor.system?.skills?.skills ?? {};
        const allSkillRows = Object.entries(cfg.skills ?? {}).map(([key, meta]) => {
            const prof = skillData[key]?.proficiency?.value ?? 0;
            return {
                key,
                label: game.i18n.localize(meta.label),
                value: prof,
                trained: prof >= 1
            };
        });
        const untrainedSkillCount = allSkillRows.filter(r => !r.trained).length;
        const skillRows = this._showAllSkills ? allSkillRows : allSkillRows.filter(r => r.trained);

        const schoolData = actor.system?.skills?.spellSchools ?? {};
        const allSchoolRows = Object.entries(cfg.spellSchools ?? {}).map(([key, meta]) => {
            const prof = schoolData[key]?.proficiency?.value ?? 0;
            return {
                key,
                label: game.i18n.localize(meta.label),
                linkedAttribute: meta.linkedAttribute,
                value: prof,
                bonus: abilityData[meta.linkedAttribute]?.value ?? 0,
                showBonus: prof >= 4,
                trained: prof >= 1
            };
        });
        const untrainedSchoolCount = allSchoolRows.filter(r => !r.trained).length;
        const schoolRows = this._showAllSchools ? allSchoolRows : allSchoolRows.filter(r => r.trained);

        const saveData = actor.system?.skills?.savingthrows ?? {};
        const saveRows = Object.entries(cfg.savingthrows ?? {}).map(([key, meta]) => ({
            key,
            label: game.i18n.localize(meta.label),
            linkedAttribute: meta.linkedAttribute,
            proficiency: saveData[key]?.proficiency?.value ?? 0,
            bonus: abilityData[meta.linkedAttribute]?.value ?? 0
        }));

        const context = {
            owner: actor.isOwner,
            editable: baseData.editable,
            actor,
            system: actor.system,
            items: actor.items,
            config: CONFIG.WISPERS,
            isGM: baseData.user.isGM,
            inventory,
            inventorySections,
            encumbrance,
            spells,
            featureSections,
            effects,
            biographyHTML,
            abilityRows,
            skillRows,
            schoolRows,
            saveRows,
            showAllSkills: this._showAllSkills,
            showAllSchools: this._showAllSchools,
            untrainedSkillCount,
            untrainedSchoolCount
        };

        this.sheetContext = context;
        return context;
    }

    /** @override */
    _onFirstRender(context, options) {
        // Relative numeric expressions ("+2", "-5") on Number inputs.
        installRelativeNumberInputs(this.element, this.actor);

        this.element.addEventListener("click", ev => {
            const abilityLabel = ev.target.closest(".ability-label[data-roll-ability]");
            if (abilityLabel) {
                ev.preventDefault();
                const key = abilityLabel.dataset.rollAbility;
                const value = this.actor.system?.abilities?.[key]?.value ?? 0;
                this._rollAbility(key, value);
                return;
            }
            const saveLabel = ev.target.closest(".save-label[data-roll-save]");
            if (saveLabel) {
                this._rollProficiencyFromGroup("savingthrows", saveLabel.dataset.rollSave);
                return;
            }
            const skillLabel = ev.target.closest(".skill-name[data-roll-skill]");
            if (skillLabel) {
                this._rollProficiencyFromGroup("skills", skillLabel.dataset.rollSkill);
                return;
            }
            const schoolLabel = ev.target.closest(".skill-name[data-roll-school]");
            if (schoolLabel) {
                this._rollProficiencyFromGroup("spellSchools", schoolLabel.dataset.rollSchool);
            }
        });

        // ApplicationV2's automatic re-render after form submission is unreliable
        // for displays computed from other fields (e.g. save bonuses derived from
        // linked ability scores). Subscribe to the document's update event so we
        // always re-render with fresh context after any actor change.
        this._onActorUpdate = (actor) => {
            if (actor.id === this.actor.id) this.render();
        };
        Hooks.on("updateActor", this._onActorUpdate);

        this._onItemChange = (item) => {
            if (item.parent?.id === this.actor.id) this.render();
        };
        Hooks.on("createItem", this._onItemChange);
        Hooks.on("updateItem", this._onItemChange);
        Hooks.on("deleteItem", this._onItemChange);

        // Allow drops anywhere on the sheet
        this.element.addEventListener("dragover", ev => ev.preventDefault());
        this.element.addEventListener("drop", ev => this._handleDrop(ev));
    }

    /** @override */
    async close(options) {
        if (this._onActorUpdate) {
            Hooks.off("updateActor", this._onActorUpdate);
            this._onActorUpdate = null;
        }
        if (this._onItemChange) {
            Hooks.off("createItem", this._onItemChange);
            Hooks.off("updateItem", this._onItemChange);
            Hooks.off("deleteItem", this._onItemChange);
            this._onItemChange = null;
        }
        return super.close(options);
    }

    /** @override */
    _onRender(context, options) {
        const tabs = new foundry.applications.ux.Tabs({navSelector: ".tabs", contentSelector: ".sheet-content", initial: this._activeTab ?? "character"});
        tabs.bind(this.element);
        this.element.querySelectorAll(".tabs [data-tab]").forEach(el => {
            el.addEventListener("click", () => { this._activeTab = el.dataset.tab; });
        });

        // Each tab can carry its own search box (inventory, features, …). Wire them
        // all, and scope each filter to its own tab so typing in one doesn't hide
        // rows in another — every tab reuses the .inventory-section / .item markup.
        this.element.querySelectorAll("input[type='search']").forEach(searchInput => {
            const scope = searchInput.closest(".tab") ?? this.element;
            searchInput.addEventListener("input", ev => {
                const query = ev.target.value.toLowerCase().trim();
                scope.querySelectorAll(".item[data-item-id]").forEach(row => {
                    const name = row.querySelector(".item-name h4")?.textContent?.toLowerCase() ?? "";
                    row.style.display = !query || name.includes(query) ? "" : "none";
                });
            });
        });

        const inventoryBody = this.element.querySelector(".inventory-body");
        if (inventoryBody) {
            inventoryBody.addEventListener("dragstart", ev => {
                const row = ev.target.closest(".item[data-item-id]");
                if (!row) return;
                const item = this.actor.items.get(row.dataset.itemId);
                if (!item) return;
                ev.dataTransfer.setData("text/plain", JSON.stringify({ type: "Item", uuid: item.uuid }));
                ev.dataTransfer.effectAllowed = "move";
            });
            inventoryBody.addEventListener("dragover", ev => {
                const row = ev.target.closest(".item[data-item-id]");
                inventoryBody.querySelectorAll(".drag-above, .drag-below").forEach(el => {
                    el.classList.remove("drag-above", "drag-below");
                });
                if (row) {
                    const rect = row.getBoundingClientRect();
                    const before = ev.clientY < rect.top + rect.height / 2;
                    row.classList.toggle("drag-above", before);
                    row.classList.toggle("drag-below", !before);
                }
            });
            inventoryBody.addEventListener("dragleave", ev => {
                if (!inventoryBody.contains(ev.relatedTarget)) {
                    inventoryBody.querySelectorAll(".drag-above, .drag-below").forEach(el => {
                        el.classList.remove("drag-above", "drag-below");
                    });
                }
            });
        }

        this.element.querySelectorAll(".skill-pips").forEach(container => {
            container.querySelectorAll(".pip").forEach(pip => {
                pip.addEventListener("click", async ev => {
                    const field = container.dataset.field;
                    const current = Number.parseInt(container.dataset.value, 10) || 0;
                    const level = Number.parseInt(pip.dataset.level, 10);
                    const newValue = (current === level) ? level - 1 : level;
                    await this.actor.update({ [field]: newValue });
                    this.render();
                });
            });
        });
    }

    async _rollAbility(key, value) {
        const baseDie = WispersCharacterSheet._attributeDieFormula(value) ?? "0";
        if (!baseDie) return;
        const meta = CONFIG.WISPERS?.abilities?.[key];
        const label = meta?.label ? game.i18n.localize(meta.label) : key;

        const config = await WispersCharacterSheet._showRollDialog(label);
        if (config === null) return;

        const parts = [baseDie];
        if (config.difficultyDie) parts.push(config.difficultyDie);
        const formula = WispersCharacterSheet._applyBoonBane(parts, config.boonBane).join(" + ");
        const roll = new Roll(formula);
        await roll.evaluate();
        await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor: label
        });
    }

    _rollProficiencyFromGroup(group, key) {
        const entry = this.actor.system?.skills?.[group]?.[key];
        const meta = CONFIG.WISPERS?.[group]?.[key];
        if (!entry || !meta) return;
        const proficiency = entry.proficiency?.value ?? 0;
        const label = meta.label ? game.i18n.localize(meta.label) : key;
        const linkedAttr = meta.linkedAttribute;
        let attributeDie = null;
        if (group === "spellSchools") {
            const attrValue = this.actor.system?.abilities?.[linkedAttr]?.value ?? 0;
            attributeDie = WispersCharacterSheet._attributeDieFormula(attrValue);
        }
        const applyAttrBonus = proficiency >= 4 && group === "spellSchools";
        return this._rollProficiency(label, proficiency, {
            attributeDie,
            applyAttrBonus,
            linkedAttr,
            showDifficulty: group === "skills"
        });
    }

    async _rollProficiency(label, proficiency, { attributeDie = null, applyAttrBonus = false, linkedAttr = null, showDifficulty = false } = {}) {
        // Untrained rolls (proficiency 0) roll bonus only — "0" passes through
        // _shiftDie unchanged, so tier modifiers are a no-op.
        const baseDie = WispersCharacterSheet._proficiencyDieFormula(proficiency) ?? "0";

        const config = await WispersCharacterSheet._showRollDialog(label, { showDifficulty });
        if (config === null) return;

        const flatBonus = applyAttrBonus && linkedAttr
            ? (this.actor.system?.abilities?.[linkedAttr]?.value ?? 0)
            : 0;

        const dieParts = [baseDie];
        if (attributeDie) dieParts.push(attributeDie);
        if (config.difficultyDie) dieParts.push(config.difficultyDie);
        const shifted = WispersCharacterSheet._applyBoonBane(dieParts, config.boonBane);
        if (flatBonus !== 0) shifted.push(String(flatBonus));
        const formula = shifted.join(" + ");
        const roll = new Roll(formula);
        await roll.evaluate();
        await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor: label
        });
    }

    static async _showRollDialog(label, { showDifficulty = true } = {}) {
        const DialogV2 = foundry.applications.api.DialogV2;
        const t = key => game.i18n.localize(`CONSTANTS.Roll.${key}`);
        const title = game.i18n.format("CONSTANTS.Roll.Title", { label });

        const difficultyOptions = [0, 1, 2, 3, 4, 5].map(lvl => {
            const key = lvl === 0 ? "DifficultyNone" : `Difficulty${lvl}`;
            return `<option value="${lvl}">${t(key)}</option>`;
        }).join("");

        const difficultyBlock = showDifficulty ? `
            <div class="form-group">
                <label>${t("DifficultyDie")}</label>
                <select name="difficultyLevel">
                    ${difficultyOptions}
                </select>
            </div>` : "";

        const content = `
            <div class="form-group">
                <label>${t("BoonBane")}</label>
                <select name="boonBane">
                    <option value="bane">${t("Bane")}</option>
                    <option value="none" selected>${t("BoonBaneNone")}</option>
                    <option value="boon">${t("Boon")}</option>
                </select>
            </div>
            ${difficultyBlock}`;

        const difficultyDieMap = { 1: "1d4", 2: "1d6", 3: "1d8", 4: "1d10", 5: "1d12" };

        return await DialogV2.prompt({
            window: { title },
            content,
            ok: {
                label: t("Roll"),
                callback: (event, button) => {
                    const difficultyLevel = showDifficulty
                        ? (Number.parseInt(button.form.elements.difficultyLevel.value, 10) || 0)
                        : 0;
                    return {
                        boonBane: button.form.elements.boonBane.value,
                        difficultyDie: difficultyDieMap[difficultyLevel] ?? null
                    };
                }
            },
            rejectClose: false
        });
    }

    static _applyBoonBane(parts, mode) {
        if (mode === "none") return parts;
        const tiers = ["1d4", "1d6", "1d8", "1d10", "1d12"];
        const diceParts = parts.filter(p => tiers.includes(p));
        if (!diceParts.length) return parts;
        const sorted = [...diceParts].sort((a, b) => tiers.indexOf(a) - tiers.indexOf(b));
        const target = mode === "boon" ? sorted[0] : sorted.at(-1);
        const shift = mode === "boon" ? 1 : -1;
        const newDie = tiers[Math.max(0, Math.min(tiers.length - 1, tiers.indexOf(target) + shift))];
        let replaced = false;
        return parts.map(p => {
            if (!replaced && p === target) { replaced = true; return newDie; }
            return p;
        });
    }

    static _attributeDieFormula(value) {
        if (value <= 0) return null;
        if (value <= 4) return "1d4";
        if (value <= 6) return "1d6";
        if (value <= 8) return "1d8";
        if (value <= 10) return "1d10";
        return "1d12";
    }

    static _proficiencyDieFormula(value) {
        const map = { 1: "1d4", 2: "1d6", 3: "1d8", 4: "1d10", 5: "1d12" };
        return map[value] ?? null;
    }

    /** @override */
    _prepareSubmitData(event, form, formData, updateData) {
        const submitData = super._prepareSubmitData(event, form, formData, updateData);
        const clamp = v => Math.max(0, Math.min(5, Math.trunc(Number(v) || 0)));
        const flatKeyRe = /^system\.skills\.(skills|spellSchools|savingthrows)\.[^.]+\.proficiency\.value$/;

        // Flat (dot-keyed) shape
        for (const k of Object.keys(submitData)) {
            if (flatKeyRe.test(k)) submitData[k] = clamp(submitData[k]);
        }

        // Expanded (nested) shape
        for (const group of ["skills", "spellSchools", "savingthrows"]) {
            const set = submitData?.system?.skills?.[group];
            if (!set || typeof set !== "object") continue;
            for (const k of Object.keys(set)) {
                const p = set[k]?.proficiency;
                if (p && typeof p === "object" && "value" in p) p.value = clamp(p.value);
            }
        }

        return submitData;
    }

    static _onToggleAllSkills(event, target) {
        this._showAllSkills = !this._showAllSkills;
        this.render();
    }

    static _onToggleAllSchools(event, target) {
        this._showAllSchools = !this._showAllSchools;
        this.render();
    }

    static async _onAddSkill(event, target) {
        await WispersCharacterSheet._promoteToNovice(this, "skills", "Learn a Skill", "All skills are already trained.");
    }

    static async _onAddSchool(event, target) {
        await WispersCharacterSheet._promoteToNovice(this, "spellSchools", "Learn a Spell School", "All spell schools are already trained.");
    }

    static async _promoteToNovice(app, group, title, allTrainedMessage) {
        const data = app.actor.system?.skills?.[group] ?? {};
        const meta = CONFIG.WISPERS?.[group] ?? {};
        const untrained = Object.entries(data).filter(([, v]) => (v?.proficiency?.value ?? 0) < 1);
        if (!untrained.length) {
            ui.notifications.info(allTrainedMessage);
            return;
        }
        const options = untrained
            .map(([key]) => {
                const label = meta[key]?.label ? game.i18n.localize(meta[key].label) : key;
                return `<option value="${key}">${foundry.utils.escapeHTML?.(label) ?? label}</option>`;
            })
            .join("");
        const content = `
            <div class="form-group">
                <label>Choose one to learn at Novice (1):</label>
                <select name="key" autofocus>${options}</select>
            </div>`;
        const DialogV2 = foundry.applications.api.DialogV2;
        const result = await DialogV2.prompt({
            window: { title },
            content,
            ok: {
                label: "Learn (Novice)",
                callback: (event, button) => button.form.elements.key.value
            },
            rejectClose: false
        });
        if (!result) return;
        await app.actor.update({ [`system.skills.${group}.${result}.proficiency.value`]: 1 });
    }

    static async _onCreateItem(event, target) {
        const type = target.dataset.type;
        const featureType = target.dataset.featureType;
        const name = game.i18n.localize("CONSTANTS.Inventory.NewItem");
        const itemData = { name, type };
        // Creation data is NOT run through expandObject (unlike Document#update),
        // so a flat "system.featureType.value" key would be dropped during schema
        // cleaning and the feature would default to "active". Build it nested.
        if (featureType) foundry.utils.setProperty(itemData, "system.featureType.value", featureType);
        await this.actor.createEmbeddedDocuments("Item", [itemData]);
    }

    static _onEditItem(event, target) {
        const item = this.actor.items.get(target.dataset.itemId);
        item?.sheet?.render(true);
    }

    // Flip system.equipped.value on equippable items (weapons/armor/shields).
    // The updateItem hook registered in _onFirstRender re-renders the sheet, so
    // the toggle icon reflects the new state without an explicit render() here.
    static async _onToggleEquipped(event, target) {
        const item = this.actor.items.get(target.dataset.itemId);
        if (!item || !("equipped" in (item.system ?? {}))) return;
        await item.update({ "system.equipped.value": !item.system.equipped.value });
    }

    static async _onDeleteItem(event, target) {
        const item = this.actor.items.get(target.dataset.itemId);
        if (!item) return;
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: game.i18n.localize("CONSTANTS.Inventory.DeleteItem") },
            content: `<p>${foundry.utils.escapeHTML(item.name)}?</p>`,
            rejectClose: false
        });
        if (confirmed) await item.delete();
    }

    static async _onAddCoins(event, target) {
        const t = key => game.i18n.localize(`CONSTANTS.Coinage.${key}`);
        const current = this.actor.system?.currency ?? {};
        const amounts = await WispersCharacterSheet._showCoinDialog(t("AddTitle"), current);
        if (!amounts) return;
        const update = {};
        for (const [denom, delta] of Object.entries(amounts)) {
            if (delta === 0) continue;
            update[`system.currency.${denom}.value`] = (current[denom]?.value ?? 0) + delta;
        }
        if (Object.keys(update).length) await this.actor.update(update);
    }

    static async _onRemoveCoins(event, target) {
        const t = key => game.i18n.localize(`CONSTANTS.Coinage.${key}`);
        const current = this.actor.system?.currency ?? {};
        const amounts = await WispersCharacterSheet._showCoinDialog(t("RemoveTitle"), current);
        if (!amounts) return;
        const update = {};
        for (const [denom, delta] of Object.entries(amounts)) {
            if (delta === 0) continue;
            update[`system.currency.${denom}.value`] = Math.max(0, (current[denom]?.value ?? 0) - delta);
        }
        if (Object.keys(update).length) await this.actor.update(update);
    }

    static async _showCoinDialog(title, current) {
        const DialogV2 = foundry.applications.api.DialogV2;
        const t = key => game.i18n.localize(`CONSTANTS.Coinage.${key}`);
        const row = (name, label) => `
            <div class="form-group">
                <label>${label} <span class="coin-current">(${current[name]?.value ?? 0})</span></label>
                <input type="number" name="${name}" value="0" min="0" />
            </div>`;
        const content = [
            row("iron",   t("Iron")),
            row("copper", t("Copper")),
            row("silver", t("Silver")),
            row("gold",   t("Gold")),
        ].join("");
        return await DialogV2.prompt({
            window: { title },
            content,
            ok: {
                label: title,
                callback: (event, button) => {
                    const f = name => Math.max(0, Number.parseInt(button.form.elements[name].value, 10) || 0);
                    return { iron: f("iron"), copper: f("copper"), silver: f("silver"), gold: f("gold") };
                }
            },
            rejectClose: false
        });
    }

    async _handleDrop(event) {
        let dragData;
        try {
            dragData = JSON.parse(event.dataTransfer.getData("text/plain"));
        } catch {
            return;
        }
        if (dragData.type !== "Item") return;

        const sourceItem = fromUuidSync(dragData.uuid) ?? await fromUuid(dragData.uuid);
        if (!sourceItem) return;

        const targetEl = event.target.closest(".item[data-item-id]");
        const targetItem = targetEl ? this.actor.items.get(targetEl.dataset.itemId) : null;

        // Clean up any lingering drag indicators
        this.element.querySelectorAll(".drag-above, .drag-below").forEach(el => {
            el.classList.remove("drag-above", "drag-below");
        });

        if (sourceItem.parent === this.actor) {
            // Same-actor drag: reorder within the same type section
            if (!targetItem || targetItem.type !== sourceItem.type || targetItem.id === sourceItem.id) return;
            const rect = targetEl.getBoundingClientRect();
            const sortBefore = event.clientY < rect.top + rect.height / 2;
            const siblings = [...this.actor.items]
                .filter(i => i.type === sourceItem.type && i.id !== sourceItem.id)
                .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
            const sorted = foundry.utils.performIntegerSort(sourceItem, { target: targetItem, siblings, sortBefore });
            const updates = sorted.map(s => ({ _id: s.target.id, sort: s.update.sort }));
            await this.actor.updateEmbeddedDocuments("Item", updates);
        } else {
            // External drop: create a copy on this actor
            await this.actor.createEmbeddedDocuments("Item", [sourceItem.toObject()]);
        }
    }

}
