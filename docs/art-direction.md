# Pushfront art direction: *The Illuminated War*

Every pixel in Pushfront belongs to one world: a medieval war chronicle being written and illuminated as the battle happens. The battlefield is a living painted map on vellum. The interface is the codex that records it, with ink, pigment, gold leaf and wax. Code is the magic of this world. The Legacy Monolith is carved with syntax, shrine runes are glyphs of code, and a commit message is a herald's proclamation.

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
- **Bars** (HP, morale, Monolith). A carved channel with a pigment fill and a gilded end cap. Damage leaves a lagging pale "wound" that drains after 400ms.

**Icons.** Use one woodcut or engraving icon set throughout: ink linework on transparent ground, 2px stroke at 24px, with hatched shading. Unit icons share their silhouettes with the battlefield sprites. Emoji appear only in user-sent emotes, and even there they are framed as a wax-sealed note.

**Layout.** The battlefield is the table, and the panels are pages laid on it, slightly rotated (±0.4°) as if placed by hand. Panels never cover the center of the map. On a phone, pages become a book you swipe through from the bottom edge.

**Motion.**

- **Easing:** `cubic-bezier(.2,.8,.2,1)` for arrivals, `cubic-bezier(.6,0,.8,.2)` for departures.
- **Durations:** UI 160–260ms. Set pieces 1.2–3s.
- **Reveal:** pages slide and settle with a 1° rotation overshoot, text writes in like ink (opacity plus a slight blur clearing), and numbers tick like a tallying scribe. Modals open as a page turning or a scroll unrolling, never as a plain fade.
- **Reduced motion:** with `prefers-reduced-motion`, all of this drops to short crossfades.

## 5. The battlefield

**The map.** A painted disc of land on a vellum sheet. Beyond its edge are:

- a hand-inked coastline
- a compass rose
- marginalia: tiny animated sea serpents, a sailing ship, and a scribe's notes naming the shrines

Terrain is painted with ink hatching on its shadow sides. Forests are clustered canopy blobs with a highlight on the top-left edge. Water is ultramarine with an animated glint shader and ink ripple lines at the shore. Rock gets angular hatched facets.

**Light and time.** The war's clock is the sun. It follows the war's simulated tick, not the wall clock, so a replay, a client catching up, or a tab waking from sleep shows the hour being watched. The night runs into the next reset.

| Time | Light |
| --- | --- |
| dawn (the reset) | gold |
| midday | neutral |
| afternoon | warm |
| dusk | crimson |
| night | ultramarine wash; capitals, shrines, campfires and fire glow as emissive points |

Cloud shadows drift across the map. Ambient life follows the hour: birds and butterflies by day, fireflies and ember motes by night.

**Sites.**

- **Capitals:** inked castles in their army's pigment, with banners on every tower, smoking chimneys, and gates that open on a muster.
- **Shrines:** standing stones with runes made of code glyphs, glowing in the holder's hue.
- **The Legacy Monolith:** obsidian, carved with ancient syntax (`goto`, `NULL`, `/* */`), with molten cracks that widen as it takes damage.

**Units.** Painted miniatures with inked outlines.

- Team pigment is on the cloth: tabard, shield field, plume, banner. It covers 20–30% of the sprite.
- Steel, leather and bone are shared materials, drawn the same way for every army.
- Rank shows as gold: chevrons, trims and gilded banner edges.
- Ragged armies have faded pigment, patched and torn cloth, and dented shields.

**Readability rules.**

- Never encode unit kind in hue.
- At far zoom every platoon becomes a heraldic token.
- Labels sit on vellum cartouches with ink text, and collide politely: lower-priority labels hide first.

## 6. Set pieces

Each set piece has anticipation, impact, aftermath and a mark left on the world.

| Moment | Anticipation | Impact | Aftermath and mark |
| --- | --- | --- | --- |
| A push musters | Horn call. The capital gates swing open | The battalion banner unfurls, and the commit message appears above the platoon as a herald's scroll for 4s | Dust on the road. The platoon's name enters the chronicle with a drop cap |
| Veteran rank up | The banner shimmers | Gold leaf sweeps across the flag, chevrons glint, a bright chime | The flag keeps its gilded edge |
| Dragon summoned | The map dims and a vast shadow sweeps across it | A roar, and the dragon dives in from the map's edge, wings beating | Scorched earth wherever it breathes |
| Capital sacked | The walls crack and the bell tolls | Fire, collapse, embers | The ruin smokes until it is rebuilt |
| The Monolith falls | Cracks race across it and the glyphs flare | It shatters into scattering glyph particles, with a deep boom and a shockwave | The Heart is revealed, glowing |
| Rout | The banner trembles | Soldiers scatter, and a white flag puffs up | Footprints of the flight |
| The day ends | The sun sets in crimson | Night ink washes across the map, the chronicle page turns, and the digest is gilded | Dawn rises on a new map |

## 7. Sound

Sound is diegetic and restrained, and every UI sound is tactile:

- quill scratch
- parchment rustle
- wax seal press
- the clink of a gold coin
- a soft bell for toasts

The battle has distant drums whose tempo follows how intense the fight is, along with horns, steel clashes, bowstrings, fire whooshes and the dragon's roar.

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
