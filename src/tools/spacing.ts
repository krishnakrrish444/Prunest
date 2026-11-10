// Plant spacing calculator: form and results. Maths lives in src/lib/spacing.ts.
import { fmt, plural } from '../lib/format';
import { axisPositions, calculateSpacing, otherDirection, type AxisLayout, type RowDirection, type SpacingInput } from '../lib/spacing';
import { fromSI, UNIT_LABEL, type Unit, type UnitSystem } from '../lib/units';
import { MAX_DRAWN_PLANTS, spacingDiagram } from '../ui/diagram';
import { block, bullets, headline, inputsUsed, stat, stats, steps, table } from '../ui/html';
import { esc, fieldset, grid, h, Issues, mountTool, NumField, pendingHTML, selectField, take, type FieldState, type Tool } from '../ui/kit';

interface SpacingState {
  length: FieldState;
  width: FieldState;
  inRow: FieldState;
  betweenRows: FieldState;
  clearance: FieldState;
  direction: RowDirection;
  centre: boolean;
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

  ctx.form.append(
    fieldset('Bed', grid(length.root, width.root)),
    fieldset('Spacing', grid(inRow.root, betweenRows.root), grid(clearance.root, direction.root), centre),
  );

  const fields = [length, width, inRow, betweenRows, clearance];
  const blank = (): SpacingState => ({
    length: { v: '', u: imp() ? 'ft' : 'm' },
    width: { v: '', u: imp() ? 'ft' : 'm' },
    inRow: { v: '', u: imp() ? 'in' : 'cm' },
    betweenRows: { v: '', u: imp() ? 'in' : 'cm' },
    clearance: { v: '', u: imp() ? 'in' : 'cm' },
    direction: 'along-length',
    centre: false,
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
    }),
    setState(s) {
      length.setState(s.length);
      width.setState(s.width);
      inRow.setState(s.inRow);
      betweenRows.setState(s.betweenRows);
      clearance.setState(s.clearance);
      direction.value = s.direction ?? 'along-length';
      centreBox.checked = Boolean(s.centre);
    },
    setSystem(next) {
      system = next;
      fields.forEach((f) => f.setSystem(next));
    },
    update() {
      const issues = new Issues();
      const L = take(length, issues, { required: true });
      const W = take(width, issues, { required: true });
      const p = take(inRow, issues, { required: true });
      const q = take(betweenRows, issues, { required: true });
      const c = take(clearance, issues, { required: false }) ?? 0;
      if (!issues.ok || L === undefined || W === undefined || p === undefined || q === undefined) {
        ctx.show(pendingHTML(issues, 'Enter the bed size and the spacing from your seed packet or plant label. The plan appears here as you type.'));
        return false;
      }
      const input: SpacingInput = { length: L, width: W, inRow: p, betweenRows: q, clearance: c, direction: direction.value, centre: centreBox.checked };
      const lay = calculateSpacing(input);
      const other = calculateSpacing({ ...input, direction: otherDirection(input.direction) });
      const along = input.direction === 'along-length';
      const dirText = (d: RowDirection) => (d === 'along-length' ? 'rows along the length' : 'rows across the width');
      const pu = inRow.unit!;
      const qu = betweenRows.unit!;
      const D = (m: number, u: Unit) => `${fmt(fromSI(m, u), 2)} ${UNIT_LABEL[u]}`;
      const plantDim = along ? 'length' : 'width';
      const rowDim = along ? 'width' : 'length';

      const compare = `<div class="notice"><p><strong>Other direction:</strong> ${dirText(otherDirection(input.direction))} gives ${plural(other.rows, 'row')} × ${fmt(other.perRow, 0)} = <strong>${plural(other.total, 'position')}</strong>${
        other.total === lay.total ? ', the same count' : other.total > lay.total ? `, ${fmt(other.total - lay.total, 0)} more` : `, ${fmt(lay.total - other.total, 0)} fewer`
      }.</p><p class="mt-2 no-print"><button type="button" class="btn btn-secondary" data-switch>Switch row direction</button></p></div>`;

      const used: [string, string][] = [
        ['Bed', `${length.describe()} long × ${width.describe()} wide`],
        ['Between plants', `${inRow.describe()}, centre to centre`],
        ['Between rows', `${betweenRows.describe()}, centre to centre`],
        ['Edge clearance', clearance.isEmpty ? '0 (none)' : clearance.describe()],
        ['Row direction', dirText(input.direction)],
        ['Leftover space', input.centre ? 'shared between both ends' : 'left at the far end'],
      ];

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

      let html = headline('This bed fits', plural(lay.total, 'plant position'), `in ${plural(lay.rows, 'row')} of ${fmt(lay.perRow, 0)}`);
      html += stats(stat('Rows', fmt(lay.rows, 0), dirText(input.direction)), stat('Plants per row', fmt(lay.perRow, 0)), stat('Total positions', fmt(lay.total, 0)));
      html += compare;

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
          ['', 'First centre', 'Then every', 'Last centre', 'Gap after last'],
          [
            axisRow(`Rows (${fmt(lay.rows, 0)}), measured across the ${rowDim}`, lay.rowAxis, qu),
            axisRow(`Plants (${fmt(lay.perRow, 0)} per row), measured along the ${plantDim}`, lay.plantAxis, pu),
          ],
        ) +
          `<p class="fine"><strong>Row centres</strong> from one ${along ? 'long side' : 'end'}: ${list(lay.rowAxis, qu)}.</p><p class="fine"><strong>Plant centres</strong> along each row, from one ${along ? 'end' : 'long side'}: ${list(lay.plantAxis, pu)}.</p>`,
      );

      const stepText = (axis: AxisLayout, dim: string, u: Unit, what: string) =>
        `<strong>${what}:</strong> ${dim} ${D(axis.total, u)} − 2 × ${D(c, u)} clearance = ${D(axis.usable, u)} usable. ${D(axis.usable, u)} ÷ ${D(axis.spacing, u)} = ${fmt(axis.usable / axis.spacing, 2)}, so ${fmt(axis.count - 1, 0)} full ${axis.count - 1 === 1 ? 'step' : 'steps'} + the first position = ${fmt(axis.count, 0)}${axis.leftover > 1e-9 ? `, with ${D(axis.leftover, u)} left over` : ', an exact fit'}.`;
      html += block(
        'How this was calculated',
        steps([
          stepText(lay.plantAxis, plantDim, pu, 'Plants per row'),
          stepText(lay.rowAxis, rowDim, qu, 'Rows'),
          `<strong>Total:</strong> ${fmt(lay.rows, 0)} × ${fmt(lay.perRow, 0)} = ${fmt(lay.total, 0)} positions.`,
        ]) +
          `<p class="fine">The first plant centre is placed ${c > 0 ? `exactly at the edge clearance (${esc(clearance.describe())}) from the edge` : 'on the bed edge line, because no edge clearance was entered'}${input.centre ? ', then moved in by half of any leftover space' : ''}. Positions are counted along each side separately; the bed area is never divided by an area per plant.</p>`,
      );
      html += block('Inputs used', inputsUsed(used));
      html += block(
        'Assumptions',
        bullets([
          'Spacing is measured centre to centre, in straight, evenly spaced rows.',
          'Edge clearance applies equally to all four sides.',
          'The bed is a rectangle. Positions are places a plant could go, not a planting recommendation.',
          'Spacing comes from your seed packet or plant label. Prunest does not supply spacing for any plant.',
        ]),
      );
      ctx.show(html);
      return true;
    },
  };
  return tool;
});
