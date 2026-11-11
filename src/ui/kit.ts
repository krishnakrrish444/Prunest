// Shared browser-side UI helpers for every tool: measurement inputs with unit
// conversion, validation messages, repeating rows, and the tool shell wiring
// (example, reset, print, save on this device). No calculation logic lives here.
import { fmtInput } from '../lib/format';
import { parseNumber } from '../lib/parse';
import { SYSTEM_OF, TO_SI, UNIT_LABEL, UNIT_NAME, type Unit, type UnitSystem } from '../lib/units';

export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

let counter = 0;
export const nextId = (prefix = 'f'): string => `${prefix}-${++counter}`;

type Attrs = Record<string, string | boolean | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'text') node.textContent = String(v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  node.append(...kids);
  return node;
}

// ---------- Number / measurement field ----------

export interface FieldState {
  v: string;
  u?: string;
}

export type Read = { kind: 'empty' } | { kind: 'bad'; message: string } | { kind: 'ok'; value: number };

export interface NumFieldOptions {
  label: string;
  /** Name used inside sentences, e.g. "fill depth". Defaults to the lowercased label. */
  noun?: string;
  help?: string;
  /** Unit choices. With units, read() returns SI (m, m², m³). */
  units?: Unit[];
  unit?: Unit;
  /** Value is an amount per unit (a price per cu yd); read() returns the amount per SI unit. */
  perUnit?: boolean;
  /** Fixed text shown after the input when there is no unit choice, e.g. "%". */
  suffix?: string;
  allowZero?: boolean;
  max?: number;
  placeholder?: string;
  optional?: boolean;
  wholeNumber?: boolean;
}

const IMPERIAL_TO_METRIC: Partial<Record<Unit, Unit>> = {
  ft: 'm', in: 'cm', yd: 'm', sqft: 'sqm', sqyd: 'sqm', cuft: 'l', cuyd: 'cum',
};
const METRIC_TO_IMPERIAL: Partial<Record<Unit, Unit>> = {
  m: 'ft', cm: 'in', mm: 'in', sqm: 'sqft', l: 'cuft', cum: 'cuyd',
};

export class NumField {
  readonly root: HTMLDivElement;
  readonly input: HTMLInputElement;
  readonly select?: HTMLSelectElement;
  label: string;
  noun: string;
  touched = false;
  private readonly err: HTMLParagraphElement;
  private readonly opts: NumFieldOptions;
  /** Full-precision value kept across unit switches so 4 ft -> m -> ft is still exactly 4 ft. */
  private exact?: number;
  private shown?: string;
  private current?: Unit;

  constructor(opts: NumFieldOptions) {
    this.opts = opts;
    this.label = opts.label;
    this.noun = opts.noun ?? opts.label.toLowerCase();
    const id = nextId('num');
    const errId = `${id}-err`;
    const helpId = opts.help ? `${id}-help` : undefined;
    this.input = h('input', {
      id,
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      class: 'input',
      placeholder: opts.placeholder,
      'aria-describedby': [helpId, errId].filter(Boolean).join(' '),
    });
    const control = h('div', { class: 'control' }, this.input);
    if (opts.units && opts.units.length > 0) {
      this.select = h('select', {
        class: 'unit-select',
        'aria-label': opts.perUnit ? `${opts.label}: per unit` : `${opts.label}: unit`,
      });
      for (const u of opts.units) {
        this.select.append(
          h('option', { value: u, title: UNIT_NAME[u], text: (opts.perUnit ? 'per ' : '') + UNIT_LABEL[u] }),
        );
      }
      this.select.value = opts.unit ?? opts.units[0]!;
      this.current = this.select.value as Unit;
      this.select.addEventListener('change', () => {
        // The browser has already switched the select; read the number in the
        // unit it was typed in, then convert.
        const next = this.select!.value as Unit;
        this.select!.value = this.current!;
        this.setUnit(next);
      });
      control.append(this.select);
    } else if (opts.suffix) {
      control.append(h('span', { class: 'unit-fixed', text: opts.suffix }));
    }
    this.err = h('p', { id: errId, class: 'field-error', hidden: true });
    const labelEl = h('label', { for: id, class: 'label' }, opts.label);
    if (opts.optional) labelEl.append(h('span', { class: 'optional', text: ' (optional)' }));
    this.root = h('div', { class: 'field' }, labelEl, control);
    if (opts.help) this.root.append(h('p', { id: helpId, class: 'help', text: opts.help }));
    this.root.append(this.err);
    this.input.addEventListener('blur', () => {
      this.touched = true;
    });
  }

  /** Change the visible label (and the name used in messages), e.g. Length -> Base for a triangle. */
  rename(label: string): void {
    if (label === this.label) return;
    this.label = label;
    this.noun = label.toLowerCase();
    this.root.querySelector('label')!.firstChild!.textContent = label;
    this.select?.setAttribute('aria-label', `${label}: unit`);
  }

  get unit(): Unit | undefined {
    return this.select ? (this.select.value as Unit) : undefined;
  }

  get isEmpty(): boolean {
    return this.input.value.trim() === '';
  }

  /** What the visitor entered, for the "inputs used" summary: e.g. "8 ft". */
  describe(): string {
    const v = this.input.value.trim();
    if (v === '') return '–';
    const u = this.unit;
    if (!u) return v + (this.opts.suffix ?? '');
    return this.opts.perUnit ? `${v} per ${UNIT_LABEL[u]}` : `${v} ${UNIT_LABEL[u]}`;
  }

  read(): Read {
    const text = this.input.value;
    const parsed = parseNumber(text);
    if (!parsed.ok) {
      if (parsed.reason === 'empty') return { kind: 'empty' };
      return {
        kind: 'bad',
        message: `“${text.trim()}” is not a number. Use digits such as 4.5${this.opts.wholeNumber ? '' : ' or 3 1/2'}.`,
      };
    }
    const raw = parsed.value;
    if (!Number.isFinite(raw)) return { kind: 'bad', message: 'That number is too large.' };
    const Noun = this.noun.charAt(0).toUpperCase() + this.noun.slice(1);
    if (this.opts.allowZero ? raw < 0 : raw <= 0) {
      return { kind: 'bad', message: `${Noun} must be ${this.opts.allowZero ? '0 or more' : 'greater than 0'}.` };
    }
    if (this.opts.wholeNumber && !Number.isInteger(raw)) {
      return { kind: 'bad', message: `${Noun} must be a whole number.` };
    }
    if (this.opts.max !== undefined && raw > this.opts.max) {
      return { kind: 'bad', message: `${Noun} cannot be more than ${this.opts.max}${this.opts.suffix ?? ''}.` };
    }
    const u = this.unit;
    if (!u) return { kind: 'ok', value: raw };
    if (this.exact !== undefined && text === this.shown) return { kind: 'ok', value: this.exact };
    return { kind: 'ok', value: this.opts.perUnit ? raw / TO_SI[u] : raw * TO_SI[u] };
  }

  /** Switch unit, converting the number so the physical quantity stays the same. */
  setUnit(next: Unit): void {
    if (!this.select || !this.opts.units?.includes(next)) return;
    const current = this.read();
    this.select.value = next;
    this.current = next;
    if (current.kind !== 'ok') return;
    this.exact = current.value;
    const display = this.opts.perUnit ? current.value * TO_SI[next] : current.value / TO_SI[next];
    this.shown = fmtInput(display);
    this.input.value = this.shown;
  }

  setSystem(system: UnitSystem): void {
    const u = this.unit;
    if (!u || SYSTEM_OF[u] === system) return;
    const next = (system === 'metric' ? IMPERIAL_TO_METRIC : METRIC_TO_IMPERIAL)[u];
    if (next) this.setUnit(next);
  }

  setError(message: string | null): void {
    if (message) {
      this.err.textContent = '';
      this.err.append(h('span', { class: 'error-mark', 'aria-hidden': 'true', text: '!' }), `Error: ${message}`);
      this.err.hidden = false;
      this.input.setAttribute('aria-invalid', 'true');
    } else {
      this.err.hidden = true;
      this.err.textContent = '';
      this.input.removeAttribute('aria-invalid');
    }
  }

  getState(): FieldState {
    return { v: this.input.value, u: this.unit };
  }

  setState(s: FieldState | undefined): void {
    this.exact = undefined;
    this.shown = undefined;
    this.touched = false;
    this.input.value = s?.v ?? '';
    if (this.select) {
      const u = s?.u && this.opts.units?.includes(s.u as Unit) ? (s.u as Unit) : (this.opts.unit ?? this.opts.units![0]!);
      this.select.value = u;
      this.current = u;
    }
    this.setError(null);
  }
}

// ---------- Validation collection ----------

export class Issues {
  missing: string[] = [];
  invalid = 0;
  get ok(): boolean {
    return this.missing.length === 0 && this.invalid === 0;
  }
  fail(field: NumField, message: string): void {
    field.setError(message);
    this.invalid++;
  }
}

/**
 * Read a field, show or clear its inline error, and record problems.
 * A required field left empty is listed as missing; its inline error appears
 * once the visitor has left the field, so a fresh form is not covered in errors.
 */
export function take(field: NumField, issues: Issues, o: { required: boolean; where?: string }): number | undefined {
  const r = field.read();
  if (r.kind === 'ok') {
    field.setError(null);
    return r.value;
  }
  if (r.kind === 'bad') {
    issues.fail(field, r.message);
    return undefined;
  }
  if (o.required) {
    issues.missing.push(`${o.where ? `${o.where}: ` : ''}${field.noun}`);
    field.setError(field.touched ? `Enter the ${field.noun}.` : null);
  } else {
    field.setError(null);
  }
  return undefined;
}

// ---------- Simple controls ----------

export function textField(label: string, o: { placeholder?: string; maxlength?: number; optional?: boolean } = {}) {
  const id = nextId('txt');
  const input = h('input', {
    id,
    type: 'text',
    class: 'input',
    placeholder: o.placeholder,
    maxlength: String(o.maxlength ?? 40),
    autocomplete: 'off',
  });
  const labelEl = h('label', { for: id, class: 'label' }, label);
  if (o.optional) labelEl.append(h('span', { class: 'optional', text: ' (optional)' }));
  return { root: h('div', { class: 'field' }, labelEl, h('div', { class: 'control' }, input)), input };
}

export function selectField<T extends string>(label: string, options: [T, string][], help?: string) {
  const id = nextId('sel');
  const select = h('select', { id, class: 'input select' });
  for (const [value, text] of options) select.append(h('option', { value, text }));
  const root = h('div', { class: 'field' }, h('label', { for: id, class: 'label' }, label), h('div', { class: 'control' }, select));
  if (help) {
    const helpId = `${id}-help`;
    select.setAttribute('aria-describedby', helpId);
    root.append(h('p', { id: helpId, class: 'help', text: help }));
  }
  return {
    root,
    select,
    get value(): T {
      return select.value as T;
    },
    set value(v: T) {
      if (options.some(([o]) => o === v)) select.value = v;
    },
  };
}

export function checkField(label: string, help?: string) {
  const id = nextId('chk');
  const input = h('input', { type: 'checkbox', id });
  const root = h('div', {}, h('label', { class: 'check', for: id }, input, label));
  if (help) {
    input.setAttribute('aria-describedby', `${id}-help`);
    root.append(h('p', { id: `${id}-help`, class: 'help', text: help }));
  }
  return { root, input };
}

/**
 * A collapsible group for optional inputs. It opens by itself when it holds
 * values (example, saved plan, shared link) or when a field inside has an error.
 */
export function optionalGroup(title: string, hint: string, ...kids: (Node | string)[]): HTMLDetailsElement {
  return h(
    'details',
    { class: 'group group-optional', 'data-optional': '' },
    h('summary', { class: 'group-summary' }, h('span', { class: 'group-legend', text: title }), h('span', { class: 'group-hint', text: hint })),
    h('div', { class: 'group-body', role: 'group', 'aria-label': title }, ...kids),
  );
}

const holdsValue = (d: Element): boolean =>
  [...d.querySelectorAll('input')].some((i) => (i.type === 'checkbox' ? i.checked : i.value.trim() !== ''));

export function fieldset(legend: string, ...kids: (Node | string)[]): HTMLFieldSetElement {
  return h('fieldset', { class: 'group' }, h('legend', { class: 'group-legend', text: legend }), ...kids);
}

export const grid = (...kids: Node[]): HTMLDivElement => h('div', { class: 'field-grid' }, ...kids);

// ---------- Repeating rows (beds, areas, crops) ----------

export interface Row {
  root: HTMLElement;
  title: HTMLElement;
  removeBtn: HTMLButtonElement;
}

export class RowList<R extends Row> {
  rows: R[] = [];
  readonly root: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly addBtn: HTMLButtonElement;

  constructor(
    private readonly noun: string,
    private readonly make: () => R,
    private readonly onChange: () => void,
    private readonly max = 20,
  ) {
    this.list = h('div', { class: 'rows' });
    this.addBtn = h('button', { type: 'button', class: 'btn btn-secondary', text: `+ Add another ${noun}` });
    this.addBtn.addEventListener('click', () => {
      const row = this.add();
      row.root.querySelector<HTMLElement>('input, select')?.focus();
      this.onChange();
    });
    this.root = h('div', {}, this.list, this.addBtn);
  }

  add(): R {
    const row = this.make();
    row.removeBtn.addEventListener('click', () => {
      const i = this.rows.indexOf(row);
      this.rows.splice(i, 1);
      row.root.remove();
      this.renumber();
      (this.rows[Math.min(i, this.rows.length - 1)]?.removeBtn ?? this.addBtn).focus();
      this.onChange();
    });
    this.rows.push(row);
    this.list.append(row.root);
    this.renumber();
    return row;
  }

  /** Replace all rows with `count` fresh ones. */
  reset(count: number): R[] {
    this.rows = [];
    this.list.textContent = '';
    for (let i = 0; i < Math.max(1, Math.min(count, this.max)); i++) this.add();
    return this.rows;
  }

  private renumber(): void {
    const Noun = this.noun.charAt(0).toUpperCase() + this.noun.slice(1);
    this.rows.forEach((row, i) => {
      row.title.textContent = `${Noun} ${i + 1}`;
      row.removeBtn.hidden = this.rows.length === 1;
      row.removeBtn.setAttribute('aria-label', `Remove ${this.noun} ${i + 1}`);
    });
    this.addBtn.hidden = this.rows.length >= this.max;
  }
}

export function rowShell(...kids: Node[]): Row {
  const title = h('h3', { class: 'row-title' });
  const removeBtn = h('button', { type: 'button', class: 'btn btn-quiet', text: 'Remove' });
  const root = h('div', { class: 'row-card' }, h('div', { class: 'row-head' }, title, removeBtn), ...kids);
  return { root, title, removeBtn };
}

// ---------- Tool shell ----------

export interface Tool<S> {
  blank(): S;
  example(): S;
  getState(): S;
  setState(state: S): void;
  /** Read the form, validate, and render results. Returns true when results are complete. */
  update(): boolean;
  setSystem(system: UnitSystem): void;
}

export interface ToolContext {
  form: HTMLElement;
  results: HTMLElement;
  system: UnitSystem;
  /** Suggested currency symbol from the browser language; purely a display label. */
  currency: string;
  refresh(): void;
  /**
   * Render results. Skips the DOM update when nothing changed, so a button
   * inside the results is not replaced mid-click when a field loses focus.
   */
  show(html: string, summary?: string): void;
}

function store(action: 'get' | 'set' | 'remove', key: string, value?: string): string | null {
  try {
    if (action === 'get') return localStorage.getItem(key);
    if (action === 'set') localStorage.setItem(key, value ?? '');
    else localStorage.removeItem(key);
    return 'ok';
  } catch {
    return null; // Private mode or storage blocked: the tool still works, it just cannot save.
  }
}

const UNITS_KEY = 'prunest:units';

/** Plans travel in the URL fragment, which browsers do not send to the server. */
export function encodePlan(state: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodePlan<S>(text: string): S | null {
  try {
    if (text.length > 20000) return null;
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const state = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    return state && typeof state === 'object' && !Array.isArray(state) ? (state as S) : null;
  } catch {
    return null;
  }
}

export function mountTool<S>(id: string, make: (ctx: ToolContext) => Tool<S>): void {
  const root = document.querySelector<HTMLElement>(`[data-tool="${id}"]`);
  if (!root) return;
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const form = q('[data-form]');
  const results = q('[data-results]');
  const status = q('[data-status]');
  const printBtn = q<HTMLButtonElement>('[data-action="print"]');
  const deleteBtn = q<HTMLButtonElement>('[data-action="delete"]');
  const planKey = `prunest:plan:${id}`;

  const lang = navigator.language || 'en-US';
  const savedSystem = store('get', UNITS_KEY);
  const system: UnitSystem =
    savedSystem === 'metric' || savedSystem === 'imperial' ? savedSystem : /^en-US|^en$/i.test(lang) ? 'imperial' : 'metric';
  const currency = /-(GB|IM|JE|GG)$/i.test(lang) ? '£' : '$';

  let tool!: Tool<S>;
  const refresh = () => {
    const ready = tool.update();
    printBtn.disabled = !ready;
    // Never leave an error hidden inside a closed optional group.
    form.querySelectorAll<HTMLDetailsElement>('details[data-optional]:not([open])').forEach((d) => {
      if (d.querySelector('[aria-invalid="true"]')) d.open = true;
    });
  };
  /** After loading values, open the optional groups that hold any and close the rest. */
  const syncOptional = () => {
    form.querySelectorAll<HTMLDetailsElement>('details[data-optional]').forEach((d) => (d.open = holdsValue(d)));
  };
  form.textContent = '';
  let lastHTML: string | null = null;
  const openFolds = new Set<string>();
  const bar = root.querySelector<HTMLElement>('[data-summary]');
  const barText = root.querySelector<HTMLElement>('[data-summary-text]');
  let summaryText = '';
  let resultsVisible = true;
  const syncBar = () => {
    if (bar) bar.hidden = summaryText === '' || resultsVisible;
  };
  const applyFolds = () => {
    results.querySelectorAll<HTMLElement>('[data-fold]').forEach((sec) => {
      const open = openFolds.has(sec.dataset.fold!);
      sec.querySelector('button')!.setAttribute('aria-expanded', String(open));
      sec.querySelector('.fold-body')!.classList.toggle('is-closed', !open);
    });
  };
  const show = (html: string, summary = '') => {
    summaryText = summary;
    if (barText) barText.textContent = summary;
    syncBar();
    if (html === lastHTML) return;
    lastHTML = html;
    results.innerHTML = html;
    applyFolds();
  };
  results.addEventListener('click', (e) => {
    const sec = (e.target as HTMLElement).closest('[data-fold-btn]')?.closest<HTMLElement>('[data-fold]');
    if (!sec) return;
    const key = sec.dataset.fold!;
    if (openFolds.has(key)) openFolds.delete(key);
    else openFolds.add(key);
    applyFolds();
  });
  if (bar && 'IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      resultsVisible = entries[0]!.isIntersecting;
      syncBar();
    }).observe(results);
  }
  tool = make({ form, results, system, currency, refresh, show });

  const say = (message: string) => {
    status.textContent = message;
  };

  const radios = root.querySelectorAll<HTMLInputElement>('input[data-units]');
  radios.forEach((r) => {
    r.checked = r.value === system;
    r.disabled = false;
    r.addEventListener('change', () => {
      if (!r.checked) return;
      tool.setSystem(r.value as UnitSystem);
      store('set', UNITS_KEY, r.value);
      refresh();
    });
  });

  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  form.addEventListener('focusout', refresh);
  form.addEventListener('submit', (e) => e.preventDefault());

  root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((btn) => {
    btn.disabled = false;
    btn.addEventListener('click', () => {
      switch (btn.dataset.action) {
        case 'example':
          tool.setState(tool.example());
          syncOptional();
          say('Example values loaded. Change any of them to match your garden.');
          break;
        case 'reset':
          tool.setState(tool.blank());
          syncOptional();
          say('All fields cleared.');
          break;
        case 'print':
          window.print();
          return;
        case 'save':
          if (store('set', planKey, JSON.stringify({ v: 1, state: tool.getState() }))) {
            deleteBtn.hidden = false;
            say('Saved in this browser on this device.');
          } else {
            say('This browser is blocking local storage, so the plan could not be saved.');
          }
          return;
        case 'share': {
          const url = `${location.origin}${location.pathname}#plan=${encodePlan(tool.getState())}`;
          const done = () => say('Link copied. Anyone who opens it sees these entries; nothing is stored online.');
          const manual = () => {
            history.replaceState(null, '', url);
            say('Copying is blocked here, so the link is now in the address bar. Copy it from there.');
          };
          if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done, manual);
          else manual();
          return;
        }
        case 'delete':
          store('remove', planKey);
          deleteBtn.hidden = true;
          say('Saved plan deleted from this browser.');
          return;
      }
      refresh();
    });
  });

  let restored = false;
  let fromLink = false;
  const linked = /^#plan=(.+)$/.exec(location.hash);
  if (linked) {
    const state = decodePlan<S>(linked[1]!);
    if (state) {
      try {
        tool.setState(state);
        fromLink = true;
      } catch {
        tool.setState(tool.blank());
      }
    }
    history.replaceState(null, '', location.pathname);
  }
  const saved = fromLink ? null : store('get', planKey);
  if (saved && saved !== 'ok') {
    try {
      const parsed = JSON.parse(saved) as { v: number; state: S };
      if (parsed.v === 1 && parsed.state) {
        tool.setState(parsed.state);
        restored = true;
      }
    } catch {
      store('remove', planKey);
    }
  }
  if (!restored && !fromLink) tool.setState(tool.blank());
  syncOptional();
  deleteBtn.hidden = store('get', planKey) === null;
  if (restored) say('Loaded the plan you saved in this browser.');
  if (fromLink) say('Loaded the plan from the link you opened. It is not saved unless you save it.');
  refresh();
  root.dataset.ready = 'true';
}

/** Placeholder shown in the results area until the form is complete and valid. */
export function pendingHTML(issues: Issues, intro: string): string {
  if (issues.invalid > 0) {
    return `<div class="notice notice-warn"><p><strong>Check the highlighted ${issues.invalid === 1 ? 'field' : 'fields'}.</strong> Results appear once every entry is valid. Nothing is guessed or replaced for you.</p></div>`;
  }
  const list = issues.missing.slice(0, 8).map((m) => `<li>${esc(m)}</li>`).join('');
  const more = issues.missing.length > 8 ? `<li>and ${issues.missing.length - 8} more</li>` : '';
  return `<div class="notice"><p>${esc(intro)}</p>${list ? `<p class="mt-2">Still needed:</p><ul class="list">${list}${more}</ul>` : ''}</div>`;
}
