import { installRelativeNumberInputs } from "../utils.js";

const api = foundry.applications.api;
const sheets = foundry.applications.sheets;

export default class WispersCharacterSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {

    sheetContext = {};
    _showAllSkills = false;
    _showAllSchools = false;
    _showAllWeapons = false;
    _showAllArmor = false;
    _activeTab = null;
    _onItemChange = null;
    _onEffectChange = null;
    // Ids of items whose inline description "card" is currently expanded. Pure UI
    // state — re-applied in _onRender so it survives the hook-driven re-renders.
    _expandedItems = new Set();
    // Same, for config-driven proficiency rows (skills). Keyed "<group>:<key>".
    _expandedSkills = new Set();

    static DEFAULT_OPTIONS = {

        tag: "form",
        classes: ["wispers", "sheet", "character"],
        actions: {
            toggleAllSkills: WispersCharacterSheet._onToggleAllSkills,
            toggleAllSchools: WispersCharacterSheet._onToggleAllSchools,
            toggleAllWeapons: WispersCharacterSheet._onToggleAllWeapons,
            toggleAllArmor: WispersCharacterSheet._onToggleAllArmor,
            addSkill: WispersCharacterSheet._onAddSkill,
            addSchool: WispersCharacterSheet._onAddSchool,
            addWeapon: WispersCharacterSheet._onAddWeapon,
            addArmor: WispersCharacterSheet._onAddArmor,
            addCoins: WispersCharacterSheet._onAddCoins,
            removeCoins: WispersCharacterSheet._onRemoveCoins,
            createItem: WispersCharacterSheet._onCreateItem,
            editItem: WispersCharacterSheet._onEditItem,
            deleteItem: WispersCharacterSheet._onDeleteItem,
            toggleEquipped: WispersCharacterSheet._onToggleEquipped,
            toggleDescription: WispersCharacterSheet._onToggleDescription,
            toggleSkillDescription: WispersCharacterSheet._onToggleSkillDescription
        },
        form: {
            submitOnChange: true,
            closeOnSubmit: false
        },
        position: {
            width: 720
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

    // Expandable proficiency cards (skills / schools / saves / weapon categories /
    // armor) are keyed by the `data-skill-group` token in the template. Each maps
    // to its CONFIG.WISPERS metadata map (`config`) and its actor-data location
    // under system.skills (`path`) — these coincide for skills/schools/saves but
    // not for weapons/armor, hence the explicit map.
    static SKILL_GROUPS = {
        skills:           { config: "skills",           path: "skills.skills" },
        spellSchools:     { config: "spellSchools",      path: "skills.spellSchools" },
        savingthrows:     { config: "savingthrows",      path: "skills.savingthrows" },
        weaponCategories: { config: "weaponCategories",  path: "skills.weapons.categories" },
        armorTypes:       { config: "armorTypes",        path: "skills.armor" }
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

        // Decorate each list row with its proficiency GROUP (weapon category /
        // armor type) and current proficiency TIER for the list columns. Types
        // without a proficiency (shield/consumable/loot) get an em-dash.
        const DASH = "—";
        const W = CONFIG.WISPERS ?? {};
        const tierText = p => WispersCharacterSheet._proficiencyTierText(p);
        const decorate = its => its.map(item => {
            const sys = item.system ?? {};
            let group = DASH, prof = DASH;
            if (item.type === "weapon") {
                const k = sys.category?.value;
                group = k ? game.i18n.localize(W.weaponCategories?.[k]?.label ?? k) : DASH;
                prof = tierText(this._resolveWeaponProficiency(item));
            } else if (item.type === "armor") {
                const k = sys.armorType?.value;
                group = k ? game.i18n.localize(W.armorTypes?.[k]?.label ?? k) : DASH;
                const e = actor.system?.skills?.armor?.[k];
                prof = tierText(e?.proficiency?.effective ?? e?.proficiency?.value ?? 0);
            }
            return { item, group, prof };
        });

        const inventorySections = [
            { type: "weapon",     labelKey: "CONSTANTS.Inventory.Weapons",     items: decorate(inventory.weapons)     },
            { type: "armor",      labelKey: "CONSTANTS.Inventory.Armor",       items: decorate(inventory.armor)       },
            { type: "shield",     labelKey: "CONSTANTS.Inventory.Shields",     items: decorate(inventory.shields)     },
            { type: "consumable", labelKey: "CONSTANTS.Inventory.Consumables", items: decorate(inventory.consumables) },
            { type: "loot",       labelKey: "CONSTANTS.Inventory.Loot",        items: decorate(inventory.loot)        },
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

        // Each spell row carries its school-check proficiency so the spellbook can
        // render the cast die icon ({{proficiencyDie entry.schoolProf}}) and the
        // click handler can roll the school check via _castSpell.
        const schoolProfOf = key => actor.system?.skills?.spellSchools?.[key]?.proficiency?.effective
            ?? actor.system?.skills?.spellSchools?.[key]?.proficiency?.value ?? 0;
        const spellList = items.filter(i => i.type === "spell");
        const spells = {};
        for (let lvl = 1; lvl <= 5; lvl++) {
            spells[lvl] = spellList
                .filter(s => (s.system?.level?.value ?? 1) === lvl)
                .map(s => {
                    const schoolKey = s.system?.school?.value;
                    const schoolProf = schoolProfOf(schoolKey);
                    return {
                        item: s,
                        schoolProf,
                        // School = the spell's proficiency group; tier = caster's
                        // school proficiency, for the spellbook list columns.
                        group: schoolKey
                            ? game.i18n.localize(CONFIG.WISPERS?.spellSchools?.[schoolKey]?.label ?? schoolKey)
                            : "—",
                        prof: WispersCharacterSheet._proficiencyTierText(schoolProf)
                    };
                });
        }

        const featureList = items.filter(i => i.type === "feature");
        const featureSections = [
            { type: "active",   labelKey: "CONSTANTS.Features.Active",   items: featureList.filter(f => f.system?.featureType?.value === "active")   },
            { type: "passive",  labelKey: "CONSTANTS.Features.Passive",  items: featureList.filter(f => f.system?.featureType?.value === "passive")  },
            { type: "reaction", labelKey: "CONSTANTS.Features.Reaction", items: featureList.filter(f => f.system?.featureType?.value === "reaction") },
        ];

        const allEffects = Array.from(actor.effects);
        // Temporary = enabled + has any duration (seconds OR rounds/turns — the
        // AP-initiative combat measures duration in rounds/turns, not seconds).
        const hasDuration = e => !!(e.duration?.seconds || e.duration?.rounds || e.duration?.turns);
        const effects = [
            { label: "CONSTANTS.Effect.Temporary", type: "temporary", effects: allEffects.filter(e => !e.disabled && hasDuration(e)) },
            { label: "CONSTANTS.Effect.Passive", type: "passive", effects: allEffects.filter(e => !e.disabled && !hasDuration(e)) },
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
        // Rows carry both the editable `value`/`proficiency` base (the pips and
        // ability inputs bind to it) AND the derived `effective`/`effectiveProficiency`
        // the die icons + rolls use. base→effective is computed in
        // wispersActor.prepareDerivedData (effects ADD into `.bonus`).
        const abilityData = actor.system?.abilities ?? {};
        const abilityRows = Object.entries(cfg.abilities ?? {}).map(([key, meta]) => ({
            key,
            label: game.i18n.localize(meta.label),
            value: abilityData[key]?.value ?? 0,
            effective: abilityData[key]?.effective ?? abilityData[key]?.value ?? 0
        }));

        const skillData = actor.system?.skills?.skills ?? {};
        const allSkillRows = Object.entries(cfg.skills ?? {}).map(([key, meta]) => {
            const prof = skillData[key]?.proficiency?.value ?? 0;
            return {
                key,
                label: game.i18n.localize(meta.label),
                value: prof,
                effective: skillData[key]?.proficiency?.effective ?? prof,
                trained: prof >= 1
            };
        });
        const untrainedSkillCount = allSkillRows.filter(r => !r.trained).length;
        const skillRows = this._showAllSkills ? allSkillRows : allSkillRows.filter(r => r.trained);

        const schoolData = actor.system?.skills?.spellSchools ?? {};
        const allSchoolRows = Object.entries(cfg.spellSchools ?? {}).map(([key, meta]) => {
            const prof = schoolData[key]?.proficiency?.value ?? 0;
            const effProf = schoolData[key]?.proficiency?.effective ?? prof;
            return {
                key,
                label: game.i18n.localize(meta.label),
                linkedAttribute: meta.linkedAttribute,
                value: prof,
                effective: effProf,
                // Bonus mirrors the roll: linked attribute (effective) added only
                // at effective proficiency ≥ 4 (spellcasting.md §1.1 step 2).
                bonus: abilityData[meta.linkedAttribute]?.effective ?? 0,
                showBonus: effProf >= 4,
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
            effectiveProficiency: saveData[key]?.proficiency?.effective ?? saveData[key]?.proficiency?.value ?? 0,
            bonus: abilityData[meta.linkedAttribute]?.effective ?? 0
        }));

        // Weapon-category and armor proficiency tracks. Same 0–5 ladder + expandable
        // card as the skills above; not rollable (attacks roll via the weapon item,
        // armor isn't rolled). All entries always show — they're fixed config sets.
        const profRows = (configMap, dataObj) => Object.entries(configMap ?? {}).map(([key, meta]) => {
            const prof = dataObj[key]?.proficiency?.value ?? 0;
            return {
                key,
                label: game.i18n.localize(meta.label),
                value: prof,
                effective: dataObj[key]?.proficiency?.effective ?? prof,
                trained: prof >= 1
            };
        });
        const allWeaponRows = profRows(cfg.weaponCategories, actor.system?.skills?.weapons?.categories ?? {});
        const allArmorRows = profRows(cfg.armorTypes, actor.system?.skills?.armor ?? {});
        // Show only trained (≥ Novice) entries by default, with a Show-all toggle —
        // same as skills/schools.
        const untrainedWeaponCount = allWeaponRows.filter(r => !r.trained).length;
        const untrainedArmorCount = allArmorRows.filter(r => !r.trained).length;
        const weaponRows = this._showAllWeapons ? allWeaponRows : allWeaponRows.filter(r => r.trained);
        const armorRows = this._showAllArmor ? allArmorRows : allArmorRows.filter(r => r.trained);

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
            weaponRows,
            armorRows,
            showAllSkills: this._showAllSkills,
            showAllSchools: this._showAllSchools,
            showAllWeapons: this._showAllWeapons,
            showAllArmor: this._showAllArmor,
            untrainedSkillCount,
            untrainedSchoolCount,
            untrainedWeaponCount,
            untrainedArmorCount
        };

        this.sheetContext = context;
        return context;
    }

    /** @override */
    _onFirstRender(context, options) {
        // Relative numeric expressions ("+2", "-5") on Number inputs.
        installRelativeNumberInputs(this.element, this.actor);

        // Roll triggers are matched by `data-roll-*` attribute, NOT by element/class,
        // so both the row label AND its die icon (any element carrying the attribute)
        // fire the same roll → dialog → chat card. Add new rollables by tagging an
        // element with the relevant data-roll-* attribute (+ the `.rollable` class).
        this.element.addEventListener("click", ev => {
            const ability = ev.target.closest("[data-roll-ability]");
            if (ability) {
                ev.preventDefault();
                const key = ability.dataset.rollAbility;
                const value = this.actor.system?.abilities?.[key]?.effective
                    ?? this.actor.system?.abilities?.[key]?.value ?? 0;
                this._rollAbility(key, value);
                return;
            }
            const save = ev.target.closest("[data-roll-save]");
            if (save) {
                ev.preventDefault();
                this._rollProficiencyFromGroup("savingthrows", save.dataset.rollSave);
                return;
            }
            const skill = ev.target.closest("[data-roll-skill]");
            if (skill) {
                ev.preventDefault();
                this._rollProficiencyFromGroup("skills", skill.dataset.rollSkill);
                return;
            }
            const school = ev.target.closest("[data-roll-school]");
            if (school) {
                ev.preventDefault();
                this._rollProficiencyFromGroup("spellSchools", school.dataset.rollSchool);
                return;
            }
            const weapon = ev.target.closest("[data-roll-weapon]");
            if (weapon) {
                ev.preventDefault();
                const item = this.actor.items.get(weapon.dataset.rollWeapon);
                if (item) this._rollWeaponAttack(item);
                return;
            }
            const spell = ev.target.closest("[data-roll-spell]");
            if (spell) {
                ev.preventDefault();
                const item = this.actor.items.get(spell.dataset.rollSpell);
                if (item) this._castSpell(item);
                return;
            }
            // Non-rollable items (features, loot, armor, shields, consumables):
            // clicking the image posts a description-only chat card to everyone.
            const card = ev.target.closest("[data-item-card]");
            if (card) {
                ev.preventDefault();
                const item = this.actor.items.get(card.dataset.itemCard);
                if (item) this._postItemCard(item);
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

        // Proficiency (and other) displays read the EFFECTIVE value (base + effect
        // `.bonus`), so toggling/editing an ActiveEffect changes what's shown — but
        // effects fire updateActiveEffect, not updateActor. Re-render when an effect
        // on this actor (directly, or transferred from one of its items) changes.
        this._onEffectChange = (effect) => {
            const parent = effect.parent;
            if (parent?.id === this.actor.id || parent?.parent?.id === this.actor.id) this.render();
        };
        Hooks.on("createActiveEffect", this._onEffectChange);
        Hooks.on("updateActiveEffect", this._onEffectChange);
        Hooks.on("deleteActiveEffect", this._onEffectChange);

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
        if (this._onEffectChange) {
            Hooks.off("createActiveEffect", this._onEffectChange);
            Hooks.off("updateActiveEffect", this._onEffectChange);
            Hooks.off("deleteActiveEffect", this._onEffectChange);
            this._onEffectChange = null;
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

        // Re-apply expanded item description cards — the markup was rebuilt by the
        // render, so reattach each open summary (dropping any item that's gone).
        for (const id of [...this._expandedItems]) {
            const li = this.element.querySelector(`.item[data-item-id="${id}"]`);
            if (li) this._expandItemSummary(li, id);
            else this._expandedItems.delete(id);
        }

        // Same for expanded skill cards (dropping any row no longer rendered, e.g.
        // a skill hidden by the trained-only filter).
        for (const token of [...this._expandedSkills]) {
            const [group, key] = token.split(":");
            const toggle = this.element.querySelector(
                `.skill-toggle[data-skill-group="${group}"][data-skill-key="${key}"]`);
            const row = toggle?.closest(".skill-row");
            if (row) this._expandSkillSummary(row, group, key);
            else this._expandedSkills.delete(token);
        }
    }

    // ---- Chat cards --------------------------------------------------------
    // Every die/icon roll posts a card enriched with the icon, description and
    // proficiency tier; non-rollable item images post a description-only card.
    // All public (no whisper) — visible to everyone.

    /** Resolve the enrichHTML implementation across Foundry versions. */
    static _enrich(text, doc) {
        const fn = foundry.applications.ux.TextEditor?.implementation?.enrichHTML
            ?? globalThis.TextEditor?.enrichHTML ?? (s => s);
        // secrets:false — chat is public, never leak GM-only content.
        return fn(text ?? "", { secrets: false, relativeTo: doc });
    }

    /** System asset path for the die icon of a 0–5 proficiency level. */
    static _proficiencyDieImg(prof) {
        const i = Math.max(0, Math.min(5, Math.trunc(Number(prof) || 0)));
        const cls = ["OneValueBorder", "d4", "d6", "d8", "d10", "d12"][i];
        return `systems/wispers/assets/img/${cls}.png`;
    }

    /** "Adept (3)" — localized proficiency tier + level, for card subtitles. */
    static _proficiencyTierText(prof) {
        const i = Math.max(0, Math.min(5, Math.trunc(Number(prof) || 0)));
        const term = game.i18n.localize("CONSTANTS.Proficiency."
            + ["Untrained", "Novice", "Trained", "Adept", "Expert", "Master"][i]);
        return `${term} (${i})`;
    }

    /**
     * Build the shared chat-card HTML (icon + title + subtitle + optional meta and
     * description). Used as the `flavor` of roll messages (the roll result renders
     * below it) and as the full content of description-only item cards.
     */
    _cardFlavor({ imgSrc = null, title = "", subtitle = "", metaHTML = "", descriptionHTML = "" } = {}) {
        const esc = foundry.utils.escapeHTML;
        const icon = imgSrc
            ? `<img class="wispers-chat-icon" src="${imgSrc}" width="40" height="40" alt="" />`
            : "";
        const sub = subtitle ? `<div class="wispers-chat-sub">${esc(subtitle)}</div>` : "";
        const meta = metaHTML ? `<div class="wispers-chat-meta">${metaHTML}</div>` : "";
        const desc = descriptionHTML ? `<div class="wispers-chat-desc">${descriptionHTML}</div>` : "";
        return `<div class="wispers-chat-card">`
            + `<header class="wispers-chat-head">${icon}`
            + `<div class="wispers-chat-titles"><span class="wispers-chat-title">${esc(title)}</span>${sub}</div>`
            + `</header>${meta}${desc}</div>`;
    }

    /** Description text → card body HTML, falling back to a localized "no description". */
    _descBody(html) {
        return (html && html.trim())
            ? html
            : `<span class="wispers-chat-empty">${game.i18n.localize("CONSTANTS.Item.NoDescription")}</span>`;
    }

    /** Post a public, description-only card for a non-rollable item (feature/loot/armor/…). */
    async _postItemCard(item) {
        const html = await WispersCharacterSheet._enrich(item.system?.description, item);
        const content = this._cardFlavor({
            imgSrc: item.img,
            title: item.name,
            descriptionHTML: this._descBody(html)
        });
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), content });
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
        const formula = this._buildRollFormula(parts, config.boonBane, "ability", key);
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
        // Use the effective (base + effect bonus) proficiency for the die and the
        // ≥4 attribute-bonus gate — see prepareDerivedData / effects-conditions.md §3.
        const proficiency = entry.proficiency?.effective ?? entry.proficiency?.value ?? 0;
        const label = meta.label ? game.i18n.localize(meta.label) : key;
        const linkedAttr = meta.linkedAttribute;
        let attributeDie = null;
        if (group === "spellSchools") {
            const attrValue = this.actor.system?.abilities?.[linkedAttr]?.effective
                ?? this.actor.system?.abilities?.[linkedAttr]?.value ?? 0;
            attributeDie = WispersCharacterSheet._attributeDieFormula(attrValue);
        }
        const applyAttrBonus = proficiency >= 4 && group === "spellSchools";
        const scopeMap = { skills: "skill", spellSchools: "school", savingthrows: "save" };
        return this._rollProficiency(label, proficiency, {
            attributeDie,
            applyAttrBonus,
            linkedAttr,
            showDifficulty: group === "skills",
            scope: scopeMap[group] ?? null,
            scopeKey: key,
            description: meta.description ? game.i18n.localize(meta.description) : ""
        });
    }

    async _rollProficiency(label, proficiency, { attributeDie = null, applyAttrBonus = false, linkedAttr = null, showDifficulty = false, scope = null, scopeKey = null, description = "" } = {}) {
        // Untrained rolls (proficiency 0) roll bonus only — "0" passes through the
        // die-shift helpers unchanged, so tier modifiers are a no-op.
        const baseDie = WispersCharacterSheet._proficiencyDieFormula(proficiency) ?? "0";

        const config = await WispersCharacterSheet._showRollDialog(label, { showDifficulty });
        if (config === null) return;

        const attrFlat = applyAttrBonus && linkedAttr
            ? (this.actor.system?.abilities?.[linkedAttr]?.effective ?? this.actor.system?.abilities?.[linkedAttr]?.value ?? 0)
            : 0;

        const dieParts = [baseDie];
        if (attributeDie) dieParts.push(attributeDie);
        if (config.difficultyDie) dieParts.push(config.difficultyDie);
        const formula = this._buildRollFormula(dieParts, config.boonBane, scope, scopeKey, attrFlat);
        const roll = new Roll(formula);
        await roll.evaluate();
        const flavor = this._cardFlavor({
            imgSrc: WispersCharacterSheet._proficiencyDieImg(proficiency),
            title: label,
            subtitle: WispersCharacterSheet._proficiencyTierText(proficiency),
            descriptionHTML: description ? foundry.utils.escapeHTML(description) : ""
        });
        await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor
        });
    }

    /**
     * Resolve the wielder's proficiency (0–5) with a weapon: a specific-slug entry
     * overrides the category, else the category, else 0 (weapons-combat.md §2.1).
     * Reads `.effective` so effects apply.
     */
    _resolveWeaponProficiency(item) {
        const sys = item.system ?? {};
        const profOf = entry => entry?.proficiency?.effective ?? entry?.proficiency?.value ?? 0;
        const slug = sys.slug?.value;
        const specific = this.actor.system?.skills?.weapons?.specific ?? {};
        if (slug && specific[slug]) return profOf(specific[slug]);
        const cat = sys.category?.value;
        const categories = this.actor.system?.skills?.weapons?.categories ?? {};
        if (cat && categories[cat]) return profOf(categories[cat]);
        return 0;
    }

    /**
     * Roll a weapon attack's **threat** (weapon die + resolved proficiency die) and
     * post a chat card. Reuses the shared dialog + lever pipeline (scope "attack",
     * no difficulty die per weapons-combat.md §1.1 step 2). NOTE: this is the
     * roller half only — AP cost and the defender react/wound resolution are the
     * deferred combat-flow phase, so nothing is spent here.
     */
    async _rollWeaponAttack(item) {
        const sys = item.system ?? {};
        const weaponDie = sys.attack?.weaponDie?.value || "0";
        const prof = this._resolveWeaponProficiency(item);
        const profDie = WispersCharacterSheet._proficiencyDieFormula(prof) ?? "0";

        const config = await WispersCharacterSheet._showRollDialog(item.name, { showDifficulty: false });
        if (config === null) return;

        const parts = [weaponDie];
        if (profDie !== "0") parts.push(profDie);
        const formula = this._buildRollFormula(parts, config.boonBane, "attack", null);
        const roll = new Roll(formula);
        await roll.evaluate();

        const saveKey = sys.attack?.targetSave?.value;
        const saveLabel = saveKey
            ? game.i18n.localize(CONFIG.WISPERS?.savingthrows?.[saveKey]?.label ?? saveKey)
            : "";
        const w = sys.attack?.wound ?? {};
        const metaHTML = `${game.i18n.localize("CONSTANTS.Weapon.TargetSave")}: ${foundry.utils.escapeHTML(saveLabel)}`
            + ` · ${game.i18n.localize("CONSTANTS.Weapon.WoundMod")} ${w.light ?? 0}/${w.normal ?? 0}/${w.heavy ?? 0}`;
        const descHTML = await WispersCharacterSheet._enrich(sys.description, item);
        const flavor = this._cardFlavor({
            imgSrc: item.img,
            title: item.name,
            subtitle: `${game.i18n.localize("CONSTANTS.Roll.Threat")} · ${WispersCharacterSheet._proficiencyTierText(prof)}`,
            metaHTML,
            descriptionHTML: this._descBody(descHTML)
        });
        await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor });
    }

    /**
     * Cast a spell: roll the school check (school proficiency die + linked-attribute
     * die, + the attribute value when effective proficiency ≥ 4) = gathered
     * spellpower, then post a chat card with the resulting degree
     * (spellcasting.md §1.1). Reuses the shared dialog + lever pipeline (scope
     * "cast", no difficulty die). NOTE: roller half only — AP cost and the
     * resolution/wound step are the deferred combat-flow phase.
     */
    async _castSpell(item) {
        const sys = item.system ?? {};
        const schoolKey = sys.school?.value;
        const meta = CONFIG.WISPERS?.spellSchools?.[schoolKey];
        const entry = this.actor.system?.skills?.spellSchools?.[schoolKey];
        const prof = entry?.proficiency?.effective ?? entry?.proficiency?.value ?? 0;
        const linkedAttr = meta?.linkedAttribute;
        const attrValue = this.actor.system?.abilities?.[linkedAttr]?.effective
            ?? this.actor.system?.abilities?.[linkedAttr]?.value ?? 0;
        const profDie = WispersCharacterSheet._proficiencyDieFormula(prof) ?? "0";
        const attrDie = WispersCharacterSheet._attributeDieFormula(attrValue);

        const config = await WispersCharacterSheet._showRollDialog(item.name, { showDifficulty: false });
        if (config === null) return;

        const parts = [profDie];
        if (attrDie) parts.push(attrDie);
        const attrFlat = prof >= 4 ? attrValue : 0;
        const formula = this._buildRollFormula(parts, config.boonBane, "cast", null, attrFlat);
        const roll = new Roll(formula);
        await roll.evaluate();

        const degreeKey = WispersCharacterSheet._spellDegree(roll.total, sys.degrees ?? {});
        const degreeLabel = game.i18n.localize(CONFIG.WISPERS?.spellDegrees?.[degreeKey] ?? degreeKey);
        const schoolLabel = meta?.label ? game.i18n.localize(meta.label) : (schoolKey ?? "");
        const metaHTML = `${game.i18n.localize("CONSTANTS.Roll.Spellpower")}: ${roll.total}`
            + ` · ${game.i18n.localize("CONSTANTS.Roll.Degree")}: ${foundry.utils.escapeHTML(degreeLabel)}`;
        const descHTML = await WispersCharacterSheet._enrich(sys.description, item);
        const flavor = this._cardFlavor({
            imgSrc: item.img,
            title: item.name,
            subtitle: `${schoolLabel} · ${WispersCharacterSheet._proficiencyTierText(prof)}`,
            metaHTML,
            descriptionHTML: this._descBody(descHTML)
        });
        await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor });
    }

    /** Highest degree whose authored threshold `total` meets (spellcasting.md §2). */
    static _spellDegree(total, degrees) {
        const order = CONFIG.WISPERS?.spellDegreeOrder
            ?? ["criticalFailure", "failure", "success", "criticalSuccess"];
        let result = order[0];
        for (const key of order) {
            const threshold = degrees?.[key];
            if (typeof threshold === "number" && total >= threshold) result = key;
        }
        return result;
    }

    /**
     * Apply the effect roll-time levers (effects-conditions.md §4.2) to a die pool
     * and join it into a roll formula. Order: tier-shift the primary die →
     * net Boon/Bane (dialog choice + flag boon − flag bane, multi-step) → flat
     * bonuses (the optional attribute bonus plus `flags.wispers.flatBonus.*`).
     * @param {string[]} parts        the die pool (e.g. ["1d8","1d4"])
     * @param {string} boonBaneChoice the dialog's "boon"|"none"|"bane"
     * @param {?string} scope         roll scope ("ability"|"skill"|"save"|"school"|...) or null to skip flags
     * @param {?string} scopeKey      the keyed scope (e.g. "reflex") or null
     * @param {number} extraFlat      a flat bonus to add before flag flatBonus (default 0)
     */
    _buildRollFormula(parts, boonBaneChoice, scope = null, scopeKey = null, extraFlat = 0) {
        const mods = scope
            ? this._collectRollMods(scope, scopeKey)
            : { boon: 0, bane: 0, tierShift: 0, flatBonus: 0 };
        let pool = WispersCharacterSheet._applyTierShift(parts, mods.tierShift);
        const net = WispersCharacterSheet._boonBaneToInt(boonBaneChoice) + mods.boon - mods.bane;
        pool = WispersCharacterSheet._applyBoonBaneNet(pool, net);
        const flat = (extraFlat ?? 0) + (mods.flatBonus ?? 0);
        if (flat !== 0) pool = [...pool, String(flat)];
        return pool.join(" + ");
    }

    /**
     * Sum the `flags.wispers.<lever>.<scope>` accumulators a roll reads: `all` +
     * its general `scope` + its keyed `scope.<key>` (effects-conditions.md §4.1).
     */
    _collectRollMods(scope, scopeKey = null) {
        const flags = this.actor.flags?.wispers ?? {};
        const scopes = ["all", scope];
        if (scopeKey) scopes.push(`${scope}.${scopeKey}`);
        const sum = lever => scopes.reduce((t, sc) => t + (Number(flags?.[lever]?.[sc]) || 0), 0);
        return {
            boon: sum("boon"),
            bane: sum("bane"),
            tierShift: sum("tierShift"),
            flatBonus: sum("flatBonus")
        };
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

    /** "boon" → +1, "bane" → −1, else 0. */
    static _boonBaneToInt(mode) {
        if (mode === "boon") return 1;
        if (mode === "bane") return -1;
        return 0;
    }

    /**
     * Apply Boon/Bane `net` times in its sign's direction (multi-step rule,
     * effects-conditions.md §4.2). Reuses _applyBoonBane so the ladder stays the
     * single source of truth.
     */
    static _applyBoonBaneNet(parts, net) {
        if (!net) return parts;
        const mode = net > 0 ? "boon" : "bane";
        let result = parts;
        for (let i = 0; i < Math.abs(net); i++) {
            result = WispersCharacterSheet._applyBoonBane(result, mode);
        }
        return result;
    }

    /**
     * Shift the pool's primary die (the first ladder die — weapon/attribute/
     * proficiency die both rollers put first) by `steps` tiers, clamped at the
     * ends. Distinct from Boon/Bane (effects-conditions.md §4.1 `tierShift`).
     */
    static _applyTierShift(parts, steps) {
        if (!steps) return parts;
        const tiers = ["1d4", "1d6", "1d8", "1d10", "1d12"];
        let done = false;
        return parts.map(p => {
            if (!done && tiers.includes(p)) {
                done = true;
                const i = tiers.indexOf(p);
                return tiers[Math.max(0, Math.min(tiers.length - 1, i + steps))];
            }
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
        // All 0–5 ladder fields: skills/schools/saves/armor + weapon categories
        // and per-slug specific weapons (weapons-combat.md §3.2, armor-shields.md §4).
        const flatKeyRe = /^system\.skills\.((skills|spellSchools|savingthrows|armor)|weapons\.(categories|specific))\.[^.]+\.proficiency\.value$/;

        // Flat (dot-keyed) shape
        for (const k of Object.keys(submitData)) {
            if (flatKeyRe.test(k)) submitData[k] = clamp(submitData[k]);
        }

        // Expanded (nested) shape
        const clampGroup = set => {
            if (!set || typeof set !== "object") return;
            for (const k of Object.keys(set)) {
                const p = set[k]?.proficiency;
                if (p && typeof p === "object" && "value" in p) p.value = clamp(p.value);
            }
        };
        const skills = submitData?.system?.skills;
        if (skills && typeof skills === "object") {
            for (const group of ["skills", "spellSchools", "savingthrows", "armor"]) {
                clampGroup(skills[group]);
            }
            clampGroup(skills.weapons?.categories);
            clampGroup(skills.weapons?.specific);
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

    static _onToggleAllWeapons(event, target) {
        this._showAllWeapons = !this._showAllWeapons;
        this.render();
    }

    static _onToggleAllArmor(event, target) {
        this._showAllArmor = !this._showAllArmor;
        this.render();
    }

    static async _onAddSkill(event, target) {
        await WispersCharacterSheet._promoteToNovice(this, "skills", "Learn a Skill", "All skills are already trained.");
    }

    static async _onAddSchool(event, target) {
        await WispersCharacterSheet._promoteToNovice(this, "spellSchools", "Learn a Spell School", "All spell schools are already trained.");
    }

    static async _onAddWeapon(event, target) {
        await WispersCharacterSheet._promoteToNovice(this, "weaponCategories", "Learn a Weapon Category", "All weapon categories are already trained.");
    }

    static async _onAddArmor(event, target) {
        await WispersCharacterSheet._promoteToNovice(this, "armorTypes", "Learn an Armor Type", "All armor types are already trained.");
    }

    // `group` is a SKILL_GROUPS token: its config map (CONFIG.WISPERS[g.config])
    // provides labels, its data path (system.<g.path>) the stored proficiencies —
    // the two differ for weapons/armor, so resolve through the map.
    static async _promoteToNovice(app, group, title, allTrainedMessage) {
        const g = WispersCharacterSheet.SKILL_GROUPS[group];
        if (!g) return;
        const data = foundry.utils.getProperty(app.actor.system, g.path) ?? {};
        const meta = CONFIG.WISPERS?.[g.config] ?? {};
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
        await app.actor.update({ [`system.${g.path}.${result}.proficiency.value`]: 1 });
    }

    static async _onCreateItem(event, target) {
        const type = target.dataset.type;
        const featureType = target.dataset.featureType;
        const spellLevel = target.dataset.spellLevel;
        const name = game.i18n.localize("CONSTANTS.Inventory.NewItem");
        const itemData = { name, type };
        // Creation data is NOT run through expandObject (unlike Document#update),
        // so a flat "system.featureType.value" key would be dropped during schema
        // cleaning and the feature would default to "active". Build it nested.
        if (featureType) foundry.utils.setProperty(itemData, "system.featureType.value", featureType);
        // Likewise, a spell created from a level section keeps that level.
        if (spellLevel) foundry.utils.setProperty(itemData, "system.level.value", Number(spellLevel) || 1);
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

    // Clicking an item name expands an inline description "card" beneath the row
    // (pushing the rows below it down); clicking again collapses it. Expansion is
    // pure UI state held in `_expandedItems`; we mutate the DOM directly (no
    // re-render) and re-apply it in _onRender so it survives the hook-driven
    // re-renders that fire on every field change.
    static _onToggleDescription(event, target) {
        event.preventDefault();
        const li = target.closest("[data-item-id]");
        if (!li) return;
        const id = li.dataset.itemId;
        if (this._expandedItems.has(id)) {
            this._expandedItems.delete(id);
            this._collapseItemSummary(li);
        } else {
            this._expandedItems.add(id);
            this._expandItemSummary(li, id);
        }
    }

    _collapseItemSummary(li) {
        li.classList.remove("expanded");
        li.querySelector(":scope > .item-summary")?.remove();
    }

    async _expandItemSummary(li, id) {
        const item = this.actor.items.get(id);
        if (!item) { this._expandedItems.delete(id); return; }
        li.classList.add("expanded");
        let summary = li.querySelector(":scope > .item-summary");
        if (!summary) {
            summary = document.createElement("div");
            summary.className = "item-summary";
            li.appendChild(summary);
        }
        const enrich = foundry.applications.ux.TextEditor?.implementation?.enrichHTML
            ?? globalThis.TextEditor?.enrichHTML ?? (s => s);
        const html = await enrich(item.system?.description ?? "", {
            secrets: item.isOwner,
            relativeTo: item
        });
        // Type-specific "other properties" (the stats not surfaced as list columns).
        const props = this._itemProps(item);
        const esc = foundry.utils.escapeHTML;
        const propsHTML = props.length
            ? `<dl class="item-props">` + props.map(p =>
                `<div class="item-prop-row"><dt>${esc(p.label)}</dt><dd>${esc(String(p.value))}</dd></div>`).join("")
            + `</dl>`
            : "";
        const descBody = (html && html.trim())
            ? html
            : `<span class="item-summary-empty">${game.i18n.localize("CONSTANTS.Item.NoDescription")}</span>`;
        summary.innerHTML = propsHTML + `<div class="item-summary-text">${descBody}</div>`;
    }

    /**
     * Type-specific stats shown in an item's expandable card ("other properties").
     * Proficiency group/tier already appear as list columns, so this is the rest:
     * weapon die/save/AP/range/wound, armor value/covers/req, shield block, uses,
     * spell level/cast/range/duration/components.
     */
    _itemProps(item) {
        const sys = item.system ?? {};
        const L = k => game.i18n.localize(k);
        const saveLabel = k => k ? L(CONFIG.WISPERS?.savingthrows?.[k]?.label ?? k) : "—";
        const covers = set => (set && set.size ? Array.from(set).map(saveLabel).join(", ") : "—");
        const out = [];
        switch (item.type) {
            case "weapon": {
                const a = sys.attack ?? {};
                out.push({ label: L("CONSTANTS.Weapon.WeaponDie"), value: a.weaponDie?.value ?? "—" });
                out.push({ label: L("CONSTANTS.Weapon.TargetSave"), value: saveLabel(a.targetSave?.value) });
                out.push({ label: L("CONSTANTS.Weapon.ApCost"), value: a.apCost?.value ?? 0 });
                out.push({ label: L("CONSTANTS.Weapon.Range"), value: `${sys.range?.value ?? 0} ${sys.range?.units ?? ""}`.trim() });
                out.push({ label: L("CONSTANTS.Weapon.WoundMod"), value: `${a.wound?.light ?? 0}/${a.wound?.normal ?? 0}/${a.wound?.heavy ?? 0}` });
                break;
            }
            case "armor": {
                out.push({ label: L("CONSTANTS.Armor.Value"), value: sys.armorValue?.value ?? 0 });
                out.push({ label: L("CONSTANTS.Armor.Covers"), value: covers(sys.covers) });
                out.push({ label: L("CONSTANTS.Armor.RequiredProficiency"), value: WispersCharacterSheet._proficiencyTierText(sys.requiredProficiency?.value ?? 0) });
                break;
            }
            case "shield": {
                out.push({ label: L("CONSTANTS.Armor.Value"), value: sys.armorValue?.value ?? 0 });
                out.push({ label: L("CONSTANTS.Armor.Covers"), value: covers(sys.covers) });
                out.push({ label: L("CONSTANTS.Weapon.ApCost"), value: sys.block?.apCost ?? 0 });
                break;
            }
            case "consumable": {
                out.push({ label: L("CONSTANTS.Item.Uses"), value: `${sys.uses?.value ?? 0} / ${sys.uses?.max ?? 0}` });
                break;
            }
            case "spell": {
                out.push({ label: L("CONSTANTS.Spell.Level"), value: sys.level?.value ?? 1 });
                out.push({ label: L("CONSTANTS.Spell.CastingTime"), value: sys.castingTime?.value ?? 0 });
                out.push({ label: L("CONSTANTS.Spell.Range"), value: sys.range?.value ?? "—" });
                out.push({ label: L("CONSTANTS.Spell.Duration"), value: sys.duration?.value ?? "—" });
                const comp = [];
                if (sys.components?.verbal) comp.push(L("CONSTANTS.Spell.Verbal"));
                if (sys.components?.somatic) comp.push(L("CONSTANTS.Spell.Somatic"));
                if (sys.components?.material) comp.push(L("CONSTANTS.Spell.Material"));
                out.push({ label: L("CONSTANTS.Spell.Components"), value: comp.length ? comp.join(", ") : "—" });
                break;
            }
        }
        return out;
    }

    // Skills behave like items: clicking the name expands a read-only card with
    // the skill's (shared, config-defined) description and its current proficiency.
    // The description is system metadata in CONFIG.WISPERS, so — unlike item cards
    // — there's no document to read; we localize the config `description` key.
    static _onToggleSkillDescription(event, target) {
        event.preventDefault();
        const row = target.closest(".skill-row");
        if (!row) return;
        const group = target.dataset.skillGroup;
        const key = target.dataset.skillKey;
        const token = `${group}:${key}`;
        if (this._expandedSkills.has(token)) {
            this._expandedSkills.delete(token);
            this._collapseSkillSummary(row);
        } else {
            this._expandedSkills.add(token);
            this._expandSkillSummary(row, group, key);
        }
    }

    _collapseSkillSummary(row) {
        row.classList.remove("expanded");
        row.querySelector(":scope > .skill-summary")?.remove();
    }

    _expandSkillSummary(row, group, key) {
        const g = WispersCharacterSheet.SKILL_GROUPS[group];
        const meta = g ? CONFIG.WISPERS?.[g.config]?.[key] : null;
        if (!meta) return;
        row.classList.add("expanded");
        let summary = row.querySelector(":scope > .skill-summary");
        if (!summary) {
            summary = document.createElement("div");
            summary.className = "skill-summary";
            row.appendChild(summary);
        }
        // Effective (base + effect bonus) proficiency, mirroring the row die.
        const entry = foundry.utils.getProperty(this.actor.system, `${g.path}.${key}`);
        const prof = Math.max(0, Math.min(5,
            entry?.proficiency?.effective ?? entry?.proficiency?.value ?? 0));
        // Mirrors of wispers.js _proficiencyDieClass / PROFICIENCY_TERMS (0–5).
        const dieClass = ["noDie", "d4", "d6", "d8", "d10", "d12"][prof];
        const term = game.i18n.localize("CONSTANTS.Proficiency."
            + ["Untrained", "Novice", "Trained", "Adept", "Expert", "Master"][prof]);
        const profLabel = game.i18n.localize("CONSTANTS.Skills.Proficiency");
        const descKey = meta.description;
        const desc = descKey ? game.i18n.localize(descKey) : "";
        const hasDesc = desc && desc !== descKey;
        const descHTML = hasDesc
            ? foundry.utils.escapeHTML(desc)
            : `<span class="skill-summary-empty">${game.i18n.localize("CONSTANTS.Item.NoDescription")}</span>`;
        summary.innerHTML =
            `<div class="skill-summary-prof">`
            + `<span class="skill-die ${dieClass}"></span>`
            + `<span class="skill-prof-level">${profLabel}: ${term}</span>`
            + `</div>`
            + `<div class="skill-summary-desc">${descHTML}</div>`;
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
