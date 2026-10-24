import { describe, expect, it } from 'vitest';
import { parseRepoInput, validRef } from './repoRef.ts';

describe('parseRepoInput', () => {
  const repo = (owner: string, name: string, ref: string | null = null) => ({ owner, repo: name, ref });

  it('reads owner/repo and its shorthand with a ref', () => {
    expect(parseRepoInput('torvalds/linux')).toEqual(repo('torvalds', 'linux'));
    expect(parseRepoInput('  vercel/next.js  ')).toEqual(repo('vercel', 'next.js'));
    expect(parseRepoInput('facebook/react@main')).toEqual(repo('facebook', 'react', 'main'));
    expect(parseRepoInput('a-b/c_d.e')).toEqual(repo('a-b', 'c_d.e'));
  });

  it('reads github.com URLs of a repository, with or without scheme, www, .git or a trailing slash', () => {
    for (const url of ['https://github.com/rust-lang/rust', 'http://github.com/rust-lang/rust/', 'github.com/rust-lang/rust', 'https://www.github.com/rust-lang/rust.git', 'https://github.com/rust-lang/rust?tab=readme#top', 'HTTPS://GITHUB.COM/rust-lang/rust']) {
      expect(parseRepoInput(url), url).toEqual(repo('rust-lang', 'rust'));
    }
  });

  it('reads the branch of a tree URL and the sha of a commit URL', () => {
    expect(parseRepoInput('https://github.com/denoland/deno/tree/v2.1')).toEqual(repo('denoland', 'deno', 'v2.1'));
    expect(parseRepoInput('https://github.com/o/r/tree/feature/siege-planner')).toEqual(repo('o', 'r', 'feature/siege-planner'));
    expect(parseRepoInput('https://github.com/nodejs/node/commit/0f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6')).toEqual(repo('nodejs', 'node', '0f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6'));
    expect(parseRepoInput('https://github.com/nodejs/node/commits/v22.x')).toEqual(repo('nodejs', 'node', 'v22.x'));
    expect(parseRepoInput('https://github.com/nodejs/node/blob/main/lib/fs.js')).toEqual(repo('nodejs', 'node', 'main'));
  });

  it('reads the repository of any other page in it', () => {
    expect(parseRepoInput('https://github.com/microsoft/TypeScript/pull/123')).toEqual(repo('microsoft', 'TypeScript'));
    expect(parseRepoInput('https://github.com/microsoft/TypeScript/issues')).toEqual(repo('microsoft', 'TypeScript'));
  });

  it('reads SSH remotes', () => {
    expect(parseRepoInput('git@github.com:sveltejs/svelte.git')).toEqual(repo('sveltejs', 'svelte'));
    expect(parseRepoInput('ssh://git@github.com/sveltejs/svelte')).toEqual(repo('sveltejs', 'svelte'));
  });

  it('refuses what names no repository', () => {
    for (const bad of ['', '   ', 'linux', 'https://github.com/torvalds', 'https://gitlab.com/a/b', 'https://example.com/a/b', 'github.com/orgs/foo', 'https://github.com/settings/profile', '-bad/repo', 'a--b/repo', 'owner/..', 'own er/repo', 'x'.repeat(40) + '/r', 'https://github.com/%zz/repo']) {
      expect(parseRepoInput(bad), bad).toBeNull();
    }
  });

  it('drops a ref it would not pass on to GitHub', () => {
    expect(parseRepoInput('o/r@../../etc')).toEqual(repo('o', 'r'));
    expect(parseRepoInput('https://github.com/o/r/tree/a..b')).toEqual(repo('o', 'r'));
    expect(validRef('main')).toBe(true);
    expect(validRef('release/1.x')).toBe(true);
    expect(validRef('-rf')).toBe(false);
    expect(validRef('a b')).toBe(false);
  });
});
