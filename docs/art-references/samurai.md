# Samurai (Sengoku clans): references

Studied for the Samurai faction (docs/factions.md). Reference only; no image files committed. All
Met images are Open Access (public domain, CC0 metadata), fetched through the Met collection API.

| # | Image | Source / licence | Taken from it |
|---|---|---|---|
| 1 | Dō-maru armour, ca. 1550 (Met 22505) | https://www.metmuseum.org/art/collection/search/22505 — image https://images.metmuseum.org/CRDImages/aa/web-large/DT305406.jpg — Public domain (Met Open Access) | Sengoku-period armour reads as **horizontal stripes** of lacing (odoshi): bands of indigo, vermilion, white and ochre. At 16 px that becomes 2–3 alternating 1-px rows on the torso and kusazuri skirt. The kusazuri flares into a **bell/skirt** below the waist: the widest point of the figure is the hips, not the shoulders. Sode (shoulder boards) are flat rectangles that stick out sideways. |
| 2 | Gusoku armour, 18th c. (Met 24975) | https://www.metmuseum.org/art/collection/search/24975 — image https://images.metmuseum.org/CRDImages/aa/web-large/DT5334.jpg — Public domain | Full silhouette of a samurai: **wide flared kabuto** with a turned-back fukigaeshi on each side and a crest spike, **menpō face mask** (dark with a white moustache), dark lacquered plate dō in the middle, bright lacing rows at the sode, white sash at the waist, kusazuri plates hanging in a trapezoid. Palette: black lacquer, rust-brown, vermilion knots, green-and-white lacing. Lacquer is near-black, so the faction "metal" is a warm dark grey, not Templar steel. |
| 3 | War hat (jingasa), 18th–19th c. (Met 27593) | https://www.metmuseum.org/art/collection/search/27593 — image https://images.metmuseum.org/CRDImages/aa/web-large/LC-L_2004_41_13-002.JPG — Public domain | The ashigaru hat: a **shallow cone with a wide flat brim** wider than the shoulders. In pixels: a 7–9 px wide, 2 px tall wedge over a 3 px head, with a 1-px gold mon dot. This alone separates ashigaru from samurai (tall horned kabuto) at game scale. |
| 4 | Utagawa Yoshitsuna, *The Fourth Battle at Kawanakajima* (Met 893323) | https://www.metmuseum.org/art/collection/search/893323 — image https://images.metmuseum.org/CRDImages/as/web-large/DP149164.jpg — Public domain | How a Sengoku army reads from far away: **a forest of small rectangular sashimono flags** above every head, each regiment in one colour, spears as long thin diagonals, mounted samurai with **horo** (cloak balloon) and big crests. The flags carry the army's identity: we make the sashimono the team-hue element. Cavalry crossing at full gallop leans forward with spears level. |
| 5 | Utagawa Kuniyoshi, *The Wada Rebellion: Yoshihide Breaks Down the Great Gate* (Met 893317) | https://www.metmuseum.org/art/collection/search/893317 — image https://images.metmuseum.org/CRDImages/as/web-large/DP149158.jpg — Public domain | Heavy foot drama: a huge figure with a raised club (kanabō-like) smashing a gate while lighter men scatter. Source for the Sōhei/shock unit pose: weapon held **two-handed high over the head** in Attack, white head-cowl (sōhei katō) as a bright pixel cluster. |
| 6 | Matchlock gun (Met 32138) | https://www.metmuseum.org/art/collection/search/32138 — image https://images.metmuseum.org/CRDImages/aa/web-large/DP166283.jpg — Public domain | Generic matchlock silhouette (this one is not Japanese; used only for shape): a long straight barrel, short stock held **against the cheek**, not the shoulder, brass bands. For teppō: a 7–8 px straight dark line with one gold pixel at the pan, plus a 1-px grey smoke puff on Shoot. |
| 7 | sebshady, *Samurai Sprites* (OpenGameArt) | https://opengameart.org/content/samurai-sprites — image https://opengameart.org/sites/default/files/samurai.png — **CC0** | 48×48 3/4-view samurai in four facings with walk, attack and death. Takeaways: the **topknot** and a pale face are enough to read "samurai" without a helmet; the katana is a 1-px pale arc that sweeps through 3 frames; death is a fall to the side with a red pixel pool. Too cartoony in colour (flat sky-blue); we keep its readable pose timing but use the darker lacquer palette from refs 1–2. |

Not used: the Wikimedia Commons API was rate-limited from the build machine (HTTP 429), so the
Nagashino screen (File:Battle-of-Nagashino-Map-Folding-Screen-1575.png, public domain) was found
but not downloaded; revisit for teppō volley lines behind the palisade.

## Added by the sprite painter (sprites.ts)

| # | Image | Source / licence | Taken from it |
|---|---|---|---|
| 8 | Helmet (*Zukinnari Kabuto*), 16th c. (Met 24014) | https://www.metmuseum.org/art/collection/search/24014 — Public domain (Met Open Access) | The kabuto bowl sits low with a wide flaring shikoro (neck guard) and turned-back fukigaeshi, and the crest is a tall gold-and-vermilion shape above. In pixels: a dark bowl, a laced vermilion flare at the back and sides, and a 2-px gold crest. The daimyō gets a 5-px crescent. |
| 9 | Kawanakajima print and Met gusoku, re-studied at sprite scale (refs 2, 4) | as above | At game scale the dark lacquer must stay near-black rather than blue: our first pass used `#2c3550` and whole blocks read as blue blobs, so lacquer became `#2a2a31` and the team-hue sashimono carries all the colour. Seen from behind, a regiment is a field of flags, as in the print. |
| 10 | sebshady, *Samurai Sprites* (OGA, CC0), re-studied (ref 7) | **CC0** | The katana as a pale 1-px arc that sweeps through the attack; the fall to the side. |

## The sōhei's katō shows a face (cc/art3)

At battle zoom (HD, zoom 4) a block of sōhei read as rows of blank cream eggs: the katō's eye slit
was one pixel high at level 4 and merged into the cowl's tan there, so nothing said "man" under
the cloth. References, study only (in `references/samurai/`):

| Image | Licence | What was taken |
|---|---|---|
| [Met 58396, inrō with Yoshitsune and Benkei on the Gojō Bridge](https://images.metmuseum.org/CRDImages/as/web-large/81_1_325_O3.JPG) ([page](https://www.metmuseum.org/art/collection/search/58396)) | CC0 | Benkei's head wrap leaves brows, eyes and cheeks bare in an oval opening; the cloth frames the face with a dark inner edge. |
| [Met 58349, box with Benkei and a bell](https://images.metmuseum.org/CRDImages/as/web-large/DT220564.jpg) ([page](https://www.metmuseum.org/art/collection/search/58349)) | CC0 | The cowl as a mass of wrapped folds round a visible face; the eyes are the darkest thing on the head. |
| [Met 44989, Yoshitsune and Benkei putting to flight the ghosts (Hokusai school print)](https://images.metmuseum.org/CRDImages/as/web-large/DP124562.jpg) ([page](https://www.metmuseum.org/art/collection/search/44989)) | CC0 | The monk's face is a strong light shape inside the dark of the wrap and the robe; the eye is a bold black stroke. |
| [Met 57836, Illustrated Story of Yoshitsune](https://images.metmuseum.org/CRDImages/as/web-large/LC-JIB_145_004_crd.jpg) ([page](https://www.metmuseum.org/art/collection/search/57836)) | CC0 | Even in line, the hooded men read by the face opening and the eyes; the hood's silhouette alone does not. |

What changed (`samurai-static.ts`, `kato`): an oval opening shows the face (flesh, darker on the
shade side and under the brow), the eyes as two dark marks, brows at level 8, and the wrap's inner
edge one tone down round it. Rounds: (1) a larger opening read at level 8 but at level 4 the brows
and eyes fused into a black visor bar; (2) eyes only below level 8, at 0.12 of the opening, vanished
at level 4; (3) eyes at 0.22 below level 8, no brows: two dark eyes in a flesh window at level 4, and
in battle the block reads as hooded men. Pixel lint (HD, kind 8): no new warnings or failures.
