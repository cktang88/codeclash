// Red-team tests: each crafts pushes that try to earn a stronger army than the
// honest work they stand for, feeds them through the same measurement the
// poller uses, and checks the gamed army is no meaningfully stronger. See
// docs/fair-play.md for the survey these come from.

import { describe, expect, it } from 'vitest';
import { Cat, KIND_COUNT, type Ledger } from '../sim/api.ts';
import { applyDelta, armyFor, armyQuality, emptyLedger, purposeOf } from '../sim/muster.ts';
import { STATS } from '../sim/stats.ts';
import { openDb, Store } from '../server/db.ts';
import type { ChangedFile } from './classify.ts';
import { DAILY_CODE_CAP, measurePush, MemoryLedger, type LedgerStore, type PushDelta } from './ledger.ts';

// ------------------------------------------------------------ helpers

function file(filename: string, added: readonly string[], removed: readonly string[] = []): ChangedFile {
  const patch = ['@@ -1,1 +1,1 @@', ...removed.map((l) => `-${l}`), ...added.map((l) => `+${l}`)].join('\n');
  return { filename, status: 'modified', additions: added.length, deletions: removed.length, patch };
}

function rng(seed: number) {
  let r = seed >>> 0;
  return () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296);
}

const VERBS = ['load', 'save', 'parse', 'render', 'build', 'fetch', 'merge', 'apply', 'check', 'format', 'resolve', 'update', 'validate', 'compute', 'encode', 'decode', 'schedule', 'notify', 'collect', 'filter'];
const NOUNS = ['user', 'order', 'invoice', 'session', 'token', 'config', 'report', 'cart', 'item', 'route', 'account', 'payment', 'profile', 'message', 'channel', 'widget', 'layout', 'query', 'cache', 'batch'];
const FIELDS = ['id', 'name', 'total', 'status', 'owner', 'createdAt', 'items', 'limit', 'offset', 'region', 'currency', 'tags'];
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** Realistic TypeScript: functions of varied statements, about one decision every six or seven lines. */
function honestCode(n: number, seed: number): string[] {
  const rand = rng(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
  const seen = new Set<string>();
  const out: string[] = [];
  const body = [
    () => `  const ${pick(NOUNS)}${cap(pick(NOUNS))} = ${pick(VERBS)}${cap(pick(NOUNS))}(${pick(NOUNS)}, options.${pick(FIELDS)});`,
    () => `  ${pick(NOUNS)}Index.set(${pick(NOUNS)}.${pick(FIELDS)}, ${pick(VERBS)}${cap(pick(NOUNS))}(${pick(NOUNS)}));`,
    () => `  this.${pick(NOUNS)}${cap(pick(FIELDS))} = await ${pick(VERBS)}${cap(pick(NOUNS))}(${pick(NOUNS)}.${pick(FIELDS)});`,
    () => `  log.debug("${pick(VERBS)} ${pick(NOUNS)}", ${pick(NOUNS)}.${pick(FIELDS)}, ${pick(NOUNS)}.${pick(FIELDS)});`,
    () => `  const { ${pick(FIELDS)}, ${pick(FIELDS)} } = ${pick(NOUNS)}${cap(pick(NOUNS))};`,
    () => `  ${pick(NOUNS)}.${pick(FIELDS)} = ${pick(VERBS)}${cap(pick(FIELDS))}(${pick(NOUNS)}.${pick(FIELDS)}, ${pick(NOUNS)});`,
    () => `  if (${pick(NOUNS)}.${pick(FIELDS)} && !${pick(NOUNS)}.${pick(FIELDS)}) return ${pick(VERBS)}${cap(pick(NOUNS))}(${pick(NOUNS)});`,
    () => `  return ${pick(NOUNS)}.${pick(FIELDS)} ?? default${cap(pick(NOUNS))}.${pick(FIELDS)};`,
  ];
  while (out.length < n) {
    const header = `export async function ${pick(VERBS)}${cap(pick(NOUNS))}${cap(pick(FIELDS))}(${pick(NOUNS)}: ${cap(pick(NOUNS))}, options: Options) {`;
    if (seen.has(header)) continue;
    seen.add(header);
    out.push(header);
    const len = 3 + Math.floor(rand() * 6);
    for (let i = 0; i < len; i++) {
      const line = pick(body)();
      if (seen.has(line)) continue;
      seen.add(line);
      out.push(line);
    }
    out.push('}');
  }
  return out.slice(0, n);
}

function honestTests(n: number, seed: number): string[] {
  const rand = rng(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
  const seen = new Set<string>();
  while (seen.size < n) {
    seen.add(rand() < 0.3 ? `it("${pick(VERBS)}s the ${pick(NOUNS)} ${pick(FIELDS)}", async () => {` : `  expect(${pick(VERBS)}${cap(pick(NOUNS))}(${pick(NOUNS)}Fixture)).toEqual(expected${cap(pick(NOUNS))}.${pick(FIELDS)});`);
  }
  return [...seen];
}

function honestComments(n: number, seed: number): string[] {
  const rand = rng(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
  const seen = new Set<string>();
  while (seen.size < n) seen.add(`  // ${cap(pick(VERBS))}s the ${pick(NOUNS)} before its ${pick(NOUNS)} ${pick(FIELDS)} is ${pick(VERBS)}d.`);
  return [...seen];
}

/** A day's sim ledger from measured pushes. */
function ledgerOf(pushes: readonly { delta: PushDelta; msg: string }[]): Ledger {
  const l = emptyLedger();
  for (const { delta, msg } of pushes) applyDelta(l, { ...delta, purpose: purposeOf(msg) });
  return l;
}

/** Fighting strength: quality times Σ count·√(hp·damage), a Lanchester-style measure. */
function strength(ledger: Ledger): number {
  const counts = armyFor(ledger, 1);
  let s = 0;
  for (let k = 0; k < KIND_COUNT; k++) s += counts[k]! * Math.sqrt(STATS[k]!.hp * STATS[k]!.damage);
  return s * armyQuality(ledger).power;
}

const measure = (files: ChangedFile[], store: LedgerStore = new MemoryLedger()) => measurePush(files, store);

/** An honest day: `n` lines of code over `files` files, with tests and comments. */
function honestDay(n: number, files: number, msg = 'feat: add billing exports'): Ledger {
  const code = honestCode(n, 1);
  const per = Math.ceil(n / files);
  const changed: ChangedFile[] = [];
  for (let f = 0; f < files; f++) changed.push(file(`src/mod${String.fromCharCode(97 + f)}/index.ts`, code.slice(f * per, (f + 1) * per)));
  changed.push(file('src/billing.test.ts', honestTests(Math.ceil(n / 4), 2)));
  changed.push(file('src/notes.ts', honestComments(Math.ceil(n / 15), 3)));
  return ledgerOf([{ delta: measure(changed), msg }]);
}

// ------------------------------------------------------------ attacks on line counting

describe('gaming line counts', () => {
  it('reformatting old code (quotes, semicolons, trailing commas, spacing) earns nothing', () => {
    const old = honestCode(400, 11);
    const reformatted = old.map((l) => l.replace(/"/g, "'").replace(/;$/, '').replace(/\(/g, '( ').replace(/\)/g, ' )'));
    const d = measure([file('src/legacy.ts', reformatted, old)]);
    expect(d.lines[Cat.Code]).toBeLessThanOrEqual(4);
    expect(d.lines[Cat.Removed]).toBeLessThanOrEqual(4);
  });

  it('re-wrapping code to another line width pays at most once, however often it is flipped', () => {
    const one = honestCode(400, 12).filter((l) => l.includes('(') && !l.startsWith('export'));
    // Wrap each call's arguments onto their own lines, as a formatter with a narrow width would.
    const wrapped = one.flatMap((l) => {
      const open = l.indexOf('(');
      const close = l.lastIndexOf(')');
      if (close < open) return [l];
      return [l.slice(0, open + 1), ...l.slice(open + 1, close).split(', ').map((a) => `    ${a},`), `  ${l.slice(close)}`];
    });
    const ledger = new MemoryLedger();
    measure([file('src/app.ts', one)], ledger);
    const gains: number[] = [];
    for (let day = 1; day <= 6; day++) {
      ledger.today = day;
      const d = measure([file('src/app.ts', day % 2 ? wrapped : one, day % 2 ? one : wrapped)], ledger);
      gains.push(d.lines[Cat.Code]! + d.lines[Cat.Removed]!);
    }
    // The first re-wrap is new text to the ledger (a known residual, see docs/fair-play.md);
    // flipping back, or wrapping again, earns nothing more.
    expect(gains[0]).toBeLessThanOrEqual(2 * one.length);
    expect(gains.slice(1).every((g) => g <= 0)).toBe(true);
  });

  it('a trailing comment or inline comment does not make a duplicate line new', () => {
    const lines = Array.from({ length: 500 }, (_, i) => `registerHandler(router, paymentHandler); // ${['alpha', 'beta', 'gamma', 'delta'][i % 4]} ${i}`);
    const inline = Array.from({ length: 500 }, (_, i) => `registerHandler(router, /* ${i} */ paymentHandler);`);
    expect(measure([file('src/routes.ts', lines)]).lines[Cat.Code]).toBeLessThanOrEqual(2);
    expect(measure([file('src/routes.ts', inline)]).lines[Cat.Code]).toBeLessThanOrEqual(2);
  });

  it('zero-width characters, odd whitespace and homoglyphs do not make a duplicate line new', () => {
    const base = 'registerHandler(router, paymentHandler);';
    const variants = Array.from({ length: 300 }, (_, i) => {
      const at = 1 + (i % (base.length - 1));
      const mark = ['​', '‌', '‍', '⁠', '﻿', ' ', '　'][i % 7]!;
      return base.slice(0, at) + mark.repeat(1 + Math.floor(i / base.length)) + base.slice(at);
    });
    const homoglyphs = Array.from({ length: 64 }, (_, i) => base.replace(/a/g, (ch, at: number) => ((i >> (at % 6)) & 1 ? 'а' : ch)));
    expect(measure([file('src/routes.ts', variants)]).lines[Cat.Code]).toBeLessThanOrEqual(2);
    expect(measure([file('src/routes.ts', homoglyphs)]).lines[Cat.Code]).toBeLessThanOrEqual(2);
  });

  it('a data table disguised as source (object rows, switch arms, SQL inserts) counts as filler', () => {
    const words = NOUNS.flatMap((n) => VERBS.map((v) => `${v}${cap(n)}`));
    const rows = Array.from({ length: 2000 }, (_, i) => `  { id: ${i}, name: "${words[i % words.length]}", price: ${(i * 37) % 1000}, active: true },`);
    const arms = Array.from({ length: 2000 }, (_, i) => `    case ${i}: return "${words[i % words.length]}";`);
    const named = Array.from({ length: 400 }, (_, i) => `export const ICON_${i} = "M${i} ${i * 3}L${i * 7} 0Z";`);
    const sql = Array.from({ length: 1000 }, (_, i) => `INSERT INTO products (id, name) VALUES (${i}, '${words[i % words.length]}');`);
    expect(measure([file('src/catalog.ts', rows)]).lines[Cat.Code]).toBeLessThanOrEqual(10);
    expect(measure([file('src/names.ts', arms)]).lines[Cat.Code]).toBeLessThanOrEqual(10);
    expect(measure([file('src/icons.ts', named)]).lines[Cat.Code]).toBeLessThanOrEqual(10);
    expect(measure([file('db/seed.sql', sql)]).lines[Cat.Code]).toBeLessThanOrEqual(10);
  });

  it('prose or a blob pasted into a multi-line string is not code', () => {
    const rand = rng(5);
    const prose = Array.from({ length: 1500 }, () => Array.from({ length: 12 }, () => VERBS[Math.floor(rand() * VERBS.length)]! + (rand() < 0.2 ? ' and' : rand() < 0.2 ? ' if' : ' or')).join(' ') + '.');
    const blob = Array.from({ length: 1500 }, (_, i) => Buffer.from(`chunk ${i} of an embedded asset ${prose[i]}`).toString('base64').slice(0, 76));
    const ts = measure([file('src/story.ts', ['export const STORY = `', ...prose, '`;'])]);
    const py = measure([file('app/story.py', ['STORY = """', ...prose, '"""'])]);
    const b64 = measure([file('src/asset.ts', ['export const ASSET = `', ...blob, '`;'])]);
    // A tag makes the template's lines code in another language, so the prose test applies to them.
    const tagged = measure([file('src/page.ts', ['export const PAGE = html`', ...prose.map((l) => `<p>${l}</p>`), '`;'])]);
    const taggedBlob = measure([file('src/style.ts', ['export const FONT = css`', ...blob, '`;'])]);
    for (const d of [ts, py, b64, tagged, taggedBlob]) {
      expect(d.lines[Cat.Code]).toBeLessThanOrEqual(3);
      expect(d.branches).toBeLessThanOrEqual(3);
    }
  });

  it('prose in markup or LaTeX is not code', () => {
    const rand = rng(6);
    const sentence = () => Array.from({ length: 14 }, () => NOUNS[Math.floor(rand() * NOUNS.length)]!).join(' ') + '.';
    const html = measure([file('site/about.html', Array.from({ length: 800 }, () => `<p>${sentence()}</p>`))]);
    const tex = measure([file('paper/main.tex', Array.from({ length: 800 }, sentence))]);
    expect(html.lines[Cat.Code]).toBeLessThanOrEqual(10);
    expect(tex.lines[Cat.Code]).toBe(0);
  });

  it('comments in a language whose syntax was unknown do not count as code', () => {
    const d = measure([file('rtl/alu.vhd', honestComments(200, 4).map((l) => l.replace('//', '--')))]);
    expect(d.lines[Cat.Code]).toBe(0);
    expect(d.lines[Cat.Comment]).toBe(200);
  });

  it('branch stuffing (long && chains, `if (true)` on every line) is capped', () => {
    const code = honestCode(1000, 21);
    const chains = code.map((l, i) => (l.trim() === '}' ? l : `  if (${Array.from({ length: 20 }, (_, j) => `flag${(i + j) % 50}`).join(' && ')}) ${l.trim()}`));
    const ifs = code.map((l) => (l.trim() === '}' || l.startsWith('export') ? l : `  if (true) ${l.trim()}`));
    const honest = measure([file('src/app.ts', code)]);
    const stuffed = measure([file('src/app.ts', chains)]);
    const iffy = measure([file('src/app.ts', ifs)]);
    expect(stuffed.branches).toBeLessThanOrEqual(2 * stuffed.lines[Cat.Code]!);
    const h = strength(ledgerOf([{ delta: honest, msg: 'feat: billing' }]));
    expect(strength(ledgerOf([{ delta: stuffed, msg: 'feat: billing' }]))).toBeLessThanOrEqual(1.1 * h);
    expect(strength(ledgerOf([{ delta: iffy, msg: 'feat: billing' }]))).toBeLessThanOrEqual(1.1 * h);
  });

  it('spreading the same lines over many tiny files earns no more than writing them in a few', () => {
    const code = honestCode(200, 31);
    const few = measure([0, 1, 2, 3, 4].map((f) => file(`src/m${'abcde'[f]}.ts`, code.slice(f * 40, (f + 1) * 40))));
    const many = measure(code.map((l, i) => file(`src/f/${VERBS[i % 20]}${cap(NOUNS[Math.floor(i / 20) % 20]!)}.ts`, [l])));
    expect(many.lines[Cat.Code]).toBe(few.lines[Cat.Code]);
    expect(strength(ledgerOf([{ delta: many, msg: 'feat: x' }]))).toBeLessThanOrEqual(1.1 * strength(ledgerOf([{ delta: few, msg: 'feat: x' }])));
  });

  it('force-pushing, amending, or pushing the same commits to another branch credits the lines once', () => {
    const ledger = new MemoryLedger();
    const lines = honestCode(300, 41);
    let code = 0;
    // Each rewrite's compare is taken from the merge base, so it shows the same lines added again.
    for (let i = 0; i < 4; i++) code += measure([file('src/feature.ts', lines)], ledger).lines[Cat.Code]!;
    expect(code).toBe(measure([file('src/feature.ts', lines)]).lines[Cat.Code]);
  });

  it('deleting work before the daily reset and restoring it after earns it once', () => {
    const ledger = new MemoryLedger();
    const lines = honestCode(800, 51);
    const day1 = measure([file('src/feature.ts', lines)], ledger);
    const undo = measure([file('src/feature.ts', [], lines)], ledger);
    ledger.today = 1;
    const day2 = measure([file('src/feature.ts', lines)], ledger);
    expect(day1.lines[Cat.Code]).toBeGreaterThan(500);
    expect(undo.lines[Cat.Code]).toBe(-day1.lines[Cat.Code]!);
    // The second day's war sees nothing new.
    expect(day2.lines[Cat.Code]).toBe(0);
    expect(day2.lines[Cat.Removed]).toBe(0);
    // Deleting it again the next morning and restoring it on day three earns nothing either.
    ledger.today = 2;
    const del = measure([file('src/feature.ts', [], lines)], ledger);
    const back = measure([file('src/feature.ts', lines)], ledger);
    expect(del.lines[Cat.Code]! + back.lines[Cat.Code]!).toBe(0);
    expect(del.lines[Cat.Removed]! + back.lines[Cat.Removed]!).toBe(0);
  });

  it('deleting old code and restoring it on alternate days earns the removal once', () => {
    const ledger = new MemoryLedger();
    const legacy = honestCode(600, 61);
    const removed: number[] = [];
    for (let day = 0; day < 4; day++) {
      ledger.today = day;
      const d = measure([file('src/legacy.ts', day % 2 ? legacy : [], day % 2 ? [] : legacy)], ledger);
      removed.push(d.lines[Cat.Removed]!);
      expect(d.lines[Cat.Code], `day ${day}`).toBeLessThanOrEqual(0);
    }
    expect(removed[0]).toBeGreaterThan(400);
    expect(removed.slice(1).every((n) => n <= 0)).toBe(true);
  });

  it('copying the same code into several repositories credits it once', () => {
    const store = new Store(openDb(':memory:'));
    const now = Date.parse('2026-10-23T12:00:00Z');
    const lines = honestCode(500, 71);
    let code = 0;
    for (const repo of ['ana/one', 'ana/two', 'ana/three', 'ana/fork-of-one']) code += measurePush([file('src/core.ts', lines)], store.ledgerFor(7, repo, now)).lines[Cat.Code]!;
    expect(code).toBe(measure([file('src/core.ts', lines)]).lines[Cat.Code]);
  });

  it('moving code from one repository to another across pushes earns nothing', () => {
    const store = new Store(openDb(':memory:'));
    const now = Date.parse('2026-10-23T12:00:00Z');
    const lines = honestCode(300, 72);
    measurePush([file('src/core.ts', lines)], store.ledgerFor(7, 'ana/one', now));
    const out = measurePush([file('src/core.ts', [], lines)], store.ledgerFor(7, 'ana/one', now + 60_000));
    const into = measurePush([file('lib/core.ts', lines)], store.ledgerFor(7, 'ana/two', now + 120_000));
    expect(out.lines[Cat.Code]! + into.lines[Cat.Code]!).toBe(0);
  });

  it('a huge paste earns no more than the daily cap, and splitting it over the reset does not double it in one war', () => {
    const paste = honestCode(DAILY_CODE_CAP * 3, 81);
    const ledger = new MemoryLedger();
    const a = measure([file('src/paste.ts', paste.slice(0, DAILY_CODE_CAP * 1.5))], ledger);
    ledger.today = 1;
    const b = measure([file('src/paste2.ts', paste.slice(DAILY_CODE_CAP * 1.5))], ledger);
    // Both halves land in the same war when the room's reset hour is not midnight UTC.
    const war = ledgerOf([{ delta: a, msg: 'feat: import' }, { delta: b, msg: 'feat: import' }]);
    const capped = ledgerOf([{ delta: measure([file('src/paste.ts', paste.slice(0, DAILY_CODE_CAP))]), msg: 'feat: import' }]);
    expect(strength(war)).toBeLessThanOrEqual(1.1 * strength(capped));
  });

  it('a mass deletion (say, in a fork) earns less than a modest day of real code', () => {
    const legacy = honestCode(30_000, 91);
    const per = 100;
    const files = Array.from({ length: legacy.length / per }, (_, f) => file(`vendored/lib${f}/mod.ts`.replace('vendored', 'src'), [], legacy.slice(f * per, (f + 1) * per)));
    const wipe = ledgerOf([{ delta: measure(files), msg: 'refactor: remove dead code' }]);
    expect(strength(wipe)).toBeLessThan(strength(honestDay(1000, 8)));
  }, 30_000);
});

// ------------------------------------------------------------ the honest baseline

describe('honest work', () => {
  it('a realistic day of features, fixes, tests, comments and a refactor is not ragged and earns veteran rank', () => {
    const ledger = new MemoryLedger();
    const code = honestCode(1600, 101);
    const tests = honestTests(500, 102);
    const comments = honestComments(120, 103);
    const pushes: { delta: PushDelta; msg: string }[] = [];
    const push = (msg: string, files: ChangedFile[]) => pushes.push({ delta: measure(files, ledger), msg });
    // A feature across several modules, with tests and doc comments.
    push('feat(billing): add invoice exports', [
      file('src/billing/export.ts', [...comments.slice(0, 20), ...code.slice(0, 260)]),
      file('src/billing/format.ts', code.slice(260, 420)),
      file('src/billing/csv.ts', code.slice(420, 520)),
      file('src/billing/export.test.ts', tests.slice(0, 150)),
    ]);
    // Bug fixes: small, touching a few files.
    push('fix: rounding of zero-amount invoices', [file('src/billing/format.ts', code.slice(520, 560), code.slice(300, 310)), file('src/billing/format.test.ts', tests.slice(150, 190))]);
    push('fix(api): crash when the session token expires', [file('src/api/session.ts', [...comments.slice(20, 30), ...code.slice(560, 640)]), file('src/api/session.test.ts', tests.slice(190, 230))]);
    // A refactor moving code between files and deleting dead code.
    push('refactor: extract pricing rules', [
      file('src/billing/format.ts', [], code.slice(400, 420)),
      file('src/pricing/rules.ts', [...code.slice(400, 420), ...code.slice(640, 900)]),
      file('src/legacy/pricing.ts', [], honestCode(300, 104)),
    ]);
    // More features through the afternoon.
    push('feat: payment retries', [
      file('src/payments/retry.ts', [...comments.slice(30, 70), ...code.slice(900, 1150)]),
      file('src/payments/queue.ts', code.slice(1150, 1300)),
      file('src/payments/retry.test.ts', tests.slice(230, 380)),
      file('docs/payments.md', ['# Retries', 'Payments that fail are retried with exponential backoff, up to five times.']),
    ]);
    push('feat: dashboard widgets', [
      file('src/ui/widgets.tsx', [...comments.slice(70, 120), ...code.slice(1300, 1600)]),
      file('src/ui/widgets.test.tsx', tests.slice(380, 500)),
      file('src/ui/theme.ts', code.slice(1450, 1460)),
    ]);
    const day = ledgerOf(pushes);
    const q = armyQuality(day);
    expect(day.lines[Cat.Code]).toBeGreaterThan(1200);
    expect(q.notes.filter((n) => n.effect < 0)).toEqual([]);
    expect(q.quality).toBeGreaterThanOrEqual(1);
    expect(day.files).toBe(10);
    expect(q.veterancy).toBeGreaterThanOrEqual(1);
    // Closing braces and the like are filler, but little else of honest work is.
    expect(day.filler).toBeLessThan(0.3 * day.lines[Cat.Code]!);
    // A bigger day across more files earns the next rank.
    expect(armyQuality({ ...day, files: 12 }).veterancy).toBe(2);
  });

  it('honest multi-line object construction and type declarations still count as code', () => {
    const d = measure([file('src/user.ts', [
      'export interface Invoice {',
      '  id: string;',
      '  owner: UserId;',
      '  lines: InvoiceLine[];',
      '}',
      'export function toPayload(user: User, invoice: Invoice) {',
      '  return {',
      '    id: invoice.id,',
      '    owner: user.name,',
      '    total: sumLines(invoice.lines),',
      '  };',
      '}',
      'const query = sql`SELECT id FROM invoices WHERE owner = ${owner}`;',
    ])]);
    expect(d.lines[Cat.Code]).toBeGreaterThanOrEqual(9);
  });
});
