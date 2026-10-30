# Fight playground (3D)

A standalone three.js sandbox for trying free animated 3D packs as Code Clash soldiers. It is **not
part of the game**: it has its own Vite config, imports nothing from `src/`, and builds to
`dist/playground` only when asked.

```sh
pnpm playground        # http://localhost:5174
```

- **Muster** (left): add any unit to blue or red, 1 to 12 at a time.
- **Battles** (right): ready-made fights (line battle, monsters vs men, dragon raid, undead horde,
  one of each), plus a **parade** of every unit standing side by side.
- **Inspect:** click a soldier to see its pack and play any of its clips. Release puts it back in
  the fight.
- **Look:** turn the ink line on or off, set its width and the toon bands, and pick day, dusk or
  night light. The camera can be orbited with the mouse, with presets for the game's angle, low and
  top.
- **URL flags:** `?preset=<name>`, `?cam=low|parade`, `?dist=` (parade distance), `?paused`, `?tod=dusk`.

The fight is deliberately simple (`src/battle.ts`), and it is not the game's simulation. Soldiers
pick the nearest foe and march, keeping apart from friends. They strike on their attack clip's
beat (`hitAt`), or loose an arrow, fireball or bolt. They flinch when hit (unless mid-swing), are
knocked back by heavy blows, and fall, lie, then sink away. Flyers hover.

## Units and where they come from

| Pack | License | Units |
| --- | --- | --- |
| [KayKit Adventurers 2.0](https://kaylousberg.itch.io/kaykit-adventurers), [Skeletons 1.1](https://kaylousberg.itch.io/kaykit-skeletons), [Character Animations 1.1](https://kaylousberg.itch.io/kaykit-character-animations) by Kay Lousberg | CC0 | Knight, Champion (Knight + greatsword, larger), Berserker (Barbarian), Archer (Ranger), Wizard (Mage), Rogue, Skeleton, Skeleton Mage, Skeleton Minion |
| **Our own**, built on KayKit's large mannequin | CC0 base | **Troll** (moss-green, tusks, brow, gnarled club) and **Bone Golem** (ivory, eye sockets, horn, back spines, bone fists), both on the `Rig_Large` clips |
| [Quaternius Animated Monsters](https://opengameart.org/content/lowpoly-animated-monsters) | CC0 | Dragon, Giant Bat, Skeleton (Q) |
| [Quaternius RPG Characters](https://opengameart.org/content/lowpoly-rpg-characters) | CC0 | Warrior, Ranger, Cleric, Wizard (Q), Rogue (Q) |
| [Kevin Iglesias Human Melee Animations FREE](https://kevdev.itch.io/human-melee-animatons-free) | free, **not redistributable** | Footman, Warden, Mercenary, Sapper, Berserker, Champion (painted mannequin). Shown only when unpacked locally |

The CC0 files are committed under `assets/` with their license texts. The Kevin Iglesias pack is
ignored by git. To use it, unpack the "Godot/Unreal" zip so that `assets/kevin/` holds `Models/`,
`Textures/` and `anim/HumanM@*.fbx` (the same layout as in `docs/anim-lab.md`, with
`playground/assets/kevin` as the destination).

All KayKit characters share one rig (`Rig_Medium`). The animation library's ~150 clips play on
any of them, including melee 1H, 2H and dual-wield, block, bow draw and release, spell casting,
skeleton rise and walk, hit and death. Weapons are separate glTFs hung on the `handslot` bones.

## Adding a unit

Add a `UnitDef` to one of the files in `src/packs/` (or a new file listed in `src/main.ts`):

- the model file, plus any further files carrying clips for the same skeleton;
- the height to scale it to, in metres;
- regexes picking its `idle`, `walk`, `attack` (one is chosen at random among the matches), `hit`
  and `die` clips;
- its stats;
- optionally a `prep` that fixes or kits the model before styling (weapons, primitives,
  recolouring), and a `team` that puts the army colour on it (capes, cloaks, livery). Without
  `team`, the coloured ring at its feet shows its side.

Every model gets the same look (`src/style.ts`): toon bands lit warm from the upper left, a cool
ink-blue fill, and an inverted-hull ink line.

## Notes so far

- **KayKit is the backbone.** Its rig and CC0 animation library cover infantry, archers, casters
  and undead with consistent proportions, and the chunky miniature style reads well from the
  game's camera angle. Its large rig is a cheap base for our own brutes.
- **Gaps:** there is no free CC0 horse or rider (Knight and Outrider cavalry), no griffin, and no
  siege engines. The Dragon only flies (no ground clips) and has no breath clip, so its fire uses
  the attack clip.
- **Quaternius RPG** characters use darker hand-painted textures (lifted 1.35× here) and a
  different rig, so KayKit clips don't play on them.
- **Performance:** software GL in CI renders a few fps. A real GPU handles the presets easily. For
  hundreds of soldiers we would want instancing or baked sprites, as in `/anim-lab.html`.
