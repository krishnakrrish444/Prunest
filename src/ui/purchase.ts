// Shared "compare another bag size" inputs and the comparison table used by
// the soil and mulch calculators. Maths lives in src/lib/purchase.ts.
import { fmt, fmtMoney, fmtUnit, plural } from '../lib/format';
import { cheapest, planBags, type BagOption } from '../lib/purchase';
import type { Unit, UnitSystem } from '../lib/units';
import { table } from './html';
import { esc, grid, h, Issues, NumField, take, type FieldState } from './kit';

export interface ExtraBagState {
  bag: FieldState;
  price: string;
}

/** Up to two more bag sizes to compare with the first. */
export class ExtraBags {
  readonly root: HTMLDivElement;
  private readonly rows: { root: HTMLElement; bag: NumField; price: NumField }[] = [];
  private readonly addBtn: HTMLButtonElement;

  constructor(system: UnitSystem, onChange: () => void) {
    this.root = h('div', { class: 'mt-3' });
    for (let i = 0; i < 2; i++) {
      const n = i + 2;
      const bag = new NumField({ label: `Bag size ${n}`, noun: `bag size ${n}`, units: ['cuft', 'l'], unit: system === 'imperial' ? 'cuft' : 'l', optional: true });
      const price = new NumField({ label: `Price per bag ${n}`, noun: `price for bag size ${n}`, allowZero: true, optional: true });
      const remove = h('button', { type: 'button', class: 'btn btn-quiet', text: `Remove bag size ${n}` });
      const root = h('div', { class: 'mt-3 rounded-lg border border-line p-3', hidden: true }, grid(bag.root, price.root), remove);
      remove.addEventListener('click', () => {
        bag.setState({ v: '', u: bag.unit });
        price.setState({ v: '' });
        root.hidden = true;
        this.syncButton();
        this.addBtn.focus();
        onChange();
      });
      this.rows.push({ root, bag, price });
      this.root.append(root);
    }
    this.addBtn = h('button', { type: 'button', class: 'btn btn-secondary mt-3', text: '+ Compare another bag size' });
    this.addBtn.addEventListener('click', () => {
      const next = this.rows.find((r) => r.root.hidden);
      if (!next) return;
      next.root.hidden = false;
      next.bag.input.focus();
      this.syncButton();
      onChange();
    });
    this.root.append(this.addBtn);
  }

  private syncButton(): void {
    this.addBtn.hidden = this.rows.every((r) => !r.root.hidden);
  }

  get fields(): NumField[] {
    return this.rows.map((r) => r.bag);
  }

  setSystem(system: UnitSystem): void {
    this.rows.forEach((r) => r.bag.setSystem(system));
  }

  /** Read the visible rows. Returns options with their display labels. */
  read(issues: Issues): { option: BagOption; label: string; unit: Unit }[] {
    const out: { option: BagOption; label: string; unit: Unit }[] = [];
    for (const r of this.rows) {
      if (r.root.hidden) continue;
      const volume = take(r.bag, issues, { required: false });
      const price = take(r.price, issues, { required: false });
      if (volume === undefined) {
        if (price !== undefined && r.bag.isEmpty) issues.fail(r.bag, `Enter ${r.bag.noun} so its price can be used.`);
        continue;
      }
      out.push({ option: { volume, price }, label: r.bag.describe(), unit: r.bag.unit! });
    }
    return out;
  }

  getState(): ExtraBagState[] {
    return this.rows.filter((r) => !r.root.hidden).map((r) => ({ bag: r.bag.getState(), price: r.price.input.value }));
  }

  setState(list: ExtraBagState[] | undefined): void {
    this.rows.forEach((r, i) => {
      const s = list?.[i];
      r.bag.setState(s?.bag ?? { v: '', u: r.bag.unit });
      r.price.setState({ v: s?.price ?? '' });
      r.root.hidden = !s;
    });
    this.syncButton();
  }
}

export interface PurchaseRow {
  name: string;
  /** What is bought, e.g. "22 bags of 2 cu ft". */
  buy: string;
  purchasedVolume: number;
  surplusVolume: number;
  cost?: number;
  /** Price per display unit, e.g. "$5.00 per cu ft". */
  unitCost?: string;
  /** Show this row's volumes in its own unit (e.g. bulk in cu yd). */
  unit?: Unit;
}

const dp = (u: Unit) => (u === 'cuyd' || u === 'cum' ? 3 : 2);

/** Comparison table of buying options, with the lowest cost named in words. */
export function purchaseTable(rows: PurchaseRow[], unit: Unit, sym: string): string {
  const best = cheapest(rows.map((r) => r.cost));
  const body = rows.map((r, i) => [
    `${esc(r.name)}${best.includes(i) ? ' <strong class="badge">Lowest cost</strong>' : ''}`,
    `${r.buy}<span class="stat-note">${fmtUnit(r.purchasedVolume, r.unit ?? unit, dp(r.unit ?? unit))} bought</span>`,
    fmtUnit(r.surplusVolume, r.unit ?? unit, dp(r.unit ?? unit)),
    `${r.cost !== undefined ? fmtMoney(r.cost, sym) : '–'}${r.unitCost ? `<span class="stat-note">${r.unitCost}</span>` : ''}`,
  ]);
  let note = '';
  if (best.length > 0) {
    const costs = rows.map((r) => r.cost).filter((c): c is number => c !== undefined);
    const saving = Math.max(...costs) - Math.min(...costs);
    note = `<p class="fine">${best.length > 1 ? 'The lowest-cost options cost the same' : `<strong>${esc(rows[best[0]!]!.name)}</strong> is the lowest cost`} at the prices you entered${saving > 0.004 ? `, ${fmtMoney(saving, sym)} less than the most expensive option` : ''}. Delivery is not included unless you added it to a price.</p>`;
  }
  return table('Ways to buy, compared', ['Option', 'Buy', 'Spare', 'Cost'], body) + note;
}

/** Build the comparison row for one bag size. */
export function bagRow(required: number, option: BagOption, label: string, unit: Unit, sym: string): PurchaseRow {
  const p = planBags(required, option);
  const perUnit = p.costPerM3 !== undefined ? fmtMoney(p.costPerM3 * (unit === 'cuft' ? 0.028316846592 : 0.001), sym) + ` per ${unit === 'cuft' ? 'cu ft' : 'L'}` : undefined;
  return { name: `${label} bags`, buy: plural(p.count, 'bag'), purchasedVolume: p.purchasedVolume, surplusVolume: p.surplusVolume, cost: p.cost, unitCost: perUnit, unit };
}

