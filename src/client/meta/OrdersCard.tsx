import { drawOrders, orderProgress, type OrderProgress } from '../../rules/meta.ts';
import { useHudContext } from '../hud/context.ts';
import type { HudSnapshot } from '../store.ts';
import { CarvedBar } from '../ui/codex.tsx';
import { compact } from '../ui/format.ts';

/** The viewer's three Orders for today, measured live from the battlefield, or null for spectators. */
export function useOrders(hud: HudSnapshot): OrderProgress[] | null {
  const { store } = useHudContext();
  const p = hud.viewerP;
  const entry = p === null ? undefined : hud.roster[p];
  const player = p === null ? undefined : store.world?.players[p];
  if (!hud.war || !entry || entry.bot || !player) return null;
  return drawOrders(hud.war.seed, entry.id).map((o) => orderProgress(o, player));
}

function amount(o: OrderProgress): string {
  return o.unit === 'minutes' ? `${compact(o.value)} / ${compact(o.goal)} min` : `${compact(o.value)} / ${compact(o.goal)}`;
}

export function OrdersCard({ hud }: { hud: HudSnapshot }) {
  const orders = useOrders(hud);
  if (!orders) return null;
  const done = orders.filter((o) => o.done).length;
  return (
    <section className="meta-orders" aria-label="Today's Orders">
      <h3 className="block-title">
        Orders <span className="muted num">{done}/{orders.length}</span>
      </h3>
      <ol className="meta-orders-list">
        {orders.map((o) => (
          <li key={o.id} className={`meta-order${o.done ? ' is-done' : ''}`}>
            <span className="meta-order-seal" aria-hidden>{o.done ? '✠' : ''}</span>
            <span className="meta-order-title">{o.title}</span>
            {o.done ? (
              <span className="meta-order-amount gilt">Sealed</span>
            ) : (
              <>
                <CarvedBar kind="glory" value={o.value} max={o.goal} label={o.title} valueText={amount(o)} />
                <span className="meta-order-amount muted num">{amount(o)}</span>
              </>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

