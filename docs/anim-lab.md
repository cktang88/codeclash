# Anim lab: 3D animation packs as unit art (experiment)

`/anim-lab.html` (dev server only) asks whether free 3D animation packs can replace or feed the
procedural unit art in `src/client/render/art`. It loads a rigged mannequin and its clips with
three.js, paints it in the codex palette, plays a live skirmish, and **bakes** each kind's
idle, walk, attack and die poses into sprite cells shaped like the game's own (same cell size and
feet line, `CELLS`). The sheet draws them beside the procedural frames, at contact-sheet size and at
battlefield size.

## Getting the pack

The lab uses [Human Melee Animations FREE](https://kevdev.itch.io/human-melee-animatons-free) by
Kevin Iglesias. It is free, but its raw files may not be redistributed, so they are not in git
(`src/client/public/lab/` is ignored). Download the "Godot/Unreal" zip (FBX) and unpack it:

```sh
unzip "Human Melee Animations FREE.zip" -d /tmp/kevin
D=src/client/public/lab/kevin; mkdir -p $D/anim
cp -r /tmp/kevin/Models /tmp/kevin/Textures $D/
find /tmp/kevin/Animations/Male -name '*.fbx' ! -path '*RootMotion*' ! -path '*Strafe*' -exec cp {} $D/anim/ \;
cp /tmp/kevin/Animations/Masked\ Poses/HumanM@* $D/anim/
```

Then run `pnpm dev:client` and open http://localhost:5173/anim-lab.html. Query flags: `?nobake`
skips the sheet, `?mini=0` turns off the miniature proportions, and `?rx=` overrides the FBX
up-axis fix (in degrees).

## How it paints

- **Rig fix.** The FBX is Z-up: its `Rig` group carries a quarter turn about X, so the clone is
  turned back by -90°. Scale tracks and the missing `B-spineProxy` tracks are dropped from clips.
- **Livery from skin weights.** The model is a grey mannequin. Each vertex is painted by its
  dominant bone: head is skin, upper arms are mail, forearms and hands are leather, shins and feet
  are boots, and the torso and thighs take the army pigment (an `aTeam` attribute and a
  `uPigment` uniform, so one mesh serves every army).
- **Toon light.** `MeshToonMaterial` uses a 3-band gradient, with a warm key from the upper left
  and a hemisphere fill that falls to ink-blue.
- **Ink.** An inverted hull (back faces pushed out along normals, in `ink`) gives the interior
  lines. The baked cells also get the game's outer rim, an ink band plus a faint vellum halo.
- **Kit.** The pack's weapons hang on `B-handPropR`/`L`, trimmed from their heroic size. Helmets are
  primitives on the head bone. Head and hands are scaled up (1.35× and 1.25×) so kit reads at
  ~40 px tall.
- **Loadouts.** Footman: polearm and shield. Warden: sword and shield, with the shield bash.
  Mercenary: sword. Sapper: dagger. Berserker: warhammer. Champion: greatsword. The two-handed
  kinds and the Footman carry their weapon on the march: the run's arm tracks are swapped for the
  pack's masked hold pose.

## Findings so far

- **Motion is the win.** The clips have real anticipation, follow-through and weight shift. The
  game's 4-frame swings and 6-frame walk sampled from them already look livelier than the
  procedural poses, and the death falls are far better.
- **Silhouette is the loss.** At battlefield size the procedural kinds are told apart by
  exaggerated kit: a tower shield, horns, a feathered hat. One shared mannequin makes every 3D kind
  read alike. Bigger heads and hands help. Kind-specific kit (tower shield, plumes, cloaks), or
  painting over the baked poses, would still be needed.
- **Pack gaps.** It has no walk (the run is played at 0.55×), no bow, no casting, and no cavalry, so
  only the infantry kinds map. Archer, Wizard, Knight and Outrider would need other sources, such
  as Mixamo or Quaternius's CC0 Universal Animation Library.
- **Cost.** Baking 6 kinds × 18 frames × 2 armies takes about 5 s in software GL. That suits an
  offline build step (bake to PNG atlases) better than a runtime bake.

If we pursue it, the likely path is a build-time bake that writes `body`/`mask` atlases in the
layout `render/art` already consumes. The mask is a second pass with only `aTeam` regions white.
The renderer would not change.
