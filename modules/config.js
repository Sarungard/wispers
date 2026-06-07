export const WISPERS = {};

WISPERS.ATTRIBUTES = {
}

// Weapon kinds — keys are stored on `system.weaponType.value`, values are
// localization keys rendered by the item sheet's weaponType <select>.
WISPERS.weaponTypes = {
    melee: "CONSTANTS.Weapon.Melee",
    ranged: "CONSTANTS.Weapon.Ranged"
};

// Currency denominations for the item price <select>.
WISPERS.currencies = {
    iron: "CONSTANTS.Coinage.Iron",
    copper: "CONSTANTS.Coinage.Copper",
    silver: "CONSTANTS.Coinage.Silver",
    gold: "CONSTANTS.Coinage.Gold"
};

// Armor weight classes for the armor item sheet's armorType <select>.
// Each entry is `{ label, description }` (localization keys). `label` feeds the
// armor item sheet's type <select> (flattened in WispersItemSheet) and the actor
// armor-proficiency rows; `description` shows in the row's expandable card.
WISPERS.armorTypes = {
    light:  { label: "CONSTANTS.Armor.Light",  description: "CONSTANTS.Armor.LightDesc" },
    medium: { label: "CONSTANTS.Armor.Medium", description: "CONSTANTS.Armor.MediumDesc" },
    heavy:  { label: "CONSTANTS.Armor.Heavy",  description: "CONSTANTS.Armor.HeavyDesc" }
};

// Feature activation kinds — mirrors the Features tab categories.
WISPERS.featureTypes = {
    active: "CONSTANTS.Features.Active",
    passive: "CONSTANTS.Features.Passive",
    reaction: "CONSTANTS.Features.Reaction"
};

// ---------------------------------------------------------------------------
// Actor proficiency/ability metadata.
//
// This is the single source of truth for WHICH abilities, skills, spell schools
// and saving throws exist and their static metadata (display `label` as a
// localization key, and `linkedAttribute`). The actor DataModel derives its
// schema keys from these maps (see modules/data/actor/_helpers.js), and the
// character sheet reads labels/links from here — so stored actor data holds only
// the user's choices (`proficiency.value`, ability `value`/`start`). Editing a
// label or rebalancing a `linkedAttribute` is a one-line change here.
// ---------------------------------------------------------------------------

WISPERS.abilities = {
    str: { label: "CONSTANTS.Attributes.Str.long" },
    agi: { label: "CONSTANTS.Attributes.Agi.long" },
    con: { label: "CONSTANTS.Attributes.Con.long" },
    kno: { label: "CONSTANTS.Attributes.Kno.long" },
    pre: { label: "CONSTANTS.Attributes.Pre.long" },
    spi: { label: "CONSTANTS.Attributes.Spi.long" }
};

// NOTE: the old `combat` skill was removed in the v1 combat migration — weapon
// proficiencies (WISPERS.weaponCategories + per-actor specific slugs) replace it
// entirely. See docs/specs/weapons-combat.md §2.2.
// `description` is an (optional) localization key shown in the skill's expandable
// card on the character sheet. Like `label` it's shared system-wide metadata —
// edit it here + the lang files, never per-actor.
WISPERS.skills = {
    athletics:  { label: "CONSTANTS.Skills.Athletics",  linkedAttribute: "str", description: "CONSTANTS.Skills.AthleticsDesc" },
    stealth:    { label: "CONSTANTS.Skills.Stealth",    linkedAttribute: "agi", description: "CONSTANTS.Skills.StealthDesc" },
    academics:  { label: "CONSTANTS.Skills.Academics",  linkedAttribute: "kno", description: "CONSTANTS.Skills.AcademicsDesc" },
    persuasion: { label: "CONSTANTS.Skills.Persuasion", linkedAttribute: "pre", description: "CONSTANTS.Skills.PersuasionDesc" },
    willpower:  { label: "CONSTANTS.Skills.Willpower",  linkedAttribute: "spi", description: "CONSTANTS.Skills.WillpowerDesc" }
};

// `description` is an (optional) localization key shown in the school's expandable
// card on the character sheet — shared system-wide metadata, like `label`.
WISPERS.spellSchools = {
    arcana:        { label: "CONSTANTS.SpellSchools.Arcana",       linkedAttribute: "pre", description: "CONSTANTS.SpellSchools.ArcanaDesc" },
    elementalism:  { label: "CONSTANTS.SpellSchools.Elementalism", linkedAttribute: "pre", description: "CONSTANTS.SpellSchools.ElementalismDesc" },
    entropy:       { label: "CONSTANTS.SpellSchools.Entropy",      linkedAttribute: "pre", description: "CONSTANTS.SpellSchools.EntropyDesc" },
    sacratropy:    { label: "CONSTANTS.SpellSchools.Sacratrope",   linkedAttribute: "pre", description: "CONSTANTS.SpellSchools.SacratropeDesc" },
    sinistrope:    { label: "CONSTANTS.SpellSchools.Sinistrope",   linkedAttribute: "pre", description: "CONSTANTS.SpellSchools.SinistropeDesc" },
    primalism:     { label: "CONSTANTS.SpellSchools.Primalism",    linkedAttribute: "pre", description: "CONSTANTS.SpellSchools.PrimalismDesc" },
    scriptomancy:  { label: "CONSTANTS.SpellSchools.Scriptomancy", linkedAttribute: "kno", description: "CONSTANTS.SpellSchools.ScriptomancyDesc" },
    "rune-scribe": { label: "CONSTANTS.SpellSchools.RuneScribe",   linkedAttribute: "kno", description: "CONSTANTS.SpellSchools.RuneScribeDesc" }
};

// `description` is an (optional) localization key shown in the save's expandable
// card on the character sheet — shared system-wide metadata, like `label`.
WISPERS.savingthrows = {
    reflex:    { label: "CONSTANTS.SavingThrows.Reflex",    linkedAttribute: "agi", description: "CONSTANTS.SavingThrows.ReflexDesc" },
    toughness: { label: "CONSTANTS.SavingThrows.Toughness", linkedAttribute: "con", description: "CONSTANTS.SavingThrows.ToughnessDesc" },
    resolve:   { label: "CONSTANTS.SavingThrows.Resolve",   linkedAttribute: "spi", description: "CONSTANTS.SavingThrows.ResolveDesc" }
};

// ---------------------------------------------------------------------------
// Combat / spellcasting registries (v1 — see docs/specs/*.md).
// ---------------------------------------------------------------------------

// Fixed weapon categories. Like WISPERS.skills these become schema keys on the
// actor (the weapon category proficiency group, system.skills.weapons.categories)
// AND the choices for weapon.system.category.value. See weapons-combat.md §3.1.
// Each entry is `{ label, description }` (localization keys): `label` feeds the
// weapon item sheet's category <select> (flattened in WispersItemSheet) and the
// actor proficiency rows; `description` shows in the row's expandable card.
WISPERS.weaponCategories = {
    maces:     { label: "CONSTANTS.WeaponCategories.Maces",     description: "CONSTANTS.WeaponCategories.MacesDesc" },
    daggers:   { label: "CONSTANTS.WeaponCategories.Daggers",   description: "CONSTANTS.WeaponCategories.DaggersDesc" },
    axes:      { label: "CONSTANTS.WeaponCategories.Axes",      description: "CONSTANTS.WeaponCategories.AxesDesc" },
    swords:    { label: "CONSTANTS.WeaponCategories.Swords",    description: "CONSTANTS.WeaponCategories.SwordsDesc" },
    bows:      { label: "CONSTANTS.WeaponCategories.Bows",      description: "CONSTANTS.WeaponCategories.BowsDesc" },
    crossbows: { label: "CONSTANTS.WeaponCategories.Crossbows", description: "CONSTANTS.WeaponCategories.CrossbowsDesc" },
    hammers:   { label: "CONSTANTS.WeaponCategories.Hammers",   description: "CONSTANTS.WeaponCategories.HammersDesc" },
    polearms:  { label: "CONSTANTS.WeaponCategories.Polearms",  description: "CONSTANTS.WeaponCategories.PolearmsDesc" }
};

// Registry of weapon/armor property definitions. Properties are keyword-coded;
// the mechanical triggers/effects are realized later by the effects engine
// (effects-conditions.md §7). The registry pins the vocabulary so compendium
// items reference keys, not free strings. Each entry (when authored):
//   key: { label, description, (later) effect/maneuver wiring }
WISPERS.weaponProperties = {};

// The four casting degrees: labels + (documentation of) the global structural
// rule. See spellcasting.md §3. `success` is the spell's static "Spellpower
// requirement" — the minimum gathered spellpower for the effect to resolve.
WISPERS.spellDegrees = {
    criticalFailure: "CONSTANTS.SpellDegrees.CriticalFailure",  // backfire
    failure:         "CONSTANTS.SpellDegrees.Failure",          // fizzle, AP spent
    success:         "CONSTANTS.SpellDegrees.Success",          // normal effect
    criticalSuccess: "CONSTANTS.SpellDegrees.CriticalSuccess"   // scaled effect
};
// Ascending order — the resolver lands gathered spellpower in the highest degree
// whose authored threshold it meets.
WISPERS.spellDegreeOrder = ["criticalFailure", "failure", "success", "criticalSuccess"];

// Roll-time effect scope vocabulary (effects-conditions.md §4.1). A roll gathers
// `all` + its general scope + its keyed scope (e.g. a Reflex save reads
// `all`, `save`, `save.reflex`). Listed here for authoring/validation; the keyed
// variants (`save.<key>` etc.) are formed at read time.
WISPERS.effectScopes = ["all", "attack", "cast", "save", "skill", "school", "ability"];

// Named conditions — populated at `ready` from the conditions compendium
// (effects-conditions.md §5). key -> { uuid }. Empty until the content phase.
WISPERS.conditions = {};

// Severity -> wound RollTable. Values are compendium UUIDs resolved lazily at
// roll time (wound-tables.md §6.1). Filled once the wound-table pack has content.
WISPERS.woundTables = {
    light:  null,
    normal: null,
    heavy:  null
};
