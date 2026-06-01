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
WISPERS.armorTypes = {
    light: "CONSTANTS.Armor.Light",
    medium: "CONSTANTS.Armor.Medium",
    heavy: "CONSTANTS.Armor.Heavy"
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

WISPERS.skills = {
    combat:     { label: "CONSTANTS.Skills.Combat",     linkedAttribute: "str" },
    athletics:  { label: "CONSTANTS.Skills.Athletics",  linkedAttribute: "str" },
    stealth:    { label: "CONSTANTS.Skills.Stealth",    linkedAttribute: "agi" },
    academics:  { label: "CONSTANTS.Skills.Academics",  linkedAttribute: "kno" },
    persuasion: { label: "CONSTANTS.Skills.Persuasion", linkedAttribute: "pre" },
    willpower:  { label: "CONSTANTS.Skills.Willpower",  linkedAttribute: "spi" }
};

WISPERS.spellSchools = {
    arcana:        { label: "CONSTANTS.SpellSchools.Arcana",       linkedAttribute: "pre" },
    elementalism:  { label: "CONSTANTS.SpellSchools.Elementalism", linkedAttribute: "pre" },
    entropy:       { label: "CONSTANTS.SpellSchools.Entropy",      linkedAttribute: "pre" },
    sacratropy:    { label: "CONSTANTS.SpellSchools.Sacratrope",   linkedAttribute: "pre" },
    sinistrope:    { label: "CONSTANTS.SpellSchools.Sinistrope",   linkedAttribute: "pre" },
    primalism:     { label: "CONSTANTS.SpellSchools.Primalism",    linkedAttribute: "pre" },
    scriptomancy:  { label: "CONSTANTS.SpellSchools.Scriptomancy", linkedAttribute: "kno" },
    "rune-scribe": { label: "CONSTANTS.SpellSchools.RuneScribe",   linkedAttribute: "kno" }
};

WISPERS.savingthrows = {
    reflex:    { label: "CONSTANTS.SavingThrows.Reflex",    linkedAttribute: "agi" },
    toughness: { label: "CONSTANTS.SavingThrows.Toughness", linkedAttribute: "con" },
    resolve:   { label: "CONSTANTS.SavingThrows.Resolve",   linkedAttribute: "spi" }
};
