import { describe, expect, it } from 'vitest';
import { joinPhone, splitPhone } from '../src/shared/phone-input';

describe('phone country selection', () => {
  it('defaults local and blank numbers to Malaysia without changing existing input', () => {
    expect(splitPhone('012-345 6789')).toEqual({ code: '+60', number: '012-345 6789' });
    expect(joinPhone('+60', '')).toBe('');
    expect(joinPhone('+60', '012-345 6789')).toBe('+60 12-345 6789');
  });
  it('detects international prefixes and preserves subscriber formatting', () => {
    expect(splitPhone('+852 2345 6789')).toEqual({ code: '+852', number: '2345 6789' });
    expect(joinPhone('+44', '(0)20 7946 0999 ext 123')).toBe('+44 (0)20 7946 0999 ext 123');
    expect(joinPhone('+39', '06 1234 5678')).toBe('+39 06 1234 5678');
  });
  it('retains countries outside presets and avoids duplicate pasted prefixes', () => {
    expect(splitPhone('+358 40 123 4567')).toEqual({ code: '', number: '+358 40 123 4567' });
    expect(joinPhone('', '+358 40 123 4567')).toBe('+358 40 123 4567');
    expect(joinPhone('+60', '+65 8123 4567')).toBe('+65 8123 4567');
  });
});
