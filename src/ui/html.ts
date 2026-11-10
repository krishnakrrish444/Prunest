// Small HTML builders for result panels. Callers escape user-entered text.
import { esc } from './kit';

export const stat = (label: string, value: string, note = ''): string =>
  `<div class="stat"><dt>${label}</dt><dd>${value}${note ? `<span class="stat-note">${note}</span>` : ''}</dd></div>`;

export const stats = (...items: string[]): string => `<dl class="stats">${items.join('')}</dl>`;

/** `text` tables hold sentences rather than numbers: cells are left-aligned and wrap. */
export function table(caption: string, head: string[], rows: string[][], foot?: string[], text = false): string {
  const th = head.map((c, i) => `<th scope="col"${i ? ' class="num"' : ''}>${c}</th>`).join('');
  const tr = (cells: string[], tag = 'td') =>
    `<tr>${cells.map((c, i) => (i === 0 ? `<th scope="row">${c}</th>` : `<${tag} class="num">${c}</${tag}>`)).join('')}</tr>`;
  return `<div class="table-wrap"><table class="table${text ? ' table-text' : ''}"><caption>${caption}</caption><thead><tr>${th}</tr></thead><tbody>${rows
    .map((r) => tr(r))
    .join('')}</tbody>${foot ? `<tfoot>${tr(foot)}</tfoot>` : ''}</table></div>`;
}

export const block = (title: string, body: string, cls = ''): string =>
  `<section class="result-block ${cls}"><h3>${title}</h3>${body}</section>`;

/** A section that starts collapsed on screen and always prints open. */
export const fold = (title: string, body: string): string =>
  `<section class="result-block fold" data-fold="${title}"><h3><button type="button" class="fold-btn" data-fold-btn aria-expanded="false"><span>${title}</span><span class="fold-mark" aria-hidden="true"></span></button></h3><div class="fold-body is-closed">${body}</div></section>`;

export const steps = (items: string[]): string => `<ol class="steps">${items.map((i) => `<li>${i}</li>`).join('')}</ol>`;

export const bullets = (items: string[]): string => `<ul class="list">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;

export const inputsUsed = (rows: [string, string][]): string =>
  `<dl class="inputs">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;

export const check = (text: string): string =>
  `<div class="notice notice-warn"><p><span class="error-mark" aria-hidden="true">!</span><strong>Check:</strong> ${text}</p></div>`;

export const headline = (lead: string, big: string, tail = ''): string =>
  `<div class="plan-head"><p class="headline"><span class="headline-lead">${lead}</span> <strong class="headline-big${big.length > 20 ? ' headline-long' : ''}">${big}</strong>${tail ? ` <span class="headline-lead">${tail}</span>` : ''}</p></div>`;
