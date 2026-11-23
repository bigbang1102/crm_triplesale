import { describe, expect, it } from 'vitest';
import { ROLE } from './roles';

describe('ROLE', () => {
  const values = Object.values(ROLE) as string[];

  it('has no role key twice', () => {
    const dup = values.filter((v, i) => values.indexOf(v) !== i);
    expect(dup).toEqual([]);
  });

  // `/me/roles` is matched exactly (case-sensitive): a stray space or a look-alike character in a key would never match
  it('keeps every key to letters, digits and underscores', () => {
    expect(values.filter((v) => !/^[A-Za-z0-9_]+$/.test(v))).toEqual([]);
  });
});
