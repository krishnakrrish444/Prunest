import { describe, expect, it } from 'vitest';
import { parseNumber } from '../src/lib/parse';
import { fmt, fmtInput } from '../src/lib/format';
import { convert } from '../src/lib/units';

describe('parseNumber', () => {
  it('accepts decimals and fractions', () => {
    expect(parseNumber('4')).toEqual({ ok: true, value: 4 });
    expect(parseNumber(' 4.5 ')).toEqual({ ok: true, value: 4.5 });
    expect(parseNumber('.5')).toEqual({ ok: true, value: 0.5 });
    expect(parseNumber('1/2')).toEqual({ ok: true, value: 0.5 });
    expect(parseNumber('3 1/2')).toEqual({ ok: true, value: 3.5 });
  });
  it('rejects instead of guessing', () => {
    for (const s of ['abc', '4,5', '1,000', '-3', '4ft', '1/0', '1e3', '4..5', '--', '3 1']) {
      expect(parseNumber(s)).toEqual({ ok: false, reason: 'not-a-number' });
    }
    expect(parseNumber('   ')).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('display formatting', () => {
  it('rounds only for display', () => {
    expect(fmt(43.156341, 2)).toBe('43.16');
    expect(fmt(1222.06, 1)).toBe('1,222.1');
    expect(fmt(29, 0)).toBe('29');
    expect(fmt(-0.0001, 2)).toBe('0');
  });
  it('unit-switched input text is clean and converts back to the original', () => {
    expect(fmtInput(convert(4, 'ft', 'm'))).toBe('1.2192');
    expect(fmtInput(convert(10, 'in', 'cm'))).toBe('25.4');
    expect(fmtInput(convert(convert(4, 'ft', 'm'), 'm', 'ft'))).toBe('4');
    expect(fmtInput(convert(1, 'm', 'ft'))).toBe('3.28084');
  });
});
