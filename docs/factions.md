# Factions

Every faction fields the same ten unit classes (src/game/units.ts) and the same eight buildings.
A faction renames them, gives them a look, and nudges **at most 3 stats by at most ±10%**
(design.md §4). Data lives in `src/game/factions.ts`; art references in
`docs/art-references/samurai.md` and `docs/art-references/undead.md`.

The team hue (heraldry, chosen by the player) goes on what the eye finds first in a crowd: the
Templar shield and banner, the Samurai **sashimono** back-flag, the Undead **shield and tattered
banner**. Faction palette colours never compete with it: the Samurai are dark lacquer with vermilion
lacing, the Undead bone and black with a sickly green glow.

## At a glance

| Class (UnitClass) | Knights Templar | The Samurai Clans | The Hollow Host |
|---|---|---|---|
| 0 HeavyInfantry | Sergeant-Brothers | Katana Samurai (*samurai*) | Grave Legionaries (*legionaries*) |
| 1 Spearmen | Spear Levy | Yari Ashigaru (*ashigaru spears*) | Ghoul Spears (*ghoul spears*) |
| 2 Skirmishers | Javelin Men | Nage-yari Skirmishers (*skirmishers*) | Bone-Throwers (*bone-throwers*) |
| 3 Archers | Pilgrim Archers | Yumi Ashigaru (*bowmen*) | Wraith Bows (*wraith bows*) |
| 4 Crossbowmen | Genoese Crossbows | Teppō Ashigaru (*teppō*) | Revenant Arbalests (*revenants*) |
| 5 LightCavalry | Turcopoles | Yari Cavalry (*yari riders*) | Black Riders (*black riders*) |
| 6 HorseArchers | Turcopole Archers | Yabusame Archers (*yabusame*) | Barrow Horse Archers (*barrow archers*) |
| 7 Knights | Knight-Brothers | Hatamoto Horse (*hatamoto*) | Death Knights (*death knights*) |
| 8 Shock | Iron Brethren | Sōhei Warrior Monks (*warrior monks*) | Bone Colossus (*colossi*) |
| 9 Artillery | Mangonel | Ōzutsu Bombard (*bombards*) | Corpse Trebuchet (*corpse trebuchets*) |
| Commander | Marshal of the Temple | Daimyō | Lich-Marshal |

| Building key | Templar | Samurai | Undead |
|---|---|---|---|
| barracks | Sergeants’ Hall | Dōjō | Ossuary |
| range | Archery Butts | Kyūdōjō | Bone Butts |
| stables | Stables | Umaya | Carrion Stables |
| workshop | Siege Workshop | Kaji Forge | Bonewright’s Yard |
| chapter | Chapter House | Clan Shrine | Black Chapel |
| granary | Granary & Fields | Rice Paddies | Grave Fields |
| hospital | Hospital | Physician’s House | Charnel Pit |
| walls | Walls & Pavises | Palisade & Tate | Barrow Walls |

Buildings are mechanically identical; only the names change. (The Charnel Pit still returns the
day's fallen: here they are dug up rather than nursed.)

## Stat tweaks and balance

| Faction | Tweak | Why |
|---|---|---|
| Templar | Knights charge ×1.10, morale ×1.05; Archers missileDamage ×0.95 | (shipped) |
| Samurai | **HorseArchers missileDamage ×1.10** | Yabusame, the clan's signature art. Horse archers are 5% of the standard mix and fragile; +10% damage is a flavour edge, not a swing. |
| Samurai | **HeavyInfantry morale ×1.05** | Bushidō: the katana line holds a little longer. |
| Samurai | **Spearmen armour ×0.95** | Ashigaru are peasant levies in an okegawa cuirass. Started at ×0.90; the balance run showed Samurai slightly weak at small sizes, so it was halved. |
| Undead | **HeavyInfantry morale ×1.05** | The dead feel little fear. Stand-in for the no-rout rule until the sim implements it (then remove it). Started ×1.10; trimmed for balance. |
| Undead | **Shock hp ×1.05** | The Bone Colossus is a hill of fused bone. Started ×1.10; it made the host 59–60% at 400 men, so halved. |
| Undead | **Archers missileDamage ×0.90** | Rotten sinew bowstrings: the weakest archery of the three factions. |

Each faction uses exactly 3 tweak entries, all within ±10%.

### Balance results

Script: `<scratchpad>/balance/balance.ts` (not committed). Standard mix from `game.test.ts`
(`MIX`), equal men, commander on both sides, `fight()` from `battle.ts`. Every seed is fought from
**both sides of the field** (faction left vs Templar right and the reverse), which cancels side
bias: the Templar mirror comes out at exactly 50.0%. One-sided runs were too noisy (the mirror
read 60–61% with 20–80 seeds).

| Matchup | 250 men | 400 men | 600 men | Overall |
|---|---|---|---|---|
| Templar vs Templar (40 seeds × 2 sides) | 50% | 50% | – | 50.0% |
| Samurai vs Templar (30 seeds × 2 sides × 3 sizes = 180) | 43% | 50% | 52% | **48.3%** |
| Undead vs Templar (180 battles) | 53% | 53% | 52% | **52.8%** |
| Requested run: 20 seeds × 2 sides at 400 men | | Samurai 48%, Undead 55% | | |

All inside the 40–60% window. Iterations: first pass (Spearmen armour ×0.90, Undead HI morale ×1.10,
Colossus hp ×1.10) gave Samurai 46.9% and Undead 56.9% (60% at 400 men); the final values above.

### Faction rules

Stored as `FactionDef.rule` (text for the player). The Undead's is simulated since battle v12;
the Samurai's is still a proposal. Implementing one needs a re-balance (`pnpm fairness
--factions a,b`).

- **Samurai: Teppō volley.** The first volley of each Teppō regiment costs its target an extra 8
  morale (the shock of gunfire at Nagashino). Small, one-shot, and flavourful; counter-balance by
  dropping HeavyInfantry morale ×1.05 if it tests strong.
- **Undead: the dead know no fear** (built in battle v12; `fearless` in `battle.ts`, `UNDEAD` in
  `command.ts`). Undead regiments never waver, rout or rally, and no morale rule touches them
  (morale reads 100). The price is hit points: every class has 69% of its own (`DEAD_HP`; the
  Colossus 80%, `COLOSSUS_HP`; the trebuchet, timber, unchanged), which replaced the stand-in
  HeavyInfantry morale ×1.05 and Colossus hp ×1.05 tweaks. If the Lich-Marshal falls, the whole
  host crumbles: every man loses 2% of his hit points a second and fights at -4 attack, -3
  defence. An undead army is spent (and loses) under 8% standing, or under 20% against twice as
  many, and crumbles where it stands rather than running. The proposed "below 15 morale a
  regiment crumbles at 1% hp/s" was dropped: with no fear there is no morale to fall below.
  Balance (`pnpm fairness --factions undead,templar` and `undead,samurai`, 200 seeds both ways
  round, 250 and 500 a side, on v11's missile drill): before, the undead won 51.3% / 50.5% of
  their battles against the Templars (250 / 500 a side) and 53.3% / 56.8% against the Samurai.
  DEAD_HP 0.68 gave 43.5% / 52.3% and 53.5% / 58.5%; 0.7 gave 52.3% / 56.0% and 53.3% / 60.3%;
  0.69 gives 45.8% / 54.5% and 52.0% / 55.0% (each ±2.5%), as close to the old rates as the
  noise allows. Battles with undead run some 20–30 s longer (no rout cascade on their side):
  mean 117–120 s before, 138–147 s after, none to the time limit.

## Palettes

FactionDef palette shape (`sprites.ts` adds metalDark, leatherDark, wood and team colours).

| Key | Samurai | Undead | Notes |
|---|---|---|---|
| cloth | `#2c3550` | `#2e2b2a` | Samurai: indigo-black lacquer/lacing. Undead: grave-black rags. |
| clothShade | `#1a2034` | `#1a1817` | |
| trim | `#b5372b` | `#5f8f4e` | Samurai vermilion odoshi lacing; Undead corpse-light green (eyes, runes, glow). |
| metal | `#7d7a73` | `#6c6f68` | Samurai warm dark iron/lacquer; Undead dull, rust-greyed iron. |
| metalShade | `#45423d` | `#3a3c38` | |
| leather | `#4b2c1d` | `#3d3128` | Samurai lacquered brown; Undead rotted leather. |
| skin | `#d6b089` | `#d8d0b4` | Undead "skin" is **bone**: painters use it for skulls, ribs and limbs. |

Extra colours a painter may hard-code per faction (outside FactionDef): Samurai gold for mon and
crest `#c9a43a`, white sash/cowl `#e6e0d0`; Undead bright glow `#a8e07a` (1 px max per figure,
eyes), eye-socket black = outline colour, bone shade `#9c947a`.

## Visual briefs

Scale: figures 12–20 px tall on foot, horses ~16 px long; isometric, 4 facings (contract.ts
`Dir`). Shared conventions with the Templars: 1-px dark outline, light from the upper left, the
same animation timings. Poses named after `Anim` in contract.ts.

### The Samurai Clans

**Faction read.** Dark figures with bright horizontal stripes of lacing, a flared skirt
(kusazuri) making the hips the widest point, and above every soldier a **sashimono**: a 2×4 px
team-hue rectangle on a 1-px pole rising 3–4 px above the head (refs: Kawanakajima print,
Met armours). Ashigaru wear the flat **jingasa** cone hat; samurai wear the tall **kabuto** with
flared side-wings and a gold crest. A regiment from afar = a field of coloured flags over dark
bodies and slanting spears.

1. **Katana Samurai** (HeavyInfantry, ~16 px). Kabuto: 5 px wide, wings 1 px each side, gold
   crest pixel (or 2-px maedate). Dark menpō face (no skin showing but 1 px). Torso metal with 2
   rows of vermilion trim lacing; sode as 2-px blocks off the shoulders; kusazuri flared 6 px wide.
   Katana: 1-px pale steel arc, 5 px, held two-handed; no shield (the shield-hue goes to the
   sashimono). *Brace*: katana held high at the right shoulder (hassō stance), knees bent.
   *Attack*: diagonal downward cut across 3 frames, blade a bright streak on frame 2.
   *Die*: drops to one knee, then forward; sashimono falls flat beside him.
2. **Yari Ashigaru** (Spearmen, ~15 px). Jingasa (7 px wide flat cone, 1 gold mon pixel). Simple
   dark okegawa dō, leather sleeves, bare shins with white wrap pixels. Yari: very long (12–14 px)
   straight shaft, wood colour, steel tip. *Brace (pikewall)*: spear levelled at chest height,
   points forming a hedge; jingasa brims make an even row. *Attack*: short thrust, shaft slides
   2 px. *Die*: falls backward, spear clatters across.
3. **Nage-yari Skirmishers** (~14 px). No armour: dark-indigo hakama and short jacket, headband
   (hachimaki, 1 white pixel row), 2–3 short throwing spears in the left hand. Sashimono smaller
   (2×3). *Shoot*: overarm throw, body twisting. *Brace*: crouched. *Die*: spins and drops.
4. **Yumi Ashigaru** (Archers, ~15 px). Jingasa, light dō. Yumi is **asymmetric**: 9–10 px tall
   with the grip in the lower third, so the bow rises well above the hat (the defining shape).
   Quiver (ebira) on the right hip. *Shoot*: draw to the ear, bow upright. *Die*: crumples,
   bow standing up for a frame.
5. **Teppō Ashigaru** (Crossbowmen, ~15 px). Jingasa, dark dō, cartridge belt (1 px row of
   light dots). Teppō: 7–8 px straight dark line, held level at the cheek, 1 gold pixel at the pan.
   *Shoot*: 1 bright muzzle pixel + a 2–3 px grey smoke puff drifting up for 2 frames (volley lines
   look great in grey smoke). *Brace*: kneeling behind a wooden **tate** board (team-hue mon dot):
   the pavise equivalent. *Die*: falls sideways, gun across the body.
6. **Yari Cavalry** (LightCavalry). Bay horse, no barding. Rider in light dō with a jingasa or
   simple kabuto, sashimono streaming back. Yari carried diagonally, couched in the charge.
   *Attack*: thrust from the saddle. *Die*: rider slides off; horse bolts (or falls with him).
7. **Yabusame Archers** (HorseArchers). Light rider, **tall yumi** (rises 4 px above the head) as
   the silhouette key, no sashimono but a small **horo** cloak bubble in team hue at the back
   (2–3 px). Horse at a gallop, rider standing in the stirrups. *Shoot*: draws across the horse's
   neck to the side. *Die*: thrown backward.
8. **Hatamoto Horse** (Knights). The daimyō's guard: large dark horse with a red tassel harness
   (trim pixels on the chest), rider in full lacquer with tall kabuto and gold crest, sode
   prominent, **large sashimono** (3×5) or a horo. Yari levelled in the charge (Brace = yari couched
   at the trot). *Die*: horse rears and falls; crest flashes gold as it goes down.
9. **Sōhei Warrior Monks** (Shock, ~18 px, the biggest foot). White hooded cowl (katō) wrapping
   head and face, only eyes dark: a bright white head cluster. Dark robe over lamellar (metal
   showing at chest), wooden geta (2 px tall feet). **Naginata**: 10 px shaft with a 3-px curved
   pale blade. No sashimono; a team-hue prayer streamer at the waist. *Brace*: naginata held low
   and level, wide stance. *Attack*: big overhead sweep, two-handed (ref: Kuniyoshi's gate-smasher).
   *Die*: kneels, then topples sideways; white cowl stays visible on the ground.
10. **Ōzutsu Bombard** (Artillery). A short fat bronze/dark iron barrel (6 px) on a low wooden
    sledge, 3 ashigaru crew in jingasa, one with a slow-match (1 orange pixel). *Shoot*: big
    muzzle flash (2 frames), recoil 1 px back, a large grey smoke cloud. *Die*: barrel tips, crew
    scatter. (A Chinese-style traction trebuchet is the alternative if the renderer prefers the
    throwing arc shared with the Mangonel; keep the name *Ōzutsu*.)
11. **Commander: Daimyō.** Mounted, or on foot before a **maku** camp curtain (renderer's choice). Tall
    kabuto with a large gold crest (crescent maedate, 5 px), red-laced armour, **jinbaori** (sleeveless
    surcoat) in team hue, and a **saihai** (baton with a white paper tassel). A bearer behind him
    carries a tall **nobori** banner (2×8 px, team hue, the clan mon as a gold pixel ring).

### The Hollow Host

**Faction read.** The dead dressed as the soldiers they were: skull heads (big, 1/3 of the height,
ref: OGA skeletons), dark eye sockets with **one green glow pixel** in the officers and cavalry,
ribs as alternating bone/black rows, 1-px bone limbs with gaps between them, scraps of black rag
and rusty mail (ref: Holbein, Hollar). Team hue on the shields and on tattered banners with ragged
lower edges. Grim and quiet; no blood, no exposed organs: the Ghouls are the only "flesh" and they
are grey-green, gaunt, never gory. Death animation: they do not bleed, they **collapse into a heap
of bones** (the corpse frame is a small bone pile with the skull on top, plus a 1-frame green wisp
rising for the glowing units).

1. **Grave Legionaries** (HeavyInfantry, ~16 px). Skeleton in rusted mail and a battered
   open-faced helm, large rectangular or kite shield in team hue (cracked: one dark diagonal
   pixel line), short rusty sword. Shield covers most of the torso, so the silhouette matches the
   Sergeant-Brothers (fair readability). *Brace*: shields locked, skulls just visible over the
   rims. *Attack*: stiff, jerky stab (hold the windup frame one tick longer than the Templars).
   *Die*: falls apart in 2 frames: helm rolls off, bones drop.
2. **Ghoul Spears** (Spearmen, ~15 px). Hunched, gaunt grey-green figures (use `skin` darkened,
   or `#8f9a80`), bald heads, rag loincloths, holding long rough spears. The **hunch** (head forward
   of the shoulders) is the key silhouette difference from the skeletons. *Brace*: crouched low,
   spears levelled. *Die*: sprawl face down.
3. **Bone-Throwers** (Skirmishers, ~14 px). Bare skeletons, no armour, a sack of bones;
   they throw sharpened femurs and jawbones (projectile = a 2-px bone-white tumbling stick).
   *Shoot*: sidearm throw. *Die*: burst into scattered bones.
4. **Wraith Bows** (Archers, ~15 px). Hooded dark shapes, robe dissolving at the hem into 1-px
   gaps (ref: Kuniyoshi's ghosts), a pale skull face in the hood with green eye pixels, a black
   longbow. Their arrows leave a 1-px green trail. *Shoot*: draw; the robe flutters. *Die*: the
   robe collapses empty, a green wisp rises (no bones: wraiths).
5. **Revenant Arbalests** (Crossbowmen, ~15 px). Skeletons in kettle helms and padded rags,
   heavy crossbow, a team-hue pavise on the back (Brace = behind the planted pavise, as the
   Genoese). *Shoot*: stiff recoil. *Die*: bones drop behind the pavise.
6. **Black Riders** (LightCavalry). Skeletal horse (dark grey bone horse, ribcage visible, green
   eye pixel) with a rag saddle-cloth; rider a skeleton in a hood with a lance. Thin and fast;
   the light gaps between the horse's ribs and legs distinguish it from living horses.
7. **Barrow Horse Archers** (HorseArchers). Same skeletal horse, rider with a short recurve bow and
   a tattered team-hue pennon on the quiver. *Shoot*: turns in the saddle. *Die*: horse and rider
   collapse together into one bone heap.
8. **Death Knights** (Knights). The heaviest rider: a black-barded horse (barding `clothShade`
   with ragged edge, horse skull chanfron in bone), rider in **blackened full plate** (metalShade)
   with a great helm whose visor slit glows green (2 px), a team-hue shield with a skull mark
   (3 bone pixels), couched lance. *Brace*: lance couched at the trot. *Die*: horse falls,
   armour collapses empty (the helm rolls; the green goes out).
9. **Bone Colossus** (Shock, the "elephant", ~24–28 px, the biggest figure in the game). A giant
   built of fused bones: hunched, arms longer than the legs, knuckles near the ground, a cluster of
   several skulls as the head, a great **bone club** or a ship's anchor-sized cleaver. Bone
   palette with dark gaps; a ring of green glow in the chest (2–3 px). A team-hue banner rag
   nailed to its back. *Brace*: hunched, club across the body. *Attack*: overhead two-handed slam
   (2-px dust puff at the impact). *Die*: topples forward over 3 frames and breaks into a long
   heap of bones; the chest glow fades.
10. **Corpse Trebuchet** (Artillery). A traction trebuchet of black timber lashed with sinew,
    the throwing arm tipped with a bone sling; crew of 3 skeletons. Projectile: a dark bundle
    (1-px bone pixels) trailing a green wisp. *Shoot*: arm whips up, crew pull down. *Die*:
    frame splinters, crew fall to bones.
11. **Commander: Lich-Marshal.** Tall (~20 px), black ragged robe widening to the ground (ref:
    OGA Gate Keeper), skull with an iron crown, **staff topped by a green-glowing skull or lantern**
    (the brightest green on the field, 2–3 px), a team-hue tattered standard carried by a skeletal
    bearer behind. Optionally mounted on a death horse. When he falls: the staff light goes out and,
    if the no-rout rule lands, the host starts to crumble.

## Not done here

- No sprites were painted: `src/client/render/sprites.ts` is being rewritten by another agent.
  Until it reads these briefs, the new factions render with Templar shapes in their own palette.
- No `game.test.ts` balance case was added (out of this task's file scope); design.md §4 asks for
  one: each faction vs Templars, 40 seeds, 40–60% wins. Use both sides of the field per seed.
