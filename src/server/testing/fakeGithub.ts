import type { ChangedFile } from '../../rules/classify.ts';
import type { CompareResult, EventsResult, GithubClient, PushEventLite } from '../github.ts';

/** An in-memory GitHub: events per login with ETags, and compare/commit results per range. */
export class FakeGithub implements GithubClient {
  events = new Map<string, PushEventLite[]>();
  compares = new Map<string, CompareResult>();
  commits = new Map<string, CompareResult>();
  pollInterval: number | null = null;
  remaining = 5000;
  calls = { events: 0, notModified: 0, compare: 0, commit: 0 };
  failCompare = false;

  private etagOf(login: string): string {
    return `"${login}:${(this.events.get(login) ?? []).map((e) => e.id).join(',')}"`;
  }

  addEvent(login: string, e: PushEventLite): void {
    const list = this.events.get(login) ?? [];
    list.unshift(e);
    this.events.set(login, list);
  }

  setCompare(repo: string, base: string, head: string, result: CompareResult): void {
    this.compares.set(`${repo}:${base}...${head}`, result);
  }

  setCommit(repo: string, sha: string, result: CompareResult): void {
    this.commits.set(`${repo}:${sha}`, result);
  }

  async userEvents(login: string, etag: string | null): Promise<EventsResult> {
    this.calls.events++;
    const current = this.etagOf(login);
    if (etag === current) {
      this.calls.notModified++;
      return { status: 304 };
    }
    this.remaining--;
    return { status: 200, etag: current, pollInterval: this.pollInterval, events: (this.events.get(login) ?? []).slice() };
  }

  async compare(repo: string, base: string, head: string): Promise<CompareResult | null> {
    this.calls.compare++;
    this.remaining--;
    if (this.failCompare) throw new Error('GitHub is down');
    return this.compares.get(`${repo}:${base}...${head}`) ?? null;
  }

  async commit(repo: string, sha: string): Promise<CompareResult | null> {
    this.calls.commit++;
    this.remaining--;
    return this.commits.get(`${repo}:${sha}`) ?? null;
  }

  rateLimit() {
    return { remaining: this.remaining, resetAtMs: 0 };
  }
}

export function sourceFile(filename: string, added: string[], removed: string[] = []): ChangedFile {
  const patch = ['@@ -1,1 +1,1 @@', ...removed.map((l) => `-${l}`), ...added.map((l) => `+${l}`)].join('\n');
  return { filename, status: 'modified', additions: added.length, deletions: removed.length, patch };
}

export function pushEvent(id: string, repo: string, before: string, head: string, createdAt: number, ref = 'refs/heads/main'): PushEventLite {
  return { id, repo, createdAt, pushId: `p${id}`, ref, before, head };
}

export const sha = (n: number): string => n.toString(16).padStart(40, 'a');
export const ZERO = '0'.repeat(40);
