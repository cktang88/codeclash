import { Fragment, useState } from 'react';
import { Kind } from '../../sim/api.ts';
import { DOCTRINE_NAMES, STATS, type Tier } from '../../sim/stats.ts';
import { Modal } from '../ui/Modal.tsx';
import { DoctrineIcon, UnitIcon } from '../ui/icons.tsx';
import { DOCTRINE_EFFECTS } from './Command.tsx';

const TIER_LABEL: Record<Tier, string> = { base: 'Line', elite: 'Elite', special: 'Special', hero: 'Hero', legend: 'Legend' };

/** Units grouped by what in a push raises them: the code itself, the commit's purpose, then small support. */
export const UNIT_GROUPS: readonly { label: string; note: string; kinds: readonly Kind[] }[] = [
  { label: 'The code itself', note: 'Size, files touched and complexity', kinds: [Kind.Footman, Kind.Knight, Kind.Troll, Kind.Berserker, Kind.Trebuchet] },
  { label: 'Bug fixes', note: 'Commit messages with fix, bug, hotfix, crash or regression', kinds: [Kind.Cleric, Kind.Paladin, Kind.Ranger] },
  { label: 'Features', note: 'feat:, add, implement, introduce, support', kinds: [Kind.Champion, Kind.Dragon] },
  { label: 'Refactors', note: 'refactor:, clean up, simplify, remove, and deleted code', kinds: [Kind.Outrider, Kind.GriffinRider] },
  { label: 'Performance', note: 'perf:, optimize, faster, cache', kinds: [Kind.Wizard] },
  { label: 'Reverts', note: 'revert:, the undead return', kinds: [Kind.Skeleton, Kind.BoneGolem] },
  { label: 'Chores', note: 'chore:, ci:, build:, dependency bumps', kinds: [Kind.Mercenary] },
  { label: 'Support', note: 'Tests, comments, docs and config add a few helpers, never an army', kinds: [Kind.Warden, Kind.Archer, Kind.Herald, Kind.Sapper] },
];

const HOW_IT_WORKS = [
  <>
    <strong>Code is the army.</strong> Your whole day of work sets the size of your army: the code you wrote, the source files you touched and how complex it is. Each push
    marches out the soldiers your day has earned so far.
  </>,
  <>
    <strong>Purpose picks the specialists.</strong> The commit message decides who joins them: bug fixes bring Clerics and Paladins, features bring Champions, refactors bring cavalry,
    and reverts raise the dead.
  </>,
  <>
    <strong>Complexity earns heavy units.</strong> Branch points added in the code (if, for, while, case, catch, &amp;&amp;, ||) raise Knights, and very complex code raises a Troll.
    Truly legendary features summon a Dragon.
  </>,
  <>
    <strong>Tests, comments, docs and config only support.</strong> They add a handful of Wardens, Archers, a Herald or Sappers.
  </>,
  <>
    <strong>Generated and vendored code raise nothing.</strong> Lockfiles, build output and copied libraries don’t fight.
  </>,
];

const FAIR_PLAY: readonly [string, string][] = [
  ['Split or squash, same army', 'Your army comes from your whole day’s ledger, not from each push. Twenty small commits and one squashed commit raise the same soldiers; only the timing differs.'],
  ['Undone work deserts', 'Lines you add and later delete, or rewrite back, cancel out. Soldiers they raised desert.'],
  ['Moves and reformatting don’t count', 'Moving code between files, renaming, reindenting and reformatting change nothing real, so they raise nothing.'],
  ['Filler doesn’t count', 'Duplicated lines, punctuation-only lines and pasted tables of literals are left out.'],
  ['Generated and vendored code count nothing', 'Lockfiles, build output, minified bundles and copied libraries raise no one.'],
  ['The message picks specialists, not power', 'Calling every commit a fix changes who marches, never how strong the army is. Your contribution sets the power.'],
  ['Spam makes a ragged army', 'Floods of tests or comments with little code behind them lower your soldiers’ HP and damage.'],
  ['Real work makes veterans', 'The more real code you ship in a day, the higher your veteran rank, and every soldier musters stronger.'],
];

const RENOWN = [
  ['Shrine held', '2 per minute'],
  ['The Heart held', '5 per minute'],
  ['Kill', 'the victim’s worth: 1 for line soldiers, up to 30 for a Dragon'],
  ['Kill a soldier of the leader', 'double: a bounty'],
  ['Monolith damage', '1 per 100 damage'],
  ['Sack a capital', '120, less for each later sack of the same capital that day'],
];

type Tab = 'units' | 'fair' | 'command' | 'renown';

export function ArticlesOfWar({ onClose }: { onClose(): void }) {
  const [tab, setTab] = useState<Tab>('units');
  return (
    <Modal title="Articles of War" subtitle="How your pushes become an army" onClose={onClose} wide>
      <div className="segmented" role="tablist">
        {(
          [
            ['units', 'Units'],
            ['fair', 'Fair play'],
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
          <ul className="how-list">
            {HOW_IT_WORKS.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
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
                {UNIT_GROUPS.map((g) => (
                  <Fragment key={g.label}>
                    <tr className="group-row">
                      <th colSpan={6} scope="colgroup">
                        {g.label} <span className="group-note">· {g.note}</span>
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
                          <td>{s.source}</td>
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
            Each army has 160 slots on the field. A line soldier takes 1, an elite 2 or 3, a Dragon 6. Extra platoons wait at the capital.
          </p>
        </>
      )}
      {tab === 'fair' && (
        <>
          <p className="lede">Pushfront measures real work and refuses to be gamed. These are the rules that keep it honest.</p>
          <dl className="fair-list">
            {FAIR_PLAY.map(([rule, why]) => (
              <div key={rule} className="fair-item">
                <dt>{rule}</dt>
                <dd>{why}</dd>
              </div>
            ))}
          </dl>
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
            The Legacy Monolith guards the Heart at dawn, and everyone attacks it together. A sacked capital lies in ruins for 20 minutes and then rebuilds stronger. Near their own capital,
            soldiers take 20% less damage.
          </p>
        </>
      )}
    </Modal>
  );
}
