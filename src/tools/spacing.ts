// Plant spacing calculator: form and results. Maths lives in src/lib/spacing.ts.
import { fmt, fmtInput, fmtMoney, plural } from '../lib/format';
import { axisPositions, calculateSections, calculateSpacing, equilateralRowSpacing, otherDirection, planSquares, type AxisLayout, type RowDirection, type SectionLayout, type SpacingInput, type SquareFit } from '../lib/spacing';
import { fromSI, UNIT_LABEL, type Unit, type UnitSystem } from '../lib/units';
import { seedsNeeded } from '../lib/seeds';
import { cropLegend, gridDiagram, MAX_DRAWN_PLANTS, spacingDiagram } from '../ui/diagram';
import { block, bullets, fold, headline, inputsUsed, stat, stats, steps, table } from '../ui/html';
import { checkField, encodePlan, esc, fieldset, grid, h, optionalGroup, textField, Issues, mountTool, NumField, pendingHTML, RowList, rowShell, selectField, take, type FieldState, type Row, type Tool } from '../ui/kit';

interface SpacingState {
  length: FieldState;
  width: FieldState;
  inRow: FieldState;
  betweenRows: FieldState;
  clearance: FieldState;
  direction: RowDirection;
  centre: boolean;
  stagger?: boolean;
  price?: string;
  crop?: string;
  seeds?: { per: string; germ: string; extra: string; packet: string };
  mode?: Mode;
  square?: FieldState;
  /** Crop 1's share of the bed: a length (rows) or a number of squares (grid). */
  share?: FieldState;
  squares?: string;
  more?: ExtraCropState[];
}

type Mode = 'rows' | 'grid';

interface ExtraCropState {
  name: string;
  inRow: FieldState;
  betweenRows: FieldState;
  share: FieldState;
  squares: string;
}

interface ExtraCropRow extends Row {
  name: HTMLInputElement;
  inRow: NumField;
  betweenRows: NumField;
  share: NumField;
  squares: NumField;
}

const LEN: Unit[] = ['ft', 'in', 'm', 'cm'];
const GAP: Unit[] = ['in', 'ft', 'cm', 'm'];

mountTool<SpacingState>('spacing', (ctx) => {
  let system: UnitSystem = ctx.system;
  const imp = () => system === 'imperial';
  const length = new NumField({ label: 'Bed length', units: LEN, unit: imp() ? 'ft' : 'm', help: 'The longer side, by convention. Either way round works.' });
  const width = new NumField({ label: 'Bed width', units: LEN, unit: imp() ? 'ft' : 'm' });
  const inRow = new NumField({ label: 'Spacing between plants in a row', noun: 'spacing between plants', units: GAP, unit: imp() ? 'in' : 'cm', help: 'Centre to centre, from your seed packet or plant label.' });
  const betweenRows = new NumField({ label: 'Spacing between rows', units: GAP, unit: imp() ? 'in' : 'cm', help: 'Centre of one row to centre of the next.' });
  const clearance = new NumField({ label: 'Edge clearance', units: GAP, unit: imp() ? 'in' : 'cm', allowZero: true, optional: true, placeholder: '0', help: 'Minimum distance from every bed edge to the nearest plant centre. Blank means 0: the first plant sits on the edge line.' });
  const direction = selectField<RowDirection>('Row direction', [['along-length', 'Rows run along the length'], ['along-width', 'Rows run across the width']]);
  const centreBox = h('input', { type: 'checkbox', id: 'centre-layout' });
  const centre = h('label', { class: 'check', for: 'centre-layout' }, centreBox, 'Centre the layout (share leftover space between both ends)');
  const stagger = checkField('Stagger alternate rows', 'Every second row starts half a spacing further along, so plants sit in the gaps of the row before.');
  stagger.input.id = 'stagger-rows';
  stagger.root.querySelector('label')!.setAttribute('for', 'stagger-rows');
  const evenBtn = h('button', { type: 'button', class: 'btn btn-quiet mt-2', text: 'Set row spacing for an even triangle pattern' });
  const evenHelp = h('p', { class: 'help', text: 'Sets the row spacing to 0.866 × the plant spacing, so every neighbour is the same distance away.' });
  const evenWrap = h('div', {}, evenBtn, evenHelp);
  evenBtn.addEventListener('click', () => {
    const p = inRow.read();
    if (p.kind !== 'ok') {
      inRow.touched = true;
      return ctx.refresh();
    }
    const u = inRow.unit!;
    betweenRows.setState({ v: fmtInput(Number(fromSI(equilateralRowSpacing(p.value), u).toFixed(3))), u });
    ctx.refresh();
  });
  const price = new NumField({ label: 'Price per plant', allowZero: true, optional: true, help: `In ${ctx.currency}. Used only to estimate the cost of filling every position.` });

  const crop = textField('Crop', { placeholder: 'e.g. Lettuce', optional: true });
  const mode = selectField<Mode>('Layout', [['rows', 'Rows'], ['grid', 'Square-foot grid']], 'Rows: plants in straight rows at the packet spacing. Square-foot grid: the bed is divided into equal squares and each square is planted on its own.');
  const square = new NumField({ label: 'Square size', units: GAP, unit: imp() ? 'in' : 'cm', help: 'The side of each grid square. Square-foot gardens use 12 in; metric grids often use 30 cm.' });
  const lenHelp = 'Blank on one crop means whatever length is left.';
  const share = new NumField({ label: 'Length of bed for this crop', noun: 'length for crop 1', units: LEN, unit: imp() ? 'ft' : 'm', optional: true, help: lenHelp });
  const squaresField = new NumField({ label: 'Squares for this crop', noun: 'squares for crop 1', wholeNumber: true, optional: true, help: 'Blank on one crop means every square left.' });
  const makeExtra = (): ExtraCropRow => {
    const name = textField('Crop', { placeholder: 'e.g. Carrots', optional: true });
    const p = new NumField({ label: 'Spacing between plants in a row', noun: 'spacing between plants', units: GAP, unit: imp() ? 'in' : 'cm', help: 'Centre to centre, from the packet.' });
    const q = new NumField({ label: 'Spacing between rows', units: GAP, unit: imp() ? 'in' : 'cm' });
    const len = new NumField({ label: 'Length of bed for this crop', noun: 'length for this crop', units: LEN, unit: imp() ? 'ft' : 'm', optional: true, help: lenHelp });
    const sq = new NumField({ label: 'Squares for this crop', noun: 'squares for this crop', wholeNumber: true, optional: true, help: 'Blank on one crop means every square left.' });
    const shell = rowShell(grid(name.root), grid(p.root, q.root), grid(len.root, sq.root));
    const row: ExtraCropRow = { ...shell, name: name.input, inRow: p, betweenRows: q, share: len, squares: sq };
    syncRow(row);
    return row;
  };
  const extras = new RowList<ExtraCropRow>('crop', makeExtra, () => {
    syncMode();
    ctx.refresh();
  }, 7, { first: 2, min: 0 });
  /** Show only the inputs that apply to the chosen layout and number of crops. */
  function syncRow(r: { betweenRows: NumField; share: NumField; squares: NumField }) {
    const isGrid = mode.value === 'grid';
    r.betweenRows.root.hidden = isGrid;
    r.share.root.hidden = isGrid;
    r.squares.root.hidden = !isGrid;
  }
  const rowsOnly: HTMLElement[] = [];
  function syncMode() {
    const isGrid = mode.value === 'grid';
    square.root.hidden = !isGrid;
    rowsOnly.forEach((el) => (el.hidden = isGrid));
    betweenRows.root.hidden = isGrid;
    const many = extras?.rows.length > 0;
    share.root.hidden = isGrid || !many;
    squaresField.root.hidden = !isGrid || !many;
    crop1Title.textContent = many ? 'Crop 1' : 'Crop';
    extras?.rows.forEach(syncRow);
  }
  mode.select.addEventListener('change', () => {
    if (mode.value === 'grid' && square.isEmpty) square.setState({ v: imp() ? '12' : '30', u: imp() ? 'in' : 'cm' });
    syncMode();
  });
  const crop1Title = h('legend', { class: 'group-legend', text: 'Crop' });
  const perSpot = new NumField({ label: 'Seeds sown at each position', noun: 'seeds per position', wholeNumber: true, max: 50, optional: true, placeholder: '1', help: 'Blank means 1. Use 2 or more if you sow several and thin to the strongest.' });
  const germ = new NumField({ label: 'Germination rate', suffix: '%', max: 100, optional: true, help: 'From the seed packet, if it gives one.' });
  const extra = new NumField({ label: 'Extra for losses', suffix: '%', allowZero: true, max: 200, optional: true, placeholder: '0', help: 'Your own margin for pests, thinning or re-sowing. Blank means none.' });
  const perPacket = new NumField({ label: 'Seeds per packet', wholeNumber: true, optional: true, help: 'From the packet, to work out how many packets to buy.' });

  const rowSettings = fieldset('Rows', grid(clearance.root, direction.root), centre);
  const pattern = fieldset('Pattern', stagger.root, evenWrap);
  rowsOnly.push(rowSettings, pattern);
  ctx.form.append(
    fieldset('Bed', grid(length.root, width.root), grid(mode.root, square.root)),
    h('h2', { class: 'sr-only', text: 'Crops' }),
    h('fieldset', { class: 'group' }, crop1Title, grid(crop.root), grid(inRow.root, betweenRows.root), grid(share.root, squaresField.root)),
    h('div', { class: 'mt-3', 'data-crops': '' }, extras.root),
    rowSettings,
    pattern,
    optionalGroup('Seeds needed', 'Seeds and packets from the germination rate', grid(perSpot.root, germ.root), grid(extra.root, perPacket.root)),
    optionalGroup('Cost', 'Price per plant, to cost a full bed', grid(price.root)),
  );
  const syncStagger = () => (evenWrap.hidden = !stagger.input.checked);
  stagger.input.addEventListener('change', syncStagger);

  const fields = () => [length, width, inRow, betweenRows, clearance, square, share, ...extras.rows.flatMap((r) => [r.inRow, r.betweenRows, r.share])];
  const blank = (): SpacingState => ({
    length: { v: '', u: imp() ? 'ft' : 'm' },
    width: { v: '', u: imp() ? 'ft' : 'm' },
    inRow: { v: '', u: imp() ? 'in' : 'cm' },
    betweenRows: { v: '', u: imp() ? 'in' : 'cm' },
    clearance: { v: '', u: imp() ? 'in' : 'cm' },
    direction: 'along-length',
    centre: false,
    stagger: false,
    price: '',
    crop: '',
    seeds: { per: '', germ: '', extra: '', packet: '' },
    mode: 'rows',
    square: { v: '', u: imp() ? 'in' : 'cm' },
    share: { v: '', u: imp() ? 'ft' : 'm' },
    squares: '',
    more: [],
  });

  ctx.results.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-switch]')) {
      direction.value = otherDirection(direction.value);
      ctx.refresh();
      ctx.results.querySelector<HTMLElement>('[data-switch]')?.focus();
    }
  });

  const tool: Tool<SpacingState> = {
    blank,
    example: () =>
      imp()
        ? { ...blank(), length: { v: '8', u: 'ft' }, width: { v: '4', u: 'ft' }, inRow: { v: '12', u: 'in' }, betweenRows: { v: '18', u: 'in' }, clearance: { v: '6', u: 'in' } }
        : { ...blank(), length: { v: '2.4', u: 'm' }, width: { v: '1.2', u: 'm' }, inRow: { v: '30', u: 'cm' }, betweenRows: { v: '45', u: 'cm' }, clearance: { v: '15', u: 'cm' } },
    getState: () => ({
      length: length.getState(),
      width: width.getState(),
      inRow: inRow.getState(),
      betweenRows: betweenRows.getState(),
      clearance: clearance.getState(),
      direction: direction.value,
      centre: centreBox.checked,
      stagger: stagger.input.checked,
      price: price.input.value,
      crop: crop.input.value,
      seeds: { per: perSpot.input.value, germ: germ.input.value, extra: extra.input.value, packet: perPacket.input.value },
      mode: mode.value,
      square: square.getState(),
      share: share.getState(),
      squares: squaresField.input.value,
      more: extras.rows.map((r) => ({ name: r.name.value, inRow: r.inRow.getState(), betweenRows: r.betweenRows.getState(), share: r.share.getState(), squares: r.squares.input.value })),
    }),
    setState(s) {
      length.setState(s.length);
      width.setState(s.width);
      inRow.setState(s.inRow);
      betweenRows.setState(s.betweenRows);
      clearance.setState(s.clearance);
      direction.value = s.direction ?? 'along-length';
      centreBox.checked = Boolean(s.centre);
      stagger.input.checked = Boolean(s.stagger);
      price.setState({ v: s.price ?? '' });
      crop.input.value = s.crop ?? '';
      perSpot.setState({ v: s.seeds?.per ?? '' });
      germ.setState({ v: s.seeds?.germ ?? '' });
      extra.setState({ v: s.seeds?.extra ?? '' });
      perPacket.setState({ v: s.seeds?.packet ?? '' });
      mode.value = s.mode ?? 'rows';
      square.setState(s.square);
      share.setState(s.share);
      squaresField.setState({ v: s.squares ?? '' });
      const more = Array.isArray(s.more) ? s.more : [];
      extras.reset(more.length).forEach((r, i) => {
        const m = more[i]!;
        r.name.value = m.name ?? '';
        r.inRow.setState(m.inRow);
        r.betweenRows.setState(m.betweenRows);
        r.share.setState(m.share);
        r.squares.setState({ v: m.squares ?? '' });
      });
      syncStagger();
      syncMode();
    },
    setSystem(next) {
      system = next;
      fields().forEach((f) => f.setSystem(next));
    },
    update() {
      const issues = new Issues();
      const isGrid = mode.value === 'grid';
      const L = take(length, issues, { required: true });
      const W = take(width, issues, { required: true });
      const p = take(inRow, issues, { required: true, where: extras.rows.length ? 'Crop 1' : undefined });
      const q = isGrid ? 0 : take(betweenRows, issues, { required: true, where: extras.rows.length ? 'Crop 1' : undefined });
      const c = take(clearance, issues, { required: false }) ?? 0;
      const unitPrice = take(price, issues, { required: false });
      const k = take(perSpot, issues, { required: false });
      const g = take(germ, issues, { required: false });
      const x = take(extra, issues, { required: false });
      const pk = take(perPacket, issues, { required: false });
      const wantSeeds = [k, g, x, pk].some((v) => v !== undefined);
      if (isGrid || extras.rows.length > 0 || !share.isEmpty) {
        return multi(issues, { L, W, p, q, c, unitPrice, seeds: wantSeeds ? { k, g, x, pk } : undefined });
      }
      if (!issues.ok || L === undefined || W === undefined || p === undefined || q === undefined) {
        ctx.show(pendingHTML(issues, 'Enter the bed size and the spacing from your seed packet or plant label. The plan appears here as you type.'));
        return false;
      }
      const input: SpacingInput = { length: L, width: W, inRow: p, betweenRows: q, clearance: c, direction: direction.value, centre: centreBox.checked, stagger: stagger.input.checked };
      const lay = calculateSpacing(input);
      const other = calculateSpacing({ ...input, direction: otherDirection(input.direction) });
      const along = input.direction === 'along-length';
      const dirText = (d: RowDirection) => (d === 'along-length' ? 'rows along the length' : 'rows across the width');
      const pu = inRow.unit!;
      const qu = betweenRows.unit!;
      const D = (m: number, u: Unit) => `${fmt(fromSI(m, u), 2)} ${UNIT_LABEL[u]}`;
      const plantDim = along ? 'length' : 'width';
      const rowDim = along ? 'width' : 'length';

      const rowsText = (l: typeof lay) =>
        l.offsetAxis && l.offsetRows > 0 && l.offsetAxis.count !== l.perRow
          ? `${plural(l.rows, 'row')} (${fmt(l.fullRows, 0)} of ${fmt(l.perRow, 0)} and ${fmt(l.offsetRows, 0)} of ${fmt(l.offsetAxis.count, 0)})`
          : `${plural(l.rows, 'row')} of ${fmt(l.perRow, 0)}`;
      const compare = `<div class="notice"><p><strong>Other direction:</strong> ${dirText(otherDirection(input.direction))} gives ${rowsText(other)} = <strong>${plural(other.total, 'position')}</strong>${
        other.total === lay.total ? ', the same count' : other.total > lay.total ? `, ${fmt(other.total - lay.total, 0)} more` : `, ${fmt(lay.total - other.total, 0)} fewer`
      }.</p><p class="mt-2 no-print"><button type="button" class="btn btn-secondary" data-switch>Switch row direction</button></p></div>`;

      const used: [string, string][] = [
        ['Bed', `${length.describe()} long × ${width.describe()} wide`],
        ['Between plants', `${inRow.describe()}, centre to centre`],
        ['Between rows', `${betweenRows.describe()}, centre to centre`],
        ['Edge clearance', clearance.isEmpty ? '0 (none)' : clearance.describe()],
        ['Row direction', dirText(input.direction)],
        ['Leftover space', input.centre ? 'shared between both ends' : 'left at the far end'],
        ['Pattern', input.stagger ? 'alternate rows staggered by half a spacing' : 'straight grid'],
      ];
      if (unitPrice !== undefined) used.push(['Price per plant', fmtMoney(unitPrice, ctx.currency)]);
      const cropName = crop.input.value.trim();
      if (cropName) used.unshift(['Crop', cropName]);
      if (wantSeeds) used.push(['Seeds', `${k ?? 1} per position${g !== undefined ? `; ${fmt(g, 1)}% germination` : ''}${x ? `; ${fmt(x, 1)}% extra` : ''}${pk !== undefined ? `; ${fmt(pk, 0)} per packet` : ''}`]);

      if (lay.total === 0) {
        const why: string[] = [];
        const tooSmall = (axis: AxisLayout, dim: string, u: Unit) => {
          if (axis.count === 0) why.push(`The bed ${dim} is ${D(axis.total, u)}, but edge clearance takes ${D(2 * c, u)} (two edges), leaving no room for a plant centre.`);
        };
        tooSmall(lay.plantAxis, plantDim, pu);
        tooSmall(lay.rowAxis, rowDim, qu);
        ctx.show(
          `<div class="notice notice-warn"><p><span class="error-mark" aria-hidden="true">!</span><strong>No plant positions fit with these settings.</strong></p>${bullets(why)}<p class="mt-2">Reduce the edge clearance or check the bed size.</p></div>` +
          (other.total > 0 ? compare : '') +
          block('Inputs used', inputsUsed(used)),
        );
        return true;
      }

      const off = lay.offsetAxis;
      const uneven = off !== undefined && lay.offsetRows > 0 && off.count !== lay.perRow;
      let html = headline('This bed fits', plural(lay.total, 'plant position'), `in ${rowsText(lay)}`);
      html += stats(
        stat('Rows', fmt(lay.rows, 0), dirText(input.direction)),
        stat('Plants per row', uneven ? `${fmt(lay.perRow, 0)} / ${fmt(off!.count, 0)}` : fmt(lay.perRow, 0), uneven ? 'full rows / staggered rows' : ''),
        stat('Total positions', fmt(lay.total, 0)),
        ...(unitPrice !== undefined ? [stat('Plant cost', fmtMoney(lay.total * unitPrice, ctx.currency), `${fmt(lay.total, 0)} × ${fmtMoney(unitPrice, ctx.currency)}`)] : []),
      );
      if (input.stagger) {
        const grid = calculateSpacing({ ...input, stagger: false });
        const diag = Math.hypot(p / 2, q);
        html += `<p class="fine">Staggered pattern: ${fmt(lay.total, 0)} positions, against ${fmt(grid.total, 0)} in a straight grid with the same spacings. Nearest plants in neighbouring rows are ${D(diag, pu)} apart, centre to centre${diag < p * (1 - 1e-9) ? `, which is closer than the ${esc(inRow.describe())} between plants in a row` : ''}.</p>`;
      }
      html += compare;

      if (wantSeeds) {
        const roundUp = (exact: number, whole: number) => (Math.abs(exact - whole) < 1e-9 ? fmt(whole, 0) : `${fmt(exact, 2)}, rounded up to ${fmt(whole, 0)}`);
        const sd = seedsNeeded({ positions: lay.total, perSpot: k ?? 1, germination: g !== undefined ? g / 100 : undefined, extraPct: x ?? 0, perPacket: pk });
        const how =
          (k ?? 1) === 1 && g !== undefined
            ? `${fmt(lay.total, 0)} positions ÷ ${fmt(g, 1)}% germination${x ? ` × ${fmt(1 + x / 100, 3)} extra` : ''} = ${roundUp(sd.exact, sd.seeds)}. Sowing one seed per position, this is enough for one plant per position on average; some positions will still need filling.`
            : `${fmt(lay.total, 0)} positions × ${fmt(k ?? 1, 0)} ${(k ?? 1) === 1 ? 'seed' : 'seeds'}${x ? ` × ${fmt(1 + x / 100, 3)} extra` : ''} = ${roundUp(sd.exact, sd.seeds)}.${
                sd.emptyChance !== undefined
                  ? ` At ${fmt(g!, 1)}% germination, the chance a position gets no seedling is ${fmt(sd.emptyChance * 100, 2)}%, so expect about ${fmt(sd.emptySpots!, 1)} empty ${sd.emptySpots! >= 0.95 && sd.emptySpots! < 1.05 ? 'position' : 'positions'} to re-sow.`
                  : (k ?? 1) === 1
                    ? ' Add a germination rate to cover seeds that do not come up.'
                    : ''
              }`;
        html += block(
          'Seeds needed',
          stats(
            stat('Seeds', fmt(sd.seeds, 0), cropName ? esc(cropName) : `${fmt(k ?? 1, 0)} per position`),
            ...(sd.packets !== undefined ? [stat('Packets', fmt(sd.packets, 0), `${fmt(pk!, 0)} seeds each`)] : []),
          ) + `<p class="fine">${how} Germination rates on packets are measured in good conditions; outdoors it is often lower.</p>`,
        );
      }

      const tooMany = lay.total > MAX_DRAWN_PLANTS;
      html += block(
        'Layout plan',
        `<figure class="figure">${spacingDiagram({
          length: L,
          width: W,
          clearance: c,
          rowsAlongLength: along,
          layout: lay,
          lengthLabel: `${length.describe()} (length)`,
          widthLabel: `${width.describe()} (width)`,
          alt: `Top-down plan of a bed ${length.describe()} by ${width.describe()} with ${lay.rows} rows of ${lay.perRow} plants`,
        })}</figure><p class="fine">Top-down view, drawn in proportion to your measurements. Each dot is a plant centre${c > 0 ? '; the dashed line is the edge clearance' : ''}. ${
          tooMany ? `With more than ${fmt(MAX_DRAWN_PLANTS, 0)} positions, only the row lines are drawn. ` : ''
        }A printed copy is not true to scale, so mark out the bed from the measurements below.</p>`,
      );

      const axisRow = (name: string, axis: AxisLayout, u: Unit) => [
        name,
        D(axis.first, u),
        axis.count > 1 ? D(axis.spacing, u) : '–',
        D(axis.last, u),
        D(axis.total - axis.last, u),
      ];
      const list = (axis: AxisLayout, u: Unit) =>
        axis.count <= 40 ? axisPositions(axis).map((v) => fmt(fromSI(v, u), 2)).join(', ') + ` ${UNIT_LABEL[u]}` : `${fmt(axis.count, 0)} marks, every ${D(axis.spacing, u)} from ${D(axis.first, u)}`;
      html += block(
        'Measurements for marking out',
        table(
          'Where to mark rows and plants',
          ['Marks', 'First centre', 'Then every', 'Last centre', 'Gap after last'],
          [
            axisRow(`Rows (${fmt(lay.rows, 0)}), measured across the ${rowDim}`, lay.rowAxis, qu),
            axisRow(`Plants (${fmt(lay.perRow, 0)} per row${off ? ', rows 1, 3, 5…' : ''}), measured along the ${plantDim}`, lay.plantAxis, pu),
            ...(off && off.count > 0 ? [axisRow(`Plants (${fmt(off.count, 0)} per row, rows 2, 4, 6…), measured along the ${plantDim}`, off, pu)] : []),
          ],
        ) +
          `<p class="fine"><strong>Row centres</strong> from one ${along ? 'long side' : 'end'}: ${list(lay.rowAxis, qu)}.</p><p class="fine"><strong>Plant centres</strong> along ${off ? 'rows 1, 3, 5…' : 'each row'}, from one ${along ? 'end' : 'long side'}: ${list(lay.plantAxis, pu)}.</p>${
            off && off.count > 0 ? `<p class="fine"><strong>Plant centres</strong> along rows 2, 4, 6…: ${list(off, pu)}.</p>` : off ? `<p class="fine">Rows 2, 4, 6… have no room for a staggered plant inside the edge clearance.</p>` : ''
          }`,
      );

      const stepText = (axis: AxisLayout, dim: string, u: Unit, what: string) =>
        `<strong>${what}:</strong> ${dim} ${D(axis.total, u)} − 2 × ${D(c, u)} clearance = ${D(axis.usable, u)} usable. ${D(axis.usable, u)} ÷ ${D(axis.spacing, u)} = ${fmt(axis.usable / axis.spacing, 2)}, so ${fmt(axis.count - 1, 0)} full ${axis.count - 1 === 1 ? 'step' : 'steps'} + the first position = ${fmt(axis.count, 0)}${axis.leftover > 1e-9 ? `, with ${D(axis.leftover, u)} left over` : ', an exact fit'}.`;
      html += fold(
        'How this was calculated',
        steps([
          stepText(lay.plantAxis, plantDim, pu, 'Plants per row'),
          stepText(lay.rowAxis, rowDim, qu, 'Rows'),
          ...(off
            ? [
                `<strong>Staggered rows:</strong> first centre moves along by half of ${D(lay.plantAxis.spacing, pu)} to ${D(off.first, pu)}; the last centre must stay ${D(c, pu)} inside the far edge, so ${fmt(off.count, 0)} fit.`,
                `<strong>Total:</strong> ${fmt(lay.fullRows, 0)} × ${fmt(lay.perRow, 0)} + ${fmt(lay.offsetRows, 0)} × ${fmt(off.count, 0)} = ${fmt(lay.total, 0)} positions.`,
              ]
            : [`<strong>Total:</strong> ${fmt(lay.rows, 0)} × ${fmt(lay.perRow, 0)} = ${fmt(lay.total, 0)} positions.`]),
        ]) +
          `<p class="fine">The first plant centre is placed ${c > 0 ? `exactly at the edge clearance (${esc(clearance.describe())}) from the edge` : 'on the bed edge line, because no edge clearance was entered'}${input.centre ? ', then moved in by half of any leftover space' : ''}. Positions are counted along each side separately; the bed area is never divided by an area per plant.</p>`,
      );
      html += fold('Inputs used', inputsUsed(used));
      html += fold(
        'Assumptions',
        bullets([
          'Spacing is measured centre to centre, in straight, evenly spaced rows. Staggering only shifts every second row along by half a spacing.',
          'Edge clearance applies equally to all four sides.',
          'The bed is a rectangle. Positions are places a plant could go, not a planting recommendation.',
          'Spacing comes from your seed packet or plant label. Prunest does not supply spacing for any plant.',
        ]),
      );
      const schedule = encodePlan({ refs: [{ date: '', kind: 'last-frost', custom: '' }], crops: [{ name: cropName, activity: 'indoors', from: '', to: '', unit: 'weeks', direction: 'before', ref: 0 }] });
      html += `<p class="no-print mt-6"><a class="btn btn-secondary" href="/seed-starting-calculator#plan=${schedule}">${cropName ? `Make a sowing schedule for ${esc(cropName)}` : 'Make a sowing schedule for these plants'}</a></p>`;
      ctx.show(html, `${plural(lay.total, 'position')} · ${plural(lay.rows, 'row')}`);
      return true;
    },
  };

  type SeedSettings = { k?: number; g?: number; x?: number; pk?: number };
  const D = (m: number, u: Unit) => `${fmt(fromSI(m, u), 2)} ${UNIT_LABEL[u]}`;
  const seedCells = (positions: number, sd?: SeedSettings) => {
    if (!sd) return [];
    const r = seedsNeeded({ positions, perSpot: sd.k ?? 1, germination: sd.g !== undefined ? sd.g / 100 : undefined, extraPct: sd.x ?? 0, perPacket: sd.pk });
    return [fmt(r.seeds, 0), ...(sd.pk !== undefined ? [fmt(r.packets!, 0)] : [])];
  };
  const seedHead = (sd?: SeedSettings) => (sd ? ['Seeds', ...(sd.pk !== undefined ? ['Packets'] : [])] : []);
  const seedNote = (sd?: SeedSettings) =>
    sd
      ? `<p class="fine">Seeds for each crop use the same settings: ${fmt(sd.k ?? 1, 0)} per position${sd.g !== undefined ? `, ${fmt(sd.g, 1)}% germination${(sd.k ?? 1) === 1 ? ' (positions ÷ germination rate)' : ''}` : ''}${sd.x ? `, ${fmt(sd.x, 1)}% extra` : ''}${sd.pk !== undefined ? `, ${fmt(sd.pk, 0)} seeds per packet` : ''}. For crops with different germination rates, work them out one at a time.</p>`
      : '';
  const scheduleLink = (names: string[]) => {
    const list = names.filter(Boolean);
    const plan = encodePlan({
      refs: [{ date: '', kind: 'last-frost', custom: '' }],
      crops: (list.length ? list : ['']).map((name) => ({ name, activity: 'indoors', from: '', to: '', unit: 'weeks', direction: 'before', ref: 0 })),
    });
    return `<p class="no-print mt-6"><a class="btn btn-secondary" href="/seed-starting-calculator#plan=${plan}">${list.length ? `Make a sowing schedule for ${esc(list.join(', '))}` : 'Make a sowing schedule for these plants'}</a></p>`;
  };

  function multi(issues: Issues, v: { L?: number; W?: number; p?: number; q?: number; c: number; unitPrice?: number; seeds?: SeedSettings }): boolean {
    const isGrid = mode.value === 'grid';
    const names = [crop.input.value.trim(), ...extras.rows.map((r) => r.name.value.trim())];
    const label = (i: number) => names[i] || `Crop ${i + 1}`;
    type C = { p?: number; q?: number; len?: number; squares?: number; lenField: NumField; sqField: NumField; inRowField: NumField; rowField: NumField };
    const crops: C[] = [
      { p: v.p, q: v.q, len: isGrid ? undefined : take(share, issues, { required: false }), squares: isGrid ? take(squaresField, issues, { required: false }) : undefined, lenField: share, sqField: squaresField, inRowField: inRow, rowField: betweenRows },
      ...extras.rows.map((r, i) => {
        const where = `Crop ${i + 2}`;
        return {
          p: take(r.inRow, issues, { required: true, where }),
          q: isGrid ? 0 : take(r.betweenRows, issues, { required: true, where }),
          len: isGrid ? undefined : take(r.share, issues, { required: false }),
          squares: isGrid ? take(r.squares, issues, { required: false }) : undefined,
          lenField: r.share,
          sqField: r.squares,
          inRowField: r.inRow,
          rowField: r.betweenRows,
        };
      }),
    ];
    const sq = isGrid ? take(square, issues, { required: true }) : undefined;
    const ready = issues.ok && v.L !== undefined && v.W !== undefined && crops.every((c) => c.p !== undefined && c.q !== undefined) && (!isGrid || sq !== undefined);
    if (!ready) {
      ctx.show(pendingHTML(issues, isGrid ? 'Enter the bed size, square size and the spacing for each crop. The grid appears here as you type.' : 'Enter the bed size and the spacing for each crop. The plan appears here as you type.'));
      return false;
    }
    const L = v.L!;
    const W = v.W!;
    const sd = v.seeds;
    const money = (n: number) => fmtMoney(n, ctx.currency);
    const used: [string, string][] = [['Bed', `${length.describe()} long × ${width.describe()} wide`], ['Layout', isGrid ? `square-foot grid, ${square.describe()} squares` : 'rows, one section of the bed length per crop']];

    if (isGrid) {
      const plan = planSquares(L, W, sq!, crops.map((c) => ({ spacing: c.p!, squares: c.squares })));
      if (plan.problem) {
        const lastAsked = [...crops].reverse().find((c) => (plan.problem === 'two-rest' ? c.squares === undefined : c.squares !== undefined))!;
        issues.fail(
          lastAsked.sqField,
          plan.problem === 'two-rest'
            ? 'Only one crop can take the squares that are left. Enter a number of squares for this crop.'
            : `The crops ask for ${fmt(plan.squares + plan.over!, 0)} squares, but the bed has ${fmt(plan.squares, 0)} whole squares.`,
        );
        ctx.show(pendingHTML(issues, ''));
        return false;
      }
      if (plan.squares === 0) {
        ctx.show(`<div class="notice notice-warn"><p><span class="error-mark" aria-hidden="true">!</span><strong>No whole squares fit.</strong> The bed is ${esc(length.describe())} × ${esc(width.describe())} and each square is ${esc(square.describe())}. Use smaller squares or check the bed size.</p></div>`);
        return true;
      }
      const su = square.unit!;
      const perText = (f: SquareFit) => (f.blockSide > 1 ? `1 per ${f.blockSide} × ${f.blockSide} squares` : `${fmt(f.perSquare, 0)} per square (${f.perSide} × ${f.perSide})`);
      let html = headline('This bed fits', plural(plan.plants, 'plant'), `in ${plural(plan.squares, 'square')} of ${esc(square.describe())} (${plan.cols} × ${plan.rows})`);
      html += stats(
        stat('Squares', fmt(plan.squares, 0), `${plan.cols} along the length, ${plan.rows} across`),
        stat('Squares used', fmt(plan.squares - plan.free, 0), plan.free ? `${fmt(plan.free, 0)} left empty` : 'all of them'),
        stat('Plants', fmt(plan.plants, 0)),
        ...(v.unitPrice !== undefined ? [stat('Plant cost', money(plan.plants * v.unitPrice), `${fmt(plan.plants, 0)} × ${money(v.unitPrice)}`)] : []),
      );
      const short = plan.crops.map((pc, i) => (pc.used < pc.asked ? `${esc(label(i))} asked for ${plural(pc.asked, 'square')} but got ${fmt(pc.used, 0)}: plants this wide need whole blocks of ${pc.fit.blockSide} × ${pc.fit.blockSide} squares.` : '')).filter(Boolean);
      if (short.length) html += short.map((t) => `<div class="notice notice-warn"><p><span class="error-mark" aria-hidden="true">!</span><strong>Check:</strong> ${t}</p></div>`).join('');
      html += block(
        'Crops',
        table(
          'Plants for each crop',
          ['Crop', 'Spacing', 'Per square', 'Squares', 'Plants', ...seedHead(sd), ...(v.unitPrice !== undefined ? ['Cost'] : [])],
          plan.crops.map((pc, i) => [esc(label(i)), esc(crops[i]!.inRowField.describe()), perText(pc.fit), fmt(pc.used, 0), fmt(pc.plants, 0), ...seedCells(pc.plants, sd), ...(v.unitPrice !== undefined ? [money(pc.plants * v.unitPrice)] : [])]),
          plan.crops.length > 1 ? ['Total', '', '', fmt(plan.squares - plan.free, 0), fmt(plan.plants, 0), ...(sd ? seedCells(0, sd).map(() => '') : []), ...(v.unitPrice !== undefined ? [money(plan.plants * v.unitPrice)] : [])] : undefined,
        ) + seedNote(sd),
      );
      html += block(
        'Grid plan',
        `<figure class="figure">${gridDiagram({
          length: L,
          width: W,
          square: sq!,
          cols: plan.cols,
          rows: plan.rows,
          crops: plan.crops.map((pc) => ({ cells: pc.cells, perSide: pc.fit.perSide, blockSide: pc.fit.blockSide })),
          lengthLabel: `${length.describe()} (length)`,
          widthLabel: `${width.describe()} (width)`,
          alt: `Grid of ${plan.cols} by ${plan.rows} squares with ${plan.plants} plants from ${plan.crops.length} ${plan.crops.length === 1 ? 'crop' : 'crops'}`,
        })}</figure>${cropLegend(plan.crops.map((_, i) => label(i)))}<p class="fine">Squares are counted from one corner. ${
          plan.spareLength > 1e-9 || plan.spareWidth > 1e-9
            ? `A strip ${plan.spareLength > 1e-9 ? `${D(plan.spareLength, su)} wide at the far end` : ''}${plan.spareLength > 1e-9 && plan.spareWidth > 1e-9 ? ' and ' : ''}${plan.spareWidth > 1e-9 ? `${D(plan.spareWidth, su)} wide along one side` : ''} is too small for a whole square and is not planted. `
            : 'The squares fill the bed exactly. '
        }A printed copy is not true to scale.</p>`,
      );
      html += fold(
        'How this was calculated',
        steps([
          `<strong>Squares:</strong> ${esc(length.describe())} ÷ ${esc(square.describe())} = ${fmt(L / sq!, 2)} → ${plan.cols} whole; ${esc(width.describe())} ÷ ${esc(square.describe())} = ${fmt(W / sq!, 2)} → ${plan.rows} whole; ${plan.cols} × ${plan.rows} = ${plan.squares} squares.`,
          ...plan.crops.map((pc, i) =>
            pc.fit.blockSide > 1
              ? `<strong>${esc(label(i))}:</strong> spacing ${esc(crops[i]!.inRowField.describe())} is wider than one square, so each plant takes a block of ${pc.fit.blockSide} × ${pc.fit.blockSide} = ${pc.fit.blockSide ** 2} squares; ${fmt(pc.used, 0)} squares → ${fmt(pc.plants, 0)} plants.`
              : `<strong>${esc(label(i))}:</strong> ${esc(square.describe())} ÷ ${esc(crops[i]!.inRowField.describe())} = ${fmt(sq! / crops[i]!.p!, 2)} → ${pc.fit.perSide} per side, ${pc.fit.perSide} × ${pc.fit.perSide} = ${pc.fit.perSquare} per square; × ${fmt(pc.used, 0)} squares = ${fmt(pc.plants, 0)} plants.`,
          ),
        ]) + `<p class="fine">Inside a square with <em>n</em> plants per side, centres sit at ½, 1½, 2½ … of square ÷ <em>n</em> from the square’s edge, so each plant gets an equal share of the square.</p>`,
      );
      crops.forEach((c, i) => used.push([label(i), `${c.inRowField.describe()} apart${c.squares !== undefined ? `, ${plural(c.squares, 'square')}` : ', the rest of the squares'}`]));
      if (v.unitPrice !== undefined) used.push(['Price per plant', money(v.unitPrice)]);
      html += fold('Inputs used', inputsUsed(used));
      html += fold(
        'Assumptions',
        bullets([
          'Only whole squares are planted, counted from one corner of the bed.',
          'Within a square, plants are spaced evenly in both directions. A spacing wider than a square takes a block of squares per plant.',
          'Spacing comes from your seed packet or plant label. Prunest does not supply spacing for any plant.',
        ]),
      );
      html += scheduleLink(names);
      ctx.show(html, `${plural(plan.plants, 'plant')} · ${plural(plan.squares, 'square')}`);
      return true;
    }

    // Rows, one section of the bed length per crop.
    const base = { length: L, width: W, clearance: v.c, direction: direction.value, centre: centreBox.checked, stagger: stagger.input.checked };
    const res = calculateSections({ ...base, sections: crops.map((c) => ({ inRow: c.p!, betweenRows: c.q!, length: c.len })) });
    if (!res.ok) {
      const target = [...crops].reverse().find((c) => (res.problem === 'two-rest' ? c.len === undefined : c.len !== undefined))!;
      issues.fail(
        target.lenField,
        res.problem === 'two-rest'
          ? 'Only one crop can take the rest of the bed. Enter a length for this crop.'
          : `The crop lengths add up to ${D(L + res.over!, length.unit!)}, more than the bed length of ${esc(length.describe())}.`,
      );
      ctx.show(pendingHTML(issues, ''));
      return false;
    }
    const other = calculateSections({ ...base, direction: otherDirection(base.direction), sections: crops.map((c) => ({ inRow: c.p!, betweenRows: c.q!, length: c.len })) });
    const along = base.direction === 'along-length';
    const lu = length.unit!;
    const secRange = (s: SectionLayout) => `${D(s.start, lu)} to ${D(s.start + s.length, lu)}`;
    const rowsOf = (s: SectionLayout) =>
      s.layout.offsetAxis && s.layout.offsetRows > 0 && s.layout.offsetAxis.count !== s.layout.perRow
        ? `${s.layout.rows} rows (${s.layout.perRow}/${s.layout.offsetAxis.count})`
        : `${s.layout.rows} × ${s.layout.perRow}`;
    let html = headline('This bed fits', plural(res.total, 'plant position'), `for ${plural(crops.length, 'crop')}`);
    html += stats(
      stat('Crops', fmt(crops.length, 0), along ? 'rows along the length' : 'rows across the width'),
      stat('Total positions', fmt(res.total, 0)),
      ...(res.unassigned > 1e-9 ? [stat('Length not used', D(res.unassigned, lu), 'at the far end')] : []),
      ...(v.unitPrice !== undefined ? [stat('Plant cost', money(res.total * v.unitPrice), `${fmt(res.total, 0)} × ${money(v.unitPrice)}`)] : []),
    );
    if (other.ok) {
      html += `<div class="notice"><p><strong>Other direction:</strong> ${along ? 'rows across the width' : 'rows along the length'} gives <strong>${plural(other.total, 'position')}</strong>${
        other.total === res.total ? ', the same count' : other.total > res.total ? `, ${fmt(other.total - res.total, 0)} more` : `, ${fmt(res.total - other.total, 0)} fewer`
      }.</p><p class="mt-2 no-print"><button type="button" class="btn btn-secondary" data-switch>Switch row direction</button></p></div>`;
    }
    const empty = res.sections.map((s, i) => (s.layout.total === 0 ? label(i) : '')).filter(Boolean);
    if (empty.length) html += `<div class="notice notice-warn"><p><span class="error-mark" aria-hidden="true">!</span><strong>Check:</strong> no positions fit for ${esc(empty.join(', '))}. Give ${empty.length === 1 ? 'it' : 'them'} more of the bed length or reduce the edge clearance.</p></div>`;
    html += block(
      'Crops',
      table(
        'Positions for each crop',
        ['Crop', 'Part of the bed', 'Rows × plants', 'Positions', ...seedHead(sd), ...(v.unitPrice !== undefined ? ['Cost'] : [])],
        res.sections.map((s, i) => [esc(label(i)), secRange(s), rowsOf(s), fmt(s.layout.total, 0), ...seedCells(s.layout.total, sd), ...(v.unitPrice !== undefined ? [money(s.layout.total * v.unitPrice)] : [])]),
        ['Total', '', '', fmt(res.total, 0), ...(sd ? seedCells(0, sd).map(() => '') : []), ...(v.unitPrice !== undefined ? [money(res.total * v.unitPrice)] : [])],
      ) + seedNote(sd),
    );
    html += block(
      'Layout plan',
      `<figure class="figure">${spacingDiagram({
        length: L,
        width: W,
        clearance: v.c,
        rowsAlongLength: along,
        layout: res.sections[0]!.layout,
        sections: res.sections.map((s, i) => ({ start: s.start, length: s.length, layout: s.layout, label: label(i) })),
        lengthLabel: `${length.describe()} (length)`,
        widthLabel: `${width.describe()} (width)`,
        alt: `Top-down plan of a bed ${length.describe()} by ${width.describe()} split between ${crops.length} crops, ${res.total} positions`,
      })}</figure>${cropLegend(crops.map((_, i) => label(i)))}<p class="fine">Dashed lines mark where one crop’s part of the bed ends. Where two crops meet, each keeps half its own spacing from the line, so neighbours are as far apart as both packets ask. A printed copy is not true to scale.</p>`,
    );
    const marks = res.sections.map((s, i) => {
      const lay = s.layout;
      if (lay.total === 0) return `<strong>${esc(label(i))}:</strong> no positions.`;
      const pu = crops[i]!.inRowField.unit!;
      const qu = crops[i]!.rowField.unit!;
      const axisAlong = along ? lay.plantAxis : lay.rowAxis;
      const axisAcross = along ? lay.rowAxis : lay.plantAxis;
      const uAlong = along ? pu : qu;
      const uAcross = along ? qu : pu;
      const list = (axis: AxisLayout, u: Unit, offset: number) =>
        axis.count <= 30 ? axisPositions(axis).map((x) => fmt(fromSI(x + offset, u), 2)).join(', ') + ` ${UNIT_LABEL[u]}` : `${fmt(axis.count, 0)} marks, every ${D(axis.spacing, u)} from ${D(axis.first + offset, u)}`;
      return `<strong>${esc(label(i))}</strong> (${secRange(s)}): ${along ? 'plants' : 'rows'} at ${list(axisAlong, uAlong, s.start)} from the start of the bed; ${along ? 'rows' : 'plants'} at ${list(axisAcross, uAcross, 0)} from one long side.${lay.offsetAxis && lay.offsetRows > 0 ? ' Staggered rows shift along by half a spacing.' : ''}`;
    });
    html += block('Measurements for marking out', steps(marks));
    html += fold(
      'How this was calculated',
      steps(
        res.sections.map((s, i) => {
          const sp = along ? crops[i]!.inRowField : crops[i]!.rowField;
          return `<strong>${esc(label(i))}:</strong> ${secRange(s)} of the bed (${D(s.length, lu)}), keeping ${D(s.startClear, sp.unit!)} at its start and ${D(s.endClear, sp.unit!)} at its end${i > 0 || i < res.sections.length - 1 ? ` (half of ${esc(sp.describe())} where it meets another crop, the edge clearance at the bed ends)` : ''}: ${rowsOf(s)} = ${fmt(s.layout.total, 0)} positions.`;
        }),
      ) + `<p class="fine">Each part is laid out exactly as a bed of its own would be, with the edge clearance along both long sides.</p>`,
    );
    crops.forEach((c, i) => used.push([label(i), `${c.inRowField.describe()} between plants, ${c.rowField.describe()} between rows; ${c.len !== undefined ? c.lenField.describe() : 'the rest'} of the bed`]));
    used.push(['Edge clearance', clearance.isEmpty ? '0 (none)' : clearance.describe()]);
    if (v.unitPrice !== undefined) used.push(['Price per plant', money(v.unitPrice)]);
    html += fold('Inputs used', inputsUsed(used));
    html += fold(
      'Assumptions',
      bullets([
        'Crops are given parts of the bed length in the order listed, starting from one end.',
        'Spacing is centre to centre, in straight rows. Positions are places a plant could go, not a planting recommendation.',
        'Spacing comes from your seed packets or plant labels. Prunest does not supply spacing for any plant.',
      ]),
    );
    html += scheduleLink(names);
    ctx.show(html, `${plural(res.total, 'position')} · ${plural(crops.length, 'crop')}`);
    return true;
  }

  return tool;
});
