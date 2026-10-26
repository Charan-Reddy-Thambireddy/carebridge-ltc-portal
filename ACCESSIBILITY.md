# Accessibility conformance notes

**Target:** WCAG 2.1 Level AA (the standard Section 508 incorporates, and the one named in the 2024 DOJ ADA Title II rule for state and local government web content). Selected WCAG 2.2 criteria are also met where noted.

## How it is tested

| Method | Tooling | Where |
|---|---|---|
| Automated rules | axe-core via `@axe-core/playwright`, tags `wcag2a wcag2aa wcag21a wcag21aa` | [`tests/accessibility/a11y.spec.js`](tests/accessibility/a11y.spec.js), runs in CI and fails the build on any violation |
| Automated behavior | Playwright: focus management, keyboard tabs, dialog, error summary, `aria-sort`, live regions, reflow at 320px | same spec |
| Keyboard | Manual pass of every page using Tab, Shift+Tab, Enter, Space, arrow keys and Escape | checklist below |
| Screen readers | JAWS + Chrome, NVDA + Firefox, VoiceOver + Safari (macOS and iOS) | checklist below |
| Visual | Browser zoom to 200% and 400%, Windows High Contrast (forced colors), `prefers-reduced-motion`, text-spacing bookmarklet | checklist below |
| Contrast | Every token pairing computed and annotated in [`_tokens.scss`](src/CareBridge.Api/Styles/tokens/_tokens.scss) | design tokens |

Automated tools find only part of WCAG issues, so the manual checks are a required part of the definition of done, not an optional extra.

## WCAG 2.1 AA criteria and implementation

| SC | Criterion | Implementation |
|---|---|---|
| 1.1.1 | Non-text content | Decorative SVG icons use `aria-hidden="true" focusable="false"`; every icon sits next to visible text. |
| 1.3.1 | Info and relationships | Landmarks, heading hierarchy, `label`/`for`, `fieldset`/`legend`, table `caption`/`scope`/row headers, `dl` for key/value data, hints and errors via `aria-describedby`. |
| 1.3.2 | Meaningful sequence | DOM order matches visual order; no CSS reordering of content. |
| 1.3.5 | Identify input purpose | The screener does not collect personal contact data (name, address, email), so no WCAG input-purpose tokens apply; financial fields use `inputmode="decimal"` to show the right mobile keyboard. Any future personal-data field must use the matching `autocomplete` token. |
| 1.4.1 | Use of color | Links underlined; errors use an icon, bold text and a thicker border; badges use text plus distinct marker shapes; the current nav item has a bar and bold weight. |
| 1.4.3 | Contrast (minimum) | Lowest text pairing is 5.7:1 (success text on its tint); body text 16.6:1. |
| 1.4.4 | Resize text | `rem`/`em` units throughout; breakpoints in `em`; no fixed-height text containers. |
| 1.4.10 | Reflow | Single column at 320px with no horizontal page scroll (tested); wide tables scroll inside a labelled, focusable region. |
| 1.4.11 | Non-text contrast | Input borders 4.7:1, focus ring dark outline + yellow halo, radio/checkbox outlines in ink color. |
| 1.4.12 | Text spacing | No clipped or fixed-height text; tested with the text-spacing bookmarklet. |
| 1.4.13 | Content on hover or focus | No hover-only tooltips or popovers. |
| 2.1.1 | Keyboard | All controls are native `button`, `a`, `input`, `select`; custom radios keep the native input. |
| 2.1.2 | No keyboard trap | The modal `<dialog>` traps focus intentionally and releases it on Escape, Cancel or Close. |
| 2.4.1 | Bypass blocks | "Skip to main content" link targets `<main tabindex="-1">`. |
| 2.4.2 | Page titled | Unique titles; prefixed with `Error:` while a form has errors; the case page title includes the case number. |
| 2.4.3 | Focus order | Focus moves to the error summary on invalid submit, the results heading after screening, the first field when the dialog opens, back to the trigger when it closes, and to the confirmation after a decision. |
| 2.4.4 | Link purpose | Descriptive link text; "Decide" buttons include visually hidden context ("Decide on Respite care"). |
| 2.4.6 | Headings and labels | Questions are written as labels ("How old are you?"); hints explain what to include. |
| 2.4.7 | Focus visible | `:focus-visible` two-tone ring on every interactive element, including custom radios and checkboxes. |
| 2.5.3 | Label in name | Accessible names start with the visible label text. |
| 2.5.8 (2.2) | Target size (minimum) | Interactive targets are at least 44×44px (exceeds 24px). |
| 3.1.1 | Language of page | `<html lang="en">`. |
| 3.2.2 | On input | Filters apply only on the "Apply filters" button, never on select change. |
| 3.2.3 / 3.2.4 | Consistent navigation and identification | Identical header, nav and footer on every page. |
| 3.3.1 | Error identification | Inline message per field plus a summary; `aria-invalid="true"`. |
| 3.3.2 | Labels or instructions | Visible labels, hints, "All questions are required", currency prefix, example values. |
| 3.3.3 | Error suggestion | Messages say how to fix the problem ("Enter 0 if you have none"). |
| 3.3.4 | Error prevention (legal, financial, data) | Authorization decisions require explicit selection, can be cancelled, validate before saving, and reject double submission (HTTP 409). |
| 4.1.2 | Name, role, value | Native elements first; ARIA only for tabs (`tablist`/`tab`/`tabpanel`, `aria-selected`), the menu toggle (`aria-expanded`), sorting (`aria-sort`) and pagination (`aria-current`). |
| 4.1.3 | Status messages | Persistent `aria-live` regions announce result counts, sort changes, loading and saved decisions without moving focus. |

## Manual test script (per release)

**Keyboard only**
1. Load each page and press Tab once: the skip link appears. Press Enter: focus moves to main content.
2. Tab through the whole page: focus is always visible and the order follows the layout.
3. Eligibility: submit empty. Focus lands on "There is a problem"; activating a summary link focuses that field.
4. Queue: sort by each column with Enter/Space; change filters and apply; use pagination.
5. Case detail: arrow keys, Home and End move between tabs; open the dialog, Tab cycles inside it, Escape closes it and focus returns to "Decide".

**Screen reader (JAWS/NVDA)**
1. Insert+F6 / H: the heading outline makes sense. Insert+F7 / D: landmarks are Banner, Main navigation, Breadcrumb, Main, Content info.
2. Form fields announce label, hint, required state and, after an error, the error text.
3. Table navigation (Ctrl+Alt+arrows) announces column headers and the case number as row header; sorted columns announce "sorted ascending/descending".
4. Results, sort changes and saved decisions are announced without moving focus.
5. The masked Medicaid ID reads "ending in 4 8 2 1", not a string of asterisks.

**Visual**
1. Zoom to 200% and 400%: no loss of content or two-dimensional scrolling (except inside the table region).
2. Windows High Contrast themes: controls, focus and selected tab remain distinguishable.
3. OS "reduce motion" on: the loading spinner and transitions stop.
