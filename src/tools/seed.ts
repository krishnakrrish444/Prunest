// Seed starting date calculator: form and results. Date maths lives in src/lib/dates.ts.
import {
  compareDates, computeWindow, formatDate, offsetProblem, parseISODate, toICS, toISO,
  type CalDate, type CalendarEvent, type DateWindow, type OffsetDirection, type OffsetUnit,
} from '../lib/dates';
import { block, bullets, headline, inputsUsed, steps, table } from '../ui/html';
import {
  esc, fieldset, grid, h, Issues, mountTool, nextId, NumField, pendingHTML, RowList, rowShell, selectField, take, textField,
  type Row, type Tool,
} from '../ui/kit';

type Activity = 'indoors' | 'transplant' | 'direct' | 'other';
type RefKind = 'last-frost' | 'transplant' | 'first-frost' | 'other';

interface CropState {
  name: string;
  activity: Activity;
  from: string;
  to: string;
  unit: OffsetUnit;
  direction: OffsetDirection;
}

interface SeedState {
  date: string;
  kind: RefKind;
  custom: string;
  crops: CropState[];
}

interface CropRow extends Row {
  name: HTMLInputElement;
  activity: ReturnType<typeof selectField<Activity>>;
  from: NumField;
  to: NumField;
  unit: ReturnType<typeof selectField<OffsetUnit>>;
  direction: ReturnType<typeof selectField<OffsetDirection>>;
}

const ACTIVITY: Record<Activity, string> = {
  indoors: 'Sow indoors',
  transplant: 'Transplant outdoors',
  direct: 'Direct sow outdoors',
  other: 'Other task',
};
const REF: Record<RefKind, string> = {
  'last-frost': 'last spring frost date',
  transplant: 'planned transplant date',
  'first-frost': 'first autumn frost date',
  other: 'reference date',
};

mountTool<SeedState>('seed', (ctx) => {
  // Reference date
  const dateId = nextId('date');
  const dateInput = h('input', { id: dateId, type: 'date', class: 'input', min: '1900-01-01', max: '2200-12-31', 'aria-describedby': `${dateId}-help ${dateId}-err` });
  const dateErr = h('p', { id: `${dateId}-err`, class: 'field-error', hidden: true });
  let dateTouched = false;
  dateInput.addEventListener('blur', () => (dateTouched = true));
  const dateField = h(
    'div',
    { class: 'field' },
    h('label', { for: dateId, class: 'label', text: 'Reference date' }),
    h('div', { class: 'control' }, dateInput),
    h('p', { id: `${dateId}-help`, class: 'help', text: 'A date you choose, such as your local average last frost date. Prunest does not look this up or guess it.' }),
    dateErr,
  );
  const setDateError = (msg: string | null) => {
    dateErr.hidden = !msg;
    dateErr.textContent = '';
    if (msg) {
      dateErr.append(h('span', { class: 'error-mark', 'aria-hidden': 'true', text: '!' }), `Error: ${msg}`);
      dateInput.setAttribute('aria-invalid', 'true');
    } else dateInput.removeAttribute('aria-invalid');
  };
  const kind = selectField<RefKind>('This date is my', [
    ['last-frost', 'Last spring frost date'],
    ['transplant', 'Planned transplant date'],
    ['first-frost', 'First autumn frost date'],
    ['other', 'Something else'],
  ]);
  const custom = textField('Name for this date', { placeholder: 'e.g. Greenhouse ready', maxlength: 40 });
  const syncCustom = () => (custom.root.hidden = kind.value !== 'other');
  kind.select.addEventListener('change', syncCustom);

  const makeRow = (): CropRow => {
    const name = textField('Crop', { placeholder: 'e.g. Tomatoes', optional: true });
    const activity = selectField<Activity>('Task', Object.entries(ACTIVITY) as [Activity, string][]);
    const from = new NumField({ label: 'Offset', allowZero: true, wholeNumber: true, help: 'The number on the packet, e.g. 6.' });
    const to = new NumField({ label: 'Up to', noun: 'second offset', allowZero: true, wholeNumber: true, optional: true, help: 'For a range such as 6–8, enter 8 here.' });
    const unit = selectField<OffsetUnit>('Counted in', [['weeks', 'Weeks'], ['days', 'Days']]);
    const direction = selectField<OffsetDirection>('Before or after the reference date', [['before', 'Before'], ['after', 'After']]);
    const shell = rowShell(grid(name.root, activity.root), grid(from.root, to.root), grid(unit.root, direction.root));
    return { ...shell, name: name.input, activity, from, to, unit, direction };
  };
  const crops = new RowList<CropRow>('schedule line', makeRow, ctx.refresh, 40);

  ctx.form.append(
    fieldset('Reference date', grid(dateField, kind.root), grid(custom.root)),
    h('h2', { class: 'form-title mt-5', text: 'Seed packet timings' }),
    crops.root,
  );

  const blankCrop = (): CropState => ({ name: '', activity: 'indoors', from: '', to: '', unit: 'weeks', direction: 'before' });
  const refName = () => (kind.value === 'other' ? custom.input.value.trim() || REF.other : REF[kind.value]);
  let events: CalendarEvent[] = [];

  ctx.results.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('[data-ics]') || events.length === 0) return;
    const now = new Date();
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const blob = new Blob([toICS(events, stamp, `prunest-${now.getTime()}`)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: 'prunest-seed-schedule.ics' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  const tool: Tool<SeedState> = {
    blank: () => ({ date: '', kind: 'last-frost', custom: '', crops: [blankCrop()] }),
    example: () => {
      // Next 10 May on or after today, in the visitor's own calendar. Only an example.
      const now = new Date();
      const year = now.getMonth() > 4 || (now.getMonth() === 4 && now.getDate() > 10) ? now.getFullYear() + 1 : now.getFullYear();
      return {
        date: `${year}-05-10`,
        kind: 'last-frost',
        custom: '',
        crops: [
          { name: 'Tomatoes', activity: 'indoors', from: '6', to: '8', unit: 'weeks', direction: 'before' },
          { name: 'Tomatoes', activity: 'transplant', from: '2', to: '', unit: 'weeks', direction: 'after' },
          { name: 'Peas', activity: 'direct', from: '4', to: '6', unit: 'weeks', direction: 'before' },
          { name: 'Beans', activity: 'direct', from: '10', to: '', unit: 'days', direction: 'after' },
        ],
      };
    },
    getState: () => ({
      date: dateInput.value,
      kind: kind.value,
      custom: custom.input.value,
      crops: crops.rows.map((r) => ({ name: r.name.value, activity: r.activity.value, from: r.from.input.value, to: r.to.input.value, unit: r.unit.value, direction: r.direction.value })),
    }),
    setState(s) {
      dateInput.value = s.date ?? '';
      dateTouched = false;
      kind.value = s.kind ?? 'last-frost';
      custom.input.value = s.custom ?? '';
      syncCustom();
      const list = Array.isArray(s.crops) && s.crops.length ? s.crops : [blankCrop()];
      crops.reset(list.length).forEach((r, i) => {
        const c = list[i]!;
        r.name.value = c.name ?? '';
        r.activity.value = c.activity;
        r.from.setState({ v: c.from ?? '' });
        r.to.setState({ v: c.to ?? '' });
        r.unit.value = c.unit;
        r.direction.value = c.direction;
      });
    },
    setSystem() {},
    update() {
      const issues = new Issues();
      events = [];
      let ref: CalDate | null = null;
      // A date input with a partly typed or impossible date reports badInput with an empty value.
      if (dateInput.value === '' && !dateInput.validity.badInput) {
        issues.missing.push('reference date');
        setDateError(dateTouched ? 'Enter the reference date.' : null);
      } else {
        ref = parseISODate(dateInput.value);
        if (!ref) {
          issues.invalid++;
          setDateError('That is not a complete calendar date between 1900 and 2200. Check the day, month and year.');
        } else setDateError(null);
      }
      const lines: { row: CropRow; i: number; win: DateWindow; from: number; to?: number }[] = [];
      crops.rows.forEach((row, i) => {
        const where = `Line ${i + 1}`;
        const from = take(row.from, issues, { required: true, where });
        const to = take(row.to, issues, { required: false });
        if (from === undefined) return;
        const offset = { from, to, unit: row.unit.value, direction: row.direction.value };
        const problem = offsetProblem(offset);
        if (problem) return issues.fail(row.from, problem);
        if (ref) lines.push({ row, i, win: computeWindow(ref, offset), from, to });
      });
      if (!issues.ok || !ref) {
        ctx.show(pendingHTML(issues, 'Enter your reference date and at least one timing from a seed packet. Dates appear here as you type.'));
        return false;
      }
      const refText = formatDate(ref);
      const name = refName();
      const title = (l: (typeof lines)[number]) => {
        const crop = l.row.name.value.trim();
        const task = ACTIVITY[l.row.activity.value];
        return crop ? `${task}: ${crop}` : task;
      };
      const offsetText = (l: (typeof lines)[number]) => {
        const u = l.row.unit.value;
        const lo = Math.min(l.from, l.to ?? l.from);
        const hi = Math.max(l.from, l.to ?? l.from);
        const unitWord = hi === 1 && lo === hi ? u.slice(0, -1) : u;
        if (hi === 0) return `on the ${name}`;
        return `${lo === hi ? hi : `${lo}–${hi}`} ${unitWord} ${l.row.direction.value} the ${name}`;
      };
      const dateText = (w: DateWindow) => (w.isRange ? `${formatDate(w.start)} to ${formatDate(w.end)}` : formatDate(w.start));
      const sorted = [...lines].sort((a, b) => compareDates(a.win.start, b.win.start) || a.i - b.i);
      events = sorted.map((l) => ({
        title: `${title(l)} (Prunest)`,
        description: `${offsetText(l)} (${toISO(ref!)}). Calculated from dates you entered; check local conditions before planting.`,
        start: l.win.start,
        end: l.win.end,
      }));

      const firstLine = sorted[0]!;
      let html =
        sorted.length === 1
          ? headline(esc(title(firstLine)), esc(dateText(firstLine.win)), esc(offsetText(firstLine)))
          : headline('First task', esc(dateText(firstLine.win)), `${esc(title(firstLine))}. ${sorted.length} tasks in the schedule below.`);
      html += `<p class="fine">Reference: your <strong>${esc(name)}</strong>, entered as <strong>${esc(refText)}</strong>. Every date below is counted in whole calendar days from it.</p>`;
      html += block(
        'Schedule',
        table(
          'Sowing and planting schedule, earliest first',
          ['Task', 'Date or window', 'From the packet'],
          sorted.map((l) => [esc(title(l)), esc(dateText(l.win)), esc(offsetText(l))]),
        ) +
          `<p class="mt-3 no-print"><button type="button" class="btn btn-secondary" data-ics>Download calendar file (.ics)</button></p><p class="fine no-print">The file adds each task as an all-day event to most calendar apps. It is created in your browser.</p>`,
      );
      html += block(
        'How each date was worked out',
        steps(
          sorted.map((l) => {
            const sign = l.row.direction.value === 'before' ? '−' : '+';
            const days = l.win.isRange ? `${l.win.minDays} and ${l.win.maxDays} days` : `${l.win.minDays} ${l.win.minDays === 1 ? 'day' : 'days'}`;
            const reversed = l.to !== undefined && l.to < l.from ? ' The range was entered high-to-low; the window is the same either way.' : '';
            return `<strong>${esc(title(l))}:</strong> ${esc(offsetText(l))} → ${esc(refText)} ${sign} ${days} = <strong>${esc(dateText(l.win))}</strong>.${reversed}`;
          }),
        ) + `<p class="fine">One week is counted as exactly 7 days. Dates are plain calendar dates, so your timezone and daylight saving changes cannot move them.</p>`,
      );
      html += block(
        'Inputs used',
        inputsUsed([
          ['Reference date', `${refText} (${name})`],
          ...lines.map((l): [string, string] => [`Line ${l.i + 1}`, `${title(l)}: ${offsetText(l)}`]),
        ]),
      );
      html += block(
        'Before you rely on these dates',
        bullets([
          'These are arithmetic results from the date and offsets you entered. They are not a forecast.',
          'A frost date is an average or an estimate. Frost can come later, so a calculated date never guarantees it is safe to plant outdoors.',
          'Check the weather, soil conditions and the seed packet before sowing or transplanting.',
          'Task labels (sow indoors, transplant, direct sow) are the ones you chose for each line.',
        ]),
      );
      ctx.show(html);
      return true;
    },
  };
  return tool;
});
