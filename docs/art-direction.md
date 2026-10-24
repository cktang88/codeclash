# Pushfront art direction: *The Illuminated War*

Every pixel in Pushfront belongs to one world: a medieval war chronicle being written and illuminated as the battle happens. The battlefield is a living painted map on vellum: a ring of capitals around a great lake or a mountain massif. The interface is the codex that records it, with ink, pigment, gold leaf and wax. Code is the magic of this world, and a commit message is a herald's proclamation.

If an element would look at home in a SaaS dashboard, it is wrong. If it would look at home in a lavish illuminated manuscript that has come alive, it is right.

Touchstones (study them, never copy them):

- **Hades:** inked outlines, saturated rim light, strong silhouettes, UI that is part of the world.
- **Inscryption:** a diegetic table and tactile objects.
- **Pentiment:** a manuscript world, drop caps, rubrication.
- **Darkest Dungeon:** heavy ink shadow and dread.
- **Kingdom:** painterly parallax and the day and night mood.
- **Into the Breach:** perfect readability at a glance.

## 1. Pillars

1. **Ink and pigment.** Everything has a hand-inked outline, darker and warmer than the fill, never pure black. Fills are flat pigment with two tones of hatched or painted shade. Light comes from the upper left and is warm (candle-gold). Shadows are cool (ink-blue), never grey.
2. **Readable first.** The silhouette tells the unit, the pigment tells the side, gold tells the rank. Each of these is legible from across the map.
3. **Alive at rest.** Nothing is ever fully still: banners breathe, water glints, embers drift, ink settles. A quiet minute on the map should still reward watching.
4. **Weight and consequence.** Big moments get a set piece: anticipation, impact, aftermath, and a mark left on the world.
5. **Hand-made, not generated.** Details are imperfect on purpose: wobbly ink, deckled edges, uneven gold leaf. Nothing is pixel-perfect sterile.

## 2. Palette (tokens, shared by canvas and CSS)

| Token | Hex | Use |
| --- | --- | --- |
| `vellum` | `#efe4c8` | page and panel ground |
| `vellum-shade` | `#d9c79e` | panel recesses, table rows |
| `vellum-deep` | `#b9a477` | borders, deckled edges |
| `ink` | `#22180f` | outlines, body text on vellum (12:1) |
| `ink-soft` | `#4a3a28` | secondary text on vellum (7:1) |
| `ink-night` | `#12161f` | night battlefield, dark panels |
| `vermilion` | `#b8321f` | rubrics, danger, the leader's bounty |
| `ultramarine` | `#2c4a9a` | links, selection, calm |
| `verdigris` | `#2f7f6f` | health, success, growth |
| `gold-hi` / `gold` / `gold-lo` | `#f6dc8c` / `#d4a93e` / `#8a6418` | gold leaf: rank, renown, victory |
| `ember` | `#ff9a3c` | fire and magic light, only ever emissive |

**Army hues stay distinct, but are rendered as pigments.** The tone is mixed toward a warm earth tone and comes in three values (light, base, shade). It never shows up as raw neon.

Gold is reserved for value: rank, renown, victory and the best of anything. Never use it for plain decoration.

**Saturation and the HDR look.** The field is a stage with actors on it, and colour follows that split:

- **Actors are vivid.** Soldiers, banners, tokens, site glows and effects carry the strongest saturation and the brightest values on screen. Soldiers wear an *actor pigment*: the army hue at 80% saturation and 52% lightness, mixed only 6% toward earth (the map's own pigment is 66%/50% mixed 16%). It is still a pigment, never neon.
- **The stage is rich but calm.** Terrain keeps deep, saturated greens, ultramarines and earths, with a deep ink floor. It is calmer than the actors because it has less detail and a narrower *local* value range (fewer ticks and lighter hatching), never because it was lightened, greyed or pushed toward pastel. No screen lifts, white fog or low-contrast vellum washes over the field: the old dawn "warm-grey lift" is the failure to avoid.
- **Emissives bloom.** Fire, fireballs, dragon breath, embers, gold motes, torches, window lights, fort braziers and siege campfires are drawn a second time into a half-resolution target, blurred and added back. Nothing else is drawn into that target, so ordinary terrain, vellum and soldiers never bloom.
- **A filmic finish.** A final pass over the field applies a gentle filmic S-curve (deeper ink floor, highlights that roll off instead of clipping) and vibrance (saturation added most where colour is weakest, least to warm skin-like hues) rather than flat saturation. It is off under reduced motion, with `?lowfx`, on software renderers, and when frames run slow; `?hdr` forces it on for captures.
- **Guard.** Mean terrain saturation and its L\* value range (p5 to p95) must not drop below the measured baseline at any time of day, and the pass must never reduce unit-against-terrain contrast. Both are checked with the legibility measurement (see §5).

## 3. Typography

| Face | Use |
| --- | --- |
| **IM Fell English SC** (Google Fonts) | titles, drop caps, banners. Historic, with ink character |
| **Alegreya** | body and UI text, 16px base, line height 1.45. Use old-style figures in prose and **Alegreya SC** with lining, tabular figures for numbers |
| **JetBrains Mono** | only for literal code: commit messages and repo names. Shown inline as "scribe's notes": small, on a darker vellum ground |

- Headings are rubricated (vermilion) or gilded (gold leaf), never generic bold sans.
- Chronicle entries and digest chapters open with a drop cap.
- Minimum text size is 13px on screen, and 15px in the map's world labels, which are counter-scaled.
- Body contrast is at least 7:1, and secondary text at least 4.5:1.

## 4. UI language: the codex

**Surfaces.** Panels are vellum leaves with:

- a deckled or torn edge, drawn as an SVG mask
- a 1.5px ink rule inset 6px from the edge
- corner ornaments (small SVG fleurons)
- a faint paper grain, drawn as an SVG `feTurbulence` texture, not an image
- a soft cast shadow onto the map

Dark variants for night and overlays are "night vellum": `ink-night` with gold rules.

**Controls must avoid these SaaS looks:**

- pill buttons
- rounded-2xl cards
- drop-shadow-lg
- gradient blobs
- glassmorphism
- emoji as icons in chrome

**Use these instead:**

- **Primary action.** A wax seal button (vermilion, embossed sigil) or a gilded plaque with bevelled ink edges. Pressing it presses the wax: 2px translate and a darker inner shadow.
- **Secondary action.** An ink-ruled label with an underline flourish on hover.
- **Tabs.** Silk ribbon bookmarks hanging from the panel's top edge.
- **Toggles.** A brass lever or a wax seal with on/off states.
- **Inputs.** A ruled line on vellum with a quill caret.
- **Badges and tags.** Small heraldic shields or wax seals, never rounded chips.
- **Bars** (HP, morale, walls). A carved channel with a pigment fill and a gilded end cap. Damage leaves a lagging pale "wound" that drains after 400ms.
- **The ring diagram.** The ring of capitals as a small engraved figure: the centre's lake or massif, the ring road, each seat's keep in its holder's pigment, the border forts as lozenges, crossed blades where two holders meet, and the viewer's seats ringed in gold leaf (a dashed vermilion ring for a lost home). It sits on a night-vellum plaque over the map with one line of standing beside it; it never covers the centre of the map.

**Icons.** Use one woodcut or engraving icon set throughout: ink linework on transparent ground, 2px stroke at 24px, with hatched shading. Unit icons share their silhouettes with the battlefield sprites. Emoji appear only in user-sent cheers, and even there they are framed as a note with the cheer's word beside them.

**Layout.** The battlefield is the table, and the panels are pages laid on it, slightly rotated (±0.4°) as if placed by hand. Panels never cover the center of the map. On a phone, pages become a book you swipe through from the bottom edge.

**Motion.**

- **Easing:** `cubic-bezier(.2,.8,.2,1)` for arrivals, `cubic-bezier(.6,0,.8,.2)` for departures.
- **Durations:** UI 160–260ms. Set pieces 1.2–3s.
- **Reveal:** pages slide and settle with a 1° rotation overshoot, text writes in like ink (opacity plus a slight blur clearing), and numbers tick like a tallying scribe. Modals open as a page turning or a scroll unrolling, never as a plain fade.
- **Reduced motion:** with `prefers-reduced-motion`, all of this drops to short crossfades.

## 5. The battlefield

**The map.** A painted disc of land on a vellum sheet, with the ring of capitals on it. Beyond its edge are:

- a hand-inked coastline
- a compass rose
- marginalia: tiny animated sea serpents and a sailing ship

**The centre** is the map's grand feature, painted once and never fought over:

- **A great lake:** deep ultramarine shelving fast from a ragged inked shore, with engraved calm strokes across the water, ripple rings following the shore inward, and the glint shader rolling slow and broad on it as on the open sea. A serpent sometimes surfaces in it.
- **A mountain massif:** hundreds of engraved peaks in the old cartographer's manner, foothills at the shore rising to great peaks at the summit, each lit warm on its upper-left face and hatched in cool ink on the other, the tallest capped with snow.
- Its name is lettered across it in spaced display capitals, pale on the deep and outlined in ink, with a rubricated flourish beneath: *The Inkwell*, *The Greyspine*.

**The front road** is the ring itself: an ink-edged ochre track running round the centre through every capital and fort, wandering a little as a hand-ruled road does, with tiny milestones on its outer verge.

**Fronts** are drawn as a cartographer draws a realm's edge: wherever two holders' territories meet, a dashed ink border with a small cross on every other gap runs from the shore to the coast, edged on either side by a thin band of each realm's pigment. A fort a neighbour holds pushes the border back past it. Borders are thinner and paler than any road; they belong to the stage, not the actors.

Terrain is painted with ink hatching on its shadow sides. Forests are clustered canopy blobs with a highlight on the top-left edge. Water is ultramarine with an animated glint shader and ink ripple lines at the shore. Rock gets angular hatched facets.

**Light and time.** The war's clock is the sun. It follows the war's simulated tick, not the wall clock, so a replay, a client catching up, or a tab waking from sleep shows the hour being watched. The night runs into the next reset.

| Time | Light |
| --- | --- |
| dawn (the reset) | gold |
| midday | neutral |
| afternoon | warm |
| dusk | crimson |
| night | ultramarine wash; capitals, fort braziers, siege campfires and fire glow as emissive points |

Cloud shadows drift across the map. Ambient life follows the hour: birds and butterflies by day, fireflies and ember motes by night.

**Sites.**

- **Capitals:** inked castles with roofs and hangings in the holder's pigment, the holder's standard on every tower, smoking chimneys, and gates that open on a muster. A captured capital keeps its founder's architecture (the keep style its founder chose); only the pigment and the banners are the conqueror's, and the storming leaves its mark: soot licking up from the gate and windows, merlons knocked from the curtain, cracks, and a scorched yard.
- **Border forts:** a small stone keep on a grassed motte, a low curtain with two pigment-roofed turrets, the holder's standard on the keep and its banner on the wall. By night the arrow slits and the roof brazier glow; while the fort is contested the brazier flares in the attackers' pigment and a ring of their pigment fills round it. Its name is lettered on a vellum cartouche.
- **Sieges:** while foes stand at a capital's walls, an earthwork bank in the besiegers' pigment curves round the side they press from, with a palisade of stakes, their pennants and campfires behind it; the walls smoke and, as they weaken, burn. A carved wall ring round the capital shows what stands in the holder's pigment, with a pale wound draining behind fresh damage and cracks spreading from the broken end. The capital's cartouche says what the walls can expect: *breach in ~12 min*, *gates barred for 1h 20m*, *sieges open in 3h*.
- **A rising's standard:** a crooked pole lashed upright in a cairn of soot-black stones on the ring road outside the lost home, flying the fallen player's arms, for as long as the rising lasts.

**Units.** Painted miniatures with inked outlines.

- Team pigment is on the cloth: tabard, shield field, plume, banner. Shields are a broad pigment field with an argent (light) charge, so the arms read. Under every soldier a bold pigment ring between ink rules (the miniature's base) carries the side at mid zoom; elites stand on a wider ring.
- Steel, leather and bone are shared materials, drawn the same way for every army.
- Rank shows as gold: chevrons, trims and gilded banner edges.
- Ragged armies have faded pigment, patched and torn cloth, and dented shields.

**Readability rules.** Legibility wins every conflict with painterly richness. The battlefield is a *stage* (terrain: calm, rich, lower in detail) and *actors* (soldiers, banners, tokens, projectiles, site markers: crisp, vivid, high contrast).

- Never encode unit kind in hue. Kinds differ by silhouette; below zoom 1.4 soldiers are drawn up to 1.6× life size so silhouettes stay distinct at mid zoom.
- **Every figure is cut out.** Each soldier frame is baked with a rim drawn under it: an ink band 2.2 art-px outside its own outline, and outside that a light halo out to 7 art-px, tinted 62% from the army pigment toward vellum light. The ink band separates the figure from light ground (road, ochre, vellum); the halo separates it from dark ground (forest, deep water, night). The rim stays on during hit flashes.
- **The stage dims under the actors.** At mid and close zoom a soft, cool ink-blue multiply pool lies under each platoon. It darkens the ground and quiets its detail without greying it.
- **Terrain detail is quiet.** Grass ticks are sparse and faint (alpha ≤ 0.18), forest canopies are hatched lightly (alpha ≤ 0.15, every 3.2px) with a soft top-left light and an ink edge at ≤ 0.45, and rock hatching is at most 0.22. Roads keep their ink edges at 0.3 so they read as roads but stay quieter than any soldier.
- **The hour darkens the stage, not the actors.** Soldiers, bases and banners take only 14% of the time-of-day grade; terrain takes all of it. At night every platoon carries a torch pool.
- **At far zoom every platoon becomes a heraldic token**: a 40px shield in the battalion's arms with a vellum rim outside a heavy ink rule, so it stands off forest, road and night alike. Elites keep their silhouette as a pigment glyph.
- Labels sit on vellum cartouches with ink text (12:1, secondary 7:1, never under 4.5:1), and collide politely: lower-priority labels hide first.
- **Combat impact stays readable**: a hit flash is one frame of light over the figure and an 80ms fade, capped at 28 at once; knockback is capped at 60 at once; heavy blows take priority.
- **Targets, measured.** Silhouette contrast (the darker or lighter side of a soldier's outer 3px contour against the terrain 1–7px around it, WCAG ratio) is at least 3:1 on grass, forest, road, water and rock at dawn, noon, dusk and night, at mid and close zoom; at far zoom it is measured on the tokens and dots. The measurement is `scripts/legibility/` (Playwright captures with and without soldiers, then pixel sampling) and is re-run with the filmic pass on.

## 6. Set pieces

Each set piece has anticipation, impact, aftermath and a mark left on the world.

| Moment | Anticipation | Impact | Aftermath and mark |
| --- | --- | --- | --- |
| A push musters | Horn call. The gates of its muster gate (the capital it holds at that end of its realm) swing open; a rising's column gathers on the road instead | The battalion banner unfurls, and the commit message appears above the platoon as a herald's scroll for 4s | Dust on the road. The platoon's name enters the chronicle with a drop cap |
| Veteran rank up | The banner shimmers | Gold leaf sweeps across the flag, chevrons glint, a bright chime | The flag keeps its gilded edge |
| Dragon summoned | The map dims and a vast shadow sweeps across it | A roar, and the dragon dives in from the map's edge, wings beating | Scorched earth wherever it breathes |
| A fort changes hands | The capture ring fills in the attackers' pigment and the brazier flares | A horn; a pillar of pigment light and a ring spreading over the ground | The new holder's standard flies over the keep |
| A capital captured | The walls crack, the wall ring empties, and the bell tolls three times | Dust and fire burst from the breach; the old banners are torn down and their cloth scatters in the old pigment | The new holder's banners run up the poles tower by tower in a fall of gold leaf and a bright bell; the line enters the chronicle; the scorch stays on the walls all day |
| A rising | The last walls fall and the lost home's banners come down | Low drums: smoke boils up on the road outside the walls and the rebel standard rises out of it | The standard stays planted, smoking, until the home is retaken |
| The ring is won | The camera sets out from the conqueror's home and tours the ring; each capital raises the conqueror's banners in gold leaf as it passes | The camera pulls back over the whole ring: every bell peals, a gilded ring is laid along the road and the conqueror's own fanfare sounds | The soldiers slow to a painted stillness while banners, water and smoke stay alive; a proclamation unrolls naming the conqueror and leads to the digest |
| Rout | The banner trembles | Soldiers scatter, and a white flag puffs up | Footprints of the flight |
| The day ends | The sun sets in crimson | Night ink washes across the map, the chronicle page turns, and the digest is gilded | Dawn rises on a new map |

## 7. Sound

Sound is diegetic and restrained, and every UI sound is tactile:

- quill scratch
- parchment rustle
- wax seal press
- the clink of a gold coin
- a soft bell for toasts

The battle has distant drums whose tempo follows how intense the fight is, along with horns, steel clashes, bowstrings, fire whooshes and the dragon's roar. A captured capital's bell tolls three times; a ring won peals every bell over a held choir before the conqueror's fanfare.

The music is generative and modal (Dorian and Phrygian), made of drone, hand drum, lute and low choir. Its intensity layers follow the battle.

Sound is off until the player opts in with the sound seal, and every visit starts silent (browsers allow sound only after a gesture); the volume setting persists. Sound fades out and the audio clock suspends while the tab is hidden.

## 8. Quality bar checklist (every screen and every entity)

- [ ] Uses only palette tokens and the three type families
- [ ] Ink outline, top-left warm light, cool shadow
- [ ] Every interactive element has hover, press, focus (a gold ink ring) and disabled states
- [ ] No pill chips, glass, gradient blobs, default shadows, or emoji in the chrome
- [ ] Has an entrance and exit motion, and honors reduced motion
- [ ] Legible at 390px and at 1440px; text contrast meets the minimums
- [ ] Something is alive or rewarding on it, even when idle
- [ ] Looks like it belongs in the same book as everything else
