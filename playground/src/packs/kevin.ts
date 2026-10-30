// Kevin Iglesias, "Human Melee Animations FREE" (FBX): one grey mannequin with melee clips and
// six weapons. We paint the mannequin by skin weights into a liveried soldier and kit it per kind.
import * as THREE from 'three';
import type { UnitDef, UnitStats } from '../assets.ts';
import { hullOf, toon } from '../style.ts';

const B = '/kevin/';
const anim = (n: string) => `${B}anim/HumanM@${n}.fbx`;
const weapon = (n: string) => `${B}Models/Weapons/Human_${n}.fbx`;
/** The pack's weapons are heroic (a 194 cm greatsword); trimmed toward life, still big enough to read. */
const WEAPON_SCALE: Record<string, number> = { Sword: 0.8, Greatsword: 0.75, Polearm: 0.85, Shield: 0.9 };

const SKIN = new THREE.Color(0xd9a77c);
const MAIL = new THREE.Color(0x8a8f96);
const LEATHER = new THREE.Color(0x6b4a2b);
const BOOT = new THREE.Color(0x3d2a1a);

function regionOf(bone: string): [THREE.Color, number] {
  if (/head|neck/i.test(bone)) return [SKIN, 0];
  if (/finger|thumb|pinky|hand|forearm/i.test(bone)) return [LEATHER, 0];
  if (/shoulder|upperArm/i.test(bone)) return [MAIL, 0];
  if (/toe|foot|lowerLeg/i.test(bone)) return [BOOT, 0];
  if (/upperLeg/i.test(bone)) return [new THREE.Color(0.68, 0.68, 0.68), 1];
  return [new THREE.Color(1, 1, 1), 1];
}

/** Vertex colours by dominant bone; aTeam marks the livery, which wears the army's pigment. */
function paint(mesh: THREE.SkinnedMesh): void {
  const g = mesh.geometry;
  if (g.attributes.aTeam) return;
  const si = g.attributes.skinIndex!;
  const sw = g.attributes.skinWeight!;
  const color = new Float32Array(si.count * 3);
  const team = new Float32Array(si.count);
  for (let i = 0; i < si.count; i++) {
    let best = 0;
    for (let k = 1; k < 4; k++) if (sw.getComponent(i, k) > sw.getComponent(i, best)) best = k;
    const [c, t] = regionOf(mesh.skeleton.bones[si.getComponent(i, best)]?.name ?? '');
    color.set([c.r, c.g, c.b], i * 3);
    team[i] = t;
  }
  g.setAttribute('color', new THREE.BufferAttribute(color, 3));
  g.setAttribute('aTeam', new THREE.BufferAttribute(team, 1));
}

function liveryMaterial(pigment: THREE.Color, map: THREE.Texture | null): THREE.Material {
  const m = toon({ map, vertexColors: true });
  const u = { value: pigment };
  m.onBeforeCompile = (s) => {
    s.uniforms.uPigment = u;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aTeam;\nvarying float vTeam;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTeam = aTeam;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uPigment;\nvarying float vTeam;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uPigment * diffuseColor.rgb, vTeam);');
  };
  m.customProgramCacheKey = () => 'livery';
  return m;
}

function helmet(kind: string): THREE.Group {
  const g = new THREE.Group();
  const steel = toon({ color: 0x9aa0a6 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number) => {
    const piece = new THREE.Group();
    const m = new THREE.Mesh(geo, mat);
    piece.add(m, hullOf(m));
    piece.position.y = y;
    g.add(piece);
    return piece;
  };
  if (kind === 'none') return g;
  if (kind === 'great') add(new THREE.CylinderGeometry(12.5, 12, 26, 14), steel, 9);
  else add(new THREE.SphereGeometry(12.5, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), steel, 6);
  if (kind === 'kettle') add(new THREE.CylinderGeometry(19, 19, 1.5, 18), steel, 6);
  if (kind === 'horned') {
    const horn = toon({ color: 0xe8dcc0 });
    for (const s of [-1, 1]) {
      const h = add(new THREE.ConeGeometry(3, 16, 8), horn, 14);
      h.position.x = s * 12;
      h.rotation.z = -s * 0.9;
    }
  }
  if (kind === 'plume') {
    add(new THREE.SphereGeometry(12.5, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), steel, 6);
    const p = add(new THREE.ConeGeometry(4, 22, 8), toon({ color: 0xb8321f }), 22);
    p.rotation.x = -0.5;
  }
  return g;
}

const UPPER = /shoulder|Arm|forearm|hand|Finger|pinky|thumb/i;
/** The run with its arms swapped for a held pose's, so a two-handed weapon is carried on the march. */
function carry(holdName: string) {
  return (clips: THREE.AnimationClip[]) => {
    const run = clips.find((c) => /Run01_Forward/.test(c.name))!;
    const hold = clips.find((c) => c.name.includes(holdName));
    const fixed = clips.map((c) => Object.assign(c, { tracks: c.tracks.filter((t) => !t.name.endsWith('.scale') && !t.name.startsWith('B-spineProxy')) }));
    if (!hold) return fixed;
    const up = (t: THREE.KeyframeTrack) => UPPER.test(t.name.split('.')[0]!);
    return [...fixed, new THREE.AnimationClip('March', run.duration, [...run.tracks.filter((t) => !up(t)), ...hold.tracks.filter(up)])];
  };
}

interface Kit {
  id: string;
  name: string;
  right?: string;
  left?: string;
  helm: string;
  idle: string;
  attack: string;
  hold?: string;
  height?: number;
  stats: UnitStats;
}

function soldier(k: Kit): UnitDef {
  const clipFiles = [k.idle, k.attack, 'Run01_Forward', 'CombatDamage01', 'Death01', ...(k.hold ? [k.hold] : [])].map(anim);
  return {
    id: `kevin-${k.id}`,
    name: k.name,
    pack: 'Kevin Iglesias melee (painted mannequin)',
    model: `${B}Models/HumanM_Model.fbx`,
    clipFiles,
    extras: [k.right, k.left].filter((x): x is string => !!x).map(weapon),
    height: k.height ?? 1.8,
    clips: { idle: new RegExp(k.idle), walk: k.hold ? /^March$/ : /Run01_Forward/, attack: new RegExp(k.attack), hit: /CombatDamage01/, die: /Death01/ },
    rate: { walk: 0.6 },
    clipFix: carry(k.hold ?? '\u0000'),
    prep: (root, extra) => {
      // Z-up FBX: its Rig group carries a quarter turn about X that the clips don't undo.
      root.rotation.x = -Math.PI / 2;
      const bones: THREE.Bone[] = [];
      root.traverse((o) => {
        if (o instanceof THREE.Bone) bones.push(o);
        if (o instanceof THREE.SkinnedMesh) paint(o);
      });
      const bone = (re: RegExp) => bones.find((b) => re.test(b.name));
      // Miniature proportions: a bigger head and hands carry helmet and weapon at a distance.
      bone(/head$/i)?.scale.setScalar(1.35);
      for (const h of [bone(/handR$/i), bone(/handL$/i)]) h?.scale.setScalar(1.25);
      const hold = (name: string | undefined, b: THREE.Bone | undefined) => {
        if (!name || !b) return;
        const w = extra.get(weapon(name))!.clone();
        w.scale.setScalar(WEAPON_SCALE[name] ?? 1);
        b.add(w);
      };
      hold(k.right, bone(/handPropR$/i));
      hold(k.left, bone(/handPropL$/i));
      const helm = helmet(k.helm);
      helm.position.set(0, 12, 1);
      bone(/head$/i)?.add(helm);
    },
    team: (root, color) => {
      root.traverse((o) => {
        if (o instanceof THREE.SkinnedMesh && o.geometry.attributes.aTeam && !o.userData.hull) {
          o.material = liveryMaterial(color, (o.material as THREE.MeshToonMaterial).map);
        }
      });
    },
    stats: k.stats,
  };
}

const melee = (hp: number, damage: number, speed: number, cooldown: number, hitAt = 0.45): UnitStats => ({ hp, damage, range: 1.3, speed, cooldown, hitAt, radius: 0.45 });

export const KEVIN: UnitDef[] = [
  soldier({ id: 'footman', name: 'Footman', right: 'Polearm', left: 'Shield', helm: 'kettle', idle: 'CombatIdlePolearm01', attack: 'AttackPolearm01', hold: 'WeaponHoldPolearm01', stats: { ...melee(110, 11, 1.6, 1.2), range: 1.7 } }),
  soldier({ id: 'warden', name: 'Warden', right: 'Sword', left: 'Shield', helm: 'great', idle: 'CombatIdle1H01', attack: 'AttackShield01', stats: melee(190, 6, 1.3, 1.4) }),
  soldier({ id: 'mercenary', name: 'Mercenary', right: 'Sword', helm: 'plume', idle: 'CombatIdle1H01', attack: 'Attack1H01_R', stats: melee(130, 16, 1.8, 1.2) }),
  soldier({ id: 'sapper', name: 'Sapper', right: 'Dagger', helm: 'kettle', idle: 'CombatIdle01', attack: 'Attack1H01_R', stats: melee(90, 10, 1.5, 1.6) }),
  soldier({ id: 'berserker', name: 'Berserker', right: 'Warhammer', helm: 'horned', idle: 'CombatIdle2H01', attack: 'Attack2H01', hold: 'WeaponHold2H01', stats: melee(120, 26, 2.1, 1.0, 0.5) }),
  soldier({ id: 'champion', name: 'Champion', right: 'Greatsword', helm: 'great', idle: 'CombatIdle2H01', attack: 'Attack2H01', hold: 'WeaponHold2H01', height: 2.1, stats: { ...melee(520, 26, 1.5, 1.4, 0.5), range: 1.8, radius: 0.55 } }),
];
