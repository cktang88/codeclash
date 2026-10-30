// KayKit (Kay Lousberg, CC0): Adventurers, Skeletons and the Character Animations library, all on
// one rig (Rig_Medium), plus the large mannequin (Rig_Large) we dress as our own Troll and Bone Golem.
import * as THREE from 'three';
import type { UnitDef, UnitStats } from '../assets.ts';
import { hullOf, toon } from '../style.ts';

const B = '/kaykit/';
const ch = (n: string) => `${B}characters/${n}.glb`;
const w = (n: string) => `${B}weapons/${n}.gltf`;
const MEDIUM = ['General', 'MovementBasic', 'MovementAdvanced', 'CombatMelee', 'CombatRanged', 'Special'].map((n) => `${B}anim/Rig_Medium_${n}.glb`);
const LARGE = ['General', 'MovementBasic', 'CombatMelee'].map((n) => `${B}anim/Rig_Large_${n}.glb`);

/** Weapons hang on the rig's hand slots, which already sit at the grip. */
function arm(right?: string, left?: string, scale = 1) {
  return (root: THREE.Object3D, extra: Map<string, THREE.Object3D>) => {
    for (const [name, slot] of [[right, 'handslotr'], [left, 'handslotl']] as const) {
      if (!name) continue;
      const bone = root.getObjectByName(slot) ?? root.getObjectByName(slot.replace(/(.)$/, '.$1'));
      const piece = extra.get(w(name))?.clone();
      if (bone && piece) {
        piece.scale.setScalar(scale);
        bone.add(piece);
      }
    }
  };
}

/** Capes and cloaks take the army's colour, mixed into the pack's own texture. */
function capeTeam(root: THREE.Object3D, color: THREE.Color): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.hull && /cape|cloak|hood|bearhat/i.test(o.name)) {
      const m = (o.material as THREE.MeshToonMaterial).clone();
      m.color = color.clone().lerp(new THREE.Color(1, 1, 1), 0.15);
      o.material = m;
    }
  });
}

const melee = (hp: number, damage: number, speed: number, cooldown: number, hitAt = 0.45, range = 1.2): UnitStats => ({ hp, damage, range, speed, cooldown, hitAt, radius: 0.45 });
const COMMON = { hit: /^Hit_A$/, die: /^Death_A$/ };

type HeroOpts = Omit<Partial<UnitDef>, 'clips'> & { right?: string; left?: string; stats: UnitStats; clips: Partial<UnitDef['clips']> };

function hero(id: string, name: string, model: string, opts: HeroOpts): UnitDef {
  return {
    id: `kaykit-${id}`,
    name,
    pack: 'KayKit Adventurers / Skeletons (CC0)',
    model: ch(model),
    clipFiles: MEDIUM,
    extras: [opts.right, opts.left].filter((x): x is string => !!x).map(w),
    height: 1.7,
    prep: arm(opts.right, opts.left),
    team: capeTeam,
    ...opts,
    clips: { ...{ idle: /^Idle_A$/, walk: /^Walking_A$/, attack: /^Melee_1H_Attack_(Chop|Slice_Diagonal|Stab)$/ }, ...COMMON, ...opts.clips },
  };
}

// ---- Our own: the large mannequin dressed as a Troll and a Bone Golem. ----

/** Recolours every skinned mesh and adds primitive kit on the head and hands. */
function dress(skin: number, kit: (bone: (n: string) => THREE.Object3D | undefined) => void) {
  return (root: THREE.Object3D) => {
    root.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh) o.material = new THREE.MeshStandardMaterial({ color: skin });
    });
    kit((n) => root.getObjectByName(n) ?? root.getObjectByName(n.replace('.', '')));
  };
}

function piece(geo: THREE.BufferGeometry, color: number, at: [number, number, number], rot: [number, number, number] = [0, 0, 0]): THREE.Object3D {
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, toon({ color }));
  g.add(m, hullOf(m));
  g.position.set(...at);
  g.rotation.set(...rot);
  return g;
}

const troll = dress(0x6f8a4a, (bone) => {
  const head = bone('head');
  // Tusks and a heavy brow.
  for (const s of [-1, 1]) head?.add(piece(new THREE.ConeGeometry(0.05, 0.22, 8), 0xefe4c8, [s * 0.12, 0.12, 0.3], [-1.9, 0, s * 0.25]));
  head?.add(piece(new THREE.BoxGeometry(0.5, 0.1, 0.2), 0x55703a, [0, 0.42, 0.24], [0.3, 0, 0]));
  // A gnarled club: a tapered log with a knot.
  const club = new THREE.Group();
  club.add(piece(new THREE.CylinderGeometry(0.16, 0.06, 1.3, 9), 0x6b4a2b, [0, 0.55, 0]));
  club.add(piece(new THREE.SphereGeometry(0.19, 10, 8), 0x5a3d22, [0, 1.1, 0]));
  bone('handslot.r')?.add(club);
});

const golem = dress(0xe8dcc0, (bone) => {
  const head = bone('head');
  for (const s of [-1, 1]) head?.add(piece(new THREE.SphereGeometry(0.07, 10, 8), 0x22180f, [s * 0.14, 0.3, 0.33]));
  head?.add(piece(new THREE.ConeGeometry(0.09, 0.4, 8), 0xd9c79e, [0, 0.72, 0], [0, 0, 0]));
  // Ribs of bone along the back, and a fist of bone.
  const chest = bone('chest');
  for (let i = 0; i < 4; i++) chest?.add(piece(new THREE.ConeGeometry(0.07, 0.42, 7), 0xd9c79e, [0, 0.15 + i * 0.22, -0.38], [-1.1, 0, 0]));
  for (const h of ['handslot.r', 'handslot.l']) bone(h)?.add(piece(new THREE.DodecahedronGeometry(0.22), 0xd9c79e, [0, 0.05, 0]));
});

function brute(id: string, name: string, prep: UnitDef['prep'], stats: UnitStats, height: number, team?: UnitDef['team']): UnitDef {
  return {
    id: `own-${id}`,
    name,
    pack: 'Our own: KayKit large mannequin, recoloured and kitted (CC0 base)',
    model: ch('Mannequin_Large'),
    clipFiles: LARGE,
    height,
    prep,
    team,
    clips: { idle: /^Idle_B$/, walk: /^Walking_A$/, attack: /^(Melee_2H_Slam|Melee_Unarmed_Smash|Melee_2H_Attack)$/, hit: /^Hit_A$/, die: /^Death_A$/ },
    rate: { walk: 0.8, attack: 0.8 },
    stats,
  };
}

export const KAYKIT: UnitDef[] = [
  hero('knight', 'Knight', 'Knight', { right: 'sword_1handed', left: 'shield_badge_color', stats: melee(240, 22, 1.8, 1.3), clips: {} }),
  hero('champion', 'Champion', 'Knight', { right: 'sword_2handed', height: 2.1, stats: { ...melee(520, 26, 1.5, 1.4, 0.5, 1.6), radius: 0.55 }, clips: { idle: /^Melee_2H_Idle$/, attack: /^Melee_2H_Attack_(Chop|Slice|Spin)$/ } }),
  hero('barbarian', 'Berserker', 'Barbarian', { right: 'axe_2handed', stats: melee(120, 26, 2.1, 1.0, 0.5, 1.4), clips: { idle: /^Melee_2H_Idle$/, walk: /^Running_A$/, attack: /^Melee_2H_Attack_(Chop|Slice|Spinning)$/ }, rate: { walk: 0.75 } }),
  hero('ranger', 'Archer', 'Ranger', { left: 'bow_withString', stats: { hp: 55, damage: 8, range: 9, speed: 1.6, cooldown: 2.2, hitAt: 0.55, shot: 'arrow', radius: 0.4 }, clips: { idle: /^Ranged_Bow_Idle$/, walk: /^Running_HoldingBow$/, attack: /^Ranged_Bow_Release$/ }, rate: { walk: 0.7 } }),
  hero('mage', 'Wizard', 'Mage', { right: 'staff', stats: { hp: 85, damage: 20, range: 10, speed: 1.4, cooldown: 3, hitAt: 0.5, shot: 'fire', radius: 0.4 }, clips: { idle: /^Idle_B$/, attack: /^Ranged_Magic_(Shoot|Spellcasting)$/ } }),
  hero('rogue', 'Rogue', 'Rogue_Hooded', { right: 'dagger', left: 'dagger', stats: melee(90, 12, 2.2, 0.8, 0.4), clips: { idle: /^Melee_Unarmed_Idle$/, attack: /^Melee_Dualwield_Attack_(Chop|Slice|Stab)$/ } }),
  hero('skeleton', 'Skeleton', 'Skeleton_Warrior', { right: 'Skeleton_Blade', left: 'Skeleton_Shield_Small_A', stats: melee(70, 6, 1.3, 1.5), clips: { idle: /^Skeletons_Idle$/, walk: /^Skeletons_Walking$/, die: /^Skeletons_Death$/ } }),
  hero('skeleton-mage', 'Skeleton Mage', 'Skeleton_Mage', { right: 'Skeleton_Staff', stats: { hp: 60, damage: 14, range: 9, speed: 1.3, cooldown: 3, hitAt: 0.5, shot: 'bolt', radius: 0.4 }, clips: { idle: /^Skeletons_Idle$/, walk: /^Skeletons_Walking$/, attack: /^Ranged_Magic_Shoot$/, die: /^Skeletons_Death$/ } }),
  hero('minion', 'Skeleton Minion', 'Skeleton_Minion', { right: 'Skeleton_Axe', stats: melee(50, 5, 1.6, 1.4), clips: { idle: /^Skeletons_Idle$/, walk: /^Skeletons_Walking$/, die: /^Skeletons_Death$/ } }),
  brute('troll', 'Troll', troll, { hp: 600, damage: 24, range: 2.2, speed: 1.2, cooldown: 1.8, hitAt: 0.5, radius: 0.9 }, 3.0),
  brute('golem', 'Bone Golem', golem, { hp: 520, damage: 14, range: 2.0, speed: 0.9, cooldown: 2, hitAt: 0.5, radius: 0.9 }, 2.8),
];
