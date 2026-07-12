// Utilidades de UI compartidas.

export const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
export function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = el.className.replace(/bg-\w+-\d+/g, '');
  el.classList.add(type === 'err' ? 'bg-rose-600' : type === 'warn' ? 'bg-amber-600' : 'bg-slate-900');
  el.classList.remove('opacity-0', 'translate-y-4');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('opacity-0', 'translate-y-4'), 2600);
}

export const card = (inner, cls = '') =>
  `<div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-6 ${cls}">${inner}</div>`;

export const stat = (value, label, color = 'slate') => `
  <div class="bg-${color}-50 border border-${color}-100 rounded-xl p-3 text-center">
    <div class="text-2xl md:text-3xl font-black text-${color}-600 tabular-nums">${esc(value)}</div>
    <div class="text-[10px] font-bold uppercase tracking-wider text-${color}-700/70 mt-0.5">${esc(label)}</div>
  </div>`;

export const bar = (pct, color = 'indigo') => `
  <div class="h-2 bg-slate-100 rounded-full overflow-hidden"><div class="h-full bg-${color}-500 rounded-full transition-all" style="width:${Math.max(0, Math.min(100, pct))}%"></div></div>`;

export const btn = (label, attrs = '', variant = 'primary') => {
  const v = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
    amber: 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm',
    dark: 'bg-slate-800 text-white hover:bg-slate-900 shadow-sm',
    ghost: 'border-2 border-slate-200 text-slate-700 hover:border-brand-500 hover:text-brand-600 bg-white',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
    success: 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm',
  }[variant];
  return `<button ${attrs} class="font-bold py-2.5 px-4 rounded-xl transition active:scale-[.98] disabled:opacity-40 disabled:pointer-events-none ${v}">${label}</button>`;
};

export const empty = (title, sub, action = '') => `
  <div class="text-center py-14 px-4">
    <div class="text-4xl mb-3">📭</div>
    <h3 class="font-extrabold text-lg text-slate-700">${esc(title)}</h3>
    <p class="text-slate-500 text-sm mt-1 mb-5 max-w-sm mx-auto">${esc(sub)}</p>
    ${action}
  </div>`;

/** Confirmación modal accesible (Promise<boolean>). */
export function confirmDialog(title, body, okLabel = 'Confirmar', danger = true) {
  return new Promise(res => {
    const el = h(`
      <div class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4">
        <div class="bg-white w-full md:max-w-sm rounded-t-2xl md:rounded-2xl p-6 fade-in">
          <h3 class="font-extrabold text-lg mb-1">${esc(title)}</h3>
          <p class="text-slate-500 text-sm mb-6">${esc(body)}</p>
          <div class="flex gap-3">
            ${btn('Cancelar', 'data-x="0"', 'ghost').replace('py-2.5', 'py-3 flex-1')}
            ${btn(esc(okLabel), 'data-x="1"', danger ? 'danger' : 'primary').replace('py-2.5', 'py-3 flex-1')}
          </div>
        </div>
      </div>`);
    el.addEventListener('click', e => {
      const v = e.target.closest('[data-x]')?.dataset.x;
      if (v !== undefined || e.target === el) { el.remove(); res(v === '1'); }
    });
    document.body.appendChild(el);
  });
}

export async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Copiado al portapapeles'); }
  catch { toast('No se pudo copiar', 'err'); }
}

export function download(filename, text, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click(); URL.revokeObjectURL(url);
}

/** Barra de gráficos de barras apiladas en SVG puro (sin dependencias). */
export function barChart(series, { height = 120 } = {}) {
  const max = Math.max(1, ...series.map(d => d.correct + d.incorrect));
  const w = 100 / series.length;
  return `
  <svg viewBox="0 0 100 ${height}" preserveAspectRatio="none" class="w-full" style="height:${height}px">
    ${series.map((d, i) => {
      const hc = (d.correct / max) * (height - 16), hi = (d.incorrect / max) * (height - 16);
      const x = i * w + w * .18, bw = w * .64;
      return `<rect x="${x}" y="${height - 12 - hc - hi}" width="${bw}" height="${hi}" fill="#fb7185" rx="0.6"/>
              <rect x="${x}" y="${height - 12 - hc}" width="${bw}" height="${hc}" fill="#34d399" rx="0.6"/>`;
    }).join('')}
    <line x1="0" y1="${height - 12}" x2="100" y2="${height - 12}" stroke="#e2e8f0" stroke-width="0.5"/>
  </svg>
  <div class="flex justify-between text-[9px] text-slate-400 font-semibold mt-1">
    <span>${esc(series[0]?.label ?? '')}</span><span>${esc(series.at(-1)?.label ?? '')}</span>
  </div>`;
}
