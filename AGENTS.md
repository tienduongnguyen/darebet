# Next.js and Tailwind CSS Development Rules

## Codebase Orientation (read the map first)
* The project structure, every folder's role, all API routes, and conventions are documented in `codebase-map.md`. **Read that file first** to orient — it replaces broad "get familiar with the codebase" scanning.
* Prefer the map over globbing/grepping the whole tree just to understand the layout. But targeted exploration is still expected and encouraged: grep to find every caller of a symbol you're changing, read a file in depth before editing it, or trace a bug wherever it leads.
* The map is a summary, not a substitute for reading the actual files you must edit.
* Treat reality as the source of truth: if what you find contradicts the map, trust the code and update `codebase-map.md` as part of your change.

## Core Principles
* Always read modern framework documentation before major implementation. Training cutoffs can miss recent architecture shifts.
* Prioritize native Tailwind CSS utilities over custom vanilla CSS or inline style objects.
* Build responsive interfaces using a mobile-first approach.

## Next.js Rules
* Use Next.js App Router conventions exclusively.
* Keep components Server-Side (RSC) by default; only use `'use client'` when state, hooks, or event listeners are required.
* Ensure all localized assets use the native `<Image />` component with fixed width/height definitions or the `fill` property to avoid Layout Shifts.

## Tailwind CSS Rules
* Group utility classes logically (Layout -> Flex/Grid -> Spacing -> Sizing -> Typography -> Visuals -> Interactive/States).
* Apply responsive variants (e.g., `md:`, `lg:`) and pseudo-classes (e.g., `hover:`, `focus:`) directly after base styling utilities.
* Leverage dynamic variants natively via the template engine instead of building multi-line string concatenations.
* Restrict color usage strictly to semantic theme configurations (e.g., `text-primary`, `bg-background`). Avoid hardcoding arbitrary hex-codes inside utility markup.
