import { useEffect, useState } from 'react';
import type { BattleView as View } from '../../protocol.ts';
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
