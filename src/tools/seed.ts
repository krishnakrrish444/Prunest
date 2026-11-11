// Seed starting date calculator: form and results. Date maths lives in src/lib/dates.ts.
import {
  compareDates, computeWindow, formatDate, offsetProblem, parseISODate, successions, toICS, toISO,
  type CalDate, type CalendarEvent, type DateWindow, type OffsetDirection, type OffsetUnit,
} from '../lib/dates';
import { plural } from '../lib/format';
import { timelineDiagram } from '../ui/diagram';
import { block, bullets, fold, headline, inputsUsed, steps, table } from '../ui/html';
import {
  esc, grid, h, Issues, mountTool, nextId, NumField, pendingHTML, RowList, rowShell, selectField, take, textField,
  type Row, type Tool,
} from '../ui/kit';

type Activity = 'indoors' | 'transplant' | 'direct' | 'other';
type RefKind = 'last-frost' | 'transplant' | 'first-frost' | 'other';

interface RefState {
  date: string;
  kind: RefKind;
  custom: string;
}

interface CropState {
  name: string;
  activity: Activity;
  from: string;
  to: string;
  unit: OffsetUnit;
  direction: OffsetDirection;
  repeat?: string;
  every?: string;
  /** Index of the reference date this line counts from. */
  ref?: number;
}

interface SeedState {
  refs?: RefState[];
  crops: CropState[];
  /** Plans saved before several reference dates were supported. */
  date?: string;
  kind?: RefKind;
  custom?: string;
}

interface RefRow extends Row {
  id: string;
  date: HTMLInputElement;
  touched: boolean;
  kind: ReturnType<typeof selectField<RefKind>>;
  custom: HTMLInputElement;
  setError(msg: string | null): void;
  sync(): void;
}

interface CropRow extends Row {
  name: HTMLInputElement;
  activity: ReturnType<typeof selectField<Activity>>;
  from: NumField;
  to: NumField;
  unit: ReturnType<typeof selectField<OffsetUnit>>;
  direction: ReturnType<typeof selectField<OffsetDirection>>;
  repeat: NumField;
  every: NumField;
  refPick: ReturnType<typeof selectField<string>>;
  /** Reference id this line asked for, kept while options are rebuilt. */
  wanted?: string;
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
const MAX_REFS = 3;

mountTool<SeedState>('seed', (ctx) => {
  const makeRef = (): RefRow => {
    const id = nextId('ref');
    const dateId = `${id}-date`;
    const date = h('input', { id: dateId, type: 'date', class: 'input', min: '1900-01-01', max: '2200-12-31', 'aria-describedby': `${dateId}-help ${dateId}-err` });
    const err = h('p', { id: `${dateId}-err`, class: 'field-error', hidden: true });
    const dateField = h(
      'div',
      { class: 'field' },
      h('label', { for: dateId, class: 'label', text: 'Date' }),
      h('div', { class: 'control' }, date),
      h('p', { id: `${dateId}-help`, class: 'help', text: 'A date you choose, such as your local average last frost date. Prunest does not look this up or guess it.' }),
      err,
    );
    const kind = selectField<RefKind>('This date is my', [
      ['last-frost', 'Last spring frost date'],
      ['transplant', 'Planned transplant date'],
      ['first-frost', 'First autumn frost date'],
      ['other', 'Something else'],
    ]);
    const custom = textField('Name for this date', { placeholder: 'e.g. Greenhouse ready', maxlength: 40 });
    const shell = rowShell(grid(dateField, kind.root), grid(custom.root));
    const row: RefRow = {
      ...shell,
      id,
      date,
      touched: false,
      kind,
      custom: custom.input,
      setError(msg) {
        err.hidden = !msg;
        err.textContent = '';
        if (msg) {
          err.append(h('span', { class: 'error-mark', 'aria-hidden': 'true', text: '!' }), `Error: ${msg}`);
          date.setAttribute('aria-invalid', 'true');
        } else date.removeAttribute('aria-invalid');
      },
      sync() {
        custom.root.hidden = kind.value !== 'other';
      },
    };
    date.addEventListener('blur', () => (row.touched = true));
    kind.select.addEventListener('change', row.sync);
    row.sync();
    return row;
  };

  const makeRow = (): CropRow => {
    const name = textField('Crop', { placeholder: 'e.g. Tomatoes', optional: true });
    const activity = selectField<Activity>('Task', Object.entries(ACTIVITY) as [Activity, string][]);
    const from = new NumField({ label: 'Offset', allowZero: true, wholeNumber: true, help: 'The number on the packet, e.g. 6.' });
    const to = new NumField({ label: 'Up to', noun: 'second offset', allowZero: true, wholeNumber: true, optional: true, help: 'For a range such as 6–8, enter 8 here.' });
    const unit = selectField<OffsetUnit>('Counted in', [['weeks', 'Weeks'], ['days', 'Days']]);
    const direction = selectField<OffsetDirection>('Before or after the reference date', [['before', 'Before'], ['after', 'After']]);
    const refPick = selectField<string>('Counted from', []);
    const repeat = new NumField({ label: 'Number of sowings', allowZero: false, wholeNumber: true, max: 26, optional: true, placeholder: '1', help: 'For succession sowing: how many times in total.' });
    const every = new NumField({ label: 'Days between sowings', allowZero: false, wholeNumber: true, max: 366, optional: true, suffix: 'days' });
    const shell = rowShell(grid(name.root, activity.root), grid(from.root, to.root), grid(unit.root, direction.root), grid(refPick.root), grid(repeat.root, every.root));
    const row: CropRow = { ...shell, name: name.input, activity, from, to, unit, direction, repeat, every, refPick };
    refPick.select.addEventListener('change', () => (row.wanted = refPick.select.value));
    return row;
  };

  const refs = new RowList<RefRow>('reference date', makeRef, ctx.refresh, MAX_REFS);
  const crops = new RowList<CropRow>('schedule line', makeRow, ctx.refresh, 40);

  ctx.form.append(
    h('h2', { class: 'form-title', text: 'Reference dates' }),
    h('p', { class: 'help mb-3', text: 'Most schedules need one. Add a second, such as your first autumn frost date, for timings counted from it.' }),
    h('div', { 'data-refs': '' }, refs.root),
    h('h2', { class: 'form-title mt-6', text: 'Seed packet timings' }),
    h('div', { 'data-lines': '' }, crops.root),
  );

  const refName = (r: RefRow, i: number): string => {
    if (r.kind.value === 'other') return r.custom.value.trim() || (refs.rows.length > 1 ? `reference date ${i + 1}` : REF.other);
    return REF[r.kind.value];
  };

  /** Keep every line's "Counted from" list in step with the reference dates. */
  let lastSignature = '';
  const syncRefOptions = () => {
    const many = refs.rows.length > 1;
    const options = refs.rows.map((r, i): [string, string] => {
      const d = parseISODate(r.date.value);
      const name = refName(r, i);
      return [r.id, `${i + 1}. ${name.charAt(0).toUpperCase()}${name.slice(1)}${d ? `, ${formatDate(d)}` : ''}`];
    });
    const signature = JSON.stringify(options);
    crops.rows.forEach((row) => {
      row.refPick.root.hidden = !many;
      const want = row.wanted && refs.rows.some((r) => r.id === row.wanted) ? row.wanted : refs.rows[0]!.id;
      if (signature !== lastSignature || row.refPick.select.options.length !== options.length) {
        row.refPick.select.textContent = '';
        for (const [value, text] of options) row.refPick.select.append(h('option', { value, text }));
      }
      row.refPick.select.value = want;
    });
    lastSignature = signature;
  };

  const blankRef = (): RefState => ({ date: '', kind: 'last-frost', custom: '' });
  const blankCrop = (): CropState => ({ name: '', activity: 'indoors', from: '', to: '', unit: 'weeks', direction: 'before', repeat: '', every: '', ref: 0 });
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
    blank: () => ({ refs: [blankRef()], crops: [blankCrop()] }),
    example: () => {
      // Next 10 May on or after today, in the visitor's own calendar. Only an example.
      const now = new Date();
      const year = now.getMonth() > 4 || (now.getMonth() === 4 && now.getDate() > 10) ? now.getFullYear() + 1 : now.getFullYear();
      return {
        refs: [
          { date: `${year}-05-10`, kind: 'last-frost', custom: '' },
          { date: `${year}-10-10`, kind: 'first-frost', custom: '' },
        ],
        crops: [
          { name: 'Tomatoes', activity: 'indoors', from: '6', to: '8', unit: 'weeks', direction: 'before', ref: 0 },
          { name: 'Tomatoes', activity: 'transplant', from: '2', to: '', unit: 'weeks', direction: 'after', ref: 0 },
          { name: 'Peas', activity: 'direct', from: '4', to: '6', unit: 'weeks', direction: 'before', ref: 0 },
          { name: 'Lettuce', activity: 'direct', from: '2', to: '', unit: 'weeks', direction: 'before', repeat: '4', every: '14', ref: 0 },
          { name: 'Spinach', activity: 'direct', from: '6', to: '8', unit: 'weeks', direction: 'before', ref: 1 },
        ],
      };
    },
    getState: () => ({
      refs: refs.rows.map((r) => ({ date: r.date.value, kind: r.kind.value, custom: r.custom.value })),
      crops: crops.rows.map((r) => ({
        name: r.name.value,
        activity: r.activity.value,
        from: r.from.input.value,
        to: r.to.input.value,
        unit: r.unit.value,
        direction: r.direction.value,
        repeat: r.repeat.input.value,
        every: r.every.input.value,
        ref: Math.max(0, refs.rows.findIndex((x) => x.id === r.refPick.select.value)),
      })),
    }),
    setState(s) {
      const refList =
        Array.isArray(s.refs) && s.refs.length
          ? s.refs.slice(0, MAX_REFS)
          : [{ date: s.date ?? '', kind: s.kind ?? 'last-frost', custom: s.custom ?? '' }];
      refs.reset(refList.length).forEach((r, i) => {
        const v = refList[i]!;
        r.date.value = v.date ?? '';
        r.kind.value = v.kind ?? 'last-frost';
        r.custom.value = v.custom ?? '';
        r.touched = false;
        r.setError(null);
        r.sync();
      });
      const list = Array.isArray(s.crops) && s.crops.length ? s.crops : [blankCrop()];
      lastSignature = '';
      crops.reset(list.length).forEach((r, i) => {
        const c = list[i]!;
        r.name.value = c.name ?? '';
        r.activity.value = c.activity;
        r.from.setState({ v: c.from ?? '' });
        r.to.setState({ v: c.to ?? '' });
        r.unit.value = c.unit;
        r.direction.value = c.direction;
        r.repeat.setState({ v: c.repeat ?? '' });
        r.every.setState({ v: c.every ?? '' });
        r.wanted = refs.rows[c.ref ?? 0]?.id ?? refs.rows[0]!.id;
      });
      syncRefOptions();
    },
    setSystem() {},
    update() {
      syncRefOptions();
      const issues = new Issues();
      events = [];
      const many = refs.rows.length > 1;
      const parsed = new Map<string, CalDate>();
      refs.rows.forEach((r, i) => {
        // A date input with a partly typed or impossible date reports badInput with an empty value.
        if (r.date.value === '' && !r.date.validity.badInput) {
          issues.missing.push(many ? `reference date ${i + 1}` : 'reference date');
          r.setError(r.touched ? 'Enter the reference date.' : null);
          return;
        }
        const d = parseISODate(r.date.value);
        if (!d) {
          issues.invalid++;
          r.setError('That is not a complete calendar date between 1900 and 2200. Check the day, month and year.');
        } else {
          r.setError(null);
          parsed.set(r.id, d);
        }
      });

      type Line = { row: CropRow; i: number; win: DateWindow; from: number; to?: number; n: number; of: number; every: number; ref: CalDate; refIndex: number };
      const lines: Line[] = [];
      crops.rows.forEach((row, i) => {
        const where = `Line ${i + 1}`;
        const from = take(row.from, issues, { required: true, where });
        const to = take(row.to, issues, { required: false });
        const count = take(row.repeat, issues, { required: false }) ?? 1;
        const gap = take(row.every, issues, { required: false });
        if (count > 1 && gap === undefined && row.every.isEmpty) return issues.fail(row.every, 'Enter the number of days between sowings, or set the number of sowings to 1.');
        if (from === undefined) return;
        const offset = { from, to, unit: row.unit.value, direction: row.direction.value };
        const problem = offsetProblem(offset);
        if (problem) return issues.fail(row.from, problem);
        const refIndex = Math.max(0, refs.rows.findIndex((r) => r.id === row.refPick.select.value));
        const ref = parsed.get(refs.rows[refIndex]!.id);
        if (ref) successions(computeWindow(ref, offset), gap ?? 0, count).forEach((win, k) => lines.push({ row, i, win, from, to, n: k + 1, of: count, every: gap ?? 0, ref, refIndex }));
      });
      if (!issues.ok || parsed.size !== refs.rows.length) {
        ctx.show(pendingHTML(issues, 'Enter your reference date and at least one timing from a seed packet. Dates appear here as you type.'));
        return false;
      }
      const usedRefs = refs.rows.map((r, i) => ({ row: r, i, date: parsed.get(r.id)!, name: refName(r, i) }));
      const nameOf = (l: Line) => usedRefs[l.refIndex]!.name;
      const title = (l: Line) => {
        const crop = l.row.name.value.trim();
        const task = ACTIVITY[l.row.activity.value];
        return `${crop ? `${task}: ${crop}` : task}${l.of > 1 ? ` (sowing ${l.n} of ${l.of})` : ''}`;
      };
      const shortTitle = (l: Line) => {
        const crop = l.row.name.value.trim();
        const task = { indoors: 'sow indoors', transplant: 'transplant', direct: 'direct sow', other: 'task' }[l.row.activity.value];
        const nth = l.of > 1 ? ` ${l.n}` : '';
        return crop ? `${crop}${nth}, ${task}` : `${task.charAt(0).toUpperCase()}${task.slice(1)}${nth}`;
      };
      const offsetText = (l: Line) => {
        const u = l.row.unit.value;
        const lo = Math.min(l.from, l.to ?? l.from);
        const hi = Math.max(l.from, l.to ?? l.from);
        const unitWord = hi === 1 && lo === hi ? u.slice(0, -1) : u;
        const later = l.n > 1 ? `, plus ${(l.n - 1) * l.every} days` : '';
        if (hi === 0) return `on the ${nameOf(l)}${later}`;
        return `${lo === hi ? hi : `${lo}–${hi}`} ${unitWord} ${l.row.direction.value} the ${nameOf(l)}${later}`;
      };
      const dateText = (w: DateWindow) => (w.isRange ? `${formatDate(w.start)} to ${formatDate(w.end)}` : formatDate(w.start));
      const sorted = [...lines].sort((a, b) => compareDates(a.win.start, b.win.start) || a.i - b.i);
      events = sorted.map((l) => ({
        title: `${title(l)} (Prunest)`,
        description: `${offsetText(l)} (${toISO(l.ref)}). Calculated from dates you entered; check local conditions before planting.`,
        start: l.win.start,
        end: l.win.end,
      }));

      const firstLine = sorted[0]!;
      let html =
        sorted.length === 1
          ? headline(esc(title(firstLine)), esc(dateText(firstLine.win)), esc(offsetText(firstLine)))
          : headline('First task', esc(dateText(firstLine.win)), `${esc(title(firstLine))}. ${sorted.length} tasks in the schedule below.`);
      html +=
        usedRefs.length === 1
          ? `<p class="fine">Reference: your <strong>${esc(usedRefs[0]!.name)}</strong>, entered as <strong>${esc(formatDate(usedRefs[0]!.date))}</strong>. Every date below is counted in whole calendar days from it.</p>`
          : `<p class="fine">References: ${usedRefs.map((r) => `your <strong>${esc(r.name)}</strong>, <strong>${esc(formatDate(r.date))}</strong>`).join('; ')}. Each line is counted in whole calendar days from the date it names.</p>`;
      html += block(
        'Schedule',
        table(
          'Sowing and planting schedule, earliest first',
          ['Task', 'Date or window', 'From the packet'],
          sorted.map((l) => [esc(title(l)), esc(dateText(l.win)), esc(offsetText(l))]),
          undefined,
          true,
        ) +
          `<p class="mt-3 no-print"><button type="button" class="btn btn-secondary" data-ics>Download calendar file (.ics)</button></p><p class="fine no-print">The file adds each task as an all-day event to most calendar apps. It is created in your browser.</p>`,
      );
      const shortDate = (c: CalDate) => new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(c.y, c.m - 1, 1)));
      const refLabel = (r: (typeof usedRefs)[number]) => `${r.name.charAt(0).toUpperCase()}${r.name.slice(1)}: ${formatDate(r.date)}`;
      html += block(
        'Timeline',
        `<figure class="figure">${timelineDiagram(
          sorted.map((l) => ({ label: shortTitle(l), start: l.win.start, end: l.win.end, kind: l.row.activity.value })),
          usedRefs.map((r) => ({ date: r.date, label: refLabel(r) })),
          shortDate,
          `Timeline of ${sorted.length} tasks around ${usedRefs.map(refLabel).join(' and ')}`,
        )}</figure><p class="fine">Each bar is a task or window; ${usedRefs.length === 1 ? `the dashed line is your ${esc(usedRefs[0]!.name)}` : 'each dashed line is one of your reference dates'}. The schedule table has the exact dates.</p>`,
      );
      html += fold(
        'How each date was worked out',
        steps(
          sorted.map((l) => {
            const sign = l.row.direction.value === 'before' ? '−' : '+';
            const days = l.win.isRange ? `${l.win.minDays} and ${l.win.maxDays} days` : `${l.win.minDays} ${l.win.minDays === 1 ? 'day' : 'days'}`;
            const reversed = l.to !== undefined && l.to < l.from ? ' The range was entered high-to-low; the window is the same either way.' : '';
            const shift = l.n > 1 ? ` + ${(l.n - 1) * l.every} days for sowing ${l.n}` : '';
            return `<strong>${esc(title(l))}:</strong> ${esc(offsetText(l))} → ${esc(formatDate(l.ref))} ${sign} ${days}${shift} = <strong>${esc(dateText(l.win))}</strong>.${reversed}`;
          }),
        ) + `<p class="fine">One week is counted as exactly 7 days. Dates are plain calendar dates, so your timezone and daylight saving changes cannot move them.</p>`,
      );
      html += fold(
        'Inputs used',
        inputsUsed([
          ...usedRefs.map((r): [string, string] => [usedRefs.length === 1 ? 'Reference date' : `Reference date ${r.i + 1}`, `${formatDate(r.date)} (${r.name})`]),
          ...lines
            .filter((l) => l.n === 1)
            .map((l): [string, string] => [`Line ${l.i + 1}`, `${title(l).replace(/ \(sowing 1 of \d+\)/, '')}: ${offsetText(l)}${l.of > 1 ? `; ${l.of} sowings, ${l.every} days apart` : ''}`]),
        ]),
      );
      html += block(
        'Before you rely on these dates',
        bullets([
          'These are arithmetic results from the dates and offsets you entered. They are not a forecast.',
          'A frost date is an average or an estimate. Frost can come earlier or later, so a calculated date never guarantees it is safe to plant outdoors.',
          'Check the weather, soil conditions and the seed packet before sowing or transplanting.',
          'Task labels (sow indoors, transplant, direct sow) are the ones you chose for each line.',
        ]),
      );
      ctx.show(html, `${plural(sorted.length, 'task')} · first ${formatDate(firstLine.win.start)}`);
      return true;
    },
  };
  return tool;
});
