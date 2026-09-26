# Ontology Studio

[![Deploy to GitHub Pages](https://github.com/vivkv07/dotcorp/actions/workflows/pages.yml/badge.svg)](https://github.com/vivkv07/dotcorp/actions/workflows/pages.yml)

**Live site:** https://vivkv07.github.io/dotcorp/

A single-page site where people from any company can see what **their** ontology could look like:
the object types their business runs on (plants, orders, customers, claims…), the links between
them, the automations that act on them, and the data, logic and systems that feed and consume it.

The diagram follows the classic three-tier picture: analytics, automations and products on top,
the ontology slab in the middle, and data sources, logic sources and systems of action below.

## Features

- **Eight industry templates**: Manufacturing, Retail, Banking, Healthcare, Logistics, Energy,
  Insurance and SaaS. Switch with the arrows, the picker, or the ← / → keys.
- **Interactive ontology slab**: click an object to inspect its properties, drag objects around,
  hover to highlight related links, click a source tile to rename it.
- **Customize drawer**: rename objects, pick icons, edit sample properties and their status colour,
  add automations, add or remove links, and edit the three source tiers.
- **Personalise**: type your company name and the diagram and headline update.
- **Share & export**: share links carry the whole model in the URL (gzip + base64), plus PNG, SVG
  and JSON export and JSON import. Edits also persist in the browser's local storage.

## Design

The page follows the 78East Labs design system: ink on paper with a warm surface, one typeface
(Switzer, weights 300 to 600, never bold), a 6px radius, and four permitted transitions. Every
colour is a token, so the dark scheme is the same page with the tokens swapped. Motion follows the
same system: the stage tilts toward the cursor, sections rise into view, and selecting an object
blooms its ring, draws its links, and slides in its property card.

## Releasing a change

GitHub Pages caches files for ten minutes, so after changing `style.css`, `app.js` or `data.js`
bump the `?v=` number on their tags in `index.html`. That makes every browser fetch the new
files on the next visit instead of showing a stale mix.

## Running

It is a static site with no build step: open `index.html`, or serve the folder
(`python3 -m http.server`) and browse to it. Works on GitHub Pages as-is.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page shell, hero, stage, customize drawer |
| `style.css` | Light line-art theme, drawer, responsive rules |
| `app.js` | Projection onto the slab, layered layout, SVG rendering, interactions, share/export |
| `data.js` | Industry templates and the icon set |

## Adding an industry

Add an entry to `INDUSTRIES` in `data.js` (objects, links, sources) and its key to
`INDUSTRY_ORDER`. Objects use `O(id, name, icon, props, automation)` and links use
`L(source, target, verb)`; property statuses are `ok`, `warn`, `bad`, `info` or `neutral`.
