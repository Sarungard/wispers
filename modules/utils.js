/**
 * Install a capture-phase `change` listener that resolves relative numeric
 * expressions typed into number inputs into absolute values.
 *
 * Typing `+2` adds 2 to the field's current stored value; `-5` subtracts 5.
 * A plain number (no leading sign) is left untouched and sets the value
 * absolutely. The listener runs in the capture phase so the rewritten
 * `input.value` is in place before Foundry's bubble-phase `submitOnChange`
 * handler reads the form.
 *
 * Applies to any `<input data-dtype="Number">` whose `name` is a data path on
 * the bound document (e.g. `system.quantity.value`).
 *
 * @param {HTMLElement} root  The sheet's root element.
 * @param {foundry.abstract.Document} doc  The document the inputs bind to.
 */
export function installRelativeNumberInputs(root, doc) {
    root.addEventListener("change", ev => {
        const input = ev.target;
        if (input.tagName !== "INPUT" || input.dataset.dtype !== "Number") return;
        const raw = input.value.trim();
        if (!/^[+-]\d/.test(raw)) return;
        const delta = Number(raw);
        if (Number.isNaN(delta)) return;
        const current = Number(foundry.utils.getProperty(doc, input.name)) || 0;
        input.value = current + delta;
    }, { capture: true });
}
