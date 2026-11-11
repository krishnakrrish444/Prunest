// Raised-bed soil calculator: form and results. Maths lives in src/lib/soil.ts.
import { fmt, fmtMoney, fmtUnit, plural } from '../lib/format';
import { calculateSoil, KG_PER_LB, LB_PER_CUFT, splitMix, weightKg, type BedInput, type MixPart } from '../lib/soil';
import { fromSI, SYSTEM_OF, UNIT_LABEL, type Unit, type UnitSystem } from '../lib/units';
import { footprintDiagram, shareBar } from '../ui/diagram';
import { block, bullets, check, fold, headline, inputsUsed, stat, stats, steps, table } from '../ui/html';
import {
  esc, fieldset, grid, h, Issues, mountTool, NumField, optionalGroup, pendingHTML, RowList, rowShell, selectField, take, textField,
  type FieldState, type Row, type Tool,
} from '../ui/kit';

interface BedState {
  name: string;
  shape: RectOrCircle;
  length: FieldState;
  width: FieldState;
  diameter: FieldState;
  depth: FieldState;
  height: FieldState;
}

interface SoilState {
  beds: BedState[];
  allowance: string;
  bag: FieldState;
  bagPrice: string;
  bulk: FieldState;
  cur: string;
  mix?: { n: string; p: string }[];
  density?: string;
  densityUnit?: DensityUnit;
}

type DensityUnit = 'lbcuft' | 'kgm3';
type RectOrCircle = 'rect' | 'circle';

interface BedRow extends Row {
  name: HTMLInputElement;
  shape: ReturnType<typeof selectField<RectOrCircle>>;
  length: NumField;
  width: NumField;
  diameter: NumField;
  depth: NumField;
  height: NumField;
  sync(): void;
}

const LEN: Unit[] = ['ft', 'in', 'm', 'cm'];
const DEP: Unit[] = ['in', 'ft', 'cm', 'm'];

mountTool<SoilState>('soil', (ctx) => {
  let system: UnitSystem = ctx.system;
  const len = (): Unit => (system === 'imperial' ? 'ft' : 'm');
  const dep = (): Unit => (system === 'imperial' ? 'in' : 'cm');

  const makeRow = (): BedRow => {
    const name = textField('Name', { placeholder: 'e.g. Tomato bed', optional: true });
    const shape = selectField<RectOrCircle>('Shape', [['rect', 'Rectangular'], ['circle', 'Circular']]);
    const length = new NumField({ label: 'Inside length', units: LEN, unit: len() });
    const width = new NumField({ label: 'Inside width', units: LEN, unit: len() });
    const diameter = new NumField({ label: 'Inside diameter', units: LEN, unit: len(), help: 'Measure straight across the widest point, inside the walls.' });
    const depth = new NumField({
      label: 'Depth of soil to add',
      noun: 'depth of soil to add',
      units: DEP,
      unit: dep(),
      help: 'New bed: how deep you will fill it. Topping up: only the depth you want to add.',
    });
    const height = new NumField({
      label: 'Bed wall height',
      units: DEP,
      unit: dep(),
      optional: true,
      help: 'Only used to check the depth against the walls and to draw the diagram.',
    });
    const shell = rowShell(grid(name.root, shape.root), grid(length.root, width.root, diameter.root), grid(depth.root, height.root));
    const sync = () => {
      const circle = shape.value === 'circle';
      length.root.hidden = circle;
      width.root.hidden = circle;
      diameter.root.hidden = !circle;
    };
    shape.select.addEventListener('change', sync);
    sync();
    return { ...shell, name: name.input, shape, length, width, diameter, depth, height, sync };
  };

  const beds = new RowList<BedRow>('bed', makeRow, ctx.refresh);
  const allowance = new NumField({
    label: 'Extra allowance',
    suffix: '%',
    allowZero: true,
    max: 100,
    optional: true,
    placeholder: '0',
    help: 'Extra material for settling or spillage, as a percentage of the base volume. Leave blank for none.',
  });
  const bag = new NumField({ label: 'Bag size', units: ['cuft', 'l'], unit: system === 'imperial' ? 'cuft' : 'l', optional: true, help: 'The volume printed on the bag.' });
  const bagPrice = new NumField({ label: 'Price per bag', allowZero: true, optional: true });
  const bulk = new NumField({ label: 'Bulk price', units: ['cuyd', 'cum'], unit: system === 'imperial' ? 'cuyd' : 'cum', perUnit: true, allowZero: true, optional: true, help: 'The delivered or collected price for one cubic yard or cubic metre.' });
  const cur = selectField<string>('Currency symbol', [['$', '$'], ['£', '£'], ['€', '€']]);
  const mixRows = [0, 1, 2].map((i) => ({
    name: textField(`Ingredient ${i + 1}`, { placeholder: ['e.g. Topsoil', 'e.g. Compost', 'e.g. Grit'][i], optional: true }),
    parts: new NumField({ label: 'Parts', noun: `parts for ingredient ${i + 1}`, optional: true, placeholder: 'e.g. 2', help: i === 0 ? 'Relative amounts. 2, 1, 1 and 50, 25, 25 mean the same.' : undefined }),
  }));
  const density = new NumField({ label: 'Density of the product', noun: 'density', optional: true, help: 'From the supplier or the bag. Leave blank and no weight is shown.' });
  const densityUnit = selectField<DensityUnit>('Density unit', [['lbcuft', 'lb per cu ft'], ['kgm3', 'kg per m³']]);

  ctx.form.append(
    h('h2', { class: 'form-title', text: 'Your beds' }),
    beds.root,
    fieldset('Allowance', grid(allowance.root)),
    optionalGroup('Buying', 'Bag size and prices, for bag counts and cost', grid(bag.root, bagPrice.root), grid(bulk.root, cur.root)),
    optionalGroup(
      'Soil mix',
      'Split the total between your own ingredients',
      h('p', { class: 'help', text: 'Blending your own? Enter your recipe to split the total between ingredients. Prunest does not suggest a recipe.' }),
      ...mixRows.map((m) => grid(m.name.root, m.parts.root)),
    ),
    optionalGroup('Weight', 'Only from a density your supplier gives', grid(density.root, densityUnit.root)),
  );

  const allFields = () => [...beds.rows.flatMap((r) => [r.length, r.width, r.diameter, r.depth, r.height]), bag, bulk];

  const tool: Tool<SoilState> = {
    blank: () => ({
      beds: [{ name: '', shape: 'rect', length: { v: '', u: len() }, width: { v: '', u: len() }, diameter: { v: '', u: len() }, depth: { v: '', u: dep() }, height: { v: '', u: dep() } }],
      allowance: '',
      bag: { v: '', u: system === 'imperial' ? 'cuft' : 'l' },
      bagPrice: '',
      bulk: { v: '', u: system === 'imperial' ? 'cuyd' : 'cum' },
      cur: ctx.currency,
    }),
    example: () =>
      system === 'imperial'
        ? {
            beds: [
              { name: 'Vegetable bed', shape: 'rect', length: { v: '8', u: 'ft' }, width: { v: '4', u: 'ft' }, diameter: { v: '', u: 'ft' }, depth: { v: '10', u: 'in' }, height: { v: '12', u: 'in' } },
              { name: 'Herb ring', shape: 'circle', length: { v: '', u: 'ft' }, width: { v: '', u: 'ft' }, diameter: { v: '4', u: 'ft' }, depth: { v: '12', u: 'in' }, height: { v: '', u: 'in' } },
            ],
            allowance: '10',
            bag: { v: '1.5', u: 'cuft' },
            bagPrice: '8',
            bulk: { v: '45', u: 'cuyd' },
            cur: ctx.currency,
            mix: [{ n: 'Topsoil', p: '2' }, { n: 'Compost', p: '1' }, { n: '', p: '' }],
          }
        : {
            beds: [
              { name: 'Vegetable bed', shape: 'rect', length: { v: '2.4', u: 'm' }, width: { v: '1.2', u: 'm' }, diameter: { v: '', u: 'm' }, depth: { v: '25', u: 'cm' }, height: { v: '30', u: 'cm' } },
              { name: 'Herb ring', shape: 'circle', length: { v: '', u: 'm' }, width: { v: '', u: 'm' }, diameter: { v: '1.2', u: 'm' }, depth: { v: '30', u: 'cm' }, height: { v: '', u: 'cm' } },
            ],
            allowance: '10',
            bag: { v: '50', u: 'l' },
            bagPrice: '6',
            bulk: { v: '60', u: 'cum' },
            cur: ctx.currency,
            mix: [{ n: 'Topsoil', p: '2' }, { n: 'Compost', p: '1' }, { n: '', p: '' }],
          },
    getState: () => ({
      beds: beds.rows.map((r) => ({
        name: r.name.value,
        shape: r.shape.value,
        length: r.length.getState(),
        width: r.width.getState(),
        diameter: r.diameter.getState(),
        depth: r.depth.getState(),
        height: r.height.getState(),
      })),
      allowance: allowance.input.value,
      bag: bag.getState(),
      bagPrice: bagPrice.input.value,
      bulk: bulk.getState(),
      cur: cur.value,
      mix: mixRows.map((m) => ({ n: m.name.input.value, p: m.parts.input.value })),
      density: density.input.value,
      densityUnit: densityUnit.value,
    }),
    setState(s) {
      const list = Array.isArray(s.beds) && s.beds.length ? s.beds : tool.blank().beds;
      beds.reset(list.length).forEach((r, i) => {
        const b = list[i]!;
        r.name.value = b.name ?? '';
        r.shape.value = b.shape;
        r.length.setState(b.length);
        r.width.setState(b.width);
        r.diameter.setState(b.diameter);
        r.depth.setState(b.depth);
        r.height.setState(b.height);
        r.sync();
      });
      allowance.setState({ v: s.allowance ?? '' });
      bag.setState(s.bag);
      bagPrice.setState({ v: s.bagPrice ?? '' });
      bulk.setState(s.bulk);
      cur.value = s.cur ?? ctx.currency;
      mixRows.forEach((m, i) => {
        m.name.input.value = s.mix?.[i]?.n ?? '';
        m.parts.setState({ v: s.mix?.[i]?.p ?? '' });
      });
      density.setState({ v: s.density ?? '' });
      densityUnit.value = s.densityUnit ?? (system === 'imperial' ? 'lbcuft' : 'kgm3');
    },
    setSystem(next) {
      system = next;
      allFields().forEach((f) => f.setSystem(next));
      if (density.isEmpty) densityUnit.value = next === 'imperial' ? 'lbcuft' : 'kgm3';
    },
    update() {
      const issues = new Issues();
      const inputs: BedInput[] = [];
      const warnings: string[] = [];
      beds.rows.forEach((r, i) => {
        const where = `Bed ${i + 1}`;
        const circle = r.shape.value === 'circle';
        const length = circle ? undefined : take(r.length, issues, { required: true, where });
        const width = circle ? undefined : take(r.width, issues, { required: true, where });
        const diameter = circle ? take(r.diameter, issues, { required: true, where }) : undefined;
        const depth = take(r.depth, issues, { required: true, where });
        const height = take(r.height, issues, { required: false });
        if (depth !== undefined && height !== undefined && depth > height * (1 + 1e-9)) {
          warnings.push(
            `${esc(label(r, i))}: the depth of soil to add (${esc(r.depth.describe())}) is more than the wall height (${esc(r.height.describe())}). That is fine if you plan to mound the soil; otherwise re-check both measurements.`,
          );
        }
        inputs.push({ shape: r.shape.value, length, width, diameter, depth: depth ?? NaN });
      });
      const pct = take(allowance, issues, { required: false }) ?? 0;
      const bagVolume = take(bag, issues, { required: false });
      const price = take(bagPrice, issues, { required: false });
      const bulkPrice = take(bulk, issues, { required: false });
      if (price !== undefined && bagVolume === undefined && bag.isEmpty) {
        issues.fail(bag, 'Enter the bag size so the price per bag can be used.');
      }
      const mix: MixPart[] = [];
      mixRows.forEach((m, i) => {
        const parts = take(m.parts, issues, { required: false });
        const name = m.name.input.value.trim();
        if (parts !== undefined) mix.push({ name: name || `Ingredient ${i + 1}`, parts });
        else if (name && m.parts.isEmpty) issues.fail(m.parts, `Enter the parts for ${name}, or clear its name.`);
      });
      const dens = take(density, issues, { required: false });
      if (!issues.ok) {
        ctx.show(pendingHTML(issues, 'Enter the inside measurements of your bed and the depth of soil to add. Results appear here as you type.'));
        return false;
      }
      const result = calculateSoil({ beds: inputs, allowancePct: pct, bagVolume, bagPrice: price, bulkPricePerM3: bulkPrice });
      const sym = cur.value;
      const imperial = SYSTEM_OF[(beds.rows[0]!.shape.value === 'circle' ? beds.rows[0]!.diameter : beds.rows[0]!.length).unit!] === 'imperial';
      const [main, alt]: [Unit, Unit] = imperial ? ['cuft', 'cuyd'] : ['l', 'cum'];
      const hasExtra = pct > 0;
      const many = beds.rows.length > 1;

      let html = headline(many ? `For ${beds.rows.length} beds you need` : 'You need', fmtUnit(result.totalVolume, main), `of soil (${fmtUnit(result.totalVolume, alt, 3)})`);
      html += stats(
        stat('Cubic feet', fmt(fromSI(result.totalVolume, 'cuft'), 2)),
        stat('Cubic yards', fmt(fromSI(result.totalVolume, 'cuyd'), 3)),
        stat('Litres', fmt(fromSI(result.totalVolume, 'l'), 1)),
        stat('Cubic metres', fmt(result.totalVolume, 3)),
      );
      html += `<p class="fine">${
        hasExtra
          ? `Base volume ${fmtUnit(result.baseVolume, main)} + ${fmt(pct, 2)}% allowance ${fmtUnit(result.allowanceVolume, main)} = ${fmtUnit(result.totalVolume, main)}.`
          : `This is the base volume with no extra allowance.`
      }</p>`;
      if (hasExtra) {
        html += shareBar(
          [
            { label: `Base ${fmtUnit(result.baseVolume, main)}`, value: result.baseVolume, cls: 'bar-a' },
            { label: `Allowance ${fmtUnit(result.allowanceVolume, main)}`, value: result.allowanceVolume, cls: 'bar-b' },
          ],
          `Base volume ${fmtUnit(result.baseVolume, main)} plus allowance ${fmtUnit(result.allowanceVolume, main)}`,
        );
      }
      html += warnings.map(check).join('');

      if (result.bagsPooled !== undefined && bagVolume !== undefined) {
        const bagText = bag.describe();
        let body = stats(
          stat(many ? 'Bags, bought together' : 'Bags to buy', fmt(result.bagsPooled, 0), `${esc(bagText)} each`),
          ...(many ? [stat('Bags, rounded per bed', fmt(result.bagsPerBed!, 0), 'each bed rounded up on its own')] : []),
          ...(result.bagCostPooled !== undefined ? [stat('Bag cost', fmtMoney(result.bagCostPooled, sym), `${fmt(result.bagsPooled, 0)} × ${fmtMoney(price!, sym)}`)] : []),
        );
        const exact = result.totalVolume / bagVolume;
        body += `<p class="fine">${fmtUnit(result.totalVolume, bag.unit!)} ÷ ${esc(bagText)} = ${fmt(exact, 2)} bags, rounded up to ${plural(result.bagsPooled, 'whole bag')}. That buys ${fmtUnit(result.bagsPooled * bagVolume, bag.unit!)}, leaving about ${fmtUnit(Math.max(0, result.bagsPooled * bagVolume - result.totalVolume), bag.unit!)} spare.</p>`;
        if (many) {
          body += `<p class="fine"><strong>Bought together</strong> rounds up once, after adding all beds, so part-bags left over from one bed go into the next. <strong>Rounded per bed</strong> rounds each bed up separately${
            result.bagsPerBed! > result.bagsPooled
              ? `, which here means ${plural(result.bagsPerBed! - result.bagsPooled, 'extra bag')}${result.bagCostPerBed !== undefined ? ` (${fmtMoney(result.bagCostPerBed, sym)} in total)` : ''}`
              : '; for these beds both methods give the same count'
          }.</p>`;
        }
        html += block('Bags', body);
      }
      if (result.bulkCost !== undefined) {
        html += block(
          'Bulk estimate',
          stats(stat('Bulk cost', fmtMoney(result.bulkCost, sym), `${fmtUnit(result.totalVolume, bulk.unit!, 3)} × ${sym}${esc(bulk.describe())}`)) +
            `<p class="fine">Priced on the exact volume. Suppliers often sell in fixed steps and may add delivery, so ask how they round.</p>`,
        );
      }

      if (mix.length > 0) {
        const shares = splitMix(result.totalVolume, mix, bagVolume);
        const withBags = bagVolume !== undefined;
        html += block(
          'Soil mix',
          shareBar(shares.map((m, i) => ({ label: `${m.name} ${fmt(m.fraction * 100, 1)}%`, value: m.volume, cls: ['bar-a', 'bar-b', 'bar-c'][i]! })), 'Share of each ingredient in the mix') +
            table(
              'Volume of each ingredient',
              ['Ingredient', 'Share', 'Volume', ...(withBags ? [`Bags of ${esc(bag.describe())}`] : [])],
              shares.map((m) => [esc(m.name), `${fmt(m.fraction * 100, 1)}%`, `${fmtUnit(m.volume, main)} <span class="muted">(${fmtUnit(m.volume, alt, 3)})</span>`, ...(withBags ? [fmt(m.bags!, 0)] : [])]),
              withBags && shares.length > 1 ? ['Total', '', fmtUnit(result.totalVolume, main), fmt(shares.reduce((n, m) => n + m.bags!, 0), 0)] : undefined,
            ) +
            `<p class="fine">The total of ${fmtUnit(result.totalVolume, main)} is split in the proportions you entered${withBags ? '. Bags are rounded up for each ingredient separately, assuming every ingredient comes in the bag size above' : ''}. Blended ingredients can settle into less space than their separate volumes.</p>`,
        );
      }
      if (dens !== undefined) {
        const kg = weightKg(result.totalVolume, densityUnit.value === 'lbcuft' ? dens * LB_PER_CUFT : dens);
        const densText = `${density.describe()} ${densityUnit.value === 'lbcuft' ? 'lb per cu ft' : 'kg per m³'}`;
        html += block(
          'Weight',
          stats(stat('Pounds', fmt(kg / KG_PER_LB, 0)), stat('Kilograms', fmt(kg, 0)), stat('US tons', fmt(kg / KG_PER_LB / 2000, 2)), stat('Tonnes', fmt(kg / 1000, 2))) +
            `<p class="fine">${fmtUnit(result.totalVolume, densityUnit.value === 'lbcuft' ? 'cuft' : 'cum', 3)} × ${esc(densText)}. This uses only the density you entered. Real weight changes a lot with moisture.</p>`,
        );
      }

      // Per-bed breakdown
      const rows = beds.rows.map((r, i) => {
        const b = result.beds[i]!;
        const u = (r.shape.value === 'circle' ? r.diameter : r.length).unit!;
        const [a, v]: [Unit, Unit] = SYSTEM_OF[u] === 'imperial' ? ['sqft', 'cuft'] : ['sqm', 'l'];
        return [
          esc(label(r, i)),
          fmtUnit(b.area, a),
          esc(r.depth.describe()),
          fmtUnit(b.baseVolume, v),
          ...(hasExtra ? [fmtUnit(b.totalVolume, v)] : []),
          ...(bagVolume !== undefined ? [fmt(b.bags!, 0)] : []),
        ];
      });
      const head = ['Bed', 'Inside area', 'Depth added', 'Base volume', ...(hasExtra ? ['With allowance'] : []), ...(bagVolume !== undefined ? ['Bags if bought alone'] : [])];
      const foot = many
        ? ['Total', '', '', fmtUnit(result.baseVolume, main), ...(hasExtra ? [fmtUnit(result.totalVolume, main)] : []), ...(bagVolume !== undefined ? [fmt(result.bagsPerBed!, 0)] : [])]
        : undefined;
      const figures = beds.rows
        .map((r, i) => {
          const circle = r.shape.value === 'circle';
          const inp = inputs[i]!;
          const heightRead = r.height.read();
          const height = heightRead.kind === 'ok' ? heightRead.value : undefined;
          return `<figure class="figure"><figcaption>${esc(label(r, i))}</figcaption>${footprintDiagram({
            shape: r.shape.value,
            ratio: circle ? 1 : inp.length! / inp.width!,
            lengthLabel: r.length.describe(),
            widthLabel: r.width.describe(),
            diameterLabel: r.diameter.describe(),
            depthLabel: r.depth.describe(),
            depthCaption: 'soil to add',
            heightLabel: height !== undefined ? r.height.describe() : undefined,
            fillRatio: height !== undefined ? inp.depth / height : undefined,
            alt: circle
              ? `Circular bed ${r.diameter.describe()} across with ${r.depth.describe()} of soil to add`
              : `Rectangular bed ${r.length.describe()} by ${r.width.describe()} with ${r.depth.describe()} of soil to add`,
          })}</figure>`;
        })
        .join('');
      html += block('Breakdown by bed', table('Volume for each bed', head, rows, foot) + `<div class="figures">${figures}</div><p class="fine">Diagrams are not to scale. The labelled measurements are the ones used.</p>`);

      // Calculation steps
      const work = beds.rows.map((r, i) => {
        const inp = inputs[i]!;
        const b = result.beds[i]!;
        const u = (r.shape.value === 'circle' ? r.diameter : r.length).unit!;
        const [lu, vu]: [Unit, Unit] = SYSTEM_OF[u] === 'imperial' ? ['ft', 'cuft'] : ['m', 'cum'];
        const L = (m: number) => `${fmt(fromSI(m, lu), 4)} ${UNIT_LABEL[lu]}`;
        const formula =
          inp.shape === 'circle'
            ? `π × (${L(inp.diameter! / 2)})² × ${L(inp.depth)}`
            : `${L(inp.length!)} × ${L(inp.width!)} × ${L(inp.depth)}`;
        const converted = r.depth.unit !== lu ? ` <span class="muted">(depth ${esc(r.depth.describe())} = ${L(inp.depth)})</span>` : '';
        return `<strong>${esc(label(r, i))}:</strong> ${formula} = ${fmtUnit(b.baseVolume, vu, 4)}${vu === 'cum' ? ` = ${fmtUnit(b.baseVolume, 'l', 1)}` : ''}${converted}`;
      });
      if (many) work.push(`<strong>All beds:</strong> ${result.beds.map((b) => fmt(fromSI(b.baseVolume, main), 2)).join(' + ')} = ${fmtUnit(result.baseVolume, main)}`);
      if (hasExtra) work.push(`<strong>Allowance:</strong> ${fmtUnit(result.baseVolume, main)} × ${fmt(pct, 2)}% = ${fmtUnit(result.allowanceVolume, main)}, giving ${fmtUnit(result.totalVolume, main)} in total`);
      html += fold('How this was calculated', steps(work) + `<p class="fine">Rectangle: length × width × depth. Circle: π × radius² × depth. Figures are rounded for display only; the full values are carried through every step.</p>`);

      const used: [string, string][] = beds.rows.flatMap((r, i): [string, string][] => [
        [
          label(r, i),
          `${r.shape.value === 'circle' ? `circular, ${r.diameter.describe()} diameter` : `rectangular, ${r.length.describe()} × ${r.width.describe()}`}; soil to add ${r.depth.describe()}${r.height.isEmpty ? '' : `; wall height ${r.height.describe()}`}`,
        ],
      ]);
      used.push(['Extra allowance', hasExtra ? `${fmt(pct, 2)}%` : 'none']);
      if (bagVolume !== undefined) used.push(['Bag size', bag.describe()]);
      if (price !== undefined) used.push(['Price per bag', fmtMoney(price, sym)]);
      if (bulkPrice !== undefined) used.push(['Bulk price', `${sym}${bulk.describe()}`]);
      if (mix.length > 0) used.push(['Soil mix', mix.map((m) => `${m.name} ${fmt(m.parts, 2)}`).join(' : ')]);
      if (dens !== undefined) used.push(['Density', `${density.describe()} ${densityUnit.value === 'lbcuft' ? 'lb per cu ft' : 'kg per m³'}`]);
      html += fold('Inputs used', inputsUsed(used));
      html += fold(
        'Assumptions',
        bullets([
          'Measurements are inside the bed walls, and the bed has straight vertical sides and a level base.',
          'The depth is the depth of soil being added, not the wall height.',
          'Volume is loose volume as sold. Weight is shown only if you enter a density, because it depends on the product and how wet it is.',
          'Soil settles after watering. Any allowance is your own choice; none is added unless you enter one.',
          'Prices are the ones you entered and exclude delivery or tax unless you included them.',
        ]),
      );
      ctx.show(html, `${fmtUnit(result.totalVolume, main)}${result.bagsPooled !== undefined ? ` · ${plural(result.bagsPooled, 'bag')}` : ''}`);
      return true;
    },
  };
  return tool;

  function label(r: BedRow, i: number): string {
    const name = r.name.value.trim();
    return name ? `Bed ${i + 1} (${name})` : `Bed ${i + 1}`;
  }
});
