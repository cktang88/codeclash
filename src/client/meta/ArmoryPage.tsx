import { useState } from 'react';
import type { ArmoryResponse, MeResponse } from '../../protocol.ts';
import { RANKS, type ArmoryItem, type Heraldry } from '../../rules/meta.ts';
import { armyColor, hsl, type Emblem, type Pattern } from '../../rules/heraldry.ts';
import { ApiError } from '../net/api.ts';
import { Notice } from '../pages/Notice.tsx';
import { InkLink, VellumPanel, sfx } from '../ui/codex.tsx';
import { FlagSvg } from '../ui/Flag.tsx';
import { metaApi, useLoad } from './api.ts';
import { RankBadge } from './RankBadge.tsx';

const SLOTS: readonly { slot: ArmoryItem['slot']; label: string; hint: string }[] = [
  { slot: 'pattern', label: 'Standard', hint: 'The division of your army standard.' },
  { slot: 'emblem', label: 'Emblem', hint: 'The charge upon it.' },
  { slot: 'keep', label: 'Keep', hint: 'How your capital is built.' },
  { slot: 'trim', label: 'Trim', hint: 'Edging on your battalion flags and capital standards.' },
  { slot: 'fanfare', label: 'Fanfare', hint: 'What sounds when you win the day.' },
  { slot: 'tassel', label: 'Tassel', hint: 'A tassel on your banner.' },
];

const label = (value: string) => (value === 'true' ? 'Yes' : value === 'false' ? 'No' : value[0]!.toUpperCase() + value.slice(1));

/** A preview of the chosen standard in the player's own hue. */
export function StandardPreview({ heraldry, hue = 212, size = 96 }: { heraldry: Pick<Heraldry, 'pattern' | 'emblem'>; hue?: number; size?: number }) {
  return (
    <FlagSvg
      size={size}
      flag={{ hue, field: armyColor(hue), charge: hsl(hue, 60, 32), accent: hsl(45, 70, 55), pattern: heraldry.pattern as Pattern, emblem: heraldry.emblem as Emblem, initials: '' }}
    />
  );
}

export function ArmoryPage({ me }: { me: MeResponse | null }) {
  const signedIn = !!me?.user;
  const load = useLoad(signedIn ? `armory:${me.user!.id}` : 'armory:none', () => (signedIn ? metaApi.armory() : Promise.resolve(null)));
  const [armory, setArmory] = useState<ArmoryResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const current = armory ?? load.data;

  if (!signedIn) {
    return (
      <Notice title="The Armory is locked" icon="users">
        <p>Sign in to choose your heraldry.</p>
        <a className="btn btn-primary" href="/auth/github">Sign in with GitHub</a>
      </Notice>
    );
  }
  if (load.error) {
    return (
      <Notice title="The Armory is closed">
        <p>{load.error}</p>
      </Notice>
    );
  }
  if (!current) {
    return (
      <main className="page page-center" role="status">
        <span className="spinner" aria-hidden /> Unlocking the Armory…
      </main>
    );
  }

  const wear = async (req: Partial<Heraldry>) => {
    setSaving(true);
    setMessage(null);
    try {
      setArmory(await metaApi.setArmory(req));
      sfx('ui.seal');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'The herald could not record that.');
    } finally {
      setSaving(false);
    }
  };

  const h = current.heraldry;
  return (
    <main className="page meta-armory">
      <nav className="crumbs">
        <InkLink to={{ kind: 'home' }}>← Lobby</InkLink>
      </nav>
      <header className="meta-armory-head">
        <StandardPreview heraldry={h} size={128} />
        <div>
          <h1 className="page-title">The Armory</h1>
          <RankBadge rank={current.rank} />
          <p className="muted">Heraldry is for show. It never changes how your soldiers fight. Changes take effect in tomorrow’s war.</p>
        </div>
      </header>
      {message && (
        <p className="meta-armory-message" role="alert">
          {message}
        </p>
      )}
      {SLOTS.map(({ slot, label: name, hint }) => (
        <VellumPanel key={slot} className="meta-armory-slot" aria-labelledby={`armory-${slot}`}>
          <h2 className="block-title" id={`armory-${slot}`}>
            {name}
          </h2>
          <p className="muted">{hint}</p>
          <div className="meta-armory-choices" role="radiogroup" aria-labelledby={`armory-${slot}`}>
            {current.catalog
              .filter((i) => i.slot === slot)
              .map((i) => {
                const on = String(h[slot as keyof Heraldry]) === i.value;
                return (
                  <button
                    key={i.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={!i.unlocked || saving}
                    className={`meta-choice${on ? ' is-on' : ''}${i.unlocked ? '' : ' is-locked'}`}
                    title={i.unlocked ? undefined : `Unlocks at ${RANKS[i.rank]!.title}`}
                    onClick={() => !on && void wear({ [slot]: slot === 'tassel' ? i.value === 'true' : i.value } as Partial<Heraldry>)}
                  >
                    {slot === 'pattern' && <StandardPreview heraldry={{ pattern: i.value as Pattern, emblem: h.emblem }} size={40} />}
                    {slot === 'emblem' && <StandardPreview heraldry={{ pattern: h.pattern, emblem: i.value as Emblem }} size={40} />}
                    <span className="meta-choice-name">{label(i.value)}</span>
                    {!i.unlocked && <span className="meta-choice-lock muted">{RANKS[i.rank]!.title}</span>}
                  </button>
                );
              })}
          </div>
        </VellumPanel>
      ))}
      <VellumPanel className="meta-armory-slot" aria-labelledby="armory-title">
        <h2 className="block-title" id="armory-title">
          Herald’s title
        </h2>
        <p className="muted">Shown beside your name. Earned by rank and by Deeds.</p>
        <select
          className="select"
          aria-labelledby="armory-title"
          value={h.title ?? ''}
          disabled={saving}
          onChange={(e) => void wear({ title: e.target.value || null })}
        >
          <option value="">None</option>
          {current.titles.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </VellumPanel>
    </main>
  );
}
