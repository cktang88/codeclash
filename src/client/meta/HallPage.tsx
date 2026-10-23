import { Kind } from '../../sim/api.ts';
import type { LegendEntry } from '../../protocol.ts';
import { Notice } from '../pages/Notice.tsx';
import { Avatar } from '../ui/Avatar.tsx';
import { EmptyVignette, InkLink, VellumPanel } from '../ui/codex.tsx';
import { metaApi, useLoad } from './api.ts';

const KIND_TEXT: Record<LegendEntry['kind'], string> = {
  survivor: 'Survived the day',
  captain: 'A great captain',
  monolith: 'Broke the Monolith',
};

function unitName(unit: Kind | null): string {
  return unit === Kind.Dragon ? 'Dragon' : unit === Kind.Champion ? 'Champion' : 'Soldier';
}

/** The room's Hall of Legends: named Champions and Dragons, newest day first. */
export function HallPage({ slug, invite = null }: { slug: string; invite?: string | null }) {
  const { data, error } = useLoad(`legends:${slug}`, () => metaApi.legends(slug, invite));
  if (error) {
    return (
      <Notice title="The Hall is barred">
        <p>{error}</p>
        <InkLink to={{ kind: 'home' }}>← Back to the lobby</InkLink>
      </Notice>
    );
  }
  if (!data) {
    return (
      <main className="page page-center" role="status">
        <span className="spinner" aria-hidden /> Lighting the Hall…
      </main>
    );
  }
  const days = [...new Set(data.legends.map((l) => l.day))];
  return (
    <main className="page meta-hall">
      <nav className="crumbs">
        <InkLink to={{ kind: 'room', slug, invite }}>← Back to the war</InkLink>
      </nav>
      <h1 className="page-title">The Hall of Legends</h1>
      {days.length === 0 && (
        <EmptyVignette kind="plinth" title="The plinths stand empty">
          <p>No legend has been named yet. Keep a Champion or Dragon alive to the end of the day, or let it do great deeds, and its name is carved here.</p>
        </EmptyVignette>
      )}
      {days.map((day) => (
        <section key={day} className="meta-hall-day" aria-label={day}>
          <h2 className="block-title">
            <InkLink to={{ kind: 'digest', slug, warId: data.legends.find((l) => l.day === day)!.warId, invite }}>{day}</InkLink>
          </h2>
          <ul className="meta-hall-list">
            {data.legends
              .filter((l) => l.day === day)
              .map((l, i) => (
                <li key={i}>
                  <VellumPanel as="article" className="meta-legend" data-kind={l.kind}>
                    <h3 className="meta-legend-name">
                      {l.name} <span className="gilt">{l.epithet}</span>
                    </h3>
                    <p className="rubric">
                      {unitName(l.unit)} · {KIND_TEXT[l.kind]}
                    </p>
                    {l.deeds.length > 0 && (
                      <ul className="meta-legend-deeds">
                        {l.deeds.map((d) => (
                          <li key={d}>{d}</li>
                        ))}
                      </ul>
                    )}
                    <p className="meta-legend-owner muted">
                      <Avatar login={l.owner.login} url={l.owner.avatarUrl} size={20} /> of{' '}
                      <InkLink to={{ kind: 'profile', login: l.owner.login }}>@{l.owner.login}</InkLink>
                    </p>
                  </VellumPanel>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
