# Pixel-art techniques: professional tricks a 3D-to-pixel pipeline can automate

This builds on `pixel-art-craft.md`, which already covers hue-shifted ramps, per-material notes for mail, plate, cloth, lacquer, bone and hide, selective outlines, cleanup filters, frame counts, LOD sheets and integer scaling. Read that first. This file adds what it leaves out. Each item follows the pattern **rule → why it works → how Code Clash applies it**. The application notes refer to our actual code: `src/client/render/sprites128.ts` (ray-cast painter: `ramp()`, `put()`, the `PREV` anti-flicker buffer, `LEVELS`), `post.ts` (grade, grain, vignette) and `render/city/`.

## 0. Reference images studied

All of these are saved in `references/pixel-techniques/`, which is git-ignored. I made contact sheets of the animated GIF frames and opened every one with Read. All are copyrighted and free to view, so they are **for study only and must never be committed**.

| file | direct URL | page | what I took from it |
|---|---|---|---|
| 01-saint11-illumination.gif | https://saint11.art/img/pixel-tutorials/IlluminationTechniques.gif | https://saint11.art/blog/pixel-art-tutorials/ | 3-point rig (key, fill, **rim "creates a thin outline to separate the object from the background"**). Contre-jour hides detail and frames the subject. **Light from below for horror, with coloured light.** Hue-shift the light with its amount and use complementary light colours. A volumetric cone is visible only with dust or smoke and is brighter in the middle. Darken the background on the subject's bright side. |
| 02-saint11-shine.gif | https://saint11.art/img/pixel-tutorials/Shine.gif | same | A **travelling diagonal glint** (2-4 frames) across a blade or coin. The "extra shine" is a 1-frame full-white flash, then a yellow pulse that shrinks to a centre tick. |
| 03-saint11-motionblur.gif | https://saint11.art/img/pixel-tutorials/MotionBlur.gif | same | Smear types: a solid swept wedge, a crescent, a 2-colour streak, and multi-image ("ghost blades"). **Lighter colours bleed over darker ones. Darker colours are used for the fading tail.** For very fast moves, **flash complementary colours** on alternate frames. A smear "connects the frame to the previous one". |
| 04-saint11-squash.gif | https://saint11.art/img/pixel-tutorials/Squash.gif | same | **Mass never changes** (when width goes up, height goes down). Anticipation squashes **opposite** to the action. **Stiff materials deform less.** Prepare → action → brake → recover. |
| 05-saint11-shading.gif | https://saint11.art/img/pixel-tutorials/Shading.gif | same | **Band compression**, i.e. uneven band widths so the steps are hard to see. **Faces are mostly one solid colour; avoid gradients.** Labels: main light, highlight, terminator, **bounce light**. **Projected shadow has a hard edge; self-cast shadow has a soft edge.** Pillow shading and "light too soft" are marked as errors. |
| 06-saint11-isometric.gif | https://saint11.art/img/pixel-tutorials/Isometric.gif | same | 2:1, verticals always straight. **Lines can be replaced by transitions and bright corners.** Carve shapes from cuboids, then texture. **Draw flat, rotate 45° and squash 50% to go iso** (a useful tool, but not the only one). |
| 07-saint11-silhouette.gif | https://saint11.art/img/pixel-tutorials/Silhouette.gif | same | Silhouette sketch → details → animate. **Animate using silhouettes first.** Add "strong elements" (flat head, tank treads). Spiky, long-limbed and complex shapes read as danger, which suits Undead. |
| 15-saint11-darkness.gif | https://saint11.art/img/pixel-tutorials/Darkness.gif | same | **Blend dark areas into the background** and let the viewer complete them. Build in stages: general shape → light/shadow → **strong light points** → **strong rim/back light**. "Each pixel cluster must have a reason." Keep the light direction consistent. In dark scenes, use one colour for the background to keep its contrast low. |
| 08-slynyrd-lighting-tips.gif | https://images.squarespace-cdn.com/content/v1/551a19f8e4b0e8322a93850a/1536968454258-0VM5SR0OH046HOGV3GJC/11-Lighting_Tips.gif | https://www.slynyrd.com/blog/2018/6/15/pixelblog-6-light-and-shadow | **Avoid even shading bands.** **Colour bounces off nearby objects** (a cyan tint on the ball next to a blue gem). Primary and secondary light directions. **Glass has high contrast and a sharp spec, matte clay low contrast.** A **cast shadow** is the cheapest way to give a simple sprite depth. |
| 09-slynyrd-mood.png | https://images.squarespace-cdn.com/content/v1/551a19f8e4b0e8322a93850a/1536968439704-DOPZWDHAFS6AV6PESZCX/10-Mood.png | same | The same still life graded six ways. **Dramatic = near-black ground plus one saturated red. Somber = desaturated purple with low value range. Cold = blue monochrome. Warm = olive and yellow.** Mood is a palette transform, not new art. |
| 10-slynyrd-texture-principles.gif | https://images.squarespace-cdn.com/content/v1/551a19f8e4b0e8322a93850a/1536967806715-S61SGT14YITG5XHQ7O6H/1-Texture_Principles.gif | https://www.slynyrd.com/blog/2018/2/15/pixelblog-2-texture | Abstract shapes into simple clusters → repeat with a few variations → balance distribution → **contrast dense texture with negative space** → avoid orphan pixels → add colour details sparingly → **then lay shadow areas over the texture**. |
| 11-slynyrd-cyberpunk-building.gif | https://images.squarespace-cdn.com/content/v1/551a19f8e4b0e8322a93850a/42c80774-3496-461f-a92e-5f548641511d/118-Cyberpunk_Buildings_6.gif | https://www.slynyrd.com/blog/2023/1/30/pixelblog-42-cyberpunk-pixel-art | Build order **structure → signage → lighting**. Street light puts a **warm gradient at the bottom of the facade that cools upward**. Emissive windows are dotted 1-px rows. A two-tone building (lit face red, shadow face purple). |
| 12-gk-lut-set.png, 13-gk-times-of-day.png | https://slava.lazybeargames.com/content/images/2024/11/rarwlem4o5aoufvhb8vmficb-za-1-.png , https://slava.lazybeargames.com/content/images/2024/11/k2fz1wmhn9yw-rcgvticox4_bh4-1-.png | https://slava.lazybeargames.com/graveyard-keeper-how-the-graphics-effects-are-made | The same farm at dusk, day, night and late night. Night is a **teal/navy LUT with warm windows left untouched**. Late night crushes everything except the emissive windows, so they become the focal points. |
| 14-gk-normal-passes.png | https://slava.lazybeargames.com/content/images/2024/11/0omvjvscrffh1o8exichnqylnia-1-.png | same | The artist painted the well **lit from 4 sides**, and a script merges the four into a normal map. That is the 2D painter's way of getting what our ray-caster already has for free. |

---

## 1. Colour

**1.1 Compress the bands and put saturation at the terminator.** *Rule:* light, mid and shadow bands should have unequal widths (Saint11 *Shading* "band compression", Slynyrd 11 "avoid even shading bands"), and chroma should peak in the step next to the light/shadow boundary. *Why:* bands of equal width read as contour lines, i.e. pillow shading. Real terminators show the most saturated colour because subsurface and reflected light are strongest there. *Apply:* `ramp()` is currently HSL with saturation rising steadily into the darks. Rebuild it in **OKLCH**, where lightness and hue are perceptually separate (Ottosson; matrices at https://bottosson.github.io/posts/oklab/). The chroma curve over [deep, shade, base, light] should be roughly [0.8, 1.15, 1.0, 0.75]×C. The quantise thresholds on N·L should be roughly [−0.15, 0.25, 0.8], so the base band is widest and the light band is a sliver.

**1.2 Light temperature is a scene property, not a material property.** *Rule:* a warm key light gives cool shadows, and a cool key (moon) gives warm-ish shadows from the warm bounce of fires. Shadows take the **ambient** hue (Saint11 *Illumination* "hue shift"; Slynyrd 42 warm street light against a cool sky). *Why:* the eye reads the hue difference between lit and unlit as the light's colour. Fixed "shadows always go purple" breaks under torchlight. *Apply:* generate ramps from `(material base, LightRig)`. A rig is `{keyHue, keyChroma, ambientHue, ambientChroma}`. The shadow steps are the base mixed toward ambient in OKLab (a, b) by 25-40%, and the light steps are mixed toward key by 10-20%. Bake 3 rigs per faction (day, dusk, night/torch). This replaces the hard-coded `205`/`330` hue targets.

**1.3 Saturation budget and a single accent.** *Rule:* most of the image is low-chroma. The highest chroma is reserved for one accent per unit (team colour, the Undead emissive, blood) and for the focal point (Slynyrd *Mood* "dramatic": near-black plus one red). *Why:* the eye goes to the most saturated, highest-contrast spot. If everything is saturated, nothing is. *Apply:* clamp non-accent materials to OKLCH C ≤ 0.07 (steel, bone, cloth, hide) and give team and emissive ramps C ≥ 0.14. A unit test can assert that the accent is the max-chroma ramp in every faction palette.

**1.4 Colour script by scene.** *Rule:* each battle or time of day gets a mood palette transform (Slynyrd *Mood*; Graveyard Keeper's 10 artist-made LUTs built by grading screenshots in Photoshop). *Why:* a grade on the whole frame unifies sprites, ground and effects, and no art has to be redrawn. *Apply:* a 3D LUT (32³ strip) in `GlPost`, authored by grading a screenshot. Better for pixel purity: **apply the LUT to the palette, not the pixels**. Because every sprite pixel is a ramp index (`F(ramp, tone)`), the battle shader can look colours up in a per-scene ramp texture. The grade then stays within the palette, and swapping day for night costs one texture.

**1.5 Rim, back and bounce light.** *Rule:* a thin rim on the side facing away from the key separates figures from dark ground (Saint11 *Illumination*, *Darkness*). Bounce light lifts shadow planes that face the ground or a bright neighbour, in that neighbour's colour (Saint11 *Shading*, Slynyrd 11). *Why:* rim light carries the silhouette in dark scenes, which is exactly our Undead and night maps. Bounce keeps shadows from going dead. *Apply:* in `put()`, for pixels on the silhouette edge (an empty neighbour in the back-light direction) with `dot(N, backDir) > 0.4`, force tone 3 in the **rig's rim hue**. That is 1 px only, on metal and helmets, and never at level 1 (48 px), where it reads as noise. For shadow-band pixels with `N.y` facing down, raise one tone and mix 20% toward the ground colour of the current map.

**1.6 Emissive and under-lighting.** *Rule:* emissive pixels ignore the light and sit at the top of their own ramp, wrapped in a 1-2 step **palette halo** rather than a blur. Lighting from below reads as horror (Saint11). *Apply:* tag emissive materials (Undead eyes and runes, torches, lanterns, the Samurai temple lanterns). Skip shading for them. Write a halo of the glow ramp's shade/base into empty or dark neighbours within a 1-px radius at 48 and 2 px at 128. Give Undead an optional green **under-light rig** (key from below at low intensity).

---

## 2. Form and material

**2.1 Planar faces: snap normals before lighting.** *Rule:* "faces are mostly one solid colour" (Saint11). *Why:* a curved surface lit smoothly and then quantised gives wobbly contour bands, which is the main thing that looks "rendered". A hand artist decides on planes first. *Apply:* quantise each hit normal to a small direction set before the N·L test: 8 azimuths × 3 elevations, plus up, gives 26 directions. Add a per-part dither-free bias so that each limb segment resolves into 2-3 flat facets. Use coarser snapping at level 1 and finer at level 8.

**2.2 Material response table.** Slynyrd 11's glass vs clay shows material = contrast + spec size + rim strength. Ray-cast parameters:

| material | value span (OKLab ΔL deep→light) | spec | rim | hue shift/step | bands | texture motif |
|---|---|---|---|---|---|---|
| plate / helm | 0.55 (max) | 1-3 px, near-white, cold | strong | 15° (warm darks, cold lights) | 4 + spec | 1-px scratch on lit plane (Undead) |
| mail | 0.35 | none | weak | 8° | 3 | 2×2 checker only in the lit band |
| lacquer (dō, kabuto) | 0.45 | 2-4 px **streak** along the long axis | medium | 10°, darks stay saturated | 3 + streak | lacing bands, fixed period |
| cloth / surcoat / sashimono | 0.25 | none | none | 15-20° | 3 | 1-2 folds from compression points |
| leather / hide / horse | 0.30 | broad soft 1 band on rump and neck | weak | 12° | 4 | none; the mane gets 2-3 strand gaps |
| bone | 0.30 | none | medium (rim makes skulls pop at night) | 18° toward ochre | 3 | sockets as 2-3 px dark clusters |
| wood (shafts, buildings) | 0.30 | none | none | 10° | 3 | grain lines 1 px, sparse, lit face only |
| stone (city) | 0.30 | none | none | 10-15° toward purple in shade | 3 | course lines, chipped corners only |

**2.3 Cast shadow hard, form shadow soft.** *Rule:* projected (cast) shadows have hard edges. The self-shadow at the terminator may be soft (Saint11). *Apply:* on figures, the terminator is a single band edge. At level 4-8 only, allow a 1-px **checker** between shade and base exactly on the terminator, on cloth and hide only, never on metal. Cast shadows stay solid (§5.4).

**2.4 Texture by stamps, not noise.** *Rule:* abstract → repeat a few cluster shapes → balance → leave negative space → shadow over texture (Slynyrd *Texture*). *Why:* per-pixel noise is not texture. Recognisable repeated clusters are. *Apply:* for stone, plaster, grass, mail and rust, place **2-5 px stamps** from a small library at Poisson-disc points hashed in **object or world space**, so they don't swim when units move. Only place them in the lit or base band, with density × (tone/3), and skip them where a stamp would touch the outline. `hash2()` already exists, so seed it with the part-local coordinate, not the screen coordinate.

**2.5 Lines from transitions and bright corners.** *Rule:* on solid objects, especially iso buildings, an edge between two faces needs no line. The value change plus a 1-px bright convex corner does the job (Saint11 *Isometric*). *Apply:* in city kits, put a 1-px highlight on the top-front convex edges of walls and roofs. Draw no inner lines between faces. Keep outlines only at sky and ground contact.

---

## 3. Readability

**3.1 Three-value thumbnail test, automated.** *Rule:* convert to greyscale and posterise to 3 values. Class, facing and team must still read (value carries readability, hue doesn't). *Apply:* add a `sprites-preview` mode that renders every kind at level 1 in OKLab L only, posterised to 3 levels. A CI check fails if the silhouettes of two classes have IoU > 0.85, or if the mean L of a unit is within 0.12 of the terrain's mean L.

**3.2 Focal point = brightest + most saturated + sharpest.** *Rule:* one strong light point per figure (Saint11 *Darkness*, "create strong light points"). *Apply:* the spec cluster or emissive goes on the head or weapon tip. Clamp all other tone-3 clusters on the body to ≤ 3 px at 48 px so they don't compete.

**3.3 Let darkness merge.** *Rule:* blend dark areas into the background and let the viewer complete them, using one low-contrast background colour in dark scenes (Saint11). *Why:* in a crowd of thousands, outlining every dark leg makes mush. Merged darks group the figures into formation masses, which is the Total War read. *Apply:* at night rigs, drop outlines on deep-tone pixels whose neighbour is ground darker than tone 1. Keep rim and outline only on the lit and rim side.

**3.4 Formation-level value pattern.** Give every block one readable value pattern from the strategy camera: a light Templar mass with red crosses, a dark Sengoku mass with coloured sashimono above, a pale Undead mass with green points. Vary per-figure animation phase deterministically, and add a **±1 tone variance per figure** on cloth only (chosen by unit-local seed). This breaks wallpaper repetition without noise.

**3.5 Team-colour masks.** Already in the craft guide. Add that the mask should hold a **ramp index**, not a colour, so the team ramp is remapped with the same tone, and the night LUT (§1.4) still applies.

**3.6 LOD switching.** Use hysteresis (switch 48→128 at 1.15× the threshold, back at 0.85×) and a 2-frame ordered-dither crossfade so zooming doesn't pop. That is the same trick the Texel Splatting paper uses between probes.

---

## 4. Animation

**4.1 Smear rules** (Saint11 *Motion Blur*). The smear shape is the union of the swept weapon. Fill it with the weapon's **light** tone, because lighter bleeds over darker. Its trailing third uses the **deep** tone or is dropped ("darker colours for fading"). It exists for exactly one frame between anticipation and impact. *Apply:* the craft guide unions the swept masks. Add the light-front/dark-tail split by sweep parameter t, and for the fastest attacks (cavalry lance impact), alternate the white and team-accent smear on consecutive frames ("complementary flashing").

**4.2 Squash and stretch with conserved mass.** *Rule:* width × height stays constant. Anticipation squashes opposite to the action. Stiff materials deform less (Saint11 *Squash*). *Apply:* in pose space, scale soft parts (cloth, horse body and neck, Undead ghouls) along the motion axis by s and across it by 1/√s. Armour plates, shields and weapons are rigid, so they don't scale. For a charge use s ≈ 1.1, for landing or braking 0.9, for one frame each.

**4.3 Glints and flashes as frame-cheap life** (Saint11 *Shine*). A 2-4-frame diagonal glint along a blade or helm on idle loops costs no new pose. Offset the spec mask along the blade axis. Hit reaction: a 1-frame **full-white silhouette** (palette index "flash"), then back. This is a shader flag, not a sprite frame.

**4.4 Secondary motion by phase lag.** Banners, sashimono, surcoat skirts, horse tails and Undead rags lag the body by 1-2 key frames. *Apply:* for cloth bones, use `posedT(t − lag)` (the timeline already exists), so secondary motion costs no extra key poses.

**4.5 Timing.** Hold impact frames 2-3 ticks (hit-stop). Anticipation is longer than action. Keep `TICKS` uneven per frame instead of uniform per animation: a per-frame hold table such as attack `[2,2,1,1,3,2]`. Blasphemous and Dead Cells both animate pose-to-pose with held keys.

**4.6 Rotation keys.** For facing changes and rotating props, render the 45° key and let the leading corner move slowly at the sides and fast through the centre (Slynyrd 40, rotating cube). Our `Dir 0-3` turns can use one in-between at 45°.

---

## 5. Lighting effects

**5.1 Glow and bloom: choose one resolution.** *Rule:* pixel games either paint glow as palette halos at art resolution (Saint11 *Light Magic*, xave's gem ring) or do smooth bloom at **screen** resolution over an upscaled image (HD-2D; Children of Morta stretches its pixel art about 4× so dynamic lights are high-res, per a dev interview, https://techraptor.net/content/how-dead-mage-created-the-art-for-children-of-morta). *Why:* blurring at art resolution and then nearest-upscaling gives blocky smears that look like bugs. *Apply:* small emitters (eyes, torches, gems) use palette halos (§1.6). Fires, burning buildings and spell blasts use a screen-res additive bloom in `GlPost`, with low intensity (≤ 0.35) and thresholded only on emissive-tagged pixels, not on bright armour.

**5.2 Light pools quantised to the ramp.** *Rule:* point lights (torches, braziers, burning roofs) should step through the palette, not add smooth gradients over it. *Apply:* "deferred palette shading". The atlas stores, per pixel, the ramp id, tone and a **4-bit quantised normal index** (we have N at ray-cast time). The battle shader computes `tone' = clamp(tone + bucket(Σ point-light N·L × falloff), 0, 3)` and looks up `rampTex[ramp][tone']`. Ordered Bayer 4×4 dithering in **world** coordinates applies only on the 1-2 px boundary between buckets. Thousands of units are lit by torches with zero re-render and no colours outside the palette. This is the same idea as Graveyard Keeper's per-sprite normal maps, Sea of Stars' planned "fully dynamic lighting of sprites including normal mapping" and Eastward's "retro-pixel + 3D lighting", but with palette-locked output.

**5.3 Fog and volumetrics.** Graveyard Keeper stacks horizontal fog layers, so tall things (roofs, tree tops) pierce them. *Apply:* on the battle map, use 2-3 fog bands keyed by **sprite screen-y minus foot-y** (height above the ground), so banners and spears stay clear while legs fade. Fog colour comes from the rig's ambient colour. Light cones (Saint11): only where smoke or dust exists, brighter in the middle, 2 tones max.

**5.4 Shadows for thousands.** *Rule:* a cast shadow gives a simple sprite depth (Slynyrd 11). *Apply:* project each sprite's alpha with a shear matrix toward the rig's sun direction into a **single shadow mask buffer**, then darken the ground once with the rig's shadow colour. Overlapping shadows of a formation then never double-darken. Keep the hard edge (§2.3) and no blur. Graveyard Keeper rotates shadow sprites per nearby light. We can afford only the sun plus a contact ellipse.

**5.5 Day/night as palette swap.** Night in Graveyard Keeper keeps emissive windows untouched while everything else goes teal and navy. *Apply:* emissive ramps are exempt from the scene LUT. Lights "turn bluer at nightfall" in their rig, except fires.

---

## 6. Isometric

- **Draw flat, then iso.** Heraldry, roof tiles, field patterns and banners can be painted flat, then rotated 45° and scaled 50% vertically with nearest sampling, followed by the cleanup pass (Saint11). Use RotSprite-style rotation (8× upscale with Scale2x, rotate, downsample: https://en.wikipedia.org/wiki/Pixel-art_scaling_algorithms#RotSprite) to keep lines clean.
- **Tile seams.** Use 2:1 diamonds with a **2-px stepped edge** and even widths. Paint terrain into one world-space buffer per chunk instead of per tile, so edge pixels are never doubled or missed. Seed texture stamps by world coordinate so they cross tile borders seamlessly.
- **Depth sorting.** Sort by footprint (x + y), with ties broken by height. Split multi-tile buildings into per-tile slices, or sort by the footprint's front corner. Units standing inside a building's footprint row need a topological sort, not a plain y-sort.
- **Facade lighting.** Facades lit by braziers or lanterns get the warm-bottom → cool-top gradient (Slynyrd 42), stepped in 2-3 bands. Build order for city kits: structure → signage/heraldry → lighting.

---

## 7. Automated pipeline techniques

1. **Palette mapping in OKLab with ordering preserved.** Map ramp steps to a faction master palette by OKLab distance with L weighted ×2, then **enforce monotonic L along each ramp** (re-sort, or nudge a duplicate to the next entry). Nearest-colour mapping otherwise collapses two steps into one.
2. **Joint segmentation and palette for large images.** Gerstner et al., *Pixelated Image Abstraction* (NPAR 2012, https://pixl.cs.princeton.edu/pubs/Gerstner_2012_PIA/), iterate SLIC superpixels and a palette solved by deterministic annealing. The user study shows it beats downsample + median cut. We don't need it for ray-cast sprites, but it is the right tool if we ever pixelate painted backdrops or portraits. The lesson for us is that **clusters and palette should be chosen together**, which the band-speckle merge in the craft guide approximates.
3. **Diagonal ambiguity.** Kopf and Lischinski, *Depixelizing Pixel Art* (SIGGRAPH 2011, https://johanneskopf.de/publications/pixelart/), resolve 2×2 checker crossings with "curves, sparse pixels, islands" heuristics. Run them in reverse as a lint: any 2×2 checker of two non-dither colours inside a figure is ambiguous and should be resolved toward the longer connected curve.
4. **Outline extraction.** Use ID-buffer edges for silhouettes and part borders, and normal-difference edges for creases (plate only). Normalise depth thresholds by depth (craft §3.4). The Texel Splatting paper (Ebert 2026, https://arxiv.org/abs/2603.14587) detects silhouettes from object-ID discontinuities and creases from normal discontinuities in the same pass as OKLab posterisation, and shifts **lightness**, not colour. That suggests making inner lines a tone shift of the local ramp, not a separate line colour.
5. **Temporal stability.**
   - The orthographic camera and integer-snapped sprite origins fix pixel creep ("pixel creep can only ever be solved for orthographic projections", ProPixelizer, quoted by Ebert).
   - Band thresholds get **hysteresis**: a pixel keeps the previous frame's tone unless N·L crosses the threshold by a margin ε ≈ 0.06. `PREV` already holds the last frame, so use it as the Schmitt-trigger memory.
   - Stamps and dithers are anchored in object or world space, never screen space.
6. **Native resolution, nearest sampling, consistent pixel size.** The craft guide covers this. One addition: film grain and scanlines in `post.ts` should be generated on the **art-pixel grid**, or kept very faint. Screen-res grain softens the crisp edges that the ray-caster worked to make.
7. **A defect linter.** The TU Delft BSc thesis *Pixel Fixer: Semi-Automated Techniques for Correcting Pixel Art* (dataset https://data.4tu.nl/datasets/11446578-c1f3-474c-9cc4-6978a79b675b) treats banding as "adjacent segments aligning their endpoints" and pillow shading as concentric banding. Count these per sprite (aligned band endpoints, orphan pixels, L-corners, 2×2 checkers) and print a score in `sprites-preview`, so art rounds have a number to push down.

---

## 8. Apply to Code Clash: checklist

- [ ] `ramp()` rebuilt in OKLCH: chroma peaks at the shade step, lights lose chroma, nothing is pure black or white.
- [ ] Ramps generated per **LightRig** (day / dusk / night-torch / Undead under-light). Shadows mix toward the ambient hue, lights toward the key hue.
- [ ] Uneven quantise thresholds (base band widest, light band a sliver). No equal bands.
- [ ] Chroma budget: neutrals C ≤ 0.07; team, emissive and blood C ≥ 0.14; one accent per unit.
- [ ] Normals snapped to about 26 directions per part before lighting (planar faces).
- [ ] Material table (§2.2) encoded as per-material params: span, spec, rim, shift, bands, stamp.
- [ ] Rim light: 1 px on the back-lit silhouette edge for metal and helms, levels ≥ 2 only. Bounce light on down-facing shadow pixels.
- [ ] Emissive tag: unlit, top of ramp, 1-2 px palette halo, exempt from the night LUT.
- [ ] Texture stamps on Poisson points hashed in object or world space, lit band only, never touching outlines.
- [ ] Atlas stores ramp id + tone + 4-bit normal index. The battle shader does team remap, scene LUT, torch light buckets and hit flash as palette lookups.
- [ ] Scene colour script: one ramp-LUT per battle and time of day, authored by grading a screenshot.
- [ ] Bloom only at screen resolution, only on emissive-tagged pixels, intensity ≤ 0.35. No art-res blur.
- [ ] Shadows: sheared alpha into one shadow mask, applied once, hard-edged, rig-coloured.
- [ ] Height-keyed fog bands on the battle map, coloured by the rig's ambient.
- [ ] Smears: light front, dark tail, one frame; complementary flash on the fastest hits.
- [ ] Squash/stretch on soft parts only, conserving area. Rigid armour and weapons are unchanged.
- [ ] Cloth bones posed at t − lag (secondary motion for free). Per-frame hold table with hit-stop.
- [ ] Idle glint sweep on blades and helms. 1-frame white-silhouette hit flash via shader flag.
- [ ] Band hysteresis using `PREV`. Orthographic camera and integer origins. Grain on the art-pixel grid.
- [ ] Ordering-preserving OKLab palette mapping. 2×2 checker lint. Defect score in `sprites-preview`.
- [ ] CI readability: 3-value posterised silhouettes (class IoU < 0.85), unit-vs-terrain ΔL ≥ 0.12.
- [ ] LOD switch with hysteresis and a 2-frame dither crossfade.
- [ ] City: flat-paint then iso-transform for decals, chunk-buffer terrain (no seams), footprint depth sort, warm-bottom/cool-top torch-lit facades, no inner lines between faces (bright corners instead).

---

## Sources

Fetched and read:
- Saint11 (Pedro Medeiros, Celeste/TowerFall artist) tutorial index: https://saint11.art/blog/pixel-art-tutorials/ (cards listed in §0).
- Slynyrd Pixelblog catalogue: https://www.slynyrd.com/pixelblog-catalogue
  - 2 Texture: https://www.slynyrd.com/blog/2018/2/15/pixelblog-2-texture
  - 6 Light and Shadow: https://www.slynyrd.com/blog/2018/6/15/pixelblog-6-light-and-shadow
  - 40 3D Pixel Art Animation: https://www.slynyrd.com/blog/2022/9/25/pixelblog-40-3d-animation
  - 42 Cyberpunk: https://www.slynyrd.com/blog/2023/1/30/pixelblog-42-cyberpunk-pixel-art
  - Also relevant, not re-read here: 45 Bricks/Walls, 54 More Isometric, 61 Isometric Mecha Tactics, 52 Idle Stance, 50 Walk Cycle (URLs in the catalogue).
- Graveyard Keeper effects (LUT day/night, painted normal maps, depth-aware light, rotating shadow sprites, layered fog, wind shader): https://slava.lazybeargames.com/graveyard-keeper-how-the-graphics-effects-are-made
- Ebert, *Texel Splatting* (2026; related work on t3ssel8r and ProPixelizer camera snapping, OKLab posterisation, ID/normal edges): https://arxiv.org/abs/2603.14587
- Ottosson, *A perceptual color space for image processing* (OKLab): https://bottosson.github.io/posts/oklab/
- Gerstner et al., *Pixelated Image Abstraction*: https://pixl.cs.princeton.edu/pubs/Gerstner_2012_PIA/ ; journal version: https://cragl.cs.gmu.edu/pixelate/
- Children of Morta lighting (pixel art stretched about 4× for HD dynamic lights): https://techraptor.net/content/how-dead-mage-created-the-art-for-children-of-morta
- Sea of Stars render-pipeline claims (normal-mapped sprites, pixel depth, shadow receiving): https://sabotagestudio.com/presskits/sea-of-stars
- HD-2D overview (DoF, bloom, tilt-shift; denser tiles so sprites don't look "lonely"): https://en.wikipedia.org/wiki/HD-2D ; Unreal Fest 2019 talk: https://www.unrealengine.com/events/unreal-fest-europe-2019/the-fusion-of-nostalgia-and-novelty-in-the-development-of-octopath-traveler
- Normal maps for pixel art (survey): https://ar5iv.labs.arxiv.org/html/2212.09692 ; *Light the Sprite* (EG 2025): https://diglib.eg.org/handle/10.2312/egs20251032
- Blasphemous purist pixel animation (no bone animation): https://www.hollywoodreporter.com/heat-vision/blasphemous-designer-purist-approach-games-pixel-art-style-1238370
- Diablo II sprites were rendered from 3D, with equipment layered rather than rendered for every combination (community sources only): https://gamedev.net/forums/topic/556056-how-to-design-diablo-style-sprites/ ; palette transforms in PL2: https://www.github.com/OpenDiablo2/pl2
- Pixel Fixer thesis dataset (TU Delft): https://data.4tu.nl/datasets/11446578-c1f3-474c-9cc4-6978a79b675b
- Pixel-art scaling and RotSprite: https://en.wikipedia.org/wiki/Pixel-art_scaling_algorithms

Cited from knowledge, not fetched this round: Kopf and Lischinski *Depixelizing Pixel Art* (https://johanneskopf.de/publications/pixelart/), and the video channels of AdamCYounis, Brandon James Greer, MortMort and Pixel Pete (YouTube; their standard lessons on hue shifting, readability and avoiding banding are the same rules as above). **Gaps:** I found no primary sources for Eastward's lighting (Pixpil says only "retro-pixel + 3D lighting"), Kingdom Two Crowns' water and grading, Songs of Conquest's sprite lighting, Stoneshard, Owlboy beyond the craft guide, Hyper Light Drifter's palette method, or t3ssel8r's own write-up (it is video-only). The claims above about those games are limited to what the cited pages say.
