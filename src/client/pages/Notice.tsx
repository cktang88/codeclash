import type { ReactNode } from 'react';
import { Link } from '../ui/Link.tsx';
import { Icon } from '../ui/icons.tsx';

/** A centered full-page message: not found, private room, errors. */
export function Notice({ title, icon = 'flag', children }: { title: string; icon?: Parameters<typeof Icon>[0]['name']; children: ReactNode }) {
  return (
    <main className="page page-center">
      <div className="panel notice">
        <Icon name={icon} size={36} className="notice-icon" />
        <h1 className="notice-title">{title}</h1>
        {children}
      </div>
    </main>
  );
}

export function LostPage({ path }: { path: string }) {
  return (
    <Notice title="Lost in the fog of war" icon="target">
      <p>
        No road leads to <code>{path}</code>.
      </p>
      <Link className="btn btn-primary" to={{ kind: 'home' }}>
        Back to the lobby
      </Link>
    </Notice>
  );
}
