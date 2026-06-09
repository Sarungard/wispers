# Combat & initiative — `modules/combat/`

`WispersCombat` (`modules/combat/wispersCombat.js`), registered as `CONFIG.Combat.documentClass` in `wispers.js`.

Initiative is **not rolled** — it's a number the controller *chooses*, and that number is two things at once: the combatant's place in the turn order **and** their action-point pool for the turn. `WispersCombat` overrides:

- **`_sortCombatants`** — orders **lowest initiative first** (the reverse of Foundry's default). A low number means you act sooner but bank fewer action points; unset initiative sorts last. This is a deliberate tradeoff mechanic, not a bug — don't "fix" it to descending.
- **`rollInitiative`** — replaces the dice flow with `promptInitiative` (a `DialogV2` number input). The chosen value is written to `combatant.initiative` (turn order) **and** the actor's `system.initiative.{total, remaining}` (AP pool) via `actor.resetInitiative(value)`.

**AP lives on the actor** in `system.initiative.total` (the chosen number / AP cap) and `.remaining` (live pool) — these fields predate this system in the actor schema (`modules/data/actor/_helpers.js`). `wispersActor.resetInitiative(value)` sets both (discarding any leftover AP — picking a new number *overwrites*, never adds); `wispersActor.spendActionPoints(cost)` is the spend primitive. **Per-action AP costs are not yet wired** — nothing calls `spendActionPoints` yet (see `TODO.md`).

**Re-prompt cadence is end-of-turn, not start.** A combatant re-chooses their number the moment their turn *ends*, so it's locked in and available for **reaction** spending before their next turn begins. This is driven by the `combatTurnChange` hook in `wispers.js` (fires on every client) → `WispersCombat.onTurnEnd(endedCombatant)`. The first turn's numbers come from `rollInitiative` at combat start.

**Exactly one client prompts per combatant** — `_isResponsibleUser` returns the first *active player owner*, or the GM when no player owns it. Both `rollInitiative` and the `combatTurnChange` handler gate on it, so a GM "Roll All" sets only NPC numbers (players pick their own) and the end-of-turn dialog never opens on two screens. Consequence: a GM "Roll All" intentionally **skips** combatants an active player owns.

The character-sheet header shows AP read-only (`system.initiative.remaining / .total`); the `updateActor` hook in the sheet re-renders it when AP changes (see `modules/sheets/CLAUDE.md`).
