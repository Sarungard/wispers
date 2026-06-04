// Wispers combat / initiative.
//
// Initiative in Wispers is NOT rolled. When prompted, a combatant's controller
// CHOOSES a number. That number is two things at once:
//   1. their place in the turn order (combatants act LOWEST first), and
//   2. their action-point pool for the turn — stored on the actor as
//      `system.initiative.total` (the chosen number) / `.remaining` (AP left).
//
// The number is re-chosen at the END of each of the combatant's turns, so it is
// locked in (and available for reaction spending) before their next turn. The
// previous pool is discarded on reset — picking a new number overwrites AP, it
// does not add to it.
//
// Prompts are driven by exactly one client per combatant (its first active
// player owner, or the GM when no player owns it) so a dialog never appears
// twice. The end-of-turn re-prompt is wired from the `combatTurnChange` hook in
// wispers.js, which fires on every client.

export default class WispersCombat extends Combat {

  /**
   * Order combatants LOWEST initiative first — a low number means you act sooner
   * but bank fewer action points. Combatants without a chosen number sort last.
   * @override
   */
  _sortCombatants(a, b) {
    const ia = (a.initiative ?? null) === null ? Infinity : a.initiative;
    const ib = (b.initiative ?? null) === null ? Infinity : b.initiative;
    return (ia - ib) || (a.id ?? "").localeCompare(b.id ?? "");
  }

  /**
   * Replace the default dice-based initiative with a numeric prompt. Only the
   * user responsible for each combatant is prompted; the rest are skipped (so a
   * GM "Roll All" sets NPC numbers while players pick their own).
   * @override
   */
  async rollInitiative(ids, { updateTurn = true } = {}) {
    ids = typeof ids === "string" ? [ids] : ids;
    const currentId = this.combatant?.id;

    for (const id of ids) {
      const combatant = this.combatants.get(id);
      if (!combatant || !WispersCombat._isResponsibleUser(combatant)) continue;
      await WispersCombat.promptInitiative(combatant);
    }

    // Re-sorting on initiative change can move the active turn's index; keep the
    // pointer on the same combatant.
    if (updateTurn && currentId) {
      const turn = this.turns.findIndex(t => t.id === currentId);
      if (turn >= 0 && turn !== this.turn) await this.update({ turn });
    }
    return this;
  }

  /**
   * Called when a combatant's turn ends (from the `combatTurnChange` hook). The
   * combatant picks the number for their NEXT turn, which resets their AP pool.
   */
  static async onTurnEnd(combatant) {
    if (!combatant || !WispersCombat._isResponsibleUser(combatant)) return;
    await WispersCombat.promptInitiative(combatant);
  }

  /**
   * Prompt this combatant's controller for an initiative/AP number and apply it.
   * @returns {Promise<number|null>} the chosen value, or null if cancelled.
   */
  static async promptInitiative(combatant) {
    const DialogV2 = foundry.applications.api.DialogV2;
    const t = key => game.i18n.localize(`CONSTANTS.Initiative.${key}`);
    const title = game.i18n.format("CONSTANTS.Initiative.PromptTitle", { name: combatant.name });
    const current = combatant.actor?.system?.initiative?.total ?? 0;

    const content = `
      <div class="form-group">
        <label>${t("PromptLabel")}</label>
        <input type="number" name="initiative" value="${current}" step="1" autofocus />
      </div>
      <p class="hint">${t("PromptHint")}</p>`;

    const value = await DialogV2.prompt({
      window: { title },
      content,
      ok: {
        label: t("Confirm"),
        callback: (event, button) => {
          const raw = Number.parseInt(button.form.elements.initiative.value, 10);
          return Number.isFinite(raw) ? raw : null;
        }
      },
      rejectClose: false
    });

    if (value === null || value === undefined) return null;
    await WispersCombat._applyInitiative(combatant, value);
    return value;
  }

  /** Write the chosen number to the combatant (turn order) and the actor (AP). */
  static async _applyInitiative(combatant, value) {
    await combatant.update({ initiative: value });
    // Resets total + remaining; leftover AP from the previous turn is discarded.
    await combatant.actor?.resetInitiative(value);
  }

  /**
   * Decide which single client prompts for a given combatant, so the dialog
   * never opens on two screens at once: the first active player owner if any,
   * otherwise the GM.
   */
  static _isResponsibleUser(combatant) {
    const activeOwners = (combatant.players ?? []).filter(u => u.active);
    if (activeOwners.length) return game.user.id === activeOwners[0].id;
    return game.user.isGM;
  }
}
