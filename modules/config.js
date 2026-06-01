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
