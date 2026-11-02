---
name: art-reference
description: Gather and study internet reference images before drawing or designing anything visual in Code Clash (sprites, animations, buildings, terrain, effects, UI, factions, formations). Use whenever pixel art, a scene, a unit look or a visual design is being made or changed.
---

# Draw from references

1. **List the subjects.** E.g. "Templar sergeant, isometric, walk cycle", "medieval stone chapel, 3/4 view", "pike formation from above".
2. **Find at least 3–5 references per subject** with web search (and the web-fetch agent for pages):
   - CC0 / public-domain pixel art: opengameart.org (filter CC0), itch.io "CC0" packs, kenney.nl, lospec.com palettes.
   - Period sources: medieval manuscripts (Maciejowski Bible, Codex Manesse), museum collections (Met, Royal Armouries, Wikimedia Commons) for armour, weapons, heraldry, Templar seals and the Beauséant banner, castles and commanderies.
   - Games we emulate: Total War battle screenshots (formations, block shapes, charges, routs); isometric pixel RTS and city builders for camera angle, scale and readability.
3. **Download and look.** Save images to `references/<subject>/` in the repo (git-ignored: study copies stay local and are never committed unless CC0/redistributable), e.g. `curl -sL -o references/<subject>/1.png <url>`, and open each with the Read tool. Note per image: proportions, silhouette, palette, shading direction, how many pixels a figure uses, how motion reads.
4. **Write the brief** in `docs/art-references/<subject>.md`: always link each image (the direct image URL and the page it came from), its licence, and the 2–4 things taken from it.
5. **Apply the craft guide.** Before drawing pixels, read `docs/art-references/pixel-art-craft.md` (ramps, outlines, cleanup, readability, scaling; the user's target is the xave_pixel 128/64/32 comparison it analyses) and follow it.
6. **Draw**, then screenshot the result at game scale and zoomed, and compare side by side with the references. Iterate at least three rounds; each round names what is still off relative to the references.
7. **Licensing.** Commit third-party pixels only if CC0 or redistributable with attribution, and credit them in README.md. Everything else stays reference-only.
