import { fromSI, UNIT_LABEL, type Unit } from './units';

/** Format for display only: fixed max decimals, trailing zeros trimmed, thousands separators. */
export function fmt(n: number, maxDecimals = 2): string {
  if (!Number.isFinite(n)) return '–';
  const rounded = Number(n.toFixed(maxDecimals));
  return (Object.is(rounded, -0) ? 0 : rounded).toLocaleString('en-US', {
    maximumFractionDigits: maxDecimals,
  });
}

/** Format an SI quantity in a display unit, e.g. fmtUnit(0.9, 'cuft') -> "31.78 cu ft". */
export function fmtUnit(si: number, unit: Unit, maxDecimals = 2): string {
  return `${fmt(fromSI(si, unit), maxDecimals)} ${UNIT_LABEL[unit]}`;
}

export function fmtMoney(amount: number, symbol: string): string {
  return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Text to place in an input after a unit switch: enough digits to look clean, never lossy on screen. */
export function fmtInput(n: number): string {
  if (!Number.isFinite(n)) return '';
  return String(Number(n.toPrecision(7)));
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${fmt(n, 0)} ${n === 1 ? one : many}`;
}
