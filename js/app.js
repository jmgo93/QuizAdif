// Router + bootstrap.
import * as db from './db.js';
import * as V from './views.js';
import { buildQueue, startSession, startExamSession, renderSummary } from './quiz.js';
import { toast } from './ui.js';
import { normalizeQuestion } from './model.js';

const root = document.getElementById('app');
const ROUTES = { home: V.home, study: V.study, bank: V.bank, stats: V.stats, prompt: V.prompt, help: V.help };

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
    const bank = await fetch('./bank/questions.json', { cache: 'no-cache' }).then(r => {
      if (!r.ok) throw new Error(`Banco no disponible (${r.status})`); return r.json();
    });
    const current = await db.getMeta('bankVersion');
    if (current !== bank.version) {
      const questions = bank.questions.map(normalizeQuestion).filter(Boolean);
      await db.replaceBundledQuestions(questions, bank.version);
    }
  } catch (e) { console.warn('No se pudo actualizar el banco integrado', e); }
  if (await db.requestPersistence()) document.getElementById('syncDot').textContent = '● Guardado local';
  paint(ROUTES[currentRoute()] ? currentRoute() : 'home');

  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./sw.js'); } catch { /* ignora en file:// */ }
  }
})();
