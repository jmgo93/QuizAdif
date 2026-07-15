// Router + bootstrap.
import * as db from './db.js';
import * as V from './views.js';
import { buildQueue, startSession, startExamSession, renderSummary } from './quiz.js';
import { toast } from './ui.js';
import { normalizeQuestion } from './model.js';

const root = document.getElementById('app');
const ROUTES = { home: V.home, study: V.study, bank: V.bank, stats: V.stats, prompt: V.prompt, help: V.help };

// Tamaño de letra global, persistente y disponible antes de abrir IndexedDB.
const FONT_SCALES = [0.9, 1, 1.15, 1.3];
let fontScale = Number(localStorage.getItem('quizadifFontScale')) || 1;
if (!FONT_SCALES.includes(fontScale)) fontScale = 1;
const applyFontScale = () => {
  document.documentElement.style.fontSize = `${16 * fontScale}px`;
  const b = document.getElementById('btnFontSize');
  if (b) { b.textContent = `A ${Math.round(fontScale * 100)}%`; b.setAttribute('aria-label', `Tamaño de letra ${Math.round(fontScale * 100)} por ciento. Pulsar para cambiar`); }
};
document.getElementById('btnFontSize').onclick = () => {
  fontScale = FONT_SCALES[(FONT_SCALES.indexOf(fontScale) + 1) % FONT_SCALES.length];
  localStorage.setItem('quizadifFontScale', String(fontScale));
  applyFontScale();
};
applyFontScale();

const legalDialog = document.getElementById('legalDialog');
document.querySelectorAll('[data-legal]').forEach(b => b.onclick = () => legalDialog.showModal());
document.querySelectorAll('[data-legal-close]').forEach(b => b.onclick = () => legalDialog.close());
document.querySelector('[data-legal-accept]').onclick = () => {
  localStorage.setItem('quizadifDisclaimerSeen', '1');
  legalDialog.close();
};
legalDialog.addEventListener('click', e => { if (e.target === legalDialog) legalDialog.close(); });

const ctx = {
  params: {},
  go(route, params = {}) {
    const target = ROUTES[route] ? route : 'home';
    ctx.params = params;
    const hash = `#/${target}`;
    if (location.hash !== hash) { history.pushState({}, '', hash); }
    paint(target);
  },
  async launch(cfg) {
    const questions = await db.getAll('questions');
    const queue = buildQueue(questions, cfg);
    if (!queue.length) return toast('No hay preguntas que cumplan ese filtro', 'warn');
    runSession(queue, cfg);
  },
};

function runSession(queue, cfg) {
  markNav(null);
  window.scrollTo(0, 0);
  const runner = cfg.mode === 'exam' ? startExamSession : startSession;
  runner(root, queue, cfg, (s) => {
    window.scrollTo(0, 0);
    renderSummary(root, s, {
      onRetryWrong: async (ids) => {
        const all = await db.getAll('questions');
        runSession(all.filter(q => ids.includes(q.id)), { ...cfg, mode: 'practice' });
      },
      onHome: () => ctx.go('home'),
    });
  });
}

async function paint(route) {
  markNav(route);
  root.innerHTML = '<div class="text-center py-20 text-slate-300 font-bold">Cargando…</div>';
  try { await ROUTES[route](root, ctx); }
  catch (e) { console.error(e); root.innerHTML = `<p class="text-rose-600 font-bold p-6">Error: ${e.message}</p>`; }
  window.scrollTo(0, 0);
}

const markNav = (route) => document.querySelectorAll('[data-nav]').forEach(b =>
  b.classList.toggle('tab-active', b.dataset.nav === route));

// Navegación global delegada (funciona para botones dentro de vistas).
document.addEventListener('click', e => {
  const b = e.target.closest('[data-nav]');
  if (b) ctx.go(b.dataset.nav);
});
addEventListener('popstate', () => paint(currentRoute()));
const currentRoute = () => (location.hash.replace('#/', '') || 'home');

// --- PWA: instalación
let deferred;
addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferred = e;
  const b = document.getElementById('btnInstall');
  b.hidden = false;
  b.onclick = async () => { deferred.prompt(); await deferred.userChoice; b.hidden = true; deferred = null; };
});
addEventListener('appinstalled', () => toast('App instalada 🎉'));

// --- Bootstrap
(async () => {
  await db.open();
  try {
    const bundles = await Promise.all(['./bank/questions.json','./bank/editorial-expansion.json','./bank/editorial-code-ethics.json','./bank/editorial-drc.json','./bank/editorial-equality.json','./bank/editorial-pe2030.json','./bank/editorial-risks.json','./bank/editorial-earthworks.json','./bank/editorial-cab.json','./bank/editorial-turnouts.json','./bank/editorial-construction-safety.json','./bank/editorial-railway-works.json','./bank/editorial-maintenance.json','./bank/editorial-designation.json','./bank/editorial-compatible-works.json'].map(url =>
      fetch(url, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(`Banco no disponible (${r.status})`); return r.json(); })
    ));
    const bankVersion = bundles.map(b => b.version).join('+');
    const current = await db.getMeta('bankVersion');
    if (current !== bankVersion) {
      const questions = bundles.flatMap(b => b.questions).map(q => normalizeQuestion({ ...q, bundled: true })).filter(Boolean);
      await db.replaceBundledQuestions(questions, bankVersion);
    }
  } catch (e) { console.warn('No se pudo actualizar el banco integrado', e); }
  if (await db.requestPersistence()) document.getElementById('syncDot').textContent = '● Guardado local';
  if (!localStorage.getItem('quizadifDisclaimerSeen')) legalDialog.showModal();
  paint(ROUTES[currentRoute()] ? currentRoute() : 'home');

  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./sw.js'); } catch { /* ignora en file:// */ }
  }
})();
