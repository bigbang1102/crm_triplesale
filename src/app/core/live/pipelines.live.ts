/**
 * The pipelines of `GET /opportunities/filter-options?sets=pipelines,…`, kept in sessionStorage (as the other option lists, see options-cache.ts) so that the
 * opportunity detail can answer the steps of its dropdown without another call: the group the opportunity is in (`currentActivityGroup.id`) is looked
 * for among the pipelines; when one is of that group, its `steps[i]` are the steps of the dropdown (`{ id, name }`).
 *
 * ★ A GUESS: no sample of a pipeline has been seen. A pipeline is matched by `activityGroup.id` · `activityGroupId` · `id`, its steps are read from
 * `steps` (else `activities`), each `{ id, name | nameTh }`. Check the names against a real answer.
 */
import { optionKey, readOptions, writeOptions } from './options-cache';
import type { RestDeps } from './rest';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const same = (a: unknown, b: unknown): boolean => a !== undefined && a !== null && String(a) !== '' && String(a) === String(b);

/** keeps the pipelines of the answer (nothing is kept when there are none) */
export function keepPipelines(deps: RestDeps, rows: readonly unknown[] | null): void {
  if (rows && rows.length > 0) writeOptions(optionKey(deps, 'pipelines'), rows);
}

const stepsOf = (p: Obj): unknown[] | null => (Array.isArray(p['steps']) ? p['steps'] : Array.isArray(p['activities']) ? p['activities'] : null);
const stepRow = (s: Obj): Obj => ({ ...s, id: s['id'], name: String(s['name'] ?? s['nameTh'] ?? '') });

/**
 * the steps of the dropdown as `[{ id, name }]`: those of the pipeline of this activity group; when no kept pipeline is of that group (the pipelines have no
 * group yet) the steps of all the kept pipelines, once each (by id). null when nothing is kept or there is no step at all (the caller asks as before)
 */
export function pipelineSteps(deps: RestDeps, activityGroupId: unknown): Obj[] | null {
  const kept = readOptions<unknown>(optionKey(deps, 'pipelines'));
  if (!kept) return null;
  const pipes = kept.filter(isObj);
  for (const p of pipes) {
    const group = isObj(p['activityGroup']) ? p['activityGroup']['id'] : undefined;
    if (!same(group, activityGroupId) && !same(p['activityGroupId'], activityGroupId) && !same(p['id'], activityGroupId)) continue;
    const steps = stepsOf(p);
    if (steps && steps.length > 0) return steps.filter(isObj).map(stepRow);
  }
  const seen = new Set<string>();
  const all: Obj[] = [];
  for (const p of pipes) {
    for (const s of stepsOf(p) ?? []) {
      if (!isObj(s)) continue;
      const key = String(s['id'] ?? s['name']);
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(stepRow(s));
    }
  }
  return all.length > 0 ? all : null;
}

/** what is kept, for the console when no step is found (ids and keys only): tells "nothing kept" from "kept, but the names are not the ones guessed" */
export function pipelinesDebug(deps: RestDeps): string {
  const kept = readOptions<unknown>(optionKey(deps, 'pipelines'));
  if (!kept) return 'no pipelines kept in the session (filter-options not answered, or no `pipelines` list in it)';
  return `${kept.length} kept: ` + JSON.stringify(kept.slice(0, 5).map((p) => (isObj(p) ? { keys: Object.keys(p), id: p['id'], activityGroup: p['activityGroup'] ?? p['activityGroupId'] } : p)));
}
