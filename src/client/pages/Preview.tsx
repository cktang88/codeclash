import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { MeResponse, PreviewArmy, PreviewCombined, PreviewCommit, PreviewResponse } from '../../protocol.ts';
import { parseRepoInput } from '../../rules/repoRef.ts';
import { Kind } from '../../sim/api.ts';
import { ApiError, api } from '../net/api.ts';
import { navigate } from '../route.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { Link } from '../ui/Link.tsx';
import { PurposeTag } from '../ui/PurposeTag.tsx';
import { DropCap, EmptyVignette, Fleuron, SealButton } from '../ui/codex.tsx';
import { ago, plural } from '../ui/format.ts';
import { Icon } from '../ui/icons.tsx';
import { ArmyWhy } from '../ui/ArmyWhy.tsx';
import { armyLook, Formation, LineBar } from '../ui/Muster.tsx';
import '../styles/preview.css';

/** Well-known public repositories to try. */
const EXAMPLES = ['facebook/react', 'sveltejs/svelte', 'rust-lang/rust'] as const;

type Failure = { code: string; message: string };

const ROMAN = ['', 'I', 'II', 'III'];

/** Heroes, a Dragon, Berserkers, veterans and rags, called out as heraldic labels. */
function Callouts({ army }: { army: PreviewArmy }) {
  const c = army.counts;
  const tags: { tone: string; text: string; icon?: Parameters<typeof Icon>[0]['name'] }[] = [];
  if (c[Kind.Dragon]! > 0) tags.push({ tone: 'legend', text: c[Kind.Dragon] === 1 ? 'A Dragon wakes' : `${c[Kind.Dragon]} Dragons wake` });
  if (c[Kind.Champion]! > 0) tags.push({ tone: 'hero', text: c[Kind.Champion] === 1 ? 'A Champion' : `${c[Kind.Champion]} Champions`, icon: 'crown' });
  if (c[Kind.Ballista]! > 0) tags.push({ tone: 'siege', text: c[Kind.Ballista] === 1 ? 'A Ballista: bane of the big' : `${c[Kind.Ballista]} Ballistae: bane of the big` });
  if (c[Kind.Berserker]! > 0) tags.push({ tone: 'berserk', text: `${c[Kind.Berserker]} Berserker${c[Kind.Berserker] === 1 ? '' : 's'}: untested fury`, icon: 'skull' });
  if (army.veterancy > 0) tags.push({ tone: 'veteran', text: `Veteran ${ROMAN[army.veterancy]}`, icon: 'shield' });
  if (army.ragged) tags.push({ tone: 'ragged', text: 'Ragged' });
  if (tags.length === 0) return null;
  return (
    <ul className="callouts">
      {tags.map((t) => (
        <li key={t.text} className={`callout tone-${t.tone}`}>
          {t.icon && <Icon name={t.icon} size={14} />} {t.text}
        </li>
      ))}
    </ul>
  );
}

/** How scoring works, in five lines: what the page's figures come from. */
function HowScoring() {
  return (
    <details className="how-scoring">
      <summary>
        <Icon name="book" size={16} /> <span className="how-scoring-word">How scoring works</span>
      </summary>
      <ul>
        <li>
          <strong>Code is the army.</strong> About 16 lines of real code raise one place in the ranks; files, complexity and cleanup add a little.
        </li>
        <li>
          <strong>Purpose picks specialists.</strong> The commit message chooses who marches (fixes raise Clerics and Ballistae, features Champions), never how many.
        </li>
        <li>
          <strong>Editing others’ established code counts more:</strong> up to ×3.2 a line in a big, old, much-worked file, and each hard file fixed earns effort credit.
        </li>
        <li>
          <strong>Forks pay once merged upstream.</strong> Their extra credit waits until the commit reaches the original repository.
        </li>
        <li>
          <strong>Spam earns nothing.</strong> Repeats, brackets, data and generated lines don’t count, and padding makes a ragged army.
        </li>
      </ul>
    </details>
  );
}

/** The commit's message as a herald's scroll, linked to the commit on GitHub. */
function HeraldScroll({ c, now }: { c: PreviewCommit; now: number }) {
  const who = c.author.login ?? c.author.name ?? 'unknown';
  return (
    <div className="herald-scroll">
      <a className="herald-message" href={c.htmlUrl} target="_blank" rel="noopener noreferrer" title="Open this commit on GitHub">
        {c.message || <span className="muted">(no message)</span>}
        <Icon name="share" size={14} className="herald-out" />
      </a>
      <div className="herald-meta">
        <a className="scribe sha" href={c.htmlUrl} target="_blank" rel="noopener noreferrer" aria-label={`Commit ${c.shortSha} on GitHub`}>
          {c.shortSha}
        </a>
        <span className="herald-author">
          <Avatar login={who} url={c.author.avatarUrl} size={20} />
          <span className="truncate">{c.author.login ? `@${c.author.login}` : who}</span>
        </span>
        {c.date && (
          <time dateTime={c.date} title={new Date(c.date).toLocaleString()}>
            {ago(now - Date.parse(c.date))}
          </time>
        )}
        <PurposeTag purpose={c.purpose} />
      </div>
    </div>
  );
}

function CommitRow({ c, hue, now, index }: { c: PreviewCommit; hue: number | null; now: number; index: number }) {
  return (
    <li className={`muster-row${c.army.ragged ? ' is-ragged' : ''}${c.army.counts[Kind.Dragon]! > 0 ? ' has-dragon' : ''}`} style={{ ['--n' as string]: index } as CSSProperties}>
      <HeraldScroll c={c} now={now} />
      <div className="muster-row-lines">
        <LineBar lines={c.lines} hue={hue} />
        <p className="muster-row-stats muted small">
          {plural(c.filesChanged, 'file')} changed{c.files > 0 ? ` · ${plural(c.files, 'source file')} counted` : ''}
          {c.complexity > 0 ? ` · complexity ${c.complexity.toLocaleString('en-US', { maximumFractionDigits: 1 })}` : ''}
          {c.bonus ? ` · difficulty bonus +${plural(c.bonus, 'line')}` : ''}
        </p>
      </div>
      <div className="muster-row-army">
        <Callouts army={c.army} />
        {c.unread ? (
          <p className="muted small">GitHub would not give this diff.</p>
        ) : (
          <ArmyWhy why={c.why} reasons={c.reasons}>
            <Formation army={c.army} hue={hue} compact label={`Army of ${c.shortSha}`} />
          </ArmyWhy>
        )}
      </div>
    </li>
  );
}

function CombinedCard({ combined, hue, count }: { combined: PreviewCombined; hue: number | null; count: number }) {
  const army = combined.army;
  return (
    <section className="combined panel" aria-labelledby="combined-title">
      <p className="eyebrow">If pushed together today</p>
      <h2 id="combined-title" className="block-title">
        All {count === 1 ? 'one' : count} together would raise…
      </h2>
      <Callouts army={army} />
      <ArmyWhy why={combined.why} reasons={combined.reasons} open>
        <Formation army={army} hue={hue} label="The combined army" />
        <LineBar lines={combined.lines} hue={hue} />
        <p className="combined-note">
          Pushed one by one or squashed into one push, they leave the same ledger, so the army is the same size and strength either way: only the commit messages choose its specialists. Mustered
          one by one, each on a fresh day, these commits raise armies of total size <span className="num">{combined.separateSlots}</span>; together, <span className="num">{army.slots}</span>.
        </p>
      </ArmyWhy>
    </section>
  );
}

/** Loading: a quill writing a line of ink across the page. */
function InkWriting({ repo }: { repo: string }) {
  return (
    <div className="ink-writing" role="status" aria-live="polite">
      <svg viewBox="0 0 320 60" width="320" height="60" aria-hidden className="ink-writing-art">
        <path
          className="ink-line"
          d="M8 40c10-14 18-18 22-8s-6 16 2 10 12-22 20-14-4 18 4 14 10-18 18-12 0 14 8 10 14-20 22-12-2 14 6 10 10-16 18-10-2 12 6 8 14-18 22-10-2 12 6 8 12-14 20-8 0 10 8 6 14-16 22-8-2 10 6 6 12-12 20-6 2 8 10 4 14-12 22-6"
        />
        <g className="ink-quill">
          <path d="M0 0c10-14 24-26 40-30-6 10-16 22-34 32Z" fill="#efe4c8" stroke="#22180f" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M0 0 22-16" stroke="#22180f" strokeWidth="1" />
        </g>
      </svg>
      <p className="ink-writing-text">The scouts ride to {repo} and copy out its latest commits…</p>
    </div>
  );
}

/** An error as a note torn from the ledger. */
function TornNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="torn-note" role="alert">
      <h2 className="torn-note-title">{title}</h2>
      {children}
    </div>
  );
}

function failureTitle(f: Failure): string {
  switch (f.code) {
    case 'not_found':
      return 'No such public repository';
    case 'no_branch':
      return 'No such branch';
    case 'rate_limited':
      return 'The scouts must rest';
    case 'github_limited':
      return 'GitHub’s gates are shut for the hour';
    case 'unparsed':
      return 'The scouts cannot read that';
    case 'offline':
      return 'The war office did not answer';
    default:
      return 'The scouts returned empty-handed';
  }
}

export function PreviewPage({ owner, repo, branch, me }: { owner: string | null; repo: string | null; branch: string | null; me: MeResponse | null }) {
  const [text, setText] = useState(owner && repo ? `${owner}/${repo}` : '');
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const input = useRef<HTMLInputElement>(null);
  const target = owner && repo ? `${owner}/${repo}` : null;

  useEffect(() => {
    if (owner && repo) setText(`${owner}/${repo}`);
  }, [owner, repo]);

  useEffect(() => {
    if (!owner || !repo) {
      setData(null);
      setFailure(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailure(null);
    api.preview(owner, repo, branch).then(
      (d) => {
        if (cancelled) return;
        setData(d);
        setNow(Date.now());
        setLoading(false);
        document.title = `${d.repo} · Army preview · Pushfront`;
      },
      (err: unknown) => {
        if (cancelled) return;
        setData(null);
        setLoading(false);
        setFailure(err instanceof ApiError ? { code: err.code, message: err.message } : { code: 'error', message: 'Something went wrong.' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [owner, repo, branch]);

  const submit = (value = text) => {
    const parsed = parseRepoInput(value);
    if (!parsed) {
      setFailure({ code: 'unparsed', message: 'Paste a public repository as owner/repo, or any github.com link to it: the repository, a branch or a commit.' });
      input.current?.focus();
      return;
    }
    setText(`${parsed.owner}/${parsed.repo}`);
    const same = target?.toLowerCase() === `${parsed.owner}/${parsed.repo}`.toLowerCase();
    navigate({ kind: 'preview', owner: parsed.owner, repo: parsed.repo, branch: parsed.ref ?? (same ? branch : null) });
  };

  // The viewer's would-be army colour: their latest army's hue when signed in, else a neutral pigment.
  const hue = data?.viewerHue ?? null;
  const signedIn = !!me?.user;
  const shown = data && !loading ? data : null;
  const branches = shown ? (shown.branches.includes(shown.branch) ? shown.branches : [shown.branch, ...shown.branches]) : [];

  return (
    <main className="folio preview-page" style={{ ['--army' as string]: armyLook(hue).css } as CSSProperties}>
      <nav className="crumbs">
        <Link to={{ kind: 'home' }}>← Lobby</Link>
      </nav>
      <header className="preview-head">
        <p className="eyebrow">Army preview</p>
        <h1 className="page-title">{shown ? shown.repo : 'See what your code would raise'}</h1>
        {!target && (
          <DropCap
            className="preview-lede"
            text="Name any public repository and the scouts will copy out its latest ten commits. Each is weighed exactly as a push is weighed in the war, as if pushed alone on a fresh day, and its army is drawn up beside it: what it raised, and why."
          />
        )}
        <form
          className="preview-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="preview-field">
            <span className="sr-only">Repository</span>
            <Icon name="quill" size={18} className="preview-quill" />
            <input
              ref={input}
              className="input preview-input"
              value={text}
              placeholder="owner/repo, or a GitHub link"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              aria-invalid={failure?.code === 'unparsed' ? true : undefined}
              onChange={(e) => {
                setText(e.target.value);
                if (failure?.code === 'unparsed') setFailure(null);
              }}
            />
          </label>
          {shown && branches.length > 0 && (
            <label className="preview-branch">
              <span className="sr-only">Branch</span>
              <Icon name="flag" size={16} />
              <select
                className="select"
                value={shown.branch}
                onChange={(e) => navigate({ kind: 'preview', owner: owner!, repo: repo!, branch: e.target.value === shown.defaultBranch ? null : e.target.value })}
              >
                {branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                    {b === shown.defaultBranch ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <SealButton type="submit" sigil={<Icon name="flag" size={22} />} caption="Raise the muster" disabled={loading || !text.trim()} className="preview-seal" />
        </form>
        {!target && (
          <p className="preview-examples">
            <span className="muted">Try one:</span>
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="ink-link preview-example" onClick={() => submit(ex)}>
                {ex}
              </button>
            ))}
          </p>
        )}
        <p className="muted small preview-pigment">
          {hue !== null ? 'Drawn in your army’s colours.' : signedIn ? 'Drawn in a neutral pigment until your first war gives your army its colours.' : 'Drawn in a neutral pigment. Sign in and fight a war to see them in your own colours.'}
        </p>
        <HowScoring />
      </header>

      {loading && target && <InkWriting repo={target} />}
      {failure && !loading && (
        <TornNote title={failureTitle(failure)}>
          <p>{failure.message}</p>
          {failure.code === 'not_found' && <p className="muted small">Private repositories are never read, and the scouts answer for them exactly as for missing ones.</p>}
        </TornNote>
      )}

      {shown && shown.commits.length === 0 && (
        <EmptyVignette kind="ledger" title="No commits to muster">
          <p>
            <code>{shown.branch}</code> of {shown.repo} has no commits yet{shown.skippedMerges > 0 ? ' but merges, which never count' : ''}.
          </p>
          <p>
            <button type="button" className="btn" onClick={() => submit(EXAMPLES[0])}>
              Try {EXAMPLES[0]}
            </button>
          </p>
        </EmptyVignette>
      )}

      {shown && shown.combined && (
        <>
          <CombinedCard combined={shown.combined} hue={hue} count={shown.commits.length} />
          <Fleuron />
          <h2 className="block-title preview-roll-title">
            The latest {shown.commits.length === 1 ? 'commit' : `${shown.commits.length} commits`}, each pushed alone
          </h2>
          <p className="muted small preview-roll-sub">
            Newest first, on <code>{shown.branch}</code>
            {shown.skippedMerges > 0 ? ` · ${plural(shown.skippedMerges, 'merge commit')} passed over (merges never count)` : ''} · read {ago(now - shown.fetchedAt)}
          </p>
          <ol className="muster-roll">
            {shown.commits.map((c, i) => (
              <CommitRow key={c.sha} c={c} hue={hue} now={now} index={i} />
            ))}
          </ol>
        </>
      )}

      <footer className="preview-foot muted small">
        Only public repositories are read, with the server’s own GitHub access; your sign-in is never used. Each commit is measured as one push alone on a fresh day, through the same
        ledger as the war: duplicates, filler and generated code count for nothing. Results are kept for five minutes.{' '}
        <Link to={{ kind: 'demo' }} className="ink-link">
          Watch a demo war
        </Link>
      </footer>
    </main>
  );
}
