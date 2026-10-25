import { useState } from 'react';
import type { GithubLink } from '../../protocol.ts';
import { ApiError, api } from '../net/api.ts';

/** The player's own GitHub budget: whether their sign-in token is held, the privacy note, and Disconnect. */
export function GithubLinkSection({ link, onChanged }: { link: GithubLink; onChanged(): void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = encodeURIComponent(location.pathname + location.search);
  return (
    <section className="settings-block">
      <h3 className="section-label">Your GitHub budget</h3>
      {link.status === 'ok' && <p>Your pushes are read with your own sign-in token, on your own GitHub rate limit, and found within minutes.</p>}
      {link.status === 'invalid' && (
        <p className="form-error" role="alert">
          GitHub no longer accepts your sign-in token, so your pushes are read on the server’s shared budget.{' '}
          <a href={`/auth/github?next=${next}`}>Sign in again to keep your own GitHub budget</a>.
        </p>
      )}
      {link.status === 'none' && (
        <p>
          Your pushes are read on the server’s shared budget. <a href={`/auth/github?next=${next}`}>Sign in with GitHub</a> to use your own and have them found sooner.
        </p>
      )}
      <p className="muted small">
        We store your sign-in token to read your public activity on your own GitHub rate limit. Public data only; revoke any time at{' '}
        <a href="https://github.com/settings/applications" target="_blank" rel="noreferrer">
          github.com/settings/applications
        </a>
        .
      </p>
      {link.status !== 'none' && (
        <button
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError(null);
            api.disconnectGithub().then(
              () => {
                setBusy(false);
                onChanged();
              },
              (err: unknown) => {
                setBusy(false);
                setError(err instanceof ApiError ? err.message : 'Something went wrong.');
              },
            );
          }}
        >
          Disconnect GitHub
        </button>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
