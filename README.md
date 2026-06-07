# Wispers

A custom game system for [FoundryVTT v13](https://foundryvtt.com/) — a d20-style RPG built
around dice-tier proficiencies, spell schools, saving throws, and a distinctive
**threat → react → wound** combat model (no hit points, no to-hit roll).

> **Status:** v0.0.1, active early development. The data layer (actor/item schemas), the effects
> engine (base→effective derived data + roll-time levers), and the roll/chat-card half of attacks
> and spellcasting are implemented. The defender react → wound resolution loop and the compendium
> content are still in progress — see [`TODO.md`](TODO.md).

## Core concepts

- **Six attributes** (Strength, Agility, Constitution, Knowledge, Presence, Spirit), stored as
  open-ended integers and displayed as dice tiers (`d4`…`d12`).
- **Proficiencies on a 0–5 ladder** (`d4`…`d12`) for skills, spell schools, saving throws, weapon
  categories, per-weapon specifics, and armor types.
- **Boon / Bane** is the advantage mechanic (shift one die a tier); an optional **difficulty die**
  is added to the pool on non-combat checks.
- **Action Points (AP)** double as initiative: the number you pick is both your place in the turn
  order (lower acts first) and your AP pool for the turn (see the combat module).
- **Threat → react → wound:** an attack or damaging spell produces a *threat value*; the defender
  may spend AP to react with a save (and shields/armor adjust wound thresholds); whatever threat
  survives becomes a wound of some severity, resolved on a wound table.

## Build & deploy

- **LESS:** `less/wispers.less` is the entry point (it `@import`s all partials) and compiles to
  `wispers.css` at the repo root. There is no npm/build tool — compile with an IDE LESS plugin or
  the LESS CLI.
- **Deploy:** see `.vscode/tasks.json` for the default build task — a recursive copy into the local
  FoundryVTT `systems/` folder. Reload Foundry in the browser afterward.
- There are no automated tests or linter.

## Architecture

The system targets the modern **v13 ApplicationV2 / DataModel** API. The authoritative architecture
and conventions live in [`CLAUDE.md`](CLAUDE.md); finalized design specs are in
[`docs/specs/`](docs/specs/); mutable project state and known scaffolding are in
[`TODO.md`](TODO.md).

- **`wispers.js`** — the sole ES-module entry: registers document classes, every actor/item
  DataModel, the custom sheets, Handlebars helpers/partials, and the combat hooks.
- **`modules/data/`** — `TypeDataModel` schemas for actors and items (shared field groups in
  `_helpers.js`).
- **`modules/objects/`** — `wispersActor` (derived data, AP) and `WispersItem`.
- **`modules/sheets/`** — the character and item ApplicationV2 sheets (roll pipeline, dialogs).
- **`modules/combat/`** — the AP-as-initiative combat tracker.
- **`modules/config.js`** — `CONFIG.WISPERS`: the single source of truth for which
  abilities/skills/schools/saves/weapon-categories exist and their metadata.

## License

See [`LICENSE.txt`](LICENSE.txt).
