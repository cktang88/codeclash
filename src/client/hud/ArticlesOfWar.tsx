import { useState } from 'react';
import { DOCTRINE_NAMES, STATS } from '../../sim/stats.ts';
import { Modal } from '../ui/Modal.tsx';
import { DoctrineIcon, UnitIcon } from '../ui/icons.tsx';
import { DOCTRINE_EFFECTS } from './Command.tsx';

export const UNIT_SOURCES = [
  'Source code lines',
  'Test lines',
  'Comments in source',
  'Docs: Markdown, READMEs, docs/',
  'Config: CI, Docker, YAML, TOML',
  'Deleted source lines',
  'Generated code and lockfiles',
  'Vendored third-party code',
  'A balanced push: 20+ code lines, tests, and docs or comments',
];

export const UNIT_ROLES = [
  'Line infantry. Deals 60% more damage to Outriders.',
  'Shield wall. Allies nearby take 30% less damage. Arrows do half damage to it.',
  'Ranged. Arrows arc over the line. Deals 40% more damage to Legionaries, Golems and Mercenaries.',
  'Banner bearer and medic. Heals allies nearby and halves the platoon’s morale loss.',
  'Siege engineer. Deals 6× damage to capitals and the Monolith.',
  'Fast cavalry. Deals 60% more damage to Archers, Heralds and Sappers.',
  'Slow, sturdy fodder. Cheap and plentiful.',
  'Hired blade. Hits hard, but leaves 10 minutes after arriving.',
  'Hero. Allies nearby deal 20% more damage. Its platoon cannot rout while it lives.',
];

const RENOWN = [
  ['Shrine held', '2 per minute'],
  ['The Heart held', '8 per minute'],
  ['Kill', '1, 2 for elite units, 10 for a Champion'],
  ['Kill a soldier of the leader', 'double: a bounty'],
  ['Monolith damage', '1 per 100 damage'],
  ['Sack a capital', '200'],
];

type Tab = 'units' | 'command' | 'renown';

export function ArticlesOfWar({ onClose }: { onClose(): void }) {
  const [tab, setTab] = useState<Tab>('units');
  return (
    <Modal title="Articles of War" subtitle="How your pushes become an army" onClose={onClose} wide>
      <div className="segmented" role="tablist">
        {(
          [
            ['units', 'Units'],
            ['command', 'Command'],
            ['renown', 'Renown'],
          ] as const
        ).map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'is-on' : ''} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'units' && (
        <>
          <p className="lede">
            Every push to a public repository is read line by line. Each kind of line raises its own kind of soldier, and a push becomes a <strong>platoon</strong> that marches out of your
            capital. Blank lines raise nothing, and growth slows as a push gets bigger, so steady, healthy work beats sheer volume.
          </p>
          <div className="table-wrap">
            <table className="table units-table">
              <thead>
                <tr>
                  <th scope="col">Unit</th>
                  <th scope="col">Raised by</th>
                  <th scope="col">Role</th>
                  <th scope="col" className="num">
                    HP
                  </th>
                  <th scope="col" className="num">
                    Dmg
                  </th>
                </tr>
              </thead>
              <tbody>
                {STATS.map((s, k) => (
                  <tr key={s.name}>
                    <th scope="row">
                      <span className="unit-name">
                        <UnitIcon kind={k} size={22} title="" /> {s.name}
                      </span>
                    </th>
                    <td>{UNIT_SOURCES[k]}</td>
                    <td>{UNIT_ROLES[k]}</td>
                    <td className="num">{s.hp}</td>
                    <td className="num">{s.damage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            After 3 pushes in an hour, platoons arrive at half strength. After 12 pushes in a day, at a third. A player can have 160 soldiers on the field at once. Extra platoons wait at
            the capital.
          </p>
        </>
      )}
      {tab === 'command' && (
        <>
          <p className="lede">
            Nobody steers individual soldiers. Your war council sends each platoon to an objective. You get three levers, and each is scarce.
          </p>
          <h3 className="section-label">Doctrine · change once an hour</h3>
          <ul className="doctrine-list">
            {DOCTRINE_NAMES.map((name, d) => (
              <li key={name}>
                <DoctrineIcon doctrine={d} size={22} />
                <span>
                  <strong>{name}</strong> {DOCTRINE_EFFECTS[d]}
                </span>
              </li>
            ))}
          </ul>
          <h3 className="section-label">Rally · every 30 minutes</h3>
          <p>Every platoon marches on one objective you choose, for 2 hours.</p>
          <h3 className="section-label">War Cry · once per war</h3>
          <p>Your soldiers deal 30% more damage and move 25% faster for 60 seconds.</p>
          <h3 className="section-label">Morale</h3>
          <p>
            Platoons lose morale as soldiers fall or when they are outnumbered two to one. At zero morale a platoon breaks and runs home to regroup. Heralds steady them, and a
            Champion never lets its platoon break.
          </p>
        </>
      )}
      {tab === 'renown' && (
        <>
          <p className="lede">
            The player with the most renown at the room’s reset hour wins the day. Then the map is redrawn, a digest is written, and the war begins again.
          </p>
          <table className="table">
            <tbody>
              {RENOWN.map(([what, how]) => (
                <tr key={what}>
                  <th scope="row">{what}</th>
                  <td>{how}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">
            The Legacy Monolith guards the Heart at dawn, and everyone attacks it together. A sacked capital lies in ruins for 10 minutes and then rebuilds. Near their own capital,
            soldiers take 20% less damage.
          </p>
        </>
      )}
    </Modal>
  );
}
