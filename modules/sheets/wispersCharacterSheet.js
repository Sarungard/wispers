const api = foundry.applications.api;
const sheets = foundry.applications.sheets;

export default class wispersCharacterSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {

    sheetContext = {};
    _showAllSkills = false;
    _showAllSchools = false;

    static DEFAULT_OPTIONS = {

        tag: "form",
        classes: ["wispers", "sheet", "character"],
        actions: {
            toggleAllSkills: wispersCharacterSheet._onToggleAllSkills,
            toggleAllSchools: wispersCharacterSheet._onToggleAllSchools,
            addSkill: wispersCharacterSheet._onAddSkill,
            addSchool: wispersCharacterSheet._onAddSchool
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

        const rawSkills = actor.system?.skills?.skills ?? {};
        const allSkillRows = Object.entries(rawSkills).map(([key, s]) => ({
            key,
            label: s.label,
            linkedAttribute: s.linkedAttribute,
            value: s.proficiency?.value ?? 0,
            trained: (s.proficiency?.value ?? 0) >= 1
        }));
        const untrainedSkillCount = allSkillRows.filter(r => !r.trained).length;
        const skillRows = this._showAllSkills ? allSkillRows : allSkillRows.filter(r => r.trained);

        const rawSchools = actor.system?.skills?.spellSchools ?? {};
        const allSchoolRows = Object.entries(rawSchools).map(([key, s]) => ({
            key,
            label: s.label,
            linkedAttribute: s.linkedAttribute,
            value: s.proficiency?.value ?? 0,
            bonus: actor.system?.abilities?.[s.linkedAttribute]?.value ?? 0,
            trained: (s.proficiency?.value ?? 0) >= 1
        }));
        const untrainedSchoolCount = allSchoolRows.filter(r => !r.trained).length;
        const schoolRows = this._showAllSchools ? allSchoolRows : allSchoolRows.filter(r => r.trained);

        const rawSaves = actor.system?.skills?.savingthrows ?? {};
        const saveRows = Object.entries(rawSaves).map(([key, s]) => ({
            key,
            label: s.label,
            linkedAttribute: s.linkedAttribute,
            proficiency: s.proficiency?.value ?? 0,
            bonus: actor.system?.abilities?.[s.linkedAttribute]?.value ?? 0
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
            spells,
            features,
            effects,
            biographyHTML,
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
                const label = saveLabel.dataset.rollSave;
                const proficiency = parseInt(saveLabel.dataset.proficiency, 10) || 0;
                const bonus = parseInt(saveLabel.dataset.bonus, 10) || 0;
                this._rollSave(label, proficiency, bonus);
            }
        });
    }

    /** @override */
    _onRender(context, options) {
        const tabs = new foundry.applications.ux.Tabs({navSelector: ".tabs", contentSelector: ".sheet-content", initial: "character"});
        tabs.bind(this.element);

        this.element.querySelectorAll(".skill-pips").forEach(container => {
            container.querySelectorAll(".pip").forEach(pip => {
                pip.addEventListener("click", ev => {
                    const field = container.dataset.field;
                    const current = parseInt(container.dataset.value, 10) || 0;
                    const level = parseInt(pip.dataset.level, 10);
                    const newValue = (current === level) ? level - 1 : level;
                    this.actor.update({ [field]: newValue });
                });
            });
        });
    }

    async _rollAbility(key, value) {
        const formula = wispersCharacterSheet._attributeDieFormula(value);
        if (!formula) return;
        const ability = this.actor.system?.abilities?.[key];
        const label = ability?.id ? (game.i18n.localize(`CONSTANTS.Attributes.${ability.id}.long`) || ability.id) : key;
        const roll = new Roll(formula);
        await roll.evaluate();
        await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor: label
        });
    }

    async _rollSave(label, proficiency, bonus) {
        const die = wispersCharacterSheet._proficiencyDieFormula(proficiency);
        if (!die) return;
        const formula = bonus !== 0 ? `${die} + ${bonus}` : die;
        const roll = new Roll(formula);
        await roll.evaluate();
        await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor: label
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
        await wispersCharacterSheet._promoteToNovice(this, "skills", "Learn a Skill", "All skills are already trained.");
    }

    static async _onAddSchool(event, target) {
        await wispersCharacterSheet._promoteToNovice(this, "spellSchools", "Learn a Spell School", "All spell schools are already trained.");
    }

    static async _promoteToNovice(app, group, title, allTrainedMessage) {
        const data = app.actor.system?.skills?.[group] ?? {};
        const untrained = Object.entries(data).filter(([, v]) => (v?.proficiency?.value ?? 0) < 1);
        if (!untrained.length) {
            ui.notifications.info(allTrainedMessage);
            return;
        }
        const options = untrained
            .map(([key, s]) => `<option value="${key}">${foundry.utils.escapeHTML?.(s.label) ?? s.label}</option>`)
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


}
