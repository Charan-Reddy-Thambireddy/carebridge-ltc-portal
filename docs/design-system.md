# Beacon design system

Beacon is the small design system that styles CareBridge. It is written in Sass and compiled to plain CSS (`src/CareBridge.Api/Styles` → `wwwroot/css/site.css`).

## Design system vs. component library vs. framework

| | What it is | Example |
|---|---|---|
| **CSS framework** | Generic utilities and a default look you customize | Bootstrap, Tailwind |
| **Component library** | Reusable coded components, often for one tech stack | Angular Material, MUI |
| **Design system** | The *decisions* (tokens, principles, accessibility rules, content guidance) **plus** the components and documentation that implement them, owned and governed across teams | USWDS, GOV.UK Design System, an agency's enterprise design system |

A framework or component library can be one *implementation* of a design system. Beacon is structured that way: **tokens are the source of truth**, components only consume tokens, and each component has a documented accessibility contract. Migrating to an enterprise design system therefore means re-pointing tokens and swapping component markup, not rewriting page logic.

## Layers

```
tokens/      _tokens.scss   color, space, type, radius, motion, breakpoints, target size (Sass maps → CSS custom properties)
             _mixins.scss   breakpoint(), focus-ring, visually-hidden
base/        _base.scss     reset, typography, links, global focus, reduced-motion, forced-colors
layout/      _layout.scss   skip link, header, nav, breadcrumbs, footer, grid
components/  button, form, feedback (error summary, alerts, badges), card, table, tabs, dialog
```

Naming is BEM with a `bcn-` namespace (`.bcn-button--secondary`, `.bcn-tabs__panel`) so Beacon can coexist with Bootstrap or Material during a migration without class collisions.

## Token rules

- Components never use raw hex values; they read `var(--bcn-color-…)`.
- Every text/background pairing is contrast-checked and the ratio is recorded next to the token.
- Spacing uses a 4px-based scale in `rem`; breakpoints use `em` so layouts respond to the user's text size.
- `--bcn-target-size: 2.75rem` (44px) is the minimum for every interactive control.

## Component accessibility contracts

| Component | Contract |
|---|---|
| Button | Native `<button>`; disabled state uses `aria-disabled` so it stays focusable and announced; 44px minimum. |
| Text input | Always a visible `<label>`; hint and error ids are added to `aria-describedby`; `aria-invalid` drives the error style. |
| Radios / checkboxes | Native inputs kept in the DOM (opacity 0) under custom-drawn pseudo-elements; grouped in `fieldset`/`legend`. |
| Error summary | `tabindex="-1"`, receives focus on submit, contains links to each invalid control. |
| Alert | Icon + text; color is reinforcement only; `forced-colors` adds a solid border. |
| Badge | Always contains words; tone also differs by marker shape (circle, diamond, square, ring). |
| Table | `caption`, `th scope`, row headers; sortable headers are `<button>` inside `<th aria-sort>`; wrapper is a labelled focusable region. |
| Tabs | WAI-ARIA tabs pattern; selected state shown by top bar + weight + background. |
| Dialog | Native `<dialog>` + `showModal()`; `aria-labelledby`; close button with an accessible name; focus returned to the trigger. |

## Building

```bash
npm run sass:build   # one-off
npm run sass:watch   # while developing
```
