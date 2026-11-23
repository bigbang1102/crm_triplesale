import { beforeEach, describe, expect, it } from 'vitest';
import { clearOptionCache } from './options-cache';
import { keepPipelines, pipelineSteps } from './pipelines.live';
import { fakeRest } from './rest-fake';

describe('pipelines kept in the session', () => {
  beforeEach(() => clearOptionCache());
  const { deps } = fakeRest(() => ({ status: 200, result: {} }));

  it('gives the steps of the pipeline of the group (id and name), null for a group that is in none', () => {
    keepPipelines(deps, [
      { id: 'p1', activityGroup: { id: 'g1', name: 'A' }, steps: [{ id: 's1', name: 'นัดพบ' }, { id: 's2', nameTh: 'เสนอราคา' }] },
      { id: 'p2', activityGroup: { id: 'g2' }, steps: [] },
    ]);
    expect(pipelineSteps(deps, 'g1')).toEqual([{ id: 's1', name: 'นัดพบ' }, { id: 's2', nameTh: 'เสนอราคา', name: 'เสนอราคา' }]);
    // a group that is in none: the steps of all the pipelines, once each
    expect(pipelineSteps(deps, 'zzz')?.map((s) => s['id'])).toEqual(['s1', 's2']);
  });

  it('nothing kept → null', () => {
    keepPipelines(deps, []);
    expect(pipelineSteps(deps, 'g1')).toBeNull();
  });
});
