import type {
  ArmoryResponse,
  DeedEarned,
  LegendEntry,
  LegendsResponse,
  Monument,
  OrdersResponse,
  Rivalry,
  SeasonResponse,
  SeasonStanding,
} from '../protocol.ts';
import type { Digest } from '../rules/digest.ts';
import {
  DEEDS,
  ORDER_GLORY,
  armoryCatalog,
  chooseHeraldry,
  chooseLegends,
  dayGlory,
  drawOrders,
  newDeeds,
  orderProgress,
  parseHeraldry,
  rankOf,
  seasonOf,
  seasonPoints,
  titlesFor,
  type Heraldry,
  type LegendKind,
  type RankInfo,
} from '../rules/meta.ts';
import { Kind, PlatoonState } from '../sim/api.ts';
import type { RoomRow, Store } from './db.ts';
import type { Logger } from './log.ts';
import { userRef, type MetaHooks } from './rooms.ts';
import type { Channel, War } from './war.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS glory (
  user_id INTEGER NOT NULL,
  room_id INTEGER NOT NULL,
  war_id INTEGER NOT NULL,
  source TEXT NOT NULL,
  amount INTEGER NOT NULL,
  note TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS glory_user ON glory(user_id);
CREATE TABLE IF NOT EXISTS orders_done (
  war_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  order_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (war_id, user_id, order_id)
);
CREATE TABLE IF NOT EXISTS deeds (
  user_id INTEGER NOT NULL,
  deed TEXT NOT NULL,
  room_id INTEGER,
  war_id INTEGER,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, deed)
);
CREATE TABLE IF NOT EXISTS armory (
  user_id INTEGER PRIMARY KEY,
  heraldry TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS legends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  war_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  name TEXT NOT NULL,
  epithet TEXT NOT NULL,
  kind TEXT NOT NULL,
  unit INTEGER,
  deeds TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS legends_room ON legends(room_id, war_id);
CREATE TABLE IF NOT EXISTS rivalries (
  room_id INTEGER NOT NULL,
  user_a INTEGER NOT NULL,
  user_b INTEGER NOT NULL,
  wins_a INTEGER NOT NULL DEFAULT 0,
  wins_b INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (room_id, user_a, user_b)
);
`;

const HALL_SIZE = 60;
const RIVALS_SHOWN = 8;

type Raw = Record<string, unknown>;

export interface MetaDeps {
  store: Store;
  log: Logger;
  channelFor: (roomId: number) => Channel;
}

/** Orders, Glory, the Armory, the Hall of Legends, seasons, Deeds and rivalries. */
export class Meta implements MetaHooks {
  private readonly db: Store['db'];
  /** War id → users whose fulfilled Orders were already loaded, to avoid a query a second. */
  private readonly done = new Map<number, Set<string>>();
  /**
   * `${roomId}:${season}:${lastEndedWar}` → standings. They change only when one of the room's wars ends, but every
   * hello (each connection, resync, and every viewer at the reset) asks for them via monuments.
   */
  private readonly standingsCache = new Map<string, SeasonStanding[]>();

  constructor(private readonly deps: MetaDeps) {
    this.db = deps.store.db;
    this.db.exec(SCHEMA);
  }

  // ----------------------------------------------------------- heraldry

  heraldryOf(userId: number): Heraldry | undefined {
    const r = this.db.prepare('SELECT heraldry FROM armory WHERE user_id = ?').get(userId) as Raw | undefined;
    return r ? parseHeraldry(r.heraldry as string) : undefined;
  }

  armory(userId: number): ArmoryResponse {
    const rank = this.rank(userId);
    return {
      rank,
      heraldry: this.heraldryOf(userId) ?? parseHeraldry(null),
      catalog: armoryCatalog(rank.rank),
      titles: titlesFor(rank.rank, this.deedIds(userId)),
      hue: this.latestHue(userId),
    };
  }

  /** The hue of the player's army in the latest war they fought, across their rooms (hues are assigned per war). */
  latestHue(userId: number): number | null {
    let best: { startsAt: number; hue: number } | null = null;
    for (const room of this.deps.store.roomsOf(userId)) {
      for (const w of this.deps.store.wars(room.id, 3)) {
        const pl = w.header.players.find((x) => x.userId === userId && !x.bot);
        if (pl && (!best || w.startsAt > best.startsAt)) best = { startsAt: w.startsAt, hue: pl.hue };
        if (pl) break;
      }
    }
    return best?.hue ?? null;
  }

  setArmory(userId: number, request: Partial<Heraldry>): { armory: ArmoryResponse; refused: string[] } {
    const rank = this.rank(userId);
    const current = this.heraldryOf(userId) ?? parseHeraldry(null);
    const { heraldry, refused } = chooseHeraldry(current, request, rank.rank, titlesFor(rank.rank, this.deedIds(userId)));
    this.db.prepare('INSERT INTO armory (user_id, heraldry) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET heraldry = excluded.heraldry').run(userId, JSON.stringify(heraldry));
    return { armory: this.armory(userId), refused };
  }

  // -------------------------------------------------------------- glory

  glory(userId: number): number {
    const r = this.db.prepare('SELECT coalesce(sum(amount), 0) AS g FROM glory WHERE user_id = ?').get(userId) as { g: number };
    return r.g;
  }

  rank(userId: number): RankInfo {
    return rankOf(this.glory(userId));
  }

  private grant(userId: number, roomId: number, warId: number, source: string, amount: number, note: string, at: number): void {
    this.db.prepare('INSERT INTO glory (user_id, room_id, war_id, source, amount, note, at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(userId, roomId, warId, source, amount, note, at);
  }

  // ------------------------------------------------------------- orders

  /** Checks every human player's Orders against the live world; announces and pays each one once. */
  watch(roomId: number, war: War, now: number): void {
    let done = this.done.get(war.id);
    if (!done) {
      done = new Set((this.db.prepare('SELECT user_id, order_id FROM orders_done WHERE war_id = ?').all(war.id) as Raw[]).map((r) => `${r.user_id as number}:${r.order_id as string}`));
      this.done.set(war.id, done);
      if (this.done.size > 512) this.done.delete(this.done.keys().next().value!);
    }
    const header = war.header.players;
    for (let p = 0; p < header.length; p++) {
      const entry = header[p]!;
      const player = war.world.players[p];
      if (entry.bot || !player) continue;
      for (const order of drawOrders(war.meta.seed, entry.userId)) {
        const key = `${entry.userId}:${order.id}`;
        if (done.has(key) || !orderProgress(order, player).done) continue;
        done.add(key);
        this.deps.store.transaction(() => {
          this.db.prepare('INSERT OR IGNORE INTO orders_done (war_id, user_id, order_id, at) VALUES (?, ?, ?, ?)').run(war.id, entry.userId, order.id, now);
          this.grant(entry.userId, roomId, war.id, 'order', ORDER_GLORY, order.title, now);
        });
        this.deps.channelFor(roomId).send({ type: 'order', p, login: entry.login, order: { id: order.id, title: order.title }, glory: ORDER_GLORY });
      }
    }
  }

  orders(war: War): OrdersResponse {
    const rows = this.db.prepare('SELECT user_id, order_id FROM orders_done WHERE war_id = ?').all(war.id) as Raw[];
    return {
      orders: war.header.players.flatMap((pl, p) =>
        pl.bot
          ? []
          : [{
              p,
              login: pl.login,
              ids: drawOrders(war.meta.seed, pl.userId).map((o) => o.id),
              done: rows.filter((r) => r.user_id === pl.userId).map((r) => r.order_id as string),
            }],
      ),
    };
  }

  private ordersDone(warId: number, userId: number): number {
    const r = this.db.prepare('SELECT count(*) AS n FROM orders_done WHERE war_id = ? AND user_id = ?').get(warId, userId) as { n: number };
    return r.n;
  }

  // ------------------------------------------------------------ day end

  /** At the reset: Glory for the day, Deeds, rivalries, and the Hall of Legends. */
  warFinished(room: RoomRow, war: War, digest: Digest, now: number): void {
    const { store } = this.deps;
    const header = war.header.players;
    const survivors = war.world.units
      .filter((u) => u.p >= 0 && (u.kind === Kind.Champion || u.kind === Kind.Dragon) && !header[u.p]?.bot)
      .map((u) => {
        const pl = war.world.platoons.find((x) => x.id === u.platoon);
        const routed = pl?.state === PlatoonState.Rout;
        return { p: u.p, unitId: u.id, kind: u.kind, platoonKills: pl?.kills ?? 0, repo: pl ? (war.header.repos[pl.repo]?.[0] ?? 'unknown') : 'unknown', routed };
      })
      .filter((s) => !s.routed);
    const legends = chooseLegends(war.meta.seed, survivors, digest).filter((l) => !header[l.p]?.bot);

    store.transaction(() => {
      for (const l of legends) {
        this.db
          .prepare('INSERT INTO legends (room_id, war_id, user_id, day, name, epithet, kind, unit, deeds, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(room.id, war.id, header[l.p]!.userId, war.meta.day, l.name, l.epithet, l.kind, l.unit, JSON.stringify(l.deeds), now);
      }
      const humans = digest.players.filter((pl) => !pl.bot);
      for (const pl of humans) {
        const userId = header[pl.p]!.userId;
        const life = store.lifetime(userId, room.id);
        const streak = life?.streak ?? 0;
        for (const g of dayGlory(pl, streak)) this.grant(userId, room.id, war.id, g.source, g.amount, g.note, now);
        const have = new Set(this.deedIds(userId));
        const earned = newDeeds(
          {
            pl,
            digest,
            ordersDone: this.ordersDone(war.id, userId),
            streak,
            wins: life?.wins ?? 0,
            days: life?.days ?? 0,
            legendsNamed: legends.filter((l) => l.p === pl.p).length + this.legendCount(userId),
          },
          have,
        );
        for (const d of earned) this.db.prepare('INSERT OR IGNORE INTO deeds (user_id, deed, room_id, war_id, at) VALUES (?, ?, ?, ?, ?)').run(userId, d.id, room.id, war.id, now);
      }
      // Rivalries: every pair of human players who both fought, decided by their places.
      const fought = humans.filter((pl) => pl.pushes > 0 || pl.kills > 0);
      for (let i = 0; i < fought.length; i++) {
        for (let j = i + 1; j < fought.length; j++) {
          const a = fought[i]!;
          const b = fought[j]!;
          // A shared place is a draw: neither side takes the bout.
          if (a.place === b.place) continue;
          this.recordRivalry(room.id, header[a.p]!.userId, header[b.p]!.userId, a.place < b.place);
        }
      }
    });
    this.done.delete(war.id);
  }

  private recordRivalry(roomId: number, x: number, y: number, xWon: boolean): void {
    const [a, b, aWon] = x < y ? [x, y, xWon] : [y, x, !xWon];
    this.db
      .prepare(
        `INSERT INTO rivalries (room_id, user_a, user_b, wins_a, wins_b) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(room_id, user_a, user_b) DO UPDATE SET wins_a = wins_a + excluded.wins_a, wins_b = wins_b + excluded.wins_b`,
      )
      .run(roomId, a, b, aWon ? 1 : 0, aWon ? 0 : 1);
  }

  // ---------------------------------------------------- legends, seasons

  legends(roomId: number): LegendsResponse {
    const rows = this.db.prepare('SELECT * FROM legends WHERE room_id = ? ORDER BY id DESC LIMIT ?').all(roomId, HALL_SIZE) as Raw[];
    return { legends: rows.map((r) => this.legendEntry(r)) };
  }

  private legendEntry(r: Raw): LegendEntry {
    return {
      name: r.name as string,
      epithet: r.epithet as string,
      kind: r.kind as LegendKind,
      unit: (r.unit as Kind | null) ?? null,
      deeds: JSON.parse(r.deeds as string) as string[],
      owner: userRef(this.deps.store.user(r.user_id as number)),
      day: r.day as string,
      warId: r.war_id as number,
    };
  }

  private legendCount(userId: number): number {
    const r = this.db.prepare('SELECT count(*) AS n FROM legends WHERE user_id = ?').get(userId) as { n: number };
    return r.n;
  }

  season(room: RoomRow, day: string): SeasonResponse {
    const season = seasonOf(day);
    const previous = seasonOf(shiftDay(day, -7));
    const standings = this.standings(room.id, season);
    const champion = this.standings(room.id, previous)[0];
    return { season, standings, champion: champion ? { season: previous, user: champion.user } : null };
  }

  private standings(roomId: number, season: string): SeasonStanding[] {
    // Keyed by the room's latest ended war too, so a war that ends makes it stale whatever else fails.
    const last = this.db.prepare("SELECT max(id) AS id FROM wars WHERE room_id = ? AND status = 'ended'").get(roomId) as { id: number | null };
    const key = `${roomId}:${season}:${last.id ?? 0}`;
    const cached = this.standingsCache.get(key);
    if (cached) return cached;
    const standings = this.computeStandings(roomId, season);
    if (this.standingsCache.size >= 1024) this.standingsCache.clear();
    this.standingsCache.set(key, standings);
    return standings;
  }

  private forgetStandings(roomId: number): void {
    for (const key of this.standingsCache.keys()) if (key.startsWith(`${roomId}:`)) this.standingsCache.delete(key);
  }

  private computeStandings(roomId: number, season: string): SeasonStanding[] {
    const totals = new Map<number, SeasonStanding>();
    for (const w of this.deps.store.wars(roomId, 60)) {
      if (w.status !== 'ended' || !w.digest || seasonOf(w.day) !== season) continue;
      for (const pl of w.digest.players) {
        const entry = w.header.players[pl.p];
        if (!entry || entry.bot) continue;
        const points = seasonPoints(pl);
        if (points === 0) continue;
        const t = totals.get(entry.userId) ?? { user: userRef(this.deps.store.user(entry.userId)), points: 0, days: 0, wins: 0 };
        t.points += points;
        t.days++;
        if (pl.place === 1 && pl.renown > 0) t.wins++;
        totals.set(entry.userId, t);
      }
    }
    return [...totals.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || a.user.login.localeCompare(b.user.login));
  }

  /** Statues for a war: the last finished war's legends beside their players' capitals, and last season's victor at the centre of the ring. */
  monuments(room: RoomRow, war: War): Monument[] {
    const out: Monument[] = [];
    const previous = this.deps.store.wars(room.id, 3).find((w) => w.id !== war.id && w.status === 'ended');
    if (previous) {
      const rows = this.db.prepare('SELECT * FROM legends WHERE war_id = ? ORDER BY id').all(previous.id) as Raw[];
      for (const r of rows) {
        const p = war.header.players.findIndex((pl) => pl.userId === (r.user_id as number));
        if (p < 0) continue;
        out.push({ kind: 'legend', p, name: r.name as string, epithet: r.epithet as string, unit: (r.unit as Kind | null) ?? null });
      }
    }
    const champion = this.season(room, war.meta.day).champion;
    if (champion) out.push({ kind: 'season', p: -1, name: `@${champion.user.login}`, epithet: `Victor of ${champion.season}`, unit: null });
    return out;
  }

  // ------------------------------------------------------------ profile

  deedIds(userId: number): string[] {
    return (this.db.prepare('SELECT deed FROM deeds WHERE user_id = ? ORDER BY at').all(userId) as Raw[]).map((r) => r.deed as string);
  }

  /** Deeds earned; where one was earned is shown only for rooms the viewer may see. */
  deeds(userId: number, visibleRoom: (roomId: number) => boolean): DeedEarned[] {
    const rows = this.db.prepare('SELECT d.deed, d.at, d.room_id, r.slug FROM deeds d LEFT JOIN rooms r ON r.id = d.room_id WHERE d.user_id = ? ORDER BY d.at').all(userId) as Raw[];
    return rows.flatMap((r) => {
      const def = DEEDS.find((d) => d.id === r.deed);
      const room = r.room_id !== null && visibleRoom(r.room_id as number) ? ((r.slug as string | null) ?? null) : null;
      return def ? [{ id: def.id, name: def.name, text: def.text, at: r.at as number, room }] : [];
    });
  }

  /** Head-to-head records, counting only rooms the viewer may see. */
  rivalries(userId: number, visibleRoom: (roomId: number) => boolean): Rivalry[] {
    const rows = this.db.prepare('SELECT * FROM rivalries WHERE user_a = ? OR user_b = ?').all(userId, userId) as Raw[];
    const totals = new Map<number, { wins: number; losses: number }>();
    for (const r of rows) {
      if (!visibleRoom(r.room_id as number)) continue;
      const mine = r.user_a === userId;
      const rival = (mine ? r.user_b : r.user_a) as number;
      const t = totals.get(rival) ?? { wins: 0, losses: 0 };
      t.wins += (mine ? r.wins_a : r.wins_b) as number;
      t.losses += (mine ? r.wins_b : r.wins_a) as number;
      totals.set(rival, t);
    }
    return [...totals.entries()]
      .map(([rival, t]) => ({ rival: userRef(this.deps.store.user(rival)), ...t }))
      .sort((a, b) => b.wins + b.losses - (a.wins + a.losses) || a.rival.login.localeCompare(b.rival.login))
      .slice(0, RIVALS_SHOWN);
  }

  /** Removes a deleted room's meta records; a user's Glory and Deeds stay theirs. */
  /** A deleted account: the player's glory, orders, deeds and heraldry go (rooms' legends and rivalries are their history). */
  deleteUser(userId: number): void {
    for (const table of ['glory', 'orders_done', 'deeds', 'armory']) this.db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
  }

  deleteRoom(roomId: number): void {
    this.forgetStandings(roomId);
    this.db.prepare('DELETE FROM legends WHERE room_id = ?').run(roomId);
    this.db.prepare('DELETE FROM rivalries WHERE room_id = ?').run(roomId);
  }
}

function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

