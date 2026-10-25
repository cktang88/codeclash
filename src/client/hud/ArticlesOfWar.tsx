import { Fragment, useState, type ReactNode } from 'react';
import { DAILY_BONUS_CAP, FILE_CAP, FILE_CREDIT, GATE_CAP, MEANINGFUL_LINES } from '../../rules/difficulty.ts';
import { Kind } from '../../sim/api.ts';
import { STATS, type Tier } from '../../sim/stats.ts';
import { Link } from '../ui/Link.tsx';
import { Modal } from '../ui/Modal.tsx';
import { Ribbons } from '../ui/codex.tsx';
import { UnitIcon } from '../ui/icons.tsx';

const TIER_LABEL: Record<Tier, string> = { base: 'Line', elite: 'Elite', special: 'Special', hero: 'Hero', legend: 'Legend' };

/** Units grouped by what in a push raises them: the code itself, the commit's purpose, then small support. */
export const UNIT_GROUPS: readonly { label: string; note: string; kinds: readonly Kind[] }[] = [
  { label: 'The code itself', note: 'Size, files touched and complexity', kinds: [Kind.Footman, Kind.Knight, Kind.Troll, Kind.Berserker, Kind.Trebuchet] },
  { label: 'Bug fixes', note: 'Commit messages with fix, bug, hotfix, crash or regression; a hard fix’s difficulty bonus counts as fix work', kinds: [Kind.Ballista, Kind.Cleric, Kind.Paladin, Kind.Ranger] },
  { label: 'Features', note: 'feat:, add, implement, introduce, support', kinds: [Kind.Champion, Kind.Dragon] },
  { label: 'Refactors', note: 'refactor:, clean up, simplify, remove, and deleted code', kinds: [Kind.Outrider, Kind.GriffinRider] },
  { label: 'Performance', note: 'perf:, optimize, faster, cache', kinds: [Kind.Wizard] },
  { label: 'Reverts', note: 'revert:, the undead return', kinds: [Kind.Skeleton, Kind.BoneGolem] },
  { label: 'Chores', note: 'chore:, ci:, build:, dependency bumps', kinds: [Kind.Mercenary] },
  { label: 'Support', note: 'Tests, comments, docs and config add a few helpers, never an army', kinds: [Kind.Warden, Kind.Archer, Kind.Herald, Kind.Sapper] },
];

const HOW_IT_WORKS = [
  <>
    <strong>Code is the army.</strong> Your whole day of work sets the size of your army: the code you wrote, the source files you touched and how complex it is. Twice the real
    code raises about twice the army, up to 4,000 lines a day; past that each line counts half, and nothing past 8,000. Each push marches out the soldiers your day has earned so far.
  </>,
  <>
    <strong>Hard edits count for more.</strong> Changing other people’s established code in a big, much-worked repository is harder than writing new lines, so it earns a
    difficulty bonus: each line of others’ code you replace counts up to 3.2 times (the first 40 in a file in full, fewer after), by how big, old, central and shared the file
    is. And each such file you meaningfully change in a day ({MEANINGFUL_LINES}+ of its lines) earns a fixed effort credit of up to {FILE_CREDIT} lines, for at most{' '}
    {FILE_CAP} files a day. New lines are never multiplied, your own code never counts as others’, and a young repository without stars, forks and other contributors is held to ×
    {GATE_CAP}. The bonus counts as code, up to {DAILY_BONUS_CAP.toLocaleString('en-US')} lines a day.
  </>,
  <>
    <strong>Purpose picks the specialists.</strong> The commit message decides who joins them: bug fixes bring Ballistae (armour-piercing bolts, deadly to Dragons, Trolls and
    every big soldier), battle-priest Clerics, Paladins and Rangers; features bring Champions, refactors bring cavalry, and reverts raise the dead. A hard fix’s difficulty bonus
    counts as fix work.
  </>,
  <>
    <strong>Complexity earns heavy units.</strong> Complexity is read from the code’s syntax: each decision (if, loops, case arms, catch, &amp;&amp;, ||) is a point, each new
    function with a real body is three, and each name you use from a newly imported module of your own repository is half a point. Strings, comments, stubs and unused imports
    count for nothing. Complexity raises Knights, very complex code raises Trolls, and truly legendary features summon a Dragon.
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
  ['Complexity is real syntax', 'Decisions are read from the syntax tree, so keywords in strings or comments, `if (true)` and long && chains add nothing. Empty, one-line and forwarding functions earn no function points, a function counts only while the lines carrying it stand, and an import counts only for the names its code uses, once a day per module.'],
  ['Hard edits are checked', 'The difficulty bonus comes from GitHub’s blame of the file before your push: lines you wrote yourself, whitespace and comment edits earn nothing, backdated history counts from the day the repository was made, fresh accounts are not contributors, and undoing an edit the same day takes its bonus back.'],
  ['Generated and vendored code count nothing', 'Lockfiles, build output, minified bundles and copied libraries raise no one.'],
  ['The message picks specialists, not power', 'Calling every commit a fix changes who marches, never how strong the army is. Your contribution sets the power.'],
  ['Spam makes a ragged army', 'Floods of tests or comments with little code behind them lower your soldiers’ HP and damage.'],
  ['Real work makes veterans', 'The more real code you ship in a day, the higher your veteran rank, and every soldier musters stronger.'],
];

const RENOWN = [
  ['Border fort held', '2 per minute while your soldiers garrison it, a quarter of that while it stands empty'],
  ['Kill', 'the victim’s worth: 1 for line soldiers, up to 30 for a Dragon'],
  ['Storm a capital', '120 for its first fall of the day, then 120 ÷ n for its n-th'],
];

/** The ring, in the order a player meets it. */
const THE_RING: readonly [string, ReactNode][] = [
  [
    'A ring of capitals',
    <>
      Every army’s capital stands on a ring around an impassable centre, a great lake or a mountain massif. The road runs round the ring, and a <strong>border fort</strong> stands
      midway between each pair of neighbours. Seats are shuffled every day, so your neighbours change.
    </>,
  ],
  [
    'Two fronts',
    <>
      You fight only your two neighbours on the ring, one on each side. Everyone else passes your soldiers by unharmed. Your platoons march out to whichever front is pressed hardest.
    </>,
  ],
  [
    'Forts first, then walls',
    <>
      A fort flips to whoever holds it alone for 10 seconds. You can storm a neighbour’s walls only while you hold the fort beside them, and no walls can fall until the sieges open, some
      hours into the war (the ring over the map counts down to it). A founder’s gates also stay barred for a while after its first push, so no one is conquered in their sleep.
    </>,
  ],
  [
    'Sieges',
    <>
      Walls fall slowly however many strike them, so a siege is a stand: the defender, its other neighbour and every fresh push can still turn it. Near a capital they hold, soldiers take
      20% less damage, and the tower bleeds the besiegers all the while.
    </>,
  ],
  [
    'Capture',
    <>
      A capital at zero walls changes hands. Its founder’s keep stands under the conqueror’s banners, it becomes the conqueror’s <strong>muster gate</strong>, and every capital held beyond
      your own home adds <strong>25%</strong> to your army.
    </>,
  ],
  [
    'Rising',
    <>
      Lose every capital and you are not out. Your pushes muster as a <strong>rising</strong> on the road outside your lost home: take the forts beside it and storm it back.
    </>,
  ],
  [
    'Victory',
    <>
      Hold the whole ring and the war is won on the spot: the field stands still and the room is locked until the reset. If the reset comes first, the most capitals wins, then the
      larger share of the day’s code, then the most renown.
    </>,
  ],
];

type Tab = 'ring' | 'units' | 'fair' | 'council' | 'renown';

export function ArticlesOfWar({ onClose }: { onClose(): void }) {
  const [tab, setTab] = useState<Tab>('ring');
  return (
    <Modal title="Articles of War" subtitle="Being the rules by which pushes become armies" onClose={onClose} wide className="rulebook">
      <Ribbons
        className="book-ribbons"
        label="Chapters"
        value={tab}
        onChange={setTab}
        items={[
          ['ring', 'The ring'],
          ['units', 'Units'],
          ['fair', 'Fair play'],
          ['council', 'The council'],
          ['renown', 'Renown'],
        ]}
      />
      {tab === 'ring' && (
        <>
          <p className="lede">Every push you make to a public repository becomes a platoon. The war is for the ring of capitals; it lasts a day, from one reset to the next.</p>
          <dl className="fair-list">
            {THE_RING.map(([rule, why]) => (
              <div key={rule} className="fair-item">
                <dt>{rule}</dt>
                <dd>{why}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {tab === 'units' && (
        <>
          <p className="lede">
            <Link className="ink-link" to={{ kind: 'preview', owner: null, repo: null, branch: null }}>
              See what your code would raise
            </Link>
            : name any public repository and the army preview draws up what each of its latest commits would muster, and why.
          </p>
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
            Each army has 320 slots on the field (its even share of 4,000 in a room of more than 12), and 25% more for every capital it holds beyond its home. A line soldier takes 1, an
            elite 2 or 3, a Dragon 6. Extra platoons wait at the capital.
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
      {tab === 'council' && (
        <>
          <p className="lede">
            <strong>No manual control: your code is your only command.</strong> Nobody steers the armies, not even you. Every push you make raises soldiers, and your war council
            leads them.
          </p>
          <h3 className="section-label">The war council</h3>
          <p>
            Every few seconds your council sends each platoon to an objective on its front: a border fort to take or hold, a neighbour’s walls once the fort beside them is won and enough
            soldiers have massed, or your own walls when they are under siege. New platoons march to the front pressed hardest. It is the same council for everyone, so the armies differ
            only by the work behind them.
          </p>
          <h3 className="section-label">What you can do</h3>
          <p>
            Push real work. Watch, follow your banner, and inspect a platoon to read its story. Cheers are just for show: they float over your capital for everyone to see and change
            nothing on the field.
          </p>
          <h3 className="section-label">Morale</h3>
          <p>
            Platoons lose morale as soldiers fall or when they are outnumbered two to one. At zero morale a platoon breaks and runs to the nearest capital you hold to regroup (a rising’s,
            to the fort beside its lost home). Heralds steady them, and a Champion never lets its platoon break.
          </p>
        </>
      )}
      {tab === 'renown' && (
        <>
          <p className="lede">
            Hold the whole ring and you win outright. If the reset comes first, the player holding the most capitals wins the day; with capitals level, the larger share of the day’s
            code wins, and then renown. Then the map is redrawn, a digest is written, and the war begins again.
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
            Nothing singles out the leader: there is no bounty on its soldiers, and the ring itself makes it face only its two neighbours.
          </p>
        </>
      )}
    </Modal>
  );
}
