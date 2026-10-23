import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { RoomDetail } from '../../protocol.ts';
import type { HudSnapshot } from '../store.ts';
import { Link } from '../ui/Link.tsx';
import { Icon } from '../ui/icons.tsx';
import { BrandMark, Ribbons, SoundSeal, sfx } from '../ui/codex.tsx';
import { OrdersCard } from '../meta/index.ts';
import { ArticlesOfWar } from './ArticlesOfWar.tsx';
import { Chronicle } from './Chronicle.tsx';
import { ArmyPanel, CommandBar } from './Command.tsx';
import { useHudContext } from './context.ts';
import { Inspector } from './Inspector.tsx';
import { AwayModal, Countdown, DayOverBanner, MonolithBar, Toasts, VictoryFanfare } from './Overlays.tsx';
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

/** "Follow my banner": the camera rides with your freshest platoon (F on the keyboard). */
function FollowToggle() {
  const { store } = useHudContext();
  const [, bump] = useState(0);
  const s = store as typeof store & { followMine?: boolean; setFollowMine?(on: boolean): void };
  if (typeof s.setFollowMine !== 'function') return null;
  const on = !!s.followMine;
  return (
    <button
      className={`icon-btn${on ? ' is-on' : ''}`}
      aria-pressed={on}
      onClick={() => {
        sfx('ui.click');
        s.setFollowMine!(!on);
        bump((n) => n + 1);
      }}
      aria-label="Follow my banner"
      title="Follow my banner (F)"
    >
      <Icon name="follow" size={20} />
    </button>
  );
}

const PAGE_SWIPE = 56;

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
  const [turn, setTurn] = useState<'next' | 'prev' | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
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
    tab === 'standings' ? (
      <Standings standings={hud.standings} viewerP={hud.viewerP} />
    ) : tab === 'orders' ? (
      <>
        <OrdersCard hud={hud} />
        <CommandBar hud={hud} />
      </>
    ) : (
      <ArmyPanel hud={hud} />
    );
  const sheetTabs = [...leftTabs, ...rightTabs];
  // The book on a phone: swipe across a page to turn it, pull it down by its grip to close.
  const turnPage = (dir: 1 | -1) => {
    if (sheet === null) return;
    const i = sheetTabs.findIndex(([t]) => t === sheet);
    const next = sheetTabs[i + dir];
    if (!next) return;
    sfx('ui.page');
    setTurn(dir > 0 ? 'next' : 'prev');
    setSheet(next[0]);
  };
  const onSwipeStart = (e: ReactPointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onSwipeEnd = (e: ReactPointerEvent, closeOnPull: boolean) => {
    const from = swipe.current;
    swipe.current = null;
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (closeOnPull && dy > PAGE_SWIPE && Math.abs(dy) > Math.abs(dx)) {
      sfx('ui.close');
      setSheet(null);
    } else if (Math.abs(dx) > PAGE_SWIPE && Math.abs(dx) > Math.abs(dy) * 1.4) turnPage(dx < 0 ? 1 : -1);
  };
  const rightBody = (tab: RightTab) => (tab === 'chronicle' ? <Chronicle entries={hud.chronicle} viewerP={hud.viewerP} now={hud.serverNow} /> : <Chat hud={hud} canSend={canChat} />);

  return (
    <div className={`hud${narrow ? ' is-narrow' : ''}`}>
      <header className="topbar night-band">
        <Link to={{ kind: 'home' }} className="brand" aria-label="Pushfront home">
          <BrandMark />
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
          {(inWar || mode === 'demo') && <FollowToggle />}
          <button className="icon-btn" onClick={() => setModal('help')} aria-label="Articles of War: how it works" title="Articles of War">
            <Icon name="book" size={20} />
          </button>
          {slug && mode === 'live' && !narrow && (
            <>
              <Link className="icon-btn" to={{ kind: 'history', slug }} aria-label="Past wars" title="Past wars">
                <Icon name="history" size={20} />
              </Link>
              <Link className="icon-btn" to={{ kind: 'hall', slug }} aria-label="Hall of Legends" title="Hall of Legends">
                <Icon name="crown" size={20} />
              </Link>
            </>
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
          <SoundSeal />
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
              {leftOpen && <Ribbons items={leftTabs} value={leftTabs.some(([t]) => t === left) ? left : 'standings'} onChange={setLeft} label="Standings and orders" />}
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
              {rightOpen && <Ribbons items={rightTabs} value={right} onChange={setRight} label="Chronicle and chat" />}
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
        <div className="sheet">
          {sheet && (
            <div
              key={sheet}
              className={`sheet-page panel${turn ? ` is-turn-${turn}` : ''}`}
              role="tabpanel"
              aria-label={sheetTabs.find(([t]) => t === sheet)?.[1]}
              onPointerDown={onSwipeStart}
              onPointerUp={(e) => onSwipeEnd(e, false)}
              onAnimationEnd={() => setTurn(null)}
            >
              <button
                className="sheet-grip"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSwipeStart(e);
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  onSwipeEnd(e, true);
                }}
                onClick={() => setSheet(null)}
                aria-label="Close the book"
              >
                {sheetTabs.findIndex(([t]) => t === sheet) + 1} / {sheetTabs.length}
              </button>
              <div className="sheet-body">{sheet === 'chronicle' || sheet === 'chat' ? rightBody(sheet) : leftBody(sheet)}</div>
            </div>
          )}
          <div className="sheet-tabs night-band" role="tablist" aria-label="Panels">
            {sheetTabs.map(([t, label]) => (
              <button
                key={t}
                role="tab"
                aria-selected={sheet === t}
                className={sheet === t ? 'is-on' : ''}
                onClick={() => {
                  sfx(sheet === t ? 'ui.close' : 'ui.page');
                  setTurn(null);
                  setSheet((s) => (s === t ? null : t));
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <EmoteRain hud={hud} />
      {mode === 'live' && <VictoryFanfare hud={hud} />}
      {ready && hud.war && <AwayModal hud={hud} />}
      {modal === 'help' && <ArticlesOfWar onClose={() => setModal(null)} />}
      {modal === 'share' && room && <ShareModal room={room} onClose={() => setModal(null)} />}
      {modal === 'settings' && room && <RoomSettings room={room} onClose={() => setModal(null)} onChanged={(r) => onRoomChanged?.(r)} />}
    </div>
  );
}
