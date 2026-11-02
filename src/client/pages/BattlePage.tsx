import { useEffect, useState } from 'react';
import { BATTLE_VERSION } from '../../game/battle.ts';
import type { BattleView as View } from '../../protocol.ts';
import { n } from '../format.ts';
import { api } from '../api.ts';
import { DAY_NAMES } from '../format.ts';
import { linkProps } from '../route.ts';
import { BattleView } from '../ui/BattleView.tsx';

export function BattlePage({ id }: { id: number }) {
  // Both are tagged with the battle they belong to: a slow answer for a battle we have since left is dropped,
  // and the last battle (or its error) is never shown under the next one's address.
  const [loaded, setLoaded] = useState<{ id: number; view: View } | null>(null);
  const [failed, setFailed] = useState<{ id: number; message: string } | null>(null);
  useEffect(() => {
    let live = true;
    api.battle(id).then(
      (v) => live && setLoaded({ id, view: v }),
      (e: Error) => live && setFailed({ id, message: e.message }),
    );
    return () => {
      live = false;
    };
  }, [id]);
  const view = loaded?.id === id ? loaded.view : null;
  const error = failed?.id === id ? failed.message : null;
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
      {/* A fresh view per battle: speed, zoom, HUD and ticker belong to the battle they were set on. */}
      <BattleView key={id} setup={view.setup} title={title} />
    </div>
  );
}
