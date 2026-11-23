import { describe, expect, it } from 'vitest';
import { ApiError, errorText } from './api-error';

describe('errorText (port of crmErrText)', () => {
  it('returns the fallback for empty input', () => {
    expect(errorText(null, 'x')).toBe('x');
    expect(errorText(undefined)).toBe('');
    expect(errorText(42, 'n')).toBe('n');
  });

  it('uses a plain string body as is', () => {
    expect(errorText('  boom  ')).toBe('boom');
  });

  it('shows the BFF login failure text', () => {
    expect(errorText({ responseCode: 'ERROR', failMessage: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' })).toBe(
      'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
    );
  });

  it('joins message and error.message with " - " and drops duplicates', () => {
    expect(
      errorText({ status: 400, message: 'Malformed request body', error: { code: 400, message: 'String value length exceeds 20000000' } }),
    ).toBe('Malformed request body - String value length exceeds 20000000');
    expect(errorText({ message: 'same', error: { message: 'same' } })).toBe('same');
  });

  it('appends error.details as JSON', () => {
    const text = errorText({
      status: 422,
      message: 'VALIDATION_ERROR',
      error: { code: 'VALIDATION_ERROR', description: 'bad', details: [{ field: 'email', message: 'must not be empty' }] },
    });
    expect(text).toContain('VALIDATION_ERROR - bad - ');
    expect(text).toContain('"field":"email"');
  });

  it('understands the proxy shape {error:"…"}', () => {
    expect(errorText({ error: 'chat backend unreachable' })).toBe('chat backend unreachable');
  });
});

describe('ApiError', () => {
  it('exposes authRequired only for SessionTokenFilter 401s', () => {
    expect(new ApiError(401, 'x', { authRequired: true }).authRequired).toBe(true);
    expect(new ApiError(401, 'wrong password').authRequired).toBe(false);
  });
});
