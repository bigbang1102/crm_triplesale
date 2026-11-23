import { describe, expect, it } from 'vitest';
import { ApiError } from '@core/http/api-error';
import { failureMessage, failureOf } from './settings.errors';

/** the body master-service sends on a failure (ApiErrorResponse): `{status, message: <code>, error: {code, description, details[]}}` */
const apiError = (status: number, code: string, description: string, details: { field: string; message: string }[] = []) =>
  new ApiError(status, `${code} - ${description}`, { body: { status, message: code, error: { code, description, details } } });

describe('failureOf — why master-service refused (api-flow-config-page.md §5.1)', () => {
  it('maps each error.code to its own message key', () => {
    const cases: [ApiError, string][] = [
      [apiError(400, 'INVALID_TABLE_KEY', 'table key has invalid format'), 'invalidTable'],
      [apiError(404, 'MASTER_TABLE_NOT_FOUND', 'Master table not found: x'), 'tableNotFound'],
      [apiError(409, 'MASTER_NOT_WRITABLE', 'This master table is not open for writing yet'), 'notWritable'],
      [apiError(404, 'RECORD_NOT_FOUND', 'Record not found'), 'recordNotFound'],
      [apiError(404, 'FIELD_NOT_FOUND', 'Field not found: x'), 'fieldNotFound'],
      [apiError(503, 'MASTER_CONFIG_INVALID', 'Master table is temporarily unavailable'), 'configInvalid'],
    ];
    for (const [e, key] of cases) expect(failureOf(e).key, key).toBe(`app.settings.err.${key}`);
  });

  it('tells the two 403s apart: the role vs the entity', () => {
    expect(failureOf(apiError(403, 'FORBIDDEN', 'Access denied')).key).toBe('app.settings.err.noRole');
    expect(failureOf(apiError(403, 'FORBIDDEN', 'Access to this entity is not allowed')).key).toBe('app.settings.err.noEntity');
  });

  it('PREREQUISITE_NOT_MET carries the names of the steps to finish first', () => {
    const f = failureOf(apiError(409, 'PREREQUISITE_NOT_MET', 'Prerequisite setup steps are not complete', [
      { field: 'entity', message: 'นิติบุคคล' },
      { field: 'branch', message: 'สาขา' },
    ]));
    expect(f.key).toBe('app.settings.err.prereq');
    expect(f.args).toEqual(['นิติบุคคล, สาขา']);
  });

  it('VALIDATION_ERROR gives the count and keeps the per-field details', () => {
    const f = failureOf(apiError(422, 'VALIDATION_ERROR', 'Validation failed', [
      { field: 'values.code', message: 'already exists' },
      { field: 'values.name', message: 'required' },
    ]));
    expect(f.key).toBe('app.settings.err.validation');
    expect(f.args).toEqual(['2']);
    expect(f.details.map((d) => d.field)).toEqual(['values.code', 'values.name']);
  });

  it('answers without a known code fall back by HTTP status; a non-ApiError is "unknown"', () => {
    expect(failureOf(new ApiError(0, 'Cannot connect to the service')).key).toBe('app.settings.err.offline');
    expect(failureOf(new ApiError(401, 'x')).key).toBe('app.settings.err.unauthorized');
    expect(failureOf(new ApiError(400, 'x', { body: '{not json' })).key).toBe('app.settings.err.badRequest');
    expect(failureOf(new ApiError(415, 'x')).key).toBe('app.settings.err.badRequest');
    expect(failureOf(new ApiError(500, 'x', { body: 'boom' })).key).toBe('app.settings.err.server');
    expect(failureOf(new ApiError(418, 'x')).key).toBe('app.settings.err.unknown');
    expect(failureOf(new Error('x')).key).toBe('app.settings.err.unknown');
    expect(failureOf(null).key).toBe('app.settings.err.unknown');
  });

  it('a "200" that is not JSON (the dev server answered with a web page) or a 404 of the wrong shape means the route to master-service is missing', () => {
    expect(failureOf(new ApiError(200, 'Http failure during parsing')).key).toBe('app.settings.err.noRoute');
    expect(failureOf(new ApiError(404, 'HTTP 404 Not Found')).key).toBe('app.settings.err.noRoute');
    // ... but a 404 the API itself sends keeps its own meaning
    expect(failureOf(apiError(404, 'MASTER_TABLE_NOT_FOUND', 'Master table not found: x')).key).toBe('app.settings.err.tableNotFound');
  });

  it('the message carries the HTTP code so the cause can be traced (500 = service not running or database unreachable)', () => {
    const t = (k: string) => k;
    expect(failureMessage(t, failureOf(new ApiError(500, 'x')))).toBe('app.settings.err.server (HTTP 500)');
    expect(failureMessage(t, failureOf(new ApiError(0, 'x')))).toBe('app.settings.err.offline');
    expect(failureMessage(t, failureOf(new Error('x')))).toBe('app.settings.err.unknown');
  });

  it('every key it can return exists in both dictionaries', async () => {
    const keys = ['invalidTable', 'tableNotFound', 'noRole', 'noEntity', 'notWritable', 'prereq', 'recordNotFound', 'fieldNotFound', 'validation', 'configInvalid', 'offline', 'unauthorized', 'badRequest', 'server', 'noRoute', 'unknown'];
    for (const lang of ['th', 'en']) {
      const dict = (await import(`../../../../public/assets/i18n/app.${lang}.json`)).default as Record<string, string>;
      for (const k of keys) expect(dict[`app.settings.err.${k}`], `${lang}: ${k}`).toBeTruthy();
    }
  });
});
