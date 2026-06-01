import { WISPERS } from "./modules/config.js";
import wispersActor from "./modules/objects/wispersActor.js";
import WispersItem from "./modules/objects/wispersItem.js";
import wispersCharacterSheet from "./modules/sheets/wispersCharacterSheet.js";
import WispersItemSheet from "./modules/sheets/wispersItemSheet.js";
import WeaponData from "./modules/data/item/weapon.js";
import ArmorData from "./modules/data/item/armor.js";
import ShieldData from "./modules/data/item/shield.js";
import SpellData from "./modules/data/item/spell.js";
import ConsumableData from "./modules/data/item/consumable.js";
import LootData from "./modules/data/item/loot.js";
import FeatureData from "./modules/data/item/feature.js";

Hooks.once("init", async () => {
  console.log("WISPERS | Initalizing Wispers Core System");

  // Setting up the Global Configuration Object
  CONFIG.WISPERS = WISPERS;
  CONFIG.INIT = true;
  CONFIG.Actor.documentClass = wispersActor;
  CONFIG.Item.documentClass = WispersItem;

  // Item data schemas (DataModels). Each registered type uses its DataModel
  // instead of its template.json field block. Types without an entry here still
  // fall back to template.json.
  CONFIG.Item.dataModels = {
    ...(CONFIG.Item.dataModels ?? {}),
    weapon: WeaponData,
    armor: ArmorData,
    shield: ShieldData,
    spell: SpellData,
    consumable: ConsumableData,
    loot: LootData,
    feature: FeatureData,
  };

  // Register custom Sheets and unregister the core defaults.
  const DocumentSheetConfig = foundry.applications.apps.DocumentSheetConfig;
  DocumentSheetConfig.unregisterSheet(
    Actor,
    "core",
    foundry.appv1.sheets.ActorSheet,
  );
  DocumentSheetConfig.registerSheet(Actor, "wispers", wispersCharacterSheet, {
    makeDefault: true,
    label: "Default Wispers Character Sheet",
  });
  DocumentSheetConfig.unregisterSheet(
    Item,
    "core",
    foundry.appv1.sheets.ItemSheet,
  );
  DocumentSheetConfig.registerSheet(Item, "wispers", WispersItemSheet, {
    makeDefault: true,
    label: "Default Wispers Item Sheet",
  });

  // Load all Partial-Handlebar Files
  preloadHandlebarsTemplates();

  // Register Additional Handelbar Helpers
  // registerHandelbarsHelpers();
});

Hooks.once("ready", async () => {
  // Finished Initalization Phase and release lock
  CONFIG.INIT = false;

  // Only execute when run as Gamemaster
  if (!game.user.isGM) {
    return;
  }
});

function preloadHandlebarsTemplates() {
  const templatePaths = [
    "systems/wispers/templates/partials/character/attributes.hbs",
    "systems/wispers/templates/partials/character/biography.hbs",
    "systems/wispers/templates/partials/character/effects.hbs",
    "systems/wispers/templates/partials/character/features.hbs",
    "systems/wispers/templates/partials/character/inventory.hbs",
    "systems/wispers/templates/partials/character/spellbook.hbs",
    "systems/wispers/templates/actors/partials/coinage.hbs",
    "systems/wispers/templates/actors/partials/inventory-header.hbs",
    "systems/wispers/templates/actors/partials/inventory.hbs",
    "systems/wispers/templates/sheets/item/header.hbs",
    "systems/wispers/templates/sheets/item/body.hbs",
    "systems/wispers/templates/sheets/item/types/weapon.hbs",
    "systems/wispers/templates/sheets/item/types/armor.hbs",
    "systems/wispers/templates/sheets/item/types/shield.hbs",
    "systems/wispers/templates/sheets/item/types/spell.hbs",
    "systems/wispers/templates/sheets/item/types/consumable.hbs",
    "systems/wispers/templates/sheets/item/types/feature.hbs",
  ];

  return foundry.applications.handlebars.loadTemplates(templatePaths);
}

/* -------------------------------------------- */
/*  Handlebars Helpers                          */
/* -------------------------------------------- */

function _attributeDieClass(attributeValue) {
  switch (attributeValue) {
    case 0:
      return "noDie";
    case 1:
    case 2:
    case 3:
    case 4:
      return "d4";
    case 5:
    case 6:
      return "d6";
    case 7:
    case 8:
      return "d8";
    case 9:
    case 10:
      return "d10";
    default:
      return "d12";
  }
}

function _proficiencyDieClass(attributeValue) {
  switch (attributeValue) {
    case 0:
      return "noDie";
    case 1:
      return "d4";
    case 2:
      return "d6";
    case 3:
      return "d8";
    case 4:
      return "d10";
    case 5:
      return "d12";
    default:
      throw new Error(`Invalid proficiency level: ${attributeValue}`);
  }
}

// If you need to add Handlebars helpers, here is a useful example:
Handlebars.registerHelper("toLowerCase", function (str) {
  return str.toLowerCase();
});

Handlebars.registerHelper("log", function (message) {
  console.log(message);
});

Handlebars.registerHelper("attributeDie", function (value) {
  return _attributeDieClass(value);
});
Handlebars.registerHelper("proficiencyDie", function (value) {
  return _proficiencyDieClass(value);
});
Handlebars.registerHelper("proficiencyPips", function (value) {
  return [1, 2, 3, 4, 5].map(i => ({ level: i, active: i <= value }));
});
/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once("ready", function () {
  // Wait to register hotbar drop hook on ready so that modules could register earlier if they want to
  Hooks.on("hotbarDrop", (bar, data, slot) => createItemMacro(data, slot));
});

/* -------------------------------------------- */
/*  Hotbar Macros                               */
/* -------------------------------------------- */

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
async function createItemMacro(data, slot) {
  // First, determine if this is a valid owned item.
  if (data.type !== "Item") return;
  if (!data.uuid.includes("Actor.") && !data.uuid.includes("Token.")) {
    return ui.notifications.warn(
      "You can only create macro buttons for owned Items",
    );
  }
  // If it is, retrieve it based on the uuid.
  const item = await Item.fromDropData(data);

  // Create the macro command using the uuid.
  const command = `game.wisperssystem.rollItemMacro("${data.uuid}");`;
  let macro = game.macros.find(
    (m) => m.name === item.name && m.command === command,
  );
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: "script",
      img: item.img,
      command: command,
      flags: { "wispers-system.itemMacro": true },
    });
  }
  game.user.assignHotbarMacro(macro, slot);
  return false;
}

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {string} itemUuid
 */
function rollItemMacro(itemUuid) {
  // Reconstruct the drop data so that we can load the item.
  const dropData = {
    type: "Item",
    uuid: itemUuid,
  };
  // Load the item from the uuid.
  Item.fromDropData(dropData).then((item) => {
    // Determine if the item loaded and if it's an owned item.
    if (!item?.parent) {
      const itemName = item?.name ?? itemUuid;
      return ui.notifications.warn(
        `Could not find item ${itemName}. You may need to delete and recreate this macro.`,
      );
    }

    // Trigger the item roll
    item.roll();
  });
}

/* -------------------------------------------- */
/*  General Functions                           */
/* -------------------------------------------- */
