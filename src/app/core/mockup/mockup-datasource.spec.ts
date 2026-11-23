import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { datasourceDoc, persistedState, resetMockupForTests, revive, serialize, setDatasource } from './mockup-datasource';
import { documentToKey, keyToDocument } from './mockup-bootstrap';

describe('serialize / revive', () => {
  it('should keep a Map and a Set through JSON, also when they are nested', () => {
    const state = { leads: new Map([[1, { tags: new Set(['a', 'b']) }]]), seq: 5 };
    const back = revive<typeof state>(JSON.parse(JSON.stringify(serialize(state))));
    expect(back.seq).toBe(5);
    expect(back.leads.get(1)?.tags).toEqual(new Set(['a', 'b']));
  });
});

describe('datasourceDoc', () => {
  afterEach(() => resetMockupForTests());

  it('should give a hand-made document by name, and undefined for one that is not there', () => {
    setDatasource({ users: [{ username: 'a' }] }, true);
    expect(datasourceDoc('users')).toEqual([{ username: 'a' }]);
    expect(datasourceDoc('nothing')).toBeUndefined();
  });
});

describe('persistedState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetMockupForTests();
  });

  it('should build the seed when nothing was saved, and restore the saved document when there is one', () => {
    setDatasource({ 'state.x': { $map: [[1, 'one']] } }, true);
    expect(persistedState('x', () => new Map<number, string>()).get().get(1)).toBe('one');
    expect(persistedState('y', () => ({ seed: true })).get()).toEqual({ seed: true });
  });

  it('should save the state a little after it was touched, once for several touches', async () => {
    const put = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', put);
    setDatasource({}, true);
    const state = persistedState('z', () => ({ n: 0 }));
    state.get().n = 1;
    state.touch();
    state.touch();
    await vi.advanceTimersByTimeAsync(600);
    expect(put).toHaveBeenCalledTimes(1);
    expect(JSON.parse((put.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ n: 1 });
  });

  it('should save nothing without the file server', async () => {
    const put = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', put);
    const state = persistedState('w', () => ({ n: 0 }));
    state.get();
    state.touch();
    await vi.advanceTimersByTimeAsync(600);
    expect(put).not.toHaveBeenCalled();
  });
});

describe('the mirror of a sessionStorage key', () => {
  it('should keep JSON as JSON and any other text as text, and give the same string back', () => {
    expect(documentToKey(keyToDocument('{"a":[1,2]}'))).toBe('{"a":[1,2]}');
    expect(keyToDocument('plain text')).toEqual({ kind: 'session-key', text: 'plain text' });
    expect(documentToKey(keyToDocument('plain text'))).toBe('plain text');
    expect(documentToKey({ kind: 'other' })).toBeUndefined();
    expect(documentToKey(null)).toBeUndefined();
  });

  it('should keep the filter of the person at the keyboard out of the shared document, and out of what the others change', () => {
    const key = 'ts.mock.leads.state';
    const mine = '{"moved":{"1":"a"},"filterState":"{\\"tab\\":\\"board\\"}"}';
    // sent: the data without the filter
    expect(keyToDocument(mine, key)).toEqual({ kind: 'session-key', json: { moved: { '1': 'a' } } });
    // taken in: somebody else's data, with MY filter
    const theirs = { kind: 'session-key', json: { moved: { '2': 'b' } } };
    expect(JSON.parse(documentToKey(theirs, key, mine)!)).toEqual({ moved: { '2': 'b' }, filterState: '{"tab":"board"}' });
    // a key that has no such fields is taken as it is
    expect(documentToKey({ kind: 'session-key', json: { a: 1 } }, 'ts.mock.other', '{"a":2}')).toBe('{"a":1}');
  });
});
