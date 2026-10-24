// Reading a repository out of whatever someone pastes: `owner/repo`, a github.com URL of the
// repository, a branch (`/tree/…`), a commit (`/commit/…`), a file, a pull request, or an
// SSH remote. Shared by the army preview's page and its endpoint.

export interface RepoInput {
  owner: string;
  repo: string;
  /** A branch, tag or commit named by the input (`/tree/x`, `/commit/sha`, `owner/repo@x`), else null. */
  ref: string | null;
}

/** GitHub logins: letters, digits and single hyphens, 1–39 characters, not starting with a hyphen. */
export const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
/** Repository names: letters, digits, `.`, `-` and `_`, up to 100 characters. */
export const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

/** First path segments of github.com that are pages, not owners. */
const RESERVED = new Set([
  'about', 'apps', 'blog', 'collections', 'contact', 'customer-stories', 'enterprise', 'events', 'explore', 'features', 'gist', 'issues', 'join', 'login',
  'logout', 'marketplace', 'new', 'notifications', 'orgs', 'organizations', 'pricing', 'pulls', 'search', 'security', 'settings', 'site', 'sponsors',
  'stars', 'topics', 'trending', 'users', 'codespaces', 'copilot', 'readme', 'team', 'dashboard', 'account',
]);

/** A branch, tag or sha as git allows it, kept to a safe subset: no `..`, no spaces or control characters, at most 200 characters. */
export function validRef(ref: string): boolean {
  return ref.length > 0 && ref.length <= 200 && /^[A-Za-z0-9._\/-]+$/.test(ref) && !ref.includes('..') && !ref.startsWith('/') && !ref.endsWith('/') && !ref.endsWith('.lock') && !ref.startsWith('-');
}

export function validRepo(owner: string, repo: string): boolean {
  return OWNER_RE.test(owner) && REPO_RE.test(repo) && repo !== '.' && repo !== '..' && !RESERVED.has(owner.toLowerCase());
}

/** The repository (and any branch or commit) a pasted text names, or null if it names none. */
export function parseRepoInput(input: string): RepoInput | null {
  let text = input.trim();
  if (!text || text.length > 500) return null;
  // SSH remotes: git@github.com:owner/repo.git
  const ssh = /^(?:ssh:\/\/)?git@github\.com[:/](.+)$/i.exec(text);
  if (ssh) text = ssh[1]!;
  else {
    const url = /^(?:(?:https?|git):\/\/)?(?:www\.)?github\.com\/(.*)$/i.exec(text);
    if (url) text = url[1]!;
    else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) || /^[\w.-]+\.[a-z]{2,}\//i.test(text)) return null; // another site
  }
  text = text.replace(/[?#].*$/, '');
  // `owner/repo@ref` shorthand.
  let at: string | null = null;
  const shorthand = /^([^/@\s]+\/[^/@\s]+)@(\S+)$/.exec(text);
  if (shorthand) {
    text = shorthand[1]!;
    at = shorthand[2]!;
  }
  const parts = text.split('/').filter((p) => p !== '');
  if (parts.length < 2) return null;
  let decoded: string[];
  try {
    decoded = parts.map((p) => decodeURIComponent(p));
  } catch {
    return null;
  }
  const owner = decoded[0]!;
  const repo = decoded[1]!.replace(/\.git$/i, '');
  if (!validRepo(owner, repo)) return null;
  let ref: string | null = at;
  const kind = decoded[2];
  const rest = decoded.slice(3);
  if (ref === null && rest.length > 0) {
    if (kind === 'commit' || kind === 'commits') ref = rest[0]!;
    // A branch may hold slashes (`feature/x`), and so may the folder after it; only GitHub can
    // tell them apart. /tree/ keeps the whole rest (the endpoint tries shorter prefixes when no
    // such ref exists); /blob/ always names a file after its ref, so its rest is cut to one segment.
    else if (kind === 'tree') ref = rest.join('/');
    else if (kind === 'blob') ref = rest[0]!;
  }
  if (ref !== null && !validRef(ref)) ref = null;
  return { owner, repo, ref };
}
