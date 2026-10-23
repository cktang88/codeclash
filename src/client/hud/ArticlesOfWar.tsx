import { Fragment, useState } from 'react';
import { DOCTRINE_NAMES, STATS, type Tier } from '../../sim/stats.ts';
import { Modal } from '../ui/Modal.tsx';
import { DoctrineIcon, UnitIcon } from '../ui/icons.tsx';
import { DOCTRINE_EFFECTS } from './Command.tsx';

const CAT_SOURCE = ['Source code', 'Tests', 'Comments in source', 'Docs and READMEs', 'Config, CI and infra', 'Deleted source lines', 'Generated code, lockfiles', 'Vendored code'];

const SHAPE_SOURCE: Record<string, string> = {
  Champion: 'A balanced push: code, tests, and docs or comments',
  Berserker: '30+ code lines with no tests and no comments',
  Cleric: 'A commit message with fix, bug, hotfix or patch',
  Dragon: 'A legendary push: 150+ code, 50+ test, 30+ docs and comment lines. One per army.',
};

const TIER_LABEL: Record<Tier, string> = { base: 'Line', elite: 'Elite', special: 'Special', hero: 'Hero', legend: 'Legend' };

const TIER_ORDER: Record<Tier, number> = { base: 0, elite: 1, special: 2, hero: 3, legend: 4 };

/** Units grouped by the line category that raises them (line before elite), then the specials. */
export function unitGroups(): { label: string; kinds: number[] }[] {
  const groups: { label: string; kinds: number[] }[] = [];
  CAT_SOURCE.forEach((label, cat) => {
    const kinds = STATS.map((_, k) => k).filter((k) => STATS[k]!.raisedBy === cat);
    kinds.sort((a, b) => TIER_ORDER[STATS[a]!.tier] - TIER_ORDER[STATS[b]!.tier] || a - b);
    if (kinds.length > 0) groups.push({ label, kinds });
  });
  const special = STATS.map((_, k) => k).filter((k) => STATS[k]!.raisedBy < 0);
  special.sort((a, b) => TIER_ORDER[STATS[a]!.tier] - TIER_ORDER[STATS[b]!.tier] || a - b);
  if (special.length > 0) groups.push({ label: 'Raised by the shape of a push', kinds: special });
  return groups;
}

/** What raises unit `k`, in words. */
export function raisedByText(k: number): string {
  const s = STATS[k]!;
  if (s.raisedBy >= 0) return `${CAT_SOURCE[s.raisedBy] ?? 'Code'}${s.tier === 'elite' ? ': in big pushes, 3 line soldiers become 1 elite' : ''}`;
  return SHAPE_SOURCE[s.name] ?? 'The shape of a push';
}

const RENOWN = [
  ['Shrine held', '2 per minute'],
  ['The Heart held', '5 per minute'],
  ['Kill', 'the victim’s worth: 1 for line soldiers, up to 30 for a Dragon'],
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
            Every push to a public repository is read line by line. Each kind of line raises its own kind of soldier, bigger and better-shaped pushes raise elites and heroes, and a push becomes a <strong>platoon</strong> that marches out of your
            capital. Blank lines raise nothing, and growth slows as a push gets bigger, so steady, healthy work beats sheer volume.
          </p>
          <div className="table-wrap">
            <table className="table units-table">
              <thead>
                <tr>
                  <th scope="col">Unit</th>
                  <th scope="col">Raised by</th>
                  <th scope="col">Tier</th>
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
                {unitGroups().map((g) => (
                  <Fragment key={g.label}>
                    <tr className="group-row">
                      <th colSpan={6} scope="colgroup">
                        {g.label}
                      </th>
                    </tr>
                    {g.kinds.map((k) => {
                      const s = STATS[k]!;
                      return (
                        <tr key={s.name}>
                          <th scope="row">
                            <span className="unit-name">
                              <UnitIcon kind={k} size={22} title="" /> {s.name}
                            </span>
                          </th>
                          <td>{raisedByText(k)}</td>
                          <td>
                            <span className={`tag tier-${s.tier}`}>{TIER_LABEL[s.tier]}</span>
                          </td>
                          <td>{s.role}</td>
                          <td className="num">{s.hp}</td>
                          <td className="num">{s.damage}</td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            After 3 pushes in an hour, platoons arrive at half strength. After 12 pushes in a day, at a third. Each army has 160 slots on the field. A line soldier takes 1, an elite 2 or 3, a Dragon 6. Extra platoons wait at the capital.
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
