import { useEffect, useState, type ReactNode } from 'react';
import type { RoomDetail } from '../../protocol.ts';
import type { HudSnapshot } from '../store.ts';
import { Link } from '../ui/Link.tsx';
import { Icon } from '../ui/icons.tsx';
import { ArticlesOfWar } from './ArticlesOfWar.tsx';
import { Chronicle } from './Chronicle.tsx';
import { ArmyPanel, CommandBar } from './Command.tsx';
import { useHudContext } from './context.ts';
import { Inspector } from './Inspector.tsx';
import { AwayModal, Countdown, DayOverBanner, MonolithBar, Toasts } from './Overlays.tsx';
import { RoomSettings, ShareModal } from './RoomSettings.tsx';
import { Chat, EmoteBar, EmoteRain, Presence } from './Social.tsx';
import { Standings } from './Standings.tsx';

type LeftTab = 'standings' | 'orders' | 'army';
type RightTab = 'chronicle' | 'chat';
type SheetTab = LeftTab | RightTab;

function useNarrow(): boolean {
  const query = '(max-width: 900px)';
  const [narrow, setNarrow] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

function ConnPill({ hud, compact }: { hud: HudSnapshot; compact?: boolean }) {
  const { mode } = useHudContext();
  if (mode !== 'live') return null;
  const c = hud.conn;
  const [label, cls] =
    c.phase === 'live'
      ? ['Live', 'is-live']
      : c.phase === 'syncing'
        ? ['Catching up', 'is-warn']
        : c.phase === 'resyncing'
          ? ['Resyncing', 'is-warn']
          : c.phase === 'connecting'
            ? ['Connecting', 'is-warn']
            : c.phase === 'offline'
              ? ['Offline, retrying', 'is-bad']
              : ['Closed', 'is-bad'];
  return (
    <span className={`conn-pill ${cls}${compact ? ' is-compact' : ''}`} role="status" title={label}>
      <span className="conn-dot" aria-hidden />
      {compact ? <span className="sr-only">{label}</span> : label}
    </span>
  );
}

export interface RoomHudProps {
  hud: HudSnapshot;
  title: string;
  subtitle?: ReactNode;
  /** Banner under the top bar: demo notice, join call to action. */
  banner?: ReactNode;
  /** Extra controls docked at the bottom: replay transport, demo speed. */
  dock?: ReactNode;
  room?: RoomDetail | null;
  onRoomChanged?(room: RoomDetail): void;
}

/** Everything drawn over the battlefield. */
export function RoomHud({ hud, title, subtitle, banner, dock, room, onRoomChanged }: RoomHudProps) {
  const { mode, slug, me } = useHudContext();
  const narrow = useNarrow();
  const inWar = mode === 'live' && hud.viewerP !== null && hud.war?.status === 'active';
  const [left, setLeft] = useState<LeftTab>('standings');
  const [right, setRight] = useState<RightTab>('chronicle');
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [sheet, setSheet] = useState<SheetTab | null>(null);
  const [modal, setModal] = useState<'help' | 'share' | 'settings' | null>(null);
  const member = room?.viewer.member ?? false;
  const canChat = mode === 'live' && member;
  const canEmote = mode !== 'replay' && (mode === 'demo' || !!me?.user);
  const ready = hud.conn.phase === 'live' || mode !== 'live';

  const leftTabs: [LeftTab, string][] = [['standings', 'Standings']];
  if (inWar) leftTabs.push(['orders', 'Orders'], ['army', 'Your army']);
  const rightTabs: [RightTab, string][] = [['chronicle', 'Chronicle']];
  if (mode === 'live') rightTabs.push(['chat', 'Chat']);

  const leftBody = (tab: LeftTab) =>
    tab === 'standings' ? <Standings standings={hud.standings} viewerP={hud.viewerP} /> : tab === 'orders' ? <CommandBar hud={hud} /> : <ArmyPanel hud={hud} />;
  const rightBody = (tab: RightTab) => (tab === 'chronicle' ? <Chronicle entries={hud.chronicle} viewerP={hud.viewerP} now={hud.serverNow} /> : <Chat hud={hud} canSend={canChat} />);

  return (
    <div className={`hud${narrow ? ' is-narrow' : ''}`}>
      <header className="topbar">
        <Link to={{ kind: 'home' }} className="brand" aria-label="Pushfront home">
          <span className="brand-mark" aria-hidden>
            ⛨
          </span>
          {!narrow && <span className="brand-name">Pushfront</span>}
        </Link>
        <div className="topbar-title">
          <h1 className="room-name truncate">
            {room?.visibility === 'private' && <Icon name="lock" size={16} title="Private room" />} {title}
          </h1>
          {subtitle && <div className="room-sub">{subtitle}</div>}
        </div>
        <div className="topbar-meta">
          {hud.war && hud.war.status === 'active' && mode !== 'replay' && <Countdown endsAt={hud.war.endsAt} />}
          {!narrow && <Presence hud={hud} />}
          <ConnPill hud={hud} compact={narrow} />
        </div>
        <nav className="topbar-actions" aria-label="Room">
          <button className="icon-btn" onClick={() => setModal('help')} aria-label="Articles of War: how it works" title="How it works">
            <Icon name="help" size={20} />
          </button>
          {slug && mode === 'live' && !narrow && (
            <Link className="icon-btn" to={{ kind: 'history', slug }} aria-label="Past wars" title="Past wars">
              <Icon name="history" size={20} />
            </Link>
          )}
          {room && (
            <button className="icon-btn" onClick={() => setModal('share')} aria-label="Share" title="Share">
              <Icon name="share" size={20} />
            </button>
          )}
          {room && member && (
            <button className="icon-btn" onClick={() => setModal('settings')} aria-label="Room settings" title="Settings">
              <Icon name="gear" size={20} />
            </button>
          )}
        </nav>
      </header>

      <div className="hud-top-center">
        {banner}
        <DayOverBanner hud={hud} />
        <MonolithBar hud={hud} />
        <Toasts hud={hud} />
      </div>

      {!narrow && (
        <>
          <aside className={`side side-left panel${leftOpen ? '' : ' is-collapsed'}`} aria-label="Standings and orders">
            <div className="side-head">
              {leftOpen && (
                <div className="tabs" role="tablist">
                  {leftTabs.map(([t, label]) => (
                    <button key={t} role="tab" aria-selected={left === t} className={left === t ? 'is-on' : ''} onClick={() => setLeft(t)}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <button className="icon-btn icon-btn-sm" onClick={() => setLeftOpen((v) => !v)} aria-expanded={leftOpen} aria-label={leftOpen ? 'Collapse panel' : 'Expand standings'}>
                <Icon name="chevron" size={16} className={leftOpen ? 'flip' : ''} />
              </button>
            </div>
            {leftOpen && <div className="side-body">{leftBody(leftTabs.some(([t]) => t === left) ? left : 'standings')}</div>}
          </aside>
          <aside className={`side side-right panel${rightOpen ? '' : ' is-collapsed'}`} aria-label="Chronicle and chat">
            <div className="side-head">
              <button className="icon-btn icon-btn-sm" onClick={() => setRightOpen((v) => !v)} aria-expanded={rightOpen} aria-label={rightOpen ? 'Collapse panel' : 'Expand chronicle'}>
                <Icon name="chevron" size={16} className={rightOpen ? '' : 'flip'} />
              </button>
              {rightOpen && (
                <div className="tabs" role="tablist">
                  {rightTabs.map(([t, label]) => (
                    <button key={t} role="tab" aria-selected={right === t} className={right === t ? 'is-on' : ''} onClick={() => setRight(t)}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {rightOpen && <div className="side-body">{rightBody(right)}</div>}
          </aside>
        </>
      )}

      <div className="hud-bottom">
        <Inspector hud={hud} />
        <div className="hud-dock">
          {dock}
          <EmoteBar canSend={canEmote} />
        </div>
      </div>

      {narrow && (
        <div className={`sheet panel${sheet ? ' is-open' : ''}`}>
          {sheet && (
            <div className="sheet-body">
              {sheet === 'chronicle' || sheet === 'chat' ? rightBody(sheet) : leftBody(sheet)}
            </div>
          )}
          <div className="sheet-tabs" role="tablist" aria-label="Panels">
            {[...leftTabs, ...rightTabs].map(([t, label]) => (
              <button key={t} role="tab" aria-selected={sheet === t} className={sheet === t ? 'is-on' : ''} onClick={() => setSheet((s) => (s === t ? null : t))}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <EmoteRain hud={hud} />
      {ready && hud.war && <AwayModal hud={hud} />}
      {modal === 'help' && <ArticlesOfWar onClose={() => setModal(null)} />}
      {modal === 'share' && room && <ShareModal room={room} onClose={() => setModal(null)} />}
      {modal === 'settings' && room && <RoomSettings room={room} onClose={() => setModal(null)} onChanged={(r) => onRoomChanged?.(r)} />}
    </div>
  );
}
