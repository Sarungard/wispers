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

        super._configureRenderOptions(options);

        if (this.document.limited) options.parts = ["header"];
        else options.parts = ["header", "body"];
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
            bonus: actor.system?.abilities?.[s.linkedAttribute]?.value ?? 0,
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
    }

    /** @override */
    async close(options) {
        if (this._onActorUpdate) {
            Hooks.off("updateActor", this._onActorUpdate);
            this._onActorUpdate = null;
        }
        return super.close(options);
    }

    /** @override */
    _onRender(context, options) {
        const tabs = new foundry.applications.ux.Tabs({navSelector: ".tabs", contentSelector: ".sheet-content", initial: "character"});
        tabs.bind(this.element);

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
        const baseDie = wispersCharacterSheet._attributeDieFormula(value) ?? "0";
        if (!baseDie) return;
        const ability = this.actor.system?.abilities?.[key];
        const label = ability?.id ? (game.i18n.localize(`CONSTANTS.Attributes.${ability.id}.long`) || ability.id) : key;

        const config = await wispersCharacterSheet._showRollDialog(label, baseDie);
        if (config === null) return;

        const die = wispersCharacterSheet._shiftDie(baseDie, config.dieMod);
        const formula = config.flatBonus === 0 ? die : `${die} + ${config.flatBonus}`;
        const roll = new Roll(formula);
        await roll.evaluate();
        await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor: label
        });
    }

    _rollProficiencyFromGroup(group, key) {
        const entry = this.actor.system?.skills?.[group]?.[key];
        if (!entry) return;
        const proficiency = entry.proficiency?.value ?? 0;
        const bonus = this.actor.system?.abilities?.[entry.linkedAttribute]?.value ?? 0;
        const label = entry.label ?? key;
        // Only skills let the user swap the linked attribute at roll time; saves
        // and spell schools roll their fixed linked attribute.
        const abilityOptions = group === "skills"
            ? { selected: entry.linkedAttribute, list: this._abilityChoices() }
            : null;
        return this._rollProficiency(label, proficiency, bonus, { abilityOptions });
    }

    _abilityChoices() {
        const abilities = this.actor.system?.abilities ?? {};
        return Object.entries(abilities).map(([key, a]) => ({
            key,
            label: a?.id ? (game.i18n.localize(`CONSTANTS.Attributes.${a.id}.long`) || a.id) : key
        }));
    }

    async _rollProficiency(label, proficiency, bonus, { abilityOptions = null } = {}) {
        // Untrained rolls (proficiency 0) roll bonus only — "0" passes through
        // _shiftDie unchanged, so tier modifiers are a no-op.
        const baseDie = wispersCharacterSheet._proficiencyDieFormula(proficiency) ?? "0";

        const config = await wispersCharacterSheet._showRollDialog(label, baseDie, abilityOptions);
        if (config === null) return;

        // If the dialog swapped the linked attribute (skills only), recompute
        // bonus from the chosen ability's live value.
        const effectiveBonus = config.attribute
            ? (this.actor.system?.abilities?.[config.attribute]?.value ?? 0)
            : bonus;

        const die = wispersCharacterSheet._shiftDie(baseDie, config.dieMod);
        const totalBonus = effectiveBonus + config.flatBonus;
        const formula = totalBonus === 0 ? die : `${die} + ${totalBonus}`;
        const roll = new Roll(formula);
        await roll.evaluate();
        await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor: label
        });
    }

    static async _showRollDialog(label, baseDie, abilityOptions = null) {
        const DialogV2 = foundry.applications.api.DialogV2;
        const t = key => game.i18n.localize(`CONSTANTS.Roll.${key}`);
        const noChange = game.i18n.format("CONSTANTS.Roll.NoChange", { die: baseDie });
        const title = game.i18n.format("CONSTANTS.Roll.Title", { label });

        const abilityBlock = abilityOptions ? `
            <div class="form-group">
                <label>${t("LinkedAttribute")}</label>
                <select name="attribute">
                    ${abilityOptions.list.map(a =>
                        `<option value="${a.key}"${a.key === abilityOptions.selected ? " selected" : ""}>${a.label}</option>`
                    ).join("")}
                </select>
            </div>` : "";

        const content = `
            ${abilityBlock}
            <div class="form-group">
                <label>${t("DieTier")}</label>
                <select name="dieMod">
                    <option value="-2">${t("Downgrade2")}</option>
                    <option value="-1">${t("Downgrade1")}</option>
                    <option value="0" selected>${noChange}</option>
                    <option value="1">${t("Upgrade1")}</option>
                    <option value="2">${t("Upgrade2")}</option>
                </select>
            </div>
            <div class="form-group">
                <label>${t("FlatBonus")}</label>
                <input type="number" name="flatBonus" value="0" />
            </div>`;
        return await DialogV2.prompt({
            window: { title },
            content,
            ok: {
                label: t("Roll"),
                callback: (event, button) => ({
                    dieMod: Number.parseInt(button.form.elements.dieMod.value, 10),
                    flatBonus: Number.parseInt(button.form.elements.flatBonus.value, 10) || 0,
                    attribute: button.form.elements.attribute?.value ?? null
                })
            },
            rejectClose: false
        });
    }

    static _shiftDie(dieFormula, mod) {
        const tiers = ["1d4", "1d6", "1d8", "1d10", "1d12"];
        const idx = tiers.indexOf(dieFormula);
        if (idx === -1) return dieFormula;
        return tiers[Math.max(0, Math.min(tiers.length - 1, idx + mod))];
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
