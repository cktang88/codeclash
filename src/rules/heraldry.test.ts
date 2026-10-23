import { describe, expect, it } from 'vitest';
import { battalionFlag, initialsOf, languageColor, languageOfPath, nextHue } from './heraldry.ts';

describe('heraldry', () => {
  it('never mistakes Object.prototype members for languages', () => {
    expect(languageColor('constructor')).toBeNull();
    expect(languageColor('toString')).toBeNull();
    expect(languageOfPath('src/x.constructor')).toBeNull();
    expect(languageOfPath('src/x.__proto__')).toBeNull();
    expect(languageColor('TypeScript')).toBe('#3178c6');
    expect(languageOfPath('a/b.TS')).toBe('TypeScript');
    expect(typeof battalionFlag(212, 'ana/x', 'hasOwnProperty').accent).toBe('string');
  });

  it('names odd repositories and runs out of hues gracefully', () => {
    expect(initialsOf('ana/')).toBe('??');
    expect(initialsOf('ana/tiny-lang')).toBe('TL');
    const taken: number[] = [];
    for (let i = 0; i < 20; i++) taken.push(nextHue(taken));
    for (const h of taken) expect(h >= 0 && h < 360).toBe(true);
  });
});
