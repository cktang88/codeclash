// Quaternius (CC0): Animated Monsters (Dragon, Bat, Skeleton) and RPG Characters, FBX with their
// weapons already skinned in and each file carrying its own clips.
import * as THREE from 'three';
import type { UnitDef, UnitStats } from '../assets.ts';

const B = '/quaternius/';

function tintNamed(re: RegExp) {
  return (root: THREE.Object3D, color: THREE.Color) => {
    root.traverse((o) => {
      if (o instanceof THREE.Mesh && !o.userData.hull && re.test(o.name)) {
        const m = (o.material as THREE.MeshToonMaterial).clone();
        m.color = color.clone();
        o.material = m;
      }
    });
  };
}

const textures = new THREE.TextureLoader();
const ALIAS: Record<string, string> = { Bow_Texture: 'Ranger_Bow_Texture' };
/** The RPG FBXs name their texture in the material but don't link it; link it by that name. */
function texture(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of [o.material].flat() as THREE.MeshPhongMaterial[]) {
      if (m.map || !/_Texture$/.test(m.name)) continue;
      m.map = textures.load(`${B}rpg/Textures/${ALIAS[m.name] ?? m.name}.png`);
      m.map.colorSpace = THREE.SRGBColorSpace;
      // The painted textures are dark; lift them toward the KayKit figures' brightness.
      m.color.setRGB(1.35, 1.35, 1.35);
    }
  });
}

/** The monster FBXs ship near-black material colours; paint them by material name. */
function paint(colors: Record<string, number>) {
  return (root: THREE.Object3D) => {
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const mats = ([o.material].flat() as THREE.MeshPhongMaterial[]).map((m) => {
        const c = colors[m.name];
        if (c === undefined) return m;
        const n = m.clone();
        n.color.setHex(c);
        n.emissive.setHex(0);
        return n;
      });
      o.material = Array.isArray(o.material) ? mats : mats[0]!;
    });
  };
}

const RPG = { idle: /\|Idle_Weapon$/, walk: /\|Walk$/, hit: /\|RecieveHit$/, die: /\|Death$/ };

function rpg(id: string, name: string, attack: RegExp, stats: UnitStats, team?: UnitDef['team'], walk?: RegExp): UnitDef {
  return {
    id: `quat-${id.toLowerCase()}`,
    name,
    pack: 'Quaternius RPG Characters (CC0)',
    model: `${B}rpg/${id}.fbx`,
    height: 1.75,
    clips: { ...RPG, attack, ...(walk ? { walk } : {}) },
    prep: texture,
    team,
    stats,
  };
}

export const QUATERNIUS: UnitDef[] = [
  rpg('Warrior', 'Warrior', /\|Sword_Attack(Fast)?$/, { hp: 130, damage: 16, range: 1.3, speed: 1.8, cooldown: 1.1, hitAt: 0.45, radius: 0.45 }),
  rpg('Ranger', 'Ranger', /\|Bow_Attack_Shoot$/, { hp: 90, damage: 13, range: 11, speed: 1.9, cooldown: 2, hitAt: 0.3, shot: 'arrow', radius: 0.4 }, tintNamed(/^Cloak$/)),
  rpg('Cleric', 'Cleric', /\|Spell1$/, { hp: 90, damage: 6, range: 6, speed: 1.5, cooldown: 2.5, hitAt: 0.55, shot: 'bolt', radius: 0.4 }),
  rpg('Wizard', 'Wizard (Q)', /\|Spell[12]$/, { hp: 85, damage: 20, range: 10, speed: 1.4, cooldown: 3, hitAt: 0.55, shot: 'fire', radius: 0.4 }),
  rpg('Rogue', 'Rogue (Q)', /\|(Dagger_Attack|Punch)/, { hp: 90, damage: 12, range: 1.2, speed: 2.2, cooldown: 0.8, hitAt: 0.4, radius: 0.4 }),
  {
    id: 'quat-dragon',
    name: 'Dragon',
    pack: 'Quaternius Animated Monsters (CC0)',
    model: `${B}monsters/Dragon.fbx`,
    prep: paint({ Main: 0xa8322a, Wings: 0x5e2a24, Belly: 0xd9b25a, Claws: 0x22180f, Eyes: 0xf6dc8c }),
    height: 3.2,
    // It only flies: its flight serves for idle and march alike.
    clips: { idle: /Dragon_Flying$/, walk: /Dragon_Flying$/, attack: /Dragon_Attack2?$/, hit: /Dragon_Hit$/, die: /Dragon_Death$/ },
    stats: { hp: 2400, damage: 24, range: 6, speed: 2, cooldown: 2, hitAt: 0.5, shot: 'fire', fly: 2.6, radius: 1.6 },
  },
  {
    id: 'quat-bat',
    name: 'Giant Bat',
    pack: 'Quaternius Animated Monsters (CC0)',
    model: `${B}monsters/Bat.fbx`,
    prep: paint({ Main: 0x5a4a5e, Black: 0x22180f, Belly: 0xb9a477, Nose: 0xd98a8a, Eyes: 0xf6dc8c }),
    height: 1.2,
    clips: { idle: /Bat_Flying$/, walk: /Bat_Flying$/, attack: /Bat_Attack2?$/, hit: /Bat_Hit$/, die: /Bat_Death$/ },
    stats: { hp: 80, damage: 9, range: 1.4, speed: 3.4, cooldown: 1, hitAt: 0.5, fly: 1.4, radius: 0.6 },
  },
  {
    id: 'quat-skeleton',
    name: 'Skeleton (Q)',
    pack: 'Quaternius Animated Monsters (CC0)',
    model: `${B}monsters/Skeleton.fbx`,
    height: 1.7,
    clips: { idle: /Skeleton_Idle$/, walk: /Skeleton_Running$/, attack: /Skeleton_Attack$/, hit: /Skeleton_Hit$/, die: /Skeleton_Death$/ },
    rate: { walk: 0.6 },
    stats: { hp: 70, damage: 6, range: 1.2, speed: 1.3, cooldown: 1.5, hitAt: 0.5, radius: 0.45 },
  },
];
