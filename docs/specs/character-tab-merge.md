# Spec: Merge "Character Details" + "Biography" into one tab

> **Status:** **Implemented** (per the §1.1 defaults; open questions §9 resolved
> with the proposed answers — identity strings nested under `details`, personality
> kept as plain-string textareas, inline `<prose-mirror>` editors, drop list
> applied). Merges the character sheet's two
> least-populated tabs (`character` / `attributes.hbs` and `biography` /
> `biography.hbs`) into a single **"Character"** tab, and reconciles the data
> model gaps the merge exposes (placeholder inputs that save nothing, and
> template fields with no schema slot). References: `modules/sheets/CLAUDE.md`
> (tab wiring, `_prepareContext`, preload), `modules/data/CLAUDE.md` (the
> `details` block, "add a field" recipe), repo-root `CLAUDE.md` (v13 API,
> localization). **[USER]** = decided by the project owner; **[ASSUMED]** =
> inference to confirm. Targets the v13 ApplicationV2 / DataModel architecture.

## 1. Summary

Today the sheet has **seven** primary tabs. Two of them are thin and overlap
conceptually:

- **`character`** (`templates/partials/character/attributes.hbs`) — a 12-cell,
  two-column "Character Details" grid. **Only 3 cells persist** (`age`,
  `height`, `weight`); the other 9 are unbound `<input>`s with hard-coded
  English labels that save nothing.
- **`biography`** (`templates/partials/character/biography.hbs`) — 5 textareas
  (Appearance, Traits, Ideals, Bonds, Flaws) bound to
  `system.details.{appearance,trait,ideal,bond,flaw}` — **none of which exist in
  the schema**, so they are silently dropped on save.

Meanwhile the schema already defines `details.biography` (HTMLField) and
`details.notes` (HTMLField) that are **rendered nowhere** (`biography` is merely
enriched into a `biographyHTML` context var that no template consumes).

**The merge** collapses these into one **"Character"** tab (keeping the existing
`data-tab="character"` slot and its `fa-book-open-cover` icon), laid out as a
**Character Details grid on top, prose/biography sections below**. The work is
as much data-model reconciliation as it is a layout change.

### 1.1 Decisions captured (this session)

| Topic | Decision | Source |
|---|---|---|
| Merged tab name + icon | **"Character"**, `fa-solid fa-book-open-cover` (drop the Biography tab + its `fa-book` icon) | [USER] |
| Layout | Details grid on top, prose/personality sections stacked below, under section dividers | [USER] |
| The 9 unbound identity fields | **Add a curated subset** to the schema; drop the rest (see §3) | [USER] |
| Prose fields | Add a **Biography** rich-text editor **and** a **Notes** rich-text editor; **keep** the Appearance/Traits/Ideals/Bonds/Flaws textareas (and finally give them schema slots) | [USER] |

## 2. Target layout

Single scroll container (the `.tab.active` is already the scroller — see
`less/character-sheet.less`). Three stacked sections under `.subMain` dividers,
reusing the existing `attributes.hbs` markup vocabulary (`.character-fields`,
`.character-input-half-width`, `.character-input-label`, `.character-input-box`)
and the `biography.hbs` vocabulary (`.characteristics.flexcol`):

```
┌──────────────────── Character Details ────────────────────┐
  Race        [______]      Background   [______]
  Homeregion  [______]      Alignment    [______]
  Age         [__]          Height       [______]
  Weight      [______]
┌────────────────────── Personality ────────────────────────┐   (was "Biography")
  Appearance  [__________________________________________]
  Traits      [__________________________________________]
  Ideals      [__________________________________________]
  Bonds       [__________________________________________]
  Flaws       [__________________________________________]
┌──────────────────────── Biography ────────────────────────┐
  <prose-mirror, rich text>  ← system.details.biography
┌────────────────────────── Notes ──────────────────────────┐
  <prose-mirror, rich text>  ← system.details.notes
```

Section headers use the existing divider pattern from `attributes.hbs` lines
3–7 (`.form-group.subMain` → `.menu-hr-container > hr.menu-hr` + a
`.section-label`). **[ASSUMED]** the `Personality` heading replaces what was the
"Biography" tab title; the long-form prose editor below it takes the
"Biography" name. Confirm the two heading names.

## 3. Identity fields — curated subset **[USER]**

The 9 unbound inputs and their disposition. **Persist** = add a schema slot +
bind the input + localize the label. **Drop** = remove the input.

| Input | Disposition | Rationale |
|---|---|---|
| Race | **Persist** | core identity |
| Background | **Persist** | core identity |
| Alignment | **Persist** | core identity |
| Homeregion | **Persist** | core identity |
| Title | Drop | flavor; reintroduce later if needed |
| Nickname | Drop | flavor |
| Family | Drop | flavor |
| Eye Color | Drop | folds into the Appearance prose field |
| Hair Color | Drop | folds into the Appearance prose field |

`age` / `height` / `weight` are **already** bound and stay.

### 3.1 Naming collision to resolve **[ASSUMED]**

`CharacterData` already declares **top-level** fields that clash by name with two
of the persisted identity inputs, but with *different meaning*:

- `system.race` is a **`NumberField`** (placeholder, `initial: 0`) — **not** a
  race-name string (`modules/data/actor/character.js:27`).
- `system.background` is a **`SchemaField`** of two numbers
  (`socialBackground`, `culturalBackground`) — **not** a background-name string
  (`character.js:32`).

The new identity strings must therefore live under **`system.details.*`**
(distinct paths) to avoid colliding with these existing numeric fields. Proposed
slots (all `StringField`, `initial: ""`):

```
system.details.race          // string name, distinct from numeric system.race
system.details.background     // string name, distinct from system.background.{social,cultural}
system.details.alignment
system.details.homeRegion
```

**Confirm:** are the existing numeric `system.race` / `system.background` live
elsewhere, or dead placeholders we should fold/rename? If dead, a cleaner future
pass would repurpose `system.race` as the string and delete this duplication —
but that is **out of scope** here unless you say otherwise.

## 4. Data model changes (`modules/data/actor/character.js`)

Extend the `details` SchemaField (currently `age`/`height`/`weight`/`biography`/
`notes`, lines 36–42) with the curated identity strings **and** the five
personality strings the biography template already references:

```js
details: new fields.SchemaField({
    // existing
    age:    new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true, min: 0 }),
    height: new fields.StringField({ initial: "" }),
    weight: new fields.StringField({ initial: "" }),
    biography: new fields.HTMLField({ initial: "" }),
    notes:     new fields.HTMLField({ initial: "" }),
    // NEW — curated identity (§3)
    race:       new fields.StringField({ initial: "" }),
    background: new fields.StringField({ initial: "" }),
    alignment:  new fields.StringField({ initial: "" }),
    homeRegion: new fields.StringField({ initial: "" }),
    // NEW — personality (already bound in biography.hbs, never had a slot)
    appearance: new fields.StringField({ initial: "" }),
    trait:      new fields.StringField({ initial: "" }),
    ideal:      new fields.StringField({ initial: "" }),
    bond:       new fields.StringField({ initial: "" }),
    flaw:       new fields.StringField({ initial: "" })
})
```

**[ASSUMED]** personality fields are plain `StringField` (multi-line textareas),
not `HTMLField` — they were `<textarea>`s, not rich editors. Confirm if you want
them rich-text instead.

No `_prepareSubmitData` change needed — that method only clamps the 0–5
proficiency ladder fields; strings/HTML pass through untouched.

## 5. Template changes

### 5.1 The merged partial

Fold both tabs' content into a single partial rendered by the `character` tab.
Recommended: **keep `attributes.hbs` as the merged partial** (it is already the
`character` tab's body and already preloaded) and **move `biography.hbs`'s
content into it**, then delete the standalone `biography.hbs`.

`attributes.hbs` becomes three `.subMain`-divided sections (§2):

1. **Character Details** grid — existing `.character-fields` grid, but:
   - bind the 4 new identity inputs:
     `name="system.details.race"` etc., with `value="{{system.details.race}}"`;
   - remove the 5 dropped inputs (Title/Nickname/Family/Eye/Hair);
   - replace hard-coded English labels with `{{localize "CONSTANTS.Character.*"}}`
     (§7) — the repo convention is localized labels in both lang files.
2. **Personality** — the 5 textareas moved verbatim from `biography.hbs`
   (they already bind to `system.details.{appearance,trait,ideal,bond,flaw}`,
   which now have schema slots).
3. **Biography** + **Notes** — two rich-text editors (§5.2).

### 5.2 Rich-text editors (v13)

Use the v13 ProseMirror custom element (editable, integrates with
`submitOnChange` form submission automatically — no legacy `{{editor}}` helper,
which is the v1 API):

```hbs
<prose-mirror name="system.details.biography" value="{{system.details.biography}}">
    {{{biographyHTML}}}
</prose-mirror>
<prose-mirror name="system.details.notes" value="{{system.details.notes}}">
    {{{notesHTML}}}
</prose-mirror>
```

`biographyHTML` is **already** built in `_prepareContext`
(`wispersCharacterSheet.js:200`). Add a sibling `notesHTML` enriched the same way
(§6). **[ASSUMED]** `<prose-mirror>` is the desired editor; the alternative is a
read-only enriched `<div>` + an edit affordance. ProseMirror inline-editing is
the modern default and matches "Add a … editor."

### 5.3 Tab nav + content (`templates/sheets/character/body.hbs`)

- **Remove** the Biography nav link (lines 44–46) and its content `<div>`
  (lines 68–70).
- **Keep** the `character` nav link (lines 26–28) and its content `<div>`
  (lines 50–52) unchanged — it still includes `attributes.hbs`, now the merged
  partial.
- Net: 7 tabs → **6 tabs**. No change to `_onRender` tab binding or
  `this._activeTab` (initial is still `"character"`).

## 6. Sheet logic (`modules/sheets/wispersCharacterSheet.js`)

- In `_prepareContext`, add `notesHTML` next to the existing `biographyHTML`
  (mirror lines 197–203), enriching `actor.system?.details?.notes`, and expose
  it in the returned context (near line 302).
- No tab/`PARTS`/`DEFAULT_OPTIONS`/action-map changes — the merge is template +
  schema only. The `actions` map and roll dispatch are untouched.

## 7. Localization (`lang/en.json` **and** `lang/hu.json`)

Existing `CONSTANTS.Tabs.Biography` becomes unused as a **tab** label — keep it
(reuse as the "Biography" *section* heading) or remove it; **[ASSUMED]** keep.

Add `CONSTANTS.Character.*` keys for the now-localized identity + section
labels (Appearance/Traits/Ideals/Bonds/Flaws already exist under
`CONSTANTS.Character.*`):

```
CONSTANTS.Character.Race, .Background, .Alignment, .Homeregion,
CONSTANTS.Character.Age, .Height, .Weight,
CONSTANTS.Character.SectionDetails      // "Character Details" divider
CONSTANTS.Character.SectionPersonality  // "Personality" divider
CONSTANTS.Character.SectionBiography     // "Biography" divider
CONSTANTS.Character.SectionNotes         // "Notes" divider
```

Add to **both** language files (repo rule). Hungarian translations needed for
each new key.

## 8. Styling (`less/`)

- `biography.less` / the `.biography-tab` rules (if any) can be retired or
  renamed to `.personality`; the textareas now live inside the `character` tab.
- `attributes.hbs`'s `.character-fields` grid styling is unchanged.
- The merged tab is taller — verify it scrolls inside `.tab.active`
  (`overflow-y: auto`, already set) and respects the `.window-content`
  `min-height` set in the recent minimize fix. Recompile `wispers.css` via
  `lessc less/wispers.less wispers.css` after any LESS edit.

## 9. Open questions / to confirm

1. **§3.1 collision** — are numeric `system.race` / `system.background` live
   anywhere, or dead placeholders? Decides whether we nest identity strings under
   `details` (proposed) or repurpose the top-level fields.
2. **§2 headings** — confirm the three section names ("Character Details",
   "Personality", "Biography") and that the long-form editor is "Biography"
   while the 5 textareas are "Personality".
3. **§4** — personality fields as plain `StringField` textareas (proposed) or
   rich `HTMLField`?
4. **§5.2** — inline `<prose-mirror>` editors (proposed) vs read-only enriched
   display + edit button.
5. **Drop list (§3)** — OK to drop Title/Nickname/Family/Eye/Hair entirely, or
   should any be persisted instead of folded into Appearance?
6. **Migration** — existing characters have no data in the new fields (all
   default to `""`); no data migration is required. Confirm there are no
   pre-existing actors relying on the old (non-persisting) biography inputs —
   there can't be, since they never saved.

## 10. Implementation checklist

- [x] `character.js` — extend `details` schema with 4 identity + 5 personality
      fields (§4).
- [x] `attributes.hbs` — rebuild as 3 sections: bound+localized details grid,
      personality textareas, biography + notes `<prose-mirror>` (§5.1–5.2).
- [x] Delete `biography.hbs`; remove its preload entry in `wispers.js`
      and its `body.hbs` nav link + content div (§5.3).
- [x] `wispersCharacterSheet.js` — add `notesHTML` to `_prepareContext` (§6).
- [x] `lang/en.json` + `lang/hu.json` — add `CONSTANTS.Character.*` keys (§7).
- [x] `less/` — retire `.biography-tab` styles; recompile `wispers.css` (§8).
- [ ] Verify in Foundry: details persist on reload; personality textareas now
      save; biography + notes editors save rich text; tab count is 6; minimize
      still works; active-tab persistence intact. **(manual — pending)**

## 11. Touched / affected files (for the implementer)

| File | Change |
|---|---|
| `modules/data/actor/character.js` | +9 fields in `details` (§4) |
| `templates/partials/character/attributes.hbs` | rebuilt as merged 3-section partial (§5.1) |
| `templates/partials/character/biography.hbs` | **deleted** (content folded in) |
| `templates/sheets/character/body.hbs` | remove Biography nav link + content div (§5.3) |
| `wispers.js` | remove `biography.hbs` from preload list |
| `modules/sheets/wispersCharacterSheet.js` | add `notesHTML` to `_prepareContext` (§6) |
| `lang/en.json`, `lang/hu.json` | new `CONSTANTS.Character.*` keys (§7) |
| `less/character-sheet.less` (or `biography`-related LESS) | retire/rename `.biography-tab`; recompile `wispers.css` (§8) |
