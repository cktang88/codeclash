# Pixel-art craft for Code Clash: making 64-128 px ray-cast sprites look hand-made

Reference images studied (downloaded to a scratch folder and opened for study): xave_pixel's 128/64/32 size comparison (the user's target), Slynyrd's *168 - Knight* (32x48) and *170 - Castle* (64x64) process sheets, Slynyrd's hue-shifted red ramp and his *Tiny Pixels* scene, Dead Cells' flat-colour render and normal-map frame (Motion Twin), and Saint11's *Metals*, *Outlines*, *Fabric/Flags* and *<1 Pixel Movement* tutorial cards. The image files are kept for study only; none of them are CC0, so none get committed.

---

## 0. Case study: xave_pixel, 128 vs 64 vs 32 (https://i.redd.it/fxx9828pdq3d1.png)

I measured this one instead of just eyeballing it. The image is an exact 6x nearest-neighbour upscale with the grid at offset 0. I resampled it back to native pixels:

| sprite | native bbox | opaque px | colours (>=3 px) |
|---|---|---|---|
| girl "128" | 72x132 | 5349 | ~73 (115 incl. singletons) |
| girl "64" | 35x64 | 1322 | ~31 |
| girl "32" | 17x32 | 299 | ~26 |
| brute "128" | 130x91 | 6348 | ~59 |
| brute "64" | 62x44 | 1443 | ~29 |
| brute "32" | 31x22 | 366 | ~22 |

What I saw:
- **The size label means character height.** The width is whatever the pose needs. A "128" figure is about 130 px tall and only about 70 px wide, so it fills roughly a third of a 128x128 cell. The same will be true of our cells.
- **There is no black outline anywhere.** Each silhouette is closed by the darkest step of the local material's own ramp: near-black brown on the hair, near-black green on the gauntlets, dark red-brown on the skin. This is selective, coloured outlining, and it keeps the figures soft but still separate from the warm grey background.
- **Ramps are short and hue-shifted.** Each material has 3-5 steps. Skin goes pale yellow (light) → peach → orange → red-brown (shadow). Teal goes mint-teal → teal → green-black. Tan armour goes cream → tan → olive-brown. Shadows move toward warmer or redder hues and lose value. Highlights go yellow-white and are never pure white.
- **Shading is planar with hard edges.** The light comes from the front and upper left. Shapes are carved by 2-3 large clusters per form. There are no gradients and almost no dithering. The 64 and 32 versions keep the same plane breaks with fewer steps.
- **What 128 adds over 64:** readable facial features (eyes 3-4 px wide with a red iris and a white catch-light, a 1-px brow line, the nose implied by one shadow pixel, a mouth pixel), separated hair strands with gaps, knuckle segments on the gauntlets, folds on the boot cuffs, a dotted single-pixel chain, a belt with a buckle, 1-px cyan rim-light along the brute's edges, and a concentric glow ring around the axe gem.
- **What 64 keeps:** every major mass and colour zone, the face as a dark band with one red pixel, the gauntlets as two-tone blocks, the belt as a single brown stripe, and the gem as a cyan cross with a centre.
- **What survives at 32:** only **colour masses and silhouette**. That is hair (dark top), skin (orange), outfit (purple-grey), oversized teal gauntlets, and one red eye pixel. On the brute it is the tan body mass, the dark axe head and **the cyan emissive gem**. The things that read at 32 were designed to read: **oversized signature features** (giant gauntlets, a huge axe) and **one saturated accent on a desaturated body**. The colour count barely drops between 64 and 32 (about 30 to about 25) because each surviving zone still needs light, mid and dark.
- **Lesson for us:** a 128 cell is a detail budget, not a size target. Design the 32-px read first (masses plus one accent colour), then let 128 add sub-features inside those masses without changing the masses.

Similar breakdowns: Slynyrd's *Pixelblog 47 - Tiny Pixels* (keep only the defining features, such as shoulder pads and red hair; "push the detail just far enough until the mind can fill in the rest", from Pixelblog 57) and his knight sheet, which builds the figure in stages: anatomy → armour shapes → flat 2-tone → clusters → outline variants.

---

## 1. Principles

1. **Silhouette first.** Fill the sprite with one colour. If you can't tell the class, the facing and the weapon, more detail won't fix it (Slynyrd 47/57, Saint11 *Outlines*).
2. **Clusters, not pixels.** A good sprite is made of a few large same-colour clusters with clean edges. Noise, meaning single stray pixels and many small scattered clusters, reads as dirt and blur. Slynyrd 57 warns against "many small scattered clusters and overly gradual colour transitions".
3. **One light source, planar shading.** Shade the form, not the outline. *Pillow shading* means dark at every edge and light in the middle. It is the classic beginner error because it shows no light direction.
4. **Hue-shifted ramps.** A ramp changes hue as well as value. Slynyrd's rule is up to about 20° of hue per step. Saturation peaks in the middle of the ramp and never reaches 0 or 100. Value steps get smaller near white. Highlights shift toward yellow and shadows toward red, purple or blue. Straight ramps (value-only) look dead.
5. **Limited colours per material.** 3-5 steps per material and roughly 24-40 colours per figure at 128 (xave uses about 60-70 including the face). A few well-chosen colours give cleaner clusters than many near-duplicates.
6. **Selective outline.** Use a dark tint of the adjacent colour, not black. Drop or lighten the outline on the lit side. Inner borders between parts can be lighter than the outer border (Saint11 *Outlines*).
7. **Clean lines.** Lines should step evenly (1:1, 1:2, 2:1, 1:3). Mixing step lengths (2,3,2,1) causes jaggies. Remove doubled pixels on corners ("pixel-perfect" lines) and 2-px-thick lines where you wanted 1 px.
8. **Exaggerate.** Make signature parts larger than life: the shield, the helmet crest, the yari, the skull and the gauntlets. Realistic proportions disappear at small sizes.

---

## 2. Techniques for 64-128 px detail

At 128 we can afford about 3-5 pixel steps across a forearm and an 8-14 px head. Spend that on **material identity** and **face/helm**, not texture noise.

- **Mail (Templar hauberk):** don't render every ring. Use a mid-value base with a regular 2x2 or offset checker of the light step **only in the lit plane**, and leave the shadow plane flat dark. That fits Saint11's fabric rule that "dark areas have less detail", which applies here too. A 1-px darker horizontal line every 2-3 rows suggests ring rows. Mail is cool grey with a slightly blue hue.
- **Plate / helm (great helm, kabuto bowl, undead rusted plate):** this is the high-contrast material. Saint11's *Metals* card says to use a strong **backlight** (a bright rim on the side away from the key light), a sharp specular (1-3 px, near-white), and "multiple lines of light/shadow" for reflections, i.e. alternating light and dark bands following the curvature. Light tones are **colder and less saturated**, dark tones **warmer and more saturated**. The value jump between adjacent steps is large, with little middle. Scratches and dents (1-px darker marks) tell age, which suits the Undead.
- **Cloth (Templar surcoat, sashimono flag, Undead rags):** soft, low contrast and **no specular**. Use 3 steps at most. Folds radiate from compression points (elbow, belt, knee). They run parallel where cloth is under tension and perpendicular where it is slack. Few folds: "too many folds gets noisy". The red cross on white must remain a 2-value shape that holds up at 32 px.
- **Lacquer (samurai do and lamellar):** a saturated base (red, black or brown) with a **hard glossy highlight streak** like metal, but the shadows stay saturated rather than going grey. Lamellar lacing reads as horizontal bands of alternating colour, 1-2 px each. Keep the band period constant or it turns into noise.
- **Bone (Undead):** a warm off-white ramp (cream → ochre → brown-grey). Dark sockets are 2-3 px clusters, and those two pixels **are** the face read. Don't outline every rib. Use 2-3 rib stripes with gaps.
- **Horse hide:** a smooth, satin 4-step ramp with a single broad highlight on the rump, barrel and neck. The mane and tail are a darker clustered mass with 2-3 strand gaps. The legs need clear light/dark separation between near and far pairs, or the gait won't read.
- **Faces at 128:** the eye line sits about halfway down the head. Eyes are 1-2 px dark with an optional 1-px catch-light, the brow is 1 px, the nose is a single shadow pixel on the shadow side, and the mouth is one pixel. Skin needs at least 3 steps with warm shadows. Under helms, the face is just the dark visor slit plus the face shadow. That is better for us: **the helm silhouette is the face**.
- **Weapons:** a blade is 1 px wide, with a 1-px specular line along the lit edge and a darker edge on the other side. At long lengths, keep its angle on a clean step ratio (snap to 0°, 26.5°, 45°, 63.5° or 90° in screen space where the pose allows). Spear and yari shafts are thin lines and should be darker than the background on both sides. The tip gets the brightest pixel in the sprite.

---

## 3. Applying this to a 3D → pixel ray-cast pipeline

Reference pipelines: Dead Cells (3ds Max models rendered small **without anti-aliasing**, exported per frame with a **normal map**, toon-shaded in engine, at 30 fps, with keyframed pose-to-pose animation; the team accepted some flicker, and I saw flat-colour albedo plus normal frames in their article images). Guilty Gear Xrd (models built for the shader: hand-edited normals for clean shadow shapes, designer-controlled shadow thresholds, inner lines placed as authored texture lines rather than geometry, and **stepped keyframes with no interpolation**). The t3ssel8r / Godot "3D pixel art" shaders (low-res render, depth+normal edge detection, separate silhouette vs crease lines, highlight on convex edges). The Bevy pixel-art shader (toon quantise → CIELAB palette match → grid-aligned Bayer dither).

### 3.1 Ray-cast at native resolution, one sample per pixel
- Use a single ray per pixel through the pixel centre, with **no supersampling**. Hard 0/1 alpha. AA is what produces "smudge" colours that aren't in the palette.
- Use an orthographic camera. Snap the model origin to the pixel grid (integer pixel translation per frame) so that static parts do not re-rasterise differently between frames. This is the fix for Dead Cells' flicker.
- Per pixel, output: material ID, normal, depth, part ID (head/torso/weapon/shield), and a "team mask" flag.

### 3.2 Light ramps with hue shift (replacing Lambert)
```
L = dot(N, keyDir)            // key light upper-left-front, consistent for all units
L += rimTerm(N, view)*k_mat   // backlight: metal high, cloth 0
band = quantise(L, thresholds_mat)   // 3-5 bands, thresholds per material (not uniform!)
colour = ramp_mat[band]              // pre-authored hue-shifted ramp
```
- Generate the ramps procedurally in **OKLCH**. Starting at the base colour, each darker step does L −0.10…0.14, hue +12…20° toward red/purple for warm materials (toward blue for steel), and chroma peaking at the middle step. Each lighter step does hue toward yellow (or toward cyan for cold steel highlights) and chroma −10-20%. Clamp so no step is pure black or white. Then hand-tune per faction.
- Thresholds: make the **mid band the widest** (about 50% of lit area). Shadow is one hard band, and highlight is small (≤10% of area, metals only). That gives the planar look of xave's sprites instead of a smooth gradient.
- Ambient occlusion and contact: a cheap AO term (depth difference to neighbours) pushes one band darker in creases (armpits, under the helm brim, between the legs). Don't add more bands.
- Speculars come from material, not physics: plate and lacquer get a 1-3 px highlight cluster at max(N·H). Cloth, bone and hide get none.

### 3.3 Palette quantisation
- Quantise per material ramp (above), not globally after the fact. If there is a global faction palette, map each ramp step to its nearest entry by **OKLab distance**.
- **Avoid dithering on figures.** It flickers in animation and turns into noise at a distance. If needed, use it only on large static surfaces (city walls, terrain), Bayer 2x2 aligned to the world grid, and only between adjacent ramp steps.

### 3.4 Outline and inner-line passes (post, on the ID/depth buffers)
1. **Outer silhouette:** any empty pixel 4-adjacent to the sprite becomes outline, *or* (as in xave) the sprite's own edge pixels drop one ramp step. For crowd reading at 2560x1440, use a 1-px outer line in a **dark, hue-matched colour** (darkest step of the adjacent material, mixed 30% toward a faction-neutral near-black). Don't use pure black.
2. **Selective outline:** on the lit side (edge normal · keyDir > 0.5), lighten the outline one step or drop it entirely.
3. **Inner lines:** draw a line where part ID differs (arm over torso, shield over body) **or** where the depth jump is greater than threshold×depth (normalise by depth, as in the Godot long-distance fix). Colour it as the darker of the two sides' shadow step, which is lighter than the outer outline. Skip inner lines between parts of the same material where the normal difference is small. Crease lines (normal difference > ~40°) only on plate.
4. **Thin-part protection:** spear shafts, blades and reins can vanish when outline pixels overwrite them. Render thin props in a second pass after outlining, or mark them so they are never overwritten.

### 3.5 Cleanup (where hand-made quality comes from)
- **Orphan pixels:** a pixel whose colour matches none of its 8 neighbours, inside a material region, becomes the majority neighbour colour. Exempt eyes, specular and emissive pixels (tag them).
- **Doubles / L-corners on lines:** on outline and inner-line masks, remove pixels that form an "L" (a pixel with two orthogonal line neighbours that are themselves diagonal neighbours). This is the standard "pixel-perfect" filter that Aseprite's brush applies.
- **Jaggies on silhouettes:** look at runs along each edge. If a run length differs from both neighbours by more than 1 (e.g. 3,1,3), shift one pixel to even the runs out. A cheap version is a 3x3 majority (median) filter on the alpha mask only, which kills 1-px spurs and 1-px notches.
- **Band speckle:** after quantisation, flood-fill clusters of the same band per material. Any cluster with fewer than 3 px (fewer than 2 at 64) merges into its largest neighbour band. This removes the "noise" and "banding stair" artefacts that make 3D renders look rendered.
- **Temporal stability:** compare each frame with the previous one. Pixels that flip band for one frame only (A-B-A) are set to A. This is cheap anti-flicker for the idle/brace loops.

### 3.6 Animation and frame timing
- Animate **pose to pose**: author key poses and render **few frames, held**, rather than smooth interpolation (Xrd's stepped keys, Dead Cells' keyframes first).
- Suggested counts at 12 fps base (hold some frames 2 ticks): idle 4 (breath via a ±1-px chest/shoulder shift, moving light before shape as Saint11 recommends for sub-pixel motion), walk 6-8, run 6, attack 5-6 (anticipation 2 → **smear 1** → impact hold 2 → recover 1), shoot 4-5, hit 2-3 (1-frame white/flash pixel on the edge of the body), die 5-6, dead 1, brace 2.
- **Smears:** on the swing frame, render the weapon at 2-3 sub-frame positions and union their masks into one swept shape, filled in the weapon's light colour. Don't blend them.
- Snap the whole-body offset to integer pixels. Ease in and out by spacing poses, not by moving sub-pixels.

---

## 4. Crowd readability (thousands of figures)

- **Design for the 32-px read.** At 2560x1440 most figures will appear at about 32-48 px. Each faction needs **one dominant value pattern plus one accent hue**: Templar is white surcoat, red cross and steel helm. Sengoku is dark lacquer with a coloured sashimono flag rising above the head as a team marker. Undead is bone-pale over black with a sickly green or cyan emissive accent, like the cyan gem in xave's brute that survives at 32.
- **Team colour should cover large areas** (surcoat, flag, shield face, horse caparison), not a trim stripe. Community RTS discussions (Spring, AoE) note that small team spots vanish at strategy-camera distance. Implement it as a **mask channel in the ray-cast** (AoE-style palette remap: tagged pixels are recoloured from the team ramp at draw time), so one sprite sheet serves all teams.
- **Value contrast against the terrain.** Keep figures' mid values out of the terrain's mid range. A thin dark outline plus a 1-px contact shadow ellipse under each figure separates them from the ground.
- **Distinct silhouettes per unit class:** spear verticals, round shield, kite shield, bow arc, mounted hump, banner. Test this by filling sprites with a single colour.
- **LOD:** below about 40 px on screen, switch to a dedicated low-res sheet rendered **at 32 or 48 px with its own cleanup**. Never downscale a 128 sprite (thin parts vanish and colours mush). (The HD 64 battle mode does halve the 128 sheets on purpose, with a reduction built against exactly these two failures: see `hd64-downscale.md`.) The LOD sheet should exaggerate the signature features further, with fewer bands (3) and a mandatory outline.
- **Formation readability:** align facing within units, vary animation phase per figure (random start frame, seeded deterministically in `src/game`), and use unit banners or icons above formations, as Total War does, to carry type and allegiance.

---

## 5. Display and scaling

- **Integer scale only, nearest neighbour.** Use `image-rendering: pixelated`, `ctx.imageSmoothingEnabled = false`, and integer draw coordinates after camera transform. At 2560x1440 a 3x or 4x world scale is natural.
- With a free zoom, either snap the zoom to integers or use **sharp-bilinear**: nearest-integer prescale, then bilinear only at texel boundaries. Plain non-integer nearest gives uneven pixel widths that shimmer while moving.
- Snap the camera to whole *art* pixels, not screen pixels, to avoid sub-pixel crawl.
- Don't mix pixel scales in one scene: units, buildings and UI should share one world-pixel size (Slynyrd 41 and the HD-2D notes both warn about inconsistent resolution). Octopath's HD-2D team found plain sprites looked "lonely" on big screens and increased environment tile and colour density. The city needs comparable density.

---

## 6. City and building notes (isometric Canvas2D)

- Use **2:1 lines** (26.57°), not true 30°. Use even tile sizes, and check alignment with a 2:1 ruler (Slynyrd 41).
- **Two-plane lighting:** with light from the upper left, the left wall face is lit and the right face is a hue-shifted shadow. Slynyrd's castle uses cream for lit faces and purple for shade, with the roof carrying the colour identity. Add a third, lightest value on roof tops. Do the drop shadows (under eaves, windows, arches) before any texture.
- Build from cuboid kits: towers, walls, roofs and windows that mix and match (castle sheet). Vary roof hue per district or faction (his tower recolours).
- Texture should be sparse and regular: brick courses every 3-4 px, hinted on the lit face, nearly absent on the shadow face. Don't mix flat and high-detail tiles.
- Use outlines only where a building meets the sky or ground. Make them a darker shade of the adjacent colour, not black (Slynyrd 51).
- Use the **same key light and the same ramp generator** as the units so they sit in one world.

---

## 7. Sources

Licence note: everything below is copyrighted study material unless stated otherwise. Don't commit any of these images. Godot shader snippets are MIT. Kenney and OpenGameArt CC0 packs are the safe sources for committed reference assets.

- xave_pixel, 128/64/32 size comparison: https://i.redd.it/fxx9828pdq3d1.png (artist's copyright, study only)
- Slynyrd (Raymond Schlitter) Pixelblog catalogue: https://www.slynyrd.com/pixelblog-catalogue
  - 1 Color Palettes (hue-shift ramps): https://www.slynyrd.com/blog/2018/1/10/pixelblog-1-color-palettes
  - 41 Isometric Pixel Art: https://www.slynyrd.com/blog/2022/11/28/pixelblog-41-isometric-pixel-art
  - 47 Tiny Pixels: https://www.slynyrd.com/blog/2023/11/26/pixelblog-47-tiny-pixels
  - 51 City Builder: https://www.slynyrd.com/blog/2024/7/25/pixelblog-51-city-builder
  - 57 Knights, Monsters & Castles: https://www.slynyrd.com/blog/2025/7/28/pixelblog-57-knights-monsters-amp-castles
  - 8 Intro to Animation / 9 Melee Attacks: https://slynyrd.com/blog/2018/8/19/pixelblog-8-intro-to-animation , https://slynyrd.com/blog/2018/9/8/pixelblog-9-melee-attacks
- Pedro Medeiros (Saint11) pixel tutorials (Metals, Outlines, Fabric, <1 px movement): https://saint11.art/blog/pixel-art-tutorials/ (images: https://saint11.art/img/pixel-tutorials/Metal.gif etc.; copyrighted, free to view)
- Thomas Vasseur, "Art Design Deep Dive: Using a 3D pipeline for 2D animation in Dead Cells": https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i-
- 80.lv, Dead Cells character art pipeline: https://80.lv/articles/case-study-dead-cells-character-art-pipeline/
- Junya C. Motomura, "GuiltyGearXrd's Art Style: The X Factor Between 2D and 3D" (GDC 2015): https://gdcvault.com/play/1022031/GuiltyGearXrd-s-Art-Style-The ; handout https://www.ggxrd.com/Motomura_Junya_GuiltyGearXrd.pdf
- Godot "3D pixel art outline & highlight" shaders (MIT): https://godotshaders.com/shader/3d-pixel-art-outline-highlight-post-processing-shader/ ; long-distance fix https://godotshaders.com/shader/3d-pixel-art-outline-highlight-shader-fix-for-long-distance/
- bevy_pixel_art_shader (toon → palette → Bayer): https://docs.rs/crate/bevy_pixel_art_shader/latest
- Loominary wiki, OKLab matching and dithering: https://github.com/zerohpminecraft/loominary/wiki/Dithering-and-Color-Matching
- Songs of Conquest, 2D billboards in 3D: https://80.lv/articles/mixing-2d-billboards-and-3d-environments-in-a-game/
- HD-2D (Octopath) background: https://en.wikipedia.org/wiki/HD-2D ; https://www.unrealengine.com/en-us/developer-interviews/octopath-traveler-ii-builds-a-bigger-bolder-world-in-its-stunning-hd-2d-style
- Owlboy "hi-bit" and "pixel art done properly": https://80.lv/articles/owlboy-10-years-of-indie-dev
- Blasphemous purist pixel animation: https://www.hollywoodreporter.com/heat-vision/blasphemous-designer-purist-approach-games-pixel-art-style-1238370
- Sub-pixel animation: https://someanimatorwannabe.substack.com/p/animator-techniques-sub-pixel-animation
- Few frames suffice (UNIST study): https://tinywarriorgames.com/2019/11/22/you-dont-need-a-lot-of-animation-frames-unist-sprite-animation-study/
- Smear frames: https://prolificstudio.co/blog/smear-frames/
- Lines and jaggies: https://opengameart.org/content/chapter-2-lines-and-curves (OGA tutorial) ; https://community.aseprite.org/t/how-do-i-make-straight-curved-lines-properly/10246
- Lospec tutorial index (Pixel Logic by Michael Azzi, "Creating Pixel Art" by cure on PixelJoint): https://lospec.com/pixel-art-tutorials ; http://pixeljoint.com/forum/forum_posts.asp?TID=11299
- Derek Yu pixel art tutorial and common mistakes: https://www.derekyu.com/makegames/pixelart.html , https://www.derekyu.com/makegames/pixelart2.html (not fetched; the page came back empty)
- Integer and sharp-bilinear scaling: https://github.com/NuclearMeltdown/qBlank/wiki/Scaling-and-sharpening ; https://gitlab.gnome.org/World/highscore/-/issues/153
- Team-colour masks (AoE / openage): https://github.com/genie-js/slp-render ; https://widelands.org/wiki/AboutColors
- Total War unit banners: https://totalwar.fandom.com/wiki/Unit ; team-colour visibility discussion https://springrts.com/phpbb/viewtopic.php?p=444479

Gaps: pedro.medeiros.page was blocked by the network policy and web.archive.org can't be fetched. I found no primary source for Total War's own LOD and readability methods, or for Metal Slug's process. Paul Robertson, MortMort, Brandon James Greer and Army of Trolls are mostly video or Patreon material and weren't fetched. The rules above are covered by the sources that were.
