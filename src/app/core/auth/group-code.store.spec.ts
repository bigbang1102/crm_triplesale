import { afterEach, describe, expect, it } from 'vitest';
import { GROUP_CODE_KEY, forgetGroupCode, rememberGroupCode, rememberedGroupCode } from './group-code.store';

describe('the remembered group code', () => {
  afterEach(() => sessionStorage.clear());

  it('should remember a code for the browser session and forget it when asked', () => {
    expect(rememberedGroupCode()).toBe('');
    rememberGroupCode('  sun ');
    expect(rememberedGroupCode()).toBe('sun');
    expect(sessionStorage.getItem(GROUP_CODE_KEY)).toBe('sun');
    forgetGroupCode();
    expect(rememberedGroupCode()).toBe('');
  });

  it('should not remember an empty code, and should not be in localStorage (it must end with the session)', () => {
    rememberGroupCode('   ');
    expect(rememberedGroupCode()).toBe('');
    rememberGroupCode('sun');
    expect(localStorage.getItem(GROUP_CODE_KEY)).toBeNull();
  });
});
