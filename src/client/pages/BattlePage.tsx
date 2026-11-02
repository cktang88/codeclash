import { useEffect, useState } from 'react';
import { BATTLE_VERSION } from '../../game/battle.ts';
import type { BattleView as View } from '../../protocol.ts';
import { n } from '../format.ts';
import { api } from '../api.ts';
import { DAY_NAMES } from '../format.ts';
import { linkProps } from '../route.ts';
import { BattleView } from '../ui/BattleView.tsx';

export function BattlePage({ id }: { id: number }) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.battle(id).then(setView, (e: Error) => setError(e.message));
  }, [id]);
  if (error) return <div className="page"><p className="error">{error}</p></div>;
  if (!view) return <div className="page"><p className="muted">The armies are forming up…</p></div>;
  if (view.setup.version !== BATTLE_VERSION) {
    const c = view.card;
    const name = (i: 0 | 1) => (i === 0 ? c.a.login : (c.b?.login ?? 'Brigands'));
    return (
      <div className="page">
        <p><a {...linkProps(`/l/${view.league.slug}/battles`)}>← {view.league.name}</a></p>
        <h1>{name(c.winner)} held the field</h1>
        <p className="muted">This battle was fought under an older version of the rules of war (v{view.setup.version}), so it cannot be replayed in this build. The result stands:</p>
        <p>{name(0)}: {n(c.men[0])} men, {n(c.dead[0])} fell. {name(1)}: {n(c.men[1])} men, {n(c.dead[1])} fell.</p>
      </div>
    );
  }
  const title = view.card.kind === 'grand' ? 'The Grand Battle' : `${DAY_NAMES[view.card.day]}’s battle`;
  return (
    <div className="battle-page">
      <div className="battle-crumbs">
        <a {...linkProps(`/l/${view.league.slug}/battles`)}>← {view.league.name}</a>
      </div>
      <BattleView setup={view.setup} title={title} />
    </div>
  );
}
