// Mulch calculator: form and results. Maths lives in src/lib/mulch.ts.
import { fmt, fmtMoney, fmtUnit, plural } from '../lib/format';
import { footprintArea, type Shape } from '../lib/geometry';
import { calculateMulch, exclusionProblem, type MulchArea, type PurchaseOption } from '../lib/mulch';
import { fromSI, SYSTEM_OF, UNIT_LABEL, type Unit, type UnitSystem } from '../lib/units';
import { footprintDiagram } from '../ui/diagram';
import { block, bullets, fold, headline, inputsUsed, stat, stats, steps, table } from '../ui/html';
import {
  esc, fieldset, grid, h, Issues, mountTool, NumField, pendingHTML, RowList, rowShell, selectField, take, textField,
  type FieldState, type Row, type Tool,
} from '../ui/kit';

interface AreaState {
  name: string;
  shape: Shape;
  length: FieldState;
  width: FieldState;
  diameter: FieldState;
  inner?: FieldState;
  exclusion: FieldState;
}

interface MulchState {
  areas: AreaState[];
  depth: FieldState;
  bag: FieldState;
  bagPrice: string;
  step: FieldState;
  bulk: FieldState;
  cur: string;
}

interface AreaRow extends Row {
  name: HTMLInputElement;
  shape: ReturnType<typeof selectField<Shape>>;
  length: NumField;
  width: NumField;
  diameter: NumField;
  inner: NumField;
  exclusion: NumField;
  sync(): void;
}

const LEN: Unit[] = ['ft', 'in', 'yd', 'm', 'cm'];
const DEP: Unit[] = ['in', 'cm', 'mm'];
const EXAMPLE_DEPTHS: Record<UnitSystem, [string, Unit][]> = {
  imperial: [['2', 'in'], ['3', 'in'], ['4', 'in']],
  metric: [['5', 'cm'], ['7.5', 'cm'], ['10', 'cm']],
};

mountTool<MulchState>('mulch', (ctx) => {
  let system: UnitSystem = ctx.system;
  const imp = () => system === 'imperial';
  const len = (): Unit => (imp() ? 'ft' : 'm');

  const makeRow = (): AreaRow => {
    const name = textField('Name', { placeholder: 'e.g. Front border', optional: true });
    const shape = selectField<Shape>('Shape', [['rect', 'Rectangle'], ['circle', 'Circle'], ['triangle', 'Triangle'], ['ring', 'Ring (circle with a bare middle)']]);
    const length = new NumField({ label: 'Length', units: LEN, unit: len() });
    const width = new NumField({ label: 'Width', units: LEN, unit: len() });
    const diameter = new NumField({ label: 'Diameter', units: LEN, unit: len(), help: 'Straight across the middle of the circle.' });
    const inner = new NumField({ label: 'Inner diameter', units: LEN, unit: len(), help: 'Straight across the bare middle, for example the gap left around a trunk.' });
    const exclusion = new NumField({
      label: 'Area to leave out',
      units: ['sqft', 'sqm'],
      unit: imp() ? 'sqft' : 'sqm',
      allowZero: true,
      optional: true,
      help: 'Ground inside this section that is already covered or will not be mulched, such as paving or a pond.',
    });
    const shell = rowShell(grid(name.root, shape.root), grid(length.root, width.root, diameter.root, inner.root), grid(exclusion.root));
    const sync = () => {
      const round = shape.value === 'circle' || shape.value === 'ring';
      const tri = shape.value === 'triangle';
      length.root.hidden = round;
      width.root.hidden = round;
      diameter.root.hidden = !round;
      inner.root.hidden = shape.value !== 'ring';
      length.rename(tri ? 'Base' : 'Length');
      width.rename(tri ? 'Height' : 'Width');
      diameter.rename(shape.value === 'ring' ? 'Outer diameter' : 'Diameter');
    };
    shape.select.addEventListener('change', sync);
    sync();
    return { ...shell, name: name.input, shape, length, width, diameter, inner, exclusion, sync };
  };

  const areas = new RowList<AreaRow>('section', makeRow, ctx.refresh);
  const depth = new NumField({ label: 'Mulch depth', units: DEP, unit: imp() ? 'in' : 'cm', help: 'The depth you have decided on. The same depth is used for every section.' });
  const chips = h('div', { class: 'chips' });
  const drawChips = () => {
    chips.textContent = '';
    chips.append(h('span', { text: 'Example depths, not recommendations:' }));
    for (const [v, u] of EXAMPLE_DEPTHS[system]) {
      const b = h('button', { type: 'button', class: 'btn btn-quiet', text: `${v} ${UNIT_LABEL[u]}` });
      b.addEventListener('click', () => {
        depth.setState({ v, u });
        ctx.refresh();
      });
      chips.append(b);
    }
  };
  drawChips();
  const bag = new NumField({ label: 'Bag size', units: ['cuft', 'l'], unit: imp() ? 'cuft' : 'l', optional: true, help: 'The volume printed on the bag.' });
  const bagPrice = new NumField({ label: 'Price per bag', allowZero: true, optional: true });
  const step = new NumField({ label: 'Bulk sold in steps of', noun: 'bulk step', units: ['cuyd', 'cum'], unit: imp() ? 'cuyd' : 'cum', optional: true, help: 'The smallest amount the supplier adds at a time, for example 0.5 or 1.' });
  const bulk = new NumField({ label: 'Bulk price', units: ['cuyd', 'cum'], unit: imp() ? 'cuyd' : 'cum', perUnit: true, allowZero: true, optional: true });
  const cur = selectField<string>('Currency symbol', [['$', '$'], ['£', '£'], ['€', '€']]);

  ctx.form.append(
    h('h2', { class: 'form-title', text: 'Areas to mulch' }),
    h('p', { class: 'help mb-3', text: 'Split an irregular area into simple sections and add one row for each. Sections must not overlap, or the overlap is counted twice.' }),
    areas.root,
    fieldset('Depth', grid(depth.root), chips),
    fieldset('Buying (optional)', grid(bag.root, bagPrice.root), grid(step.root, bulk.root), grid(cur.root)),
  );

  const blankArea = (): AreaState => ({ name: '', shape: 'rect', length: { v: '', u: len() }, width: { v: '', u: len() }, diameter: { v: '', u: len() }, inner: { v: '', u: len() }, exclusion: { v: '', u: imp() ? 'sqft' : 'sqm' } });
  const describeShape = (row: AreaRow): string =>
    ({
      rect: `rectangle, ${row.length.describe()} × ${row.width.describe()}`,
      triangle: `triangle, base ${row.length.describe()}, height ${row.width.describe()}`,
      circle: `circle, ${row.diameter.describe()} diameter`,
      ring: `ring, ${row.diameter.describe()} outside, ${row.inner.describe()} inside`,
    })[row.shape.value];
  const label = (r: AreaRow, i: number) => {
    const n = r.name.value.trim();
    return n ? `Section ${i + 1} (${n})` : `Section ${i + 1}`;
  };

  const tool: Tool<MulchState> = {
    blank: () => ({
      areas: [blankArea()],
      depth: { v: '', u: imp() ? 'in' : 'cm' },
      bag: { v: '', u: imp() ? 'cuft' : 'l' },
      bagPrice: '',
      step: { v: '', u: imp() ? 'cuyd' : 'cum' },
      bulk: { v: '', u: imp() ? 'cuyd' : 'cum' },
      cur: ctx.currency,
    }),
    example: () =>
      imp()
        ? {
            areas: [
              { ...blankArea(), name: 'Front border', length: { v: '20', u: 'ft' }, width: { v: '6', u: 'ft' }, exclusion: { v: '12', u: 'sqft' } },
              { ...blankArea(), name: 'Tree circle', shape: 'circle', diameter: { v: '8', u: 'ft' } },
            ],
            depth: { v: '3', u: 'in' },
            bag: { v: '2', u: 'cuft' },
            bagPrice: '4.5',
            step: { v: '0.5', u: 'cuyd' },
            bulk: { v: '40', u: 'cuyd' },
            cur: ctx.currency,
          }
        : {
            areas: [
              { ...blankArea(), name: 'Front border', length: { v: '6', u: 'm' }, width: { v: '1.8', u: 'm' }, exclusion: { v: '1', u: 'sqm' } },
              { ...blankArea(), name: 'Tree circle', shape: 'circle', diameter: { v: '2.4', u: 'm' } },
            ],
            depth: { v: '7.5', u: 'cm' },
            bag: { v: '60', u: 'l' },
            bagPrice: '5',
            step: { v: '0.5', u: 'cum' },
            bulk: { v: '55', u: 'cum' },
            cur: ctx.currency,
          },
    getState: () => ({
      areas: areas.rows.map((r) => ({
        name: r.name.value,
        shape: r.shape.value,
        length: r.length.getState(),
        width: r.width.getState(),
        diameter: r.diameter.getState(),
        inner: r.inner.getState(),
        exclusion: r.exclusion.getState(),
      })),
      depth: depth.getState(),
      bag: bag.getState(),
      bagPrice: bagPrice.input.value,
      step: step.getState(),
      bulk: bulk.getState(),
      cur: cur.value,
    }),
    setState(s) {
      const list = Array.isArray(s.areas) && s.areas.length ? s.areas : [blankArea()];
      areas.reset(list.length).forEach((r, i) => {
        const a = list[i]!;
        r.name.value = a.name ?? '';
        r.shape.value = a.shape;
        r.length.setState(a.length);
        r.width.setState(a.width);
        r.diameter.setState(a.diameter);
        r.inner.setState(a.inner);
        r.exclusion.setState(a.exclusion);
        r.sync();
      });
      depth.setState(s.depth);
      bag.setState(s.bag);
      bagPrice.setState({ v: s.bagPrice ?? '' });
      step.setState(s.step);
      bulk.setState(s.bulk);
      cur.value = s.cur ?? ctx.currency;
    },
    setSystem(next) {
      system = next;
      [...areas.rows.flatMap((r) => [r.length, r.width, r.diameter, r.inner, r.exclusion]), depth, bag, step, bulk].forEach((f) => f.setSystem(next));
      drawChips();
    },
    update() {
      const issues = new Issues();
      const inputs: MulchArea[] = areas.rows.map((r, i) => {
        const where = `Section ${i + 1}`;
        const circle = r.shape.value === 'circle' || r.shape.value === 'ring';
        const a: MulchArea = {
          shape: r.shape.value,
          length: circle ? undefined : take(r.length, issues, { required: true, where }),
          width: circle ? undefined : take(r.width, issues, { required: true, where }),
          diameter: circle ? take(r.diameter, issues, { required: true, where }) : undefined,
          inner: r.shape.value === 'ring' ? take(r.inner, issues, { required: true, where }) : undefined,
          exclusion: 0,
        };
        if (a.inner !== undefined && a.diameter !== undefined && a.inner >= a.diameter) {
          issues.fail(r.inner, 'The inner diameter must be smaller than the outer diameter.');
          a.inner = undefined;
        }
        const ex = take(r.exclusion, issues, { required: false });
        const gross = footprintArea(a);
        if (ex !== undefined && Number.isFinite(gross)) {
          const problem = exclusionProblem(gross, ex);
          if (problem) issues.fail(r.exclusion, `${problem} This section is ${fmtUnit(gross, r.exclusion.unit!)}.`);
          else a.exclusion = ex;
        }
        return a;
      });
      const d = take(depth, issues, { required: true });
      const bagVolume = take(bag, issues, { required: false });
      const price = take(bagPrice, issues, { required: false });
      const increment = take(step, issues, { required: false });
      const bulkPrice = take(bulk, issues, { required: false });
      if (price !== undefined && bag.isEmpty) issues.fail(bag, 'Enter the bag size so the price per bag can be used.');
      if (bulkPrice !== undefined && step.isEmpty) issues.fail(step, 'Enter the step the supplier sells in, for example 0.5 or 1, so the bulk amount can be rounded.');
      if (!issues.ok || d === undefined) {
        ctx.show(pendingHTML(issues, 'Enter each area and the mulch depth you want. Results appear here as you type.'));
        return false;
      }
      const r = calculateMulch({ areas: inputs, depth: d, bagVolume, bagPrice: price, bulkIncrement: increment, bulkPricePerM3: bulkPrice });
      const sym = cur.value;
      const first = areas.rows[0]!;
      const isRound = (row: AreaRow) => row.shape.value === 'circle' || row.shape.value === 'ring';
      const imperial = SYSTEM_OF[(isRound(first) ? first.diameter : first.length).unit!] === 'imperial';
      const [aU, vU, vAlt]: [Unit, Unit, Unit] = imperial ? ['sqft', 'cuft', 'cuyd'] : ['sqm', 'l', 'cum'];
      const many = areas.rows.length > 1;

      let html = headline('You need', fmtUnit(r.volume, vU), `of mulch (${fmtUnit(r.volume, vAlt, 3)}) to cover ${fmtUnit(r.netArea, aU)} at ${esc(depth.describe())} deep`);
      html += stats(
        stat('Net area', fmtUnit(r.netArea, aU), r.exclusionArea > 0 ? `${fmtUnit(r.grossArea, aU)} less ${fmtUnit(r.exclusionArea, aU)}` : 'nothing left out'),
        stat('Cubic feet', fmt(fromSI(r.volume, 'cuft'), 2)),
        stat('Cubic yards', fmt(fromSI(r.volume, 'cuyd'), 3)),
        stat('Litres', fmt(fromSI(r.volume, 'l'), 1), `${fmt(r.volume, 3)} m³`),
        ...(r.coveragePerBag !== undefined ? [stat('One bag covers', fmtUnit(r.coveragePerBag, aU), `${esc(bag.describe())} at ${esc(depth.describe())}`)] : []),
      );
      html += `<p class="fine">This is the <strong>required volume</strong>, before rounding up to whole bags or bulk steps.</p>`;

      if (r.bags || r.bulk) {
        const row = (name: string, buy: string, o: PurchaseOption, u: Unit) => [name, buy, fmtUnit(o.purchasedVolume, u, 3), fmtUnit(o.surplusVolume, u, 3), o.cost !== undefined ? fmtMoney(o.cost, sym) : '–'];
        const rows: string[][] = [];
        if (r.bags) rows.push(row('Bags', `${plural(r.bags.count, 'bag')} of ${esc(bag.describe())}`, r.bags, bag.unit!));
        if (r.bulk) rows.push(row('Bulk', `${plural(r.bulk.count, 'step')} of ${esc(step.describe())}`, r.bulk, step.unit!));
        let body = table('Purchase options', ['Option', 'Buy', 'Volume bought', 'Surplus', 'Cost'], rows);
        if (r.cheaper) {
          const diff = Math.abs(r.bags!.cost! - r.bulk!.cost!);
          body += `<p class="fine"><strong>${
            r.cheaper === 'equal' ? 'Both options cost the same' : `${r.cheaper === 'bags' ? 'Bags' : 'Bulk'} cost${r.cheaper === 'bags' ? '' : 's'} ${fmtMoney(diff, sym)} less`
          }</strong> at the prices you entered. Delivery charges are not included unless you added them to the price.</p>`;
        }
        body += `<p class="fine">Volume bought is the rounded purchase quantity. Surplus is what is left after spreading the required volume.</p>`;
        html += block('What to buy', body);
      }

      const rows = areas.rows.map((row, i) => {
        const a = r.areas[i]!;
        return [esc(label(row, i)), fmtUnit(a.gross, aU), a.exclusion > 0 ? fmtUnit(a.exclusion, aU) : '–', fmtUnit(a.net, aU), fmtUnit(a.volume, vU)];
      });
      const foot = many ? ['Total', fmtUnit(r.grossArea, aU), r.exclusionArea > 0 ? fmtUnit(r.exclusionArea, aU) : '–', fmtUnit(r.netArea, aU), fmtUnit(r.volume, vU)] : undefined;
      const figures = areas.rows
        .map((row, i) => {
          const circle = isRound(row);
          const inp = inputs[i]!;
          return `<figure class="figure"><figcaption>${esc(label(row, i))}</figcaption>${footprintDiagram({
            shape: row.shape.value,
            ratio: circle ? 1 : inp.length! / inp.width!,
            innerRatio: inp.shape === 'ring' ? inp.inner! / inp.diameter! : undefined,
            innerLabel: row.inner.describe(),
            lengthLabel: row.length.describe(),
            widthLabel: row.width.describe(),
            diameterLabel: row.diameter.describe(),
            depthLabel: depth.describe(),
            depthCaption: 'mulch depth',
            alt: `${describeShape(row)}, mulched ${depth.describe()} deep`,
          })}</figure>`;
        })
        .join('');
      html += block('Breakdown by section', table('Area and volume for each section', ['Section', 'Measured area', 'Left out', 'Net area', 'Mulch'], rows, foot) + `<div class="figures">${figures}</div><p class="fine">Diagrams are not to scale. The labelled measurements are the ones used.</p>`);

      const [lu, au, vu]: [Unit, Unit, Unit] = imperial ? ['ft', 'sqft', 'cuft'] : ['m', 'sqm', 'cum'];
      const L = (m: number) => `${fmt(fromSI(m, lu), 4)} ${UNIT_LABEL[lu]}`;
      const work = areas.rows.map((row, i) => {
        const inp = inputs[i]!;
        const a = r.areas[i]!;
        const shape =
          inp.shape === 'circle'
            ? `π × (${L(inp.diameter! / 2)})²`
            : inp.shape === 'ring'
              ? `π × ((${L(inp.diameter! / 2)})² − (${L(inp.inner! / 2)})²)`
              : inp.shape === 'triangle'
                ? `½ × ${L(inp.length!)} × ${L(inp.width!)}`
                : `${L(inp.length!)} × ${L(inp.width!)}`;
        return `<strong>${esc(label(row, i))}:</strong> ${shape} = ${fmtUnit(a.gross, au, 3)}${a.exclusion > 0 ? `; less ${fmtUnit(a.exclusion, au, 3)} left out = ${fmtUnit(a.net, au, 3)}` : ''}`;
      });
      work.push(`<strong>Depth:</strong> ${esc(depth.describe())} = ${L(d)}`);
      work.push(`<strong>Volume:</strong> ${fmtUnit(r.netArea, au, 3)} × ${L(d)} = ${fmtUnit(r.volume, vu, 4)}${vu === 'cum' ? ` = ${fmtUnit(r.volume, 'l', 1)}` : ` = ${fmtUnit(r.volume, 'cuyd', 3)}`}`);
      if (r.bags) work.push(`<strong>Bags:</strong> ${fmtUnit(r.volume, bag.unit!)} ÷ ${esc(bag.describe())} = ${fmt(r.volume / bagVolume!, 2)}, rounded up to ${plural(r.bags.count, 'bag')}`);
      if (r.bulk) work.push(`<strong>Bulk:</strong> ${fmtUnit(r.volume, step.unit!, 3)} ÷ ${esc(step.describe())} = ${fmt(r.volume / increment!, 2)} steps, rounded up to ${fmt(r.bulk.count, 0)} = ${fmtUnit(r.bulk.purchasedVolume, step.unit!, 3)}`);
      html += fold('How this was calculated', steps(work) + `<p class="fine">Net area × depth = volume. Triangle area is ½ × base × height; a ring is the outer circle minus the inner circle. Figures are rounded for display only.</p>`);

      const used: [string, string][] = areas.rows.map((row, i) => [
        label(row, i),
        `${describeShape(row)}${inputs[i]!.exclusion > 0 ? `; ${row.exclusion.describe()} left out` : ''}`,
      ]);
      used.push(['Mulch depth', depth.describe()]);
      if (bagVolume !== undefined) used.push(['Bag size', bag.describe()]);
      if (price !== undefined) used.push(['Price per bag', fmtMoney(price, sym)]);
      if (increment !== undefined) used.push(['Bulk step', step.describe()]);
      if (bulkPrice !== undefined) used.push(['Bulk price', `${sym}${bulk.describe()}`]);
      html += fold('Inputs used', inputsUsed(used));
      html += fold(
        'Assumptions',
        bullets([
          'The depth is the one you entered, applied evenly over level ground.',
          'Sections do not overlap. Anything left out lies fully inside its section.',
          'Volume is loose volume as sold. Mulch settles and compacts over time.',
          'No weight is given, because weight depends on the material and how wet it is.',
          'Prices are the ones you entered and exclude delivery or tax unless you included them.',
        ]),
      );
      ctx.show(html, `${fmtUnit(r.volume, vU)}${r.bags ? ` · ${plural(r.bags.count, 'bag')}` : ''}`);
      return true;
    },
  };
  return tool;
});
