import { describe, expect, it } from 'vitest';
import { merge } from './mockup-merge';

describe('merging what the page changed with what somebody else saved', () => {
  it('should take the other version when the page changed nothing, and the page when nobody else did', () => {
    expect(merge({ a: 1 }, { a: 1 }, { a: 2 })).toEqual({ a: 2 });
    expect(merge({ a: 1 }, { a: 2 }, { a: 1 })).toEqual({ a: 2 });
    expect(merge({ a: 1 }, { a: 3 }, { a: 3 })).toEqual({ a: 3 });
  });

  it('should keep the changes of both when they are different keys of an object, and let the page win the same key', () => {
    const base = { a: 1, b: 1, c: 1 };
    expect(merge(base, { a: 2, b: 1, c: 1 }, { a: 1, b: 5, c: 1 })).toEqual({ a: 2, b: 5, c: 1 });
    expect(merge(base, { a: 2, b: 1, c: 1 }, { a: 9, b: 1, c: 1 })).toEqual({ a: 2, b: 1, c: 1 });
  });

  it('should drop a key one side removed, unless the other side changed it', () => {
    const base = { a: 1, b: 1 };
    expect(merge(base, { a: 1 }, { a: 1, b: 1 })).toEqual({ a: 1 }); // the page removed b
    expect(merge(base, { a: 1, b: 1 }, { a: 1 })).toEqual({ a: 1 }); // the other removed b
    expect(merge(base, { a: 1 }, { a: 1, b: 7 })).toEqual({ a: 1, b: 7 }); // removed here, changed there: the change stays
    expect(merge(base, { a: 1, b: 7 }, { a: 1 })).toEqual({ a: 1, b: 7 });
  });

  it('should merge a list of records by their key: every added record is kept, a removed one goes, a record both edited is merged inside', () => {
    const base = { quotations: [{ id: 1, total: 10, note: 'a' }, { id: 2, total: 20, note: 'b' }] };
    const ours = { quotations: [{ id: 1, total: 11, note: 'a' }, { id: 2, total: 20, note: 'b' }, { id: 3, total: 30, note: 'mine' }] };
    const theirs = { quotations: [{ id: 1, total: 10, note: 'edited there' }, { id: 4, total: 40, note: 'theirs' }] };
    const merged = merge(base, ours, theirs) as { quotations: Array<{ id: number; total: number; note: string }> };
    // 1 edited on both sides (different fields) · 2 removed by the other · 3 added here · 4 added there
    expect(merged.quotations).toEqual([{ id: 1, total: 11, note: 'edited there' }, { id: 4, total: 40, note: 'theirs' }, { id: 3, total: 30, note: 'mine' }]);
  });

  it('should find the key of a record by id, then code, then no', () => {
    const merged = merge({ l: [{ code: 'A', v: 1 }] }, { l: [{ code: 'A', v: 1 }, { code: 'B', v: 2 }] }, { l: [{ code: 'A', v: 1 }, { code: 'C', v: 3 }] }) as { l: Array<{ code: string }> };
    expect(merged.l.map((r) => r.code)).toEqual(['A', 'C', 'B']);
  });

  it('should treat a list without keys as a heap: what the page added is added, what it removed is removed', () => {
    expect(merge({ h: ['a', 'b'] }, { h: ['a', 'b', 'mine'] }, { h: ['a', 'b', 'theirs'] })).toEqual({ h: ['a', 'b', 'theirs', 'mine'] });
    expect(merge({ h: ['a', 'b', 'c'] }, { h: ['a', 'c'] }, { h: ['a', 'b', 'c', 'd'] })).toEqual({ h: ['a', 'c', 'd'] });
    // a log of entries that are objects without a key: the entries of both are kept
    const entry = (at: string) => ({ at, who: 'x' });
    expect(merge({ log: [entry('1')] }, { log: [entry('1'), entry('2')] }, { log: [entry('1'), entry('3')] })).toEqual({ log: [entry('1'), entry('3'), entry('2')] });
  });

  it('should merge the Map and the Set that serialize() writes', () => {
    const map = (entries: Array<[string, unknown]>) => ({ $map: entries });
    const merged = merge(map([['a', 1], ['b', 1]]), map([['a', 2], ['b', 1]]), map([['a', 1], ['b', 5], ['c', 1]])) as { $map: Array<[string, unknown]> };
    expect(Object.fromEntries(merged.$map)).toEqual({ a: 2, b: 5, c: 1 });
    const set = (values: string[]) => ({ $set: values });
    const mergedSet = merge(set(['x', 'y']), set(['x', 'y', 'mine']), set(['x', 'theirs'])) as { $set: string[] };
    expect([...mergedSet.$set].sort()).toEqual(['mine', 'theirs', 'x']);
  });

  it('should let the page win a plain value both changed, and take what the other added when the page has no such key', () => {
    expect(merge({ n: 1 }, { n: 2 }, { n: 3 })).toEqual({ n: 2 });
    expect(merge({}, { mine: 1 }, { theirs: 2 })).toEqual({ theirs: 2, mine: 1 });
    expect(merge(undefined, { a: 1 }, { b: 2 })).toEqual({ b: 2, a: 1 });
  });
});
