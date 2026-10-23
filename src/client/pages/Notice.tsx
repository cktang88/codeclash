import type { ReactNode } from 'react';
import { Link } from '../ui/Link.tsx';
import { Icon } from '../ui/icons.tsx';
import { TornMap } from '../ui/TornMap.tsx';

/** A centered full-page message: not found, private room, errors. */
export function Notice({ title, icon = 'flag', children }: { title: string; icon?: Parameters<typeof Icon>[0]['name']; children: ReactNode }) {
  return (
    <main className="page-center">
      <div className="panel notice">
        <Icon name={icon} size={36} className="notice-icon" />
        <h1 className="notice-title">{title}</h1>
        {children}
      </div>
    </main>
  );
}

/** A map torn at its edge: the road the reader asked for runs off the parchment. */
export function LostPage({ path }: { path: string }) {
  return (
    <main className="page-center lost">
      <div className="torn-map">
        <TornMap className="torn-map-art" />
        <div className="torn-map-text note">
          <h1 className="notice-title">Off the edge of the map</h1>
          <p>
            No road leads to <code>{path}</code>. Past this point the chart shows only sea, and something with wings.
          </p>
          <Link className="btn btn-primary" to={{ kind: 'home' }}>
            Back to the war table
          </Link>
        </div>
      </div>
    </main>
  );
}
