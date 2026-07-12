// Motor de sesión de estudio: práctica, examen y repaso SRS.
import * as db from './db.js';
import { applyResult, shuffle, isDue, mastery } from './model.js';
import { h, esc, btn, toast, card, confirmDialog } from './ui.js';

const LETTERS = 'ABCDEFGH';

/** @typedef {{mode:'practice'|'exam'|'review', queue:object[], i:number, answered:boolean, correct:number, startedAt:number, log:object[], selected:number|null, shuffledOpts:number[]}} Session */

export function buildQueue(questions, { mode, category, limit, onlyWeak, shuffleQ = true }) {
  let pool = questions;
  if (category && category !== 'ALL') pool = pool.filter(q => q.category === category);
  if (mode === 'review') pool = pool.filter(q => isDue(q));
  if (onlyWeak) pool = pool.filter(q => mastery(q).key === 'weak');
  if (mode === 'review') pool = [...pool].sort((a, b) => a.srs.dueAt - b.srs.dueAt);
  else if (shuffleQ) pool = shuffle(pool);
  return limit ? pool.slice(0, limit) : pool;
}

export function startSession(root, queue, opts, onDone) {
  /** @type {Session} */
  const s = {
    mode: opts.mode, queue, i: 0, answered: false, correct: 0,
    startedAt: Date.now(), log: [], selected: null, shuffledOpts: [],
    shuffleOptions: opts.shuffleOptions ?? true,
    instantFeedback: opts.mode !== 'exam',
  };

  const onKey = (e) => {
    const idx = LETTERS.indexOf(e.key.toUpperCase());
    if (!s.answered && idx >= 0 && idx < s.queue[s.i].options.length) { pick(idx); return; }
    if (e.key === 'Enter' || e.key === ' ') { root.querySelector('[data-advance]:not([hidden])')?.click(); e.preventDefault(); }
    if (s.answered && ['1', '2', '3'].includes(e.key)) root.querySelector(`[data-grade="${+e.key - 1}"]`)?.click();
  };
  document.addEventListener('keydown', onKey);
  const cleanup = () => document.removeEventListener('keydown', onKey);

  render();

  function current() { return s.queue[s.i]; }

  function render() {
    const q = current();
    const order = s.shuffleOptions ? shuffle(q.options.map((_, i) => i)) : q.options.map((_, i) => i);
    s.shuffledOpts = order;
    s.answered = false; s.selected = null;

    const pct = Math.round((s.i / s.queue.length) * 100);
    const m = mastery(q);

    root.innerHTML = `
      <div class="fade-in">
        <div class="mb-4">
          <div class="flex items-center justify-between text-xs font-bold text-slate-500 mb-2">
            <span>${s.i + 1} / ${s.queue.length}</span>
            <span class="flex gap-2">
              <span class="px-2 py-0.5 rounded-full bg-brand-100 text-brand-700">${esc(q.category)}</span>
              <span class="px-2 py-0.5 rounded-full bg-${m.color}-100 text-${m.color}-700">${m.label}</span>
              <span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">${modeLabel(s.mode)}</span>
            </span>
          </div>
          <div class="h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div class="h-full bg-brand-600 transition-all duration-300" style="width:${pct}%"></div>
          </div>
        </div>

        ${card(`
          <h2 class="text-lg md:text-2xl font-extrabold leading-snug mb-6">${esc(q.enunciado)}</h2>
          <div id="opts" class="flex flex-col gap-2.5"></div>
          <div id="fb" hidden class="mt-6"></div>
          <div id="ctrl" class="mt-6 pt-5 border-t border-slate-100 flex flex-col sm:flex-row gap-2 sm:justify-between items-stretch">
            ${btn('Abandonar', 'data-quit', 'ghost').replace('py-2.5 px-4', 'py-2 px-3 text-sm')}
            <div id="advance" class="flex gap-2"></div>
          </div>
        `)}
      </div>`;

    const opts = root.querySelector('#opts');
    order.forEach((origIdx, pos) => {
      const b = h(`
        <button data-i="${origIdx}" class="text-left w-full border-2 border-slate-200 bg-white rounded-xl px-4 py-3.5 flex items-start gap-3 hover:border-brand-500 hover:bg-brand-50 transition active:scale-[.99] group">
          <span class="shrink-0 w-7 h-7 rounded-lg bg-slate-100 text-slate-500 font-black text-sm grid place-items-center group-hover:bg-brand-100 group-hover:text-brand-600">${LETTERS[pos]}</span>
          <span class="flex-1 pt-0.5">${esc(q.options[origIdx])}</span>
        </button>`);
      b.onclick = () => pick(origIdx);
      opts.appendChild(b);
    });

    root.querySelector('[data-quit]').onclick = async () => {
      if (await confirmDialog('¿Abandonar sesión?', 'Las respuestas ya dadas se guardan igualmente.', 'Abandonar')) finish(true);
    };

    if (s.mode === 'exam') renderAdvance(); // en examen se avanza sin feedback
  }

  async function pick(origIdx) {
    if (s.answered) return;
    s.answered = true; s.selected = origIdx;
    const q = current();
    const ok = origIdx === q.correctIndex;
    if (ok) s.correct++;
    navigator.vibrate?.(ok ? 12 : [10, 40, 10]);

    // Pinta opciones
    root.querySelectorAll('#opts button').forEach(b => {
      const i = +b.dataset.i;
      b.disabled = true;
      b.classList.remove('hover:border-brand-500', 'hover:bg-brand-50', 'border-slate-200');
      const badge = b.firstElementChild;
      const show = s.instantFeedback;
      if (show && i === q.correctIndex) { b.classList.add('border-emerald-500', 'bg-emerald-50'); badge.className = badge.className.replace('bg-slate-100 text-slate-500', 'bg-emerald-500 text-white'); }
      else if (i === origIdx && (show ? !ok : true)) { b.classList.add(show ? 'border-rose-500' : 'border-brand-500', show ? 'bg-rose-50' : 'bg-brand-50'); }
      else { b.classList.add('border-slate-100', 'opacity-50'); }
    });

    if (!s.instantFeedback) { await commit(q, ok, ok ? 2 : 0); renderAdvance(); return; }

    // Feedback + autoevaluación (calibración metacognitiva)
    const fb = root.querySelector('#fb');
    fb.hidden = false;
    fb.innerHTML = `
      <div class="pop rounded-xl border-l-4 p-4 ${ok ? 'bg-emerald-50 border-emerald-500' : 'bg-rose-50 border-rose-500'}">
        <div class="font-extrabold flex items-center gap-2 mb-1 ${ok ? 'text-emerald-800' : 'text-rose-800'}">
          ${ok ? '✓ ¡Correcto!' : '✕ Incorrecto'}
        </div>
        ${!ok ? `<p class="text-sm font-semibold text-rose-900 mb-2">Respuesta correcta: <b>${esc(q.options[q.correctIndex])}</b></p>` : ''}
        ${q.feedback ? `<p class="text-sm leading-relaxed ${ok ? 'text-emerald-900' : 'text-rose-900'}">${esc(q.feedback)}</p>` : '<p class="text-sm italic text-slate-500">Esta pregunta no tiene explicación.</p>'}
      </div>
      ${ok ? `
      <div class="mt-4">
        <p class="text-xs font-bold text-slate-500 mb-2">¿Cómo de seguro estabas? <span class="font-normal">(ajusta cuándo repasarla)</span></p>
        <div class="grid grid-cols-2 gap-2">
          ${btn('🤔 Dudé <kbd class="hidden md:inline text-[10px] opacity-60">2</kbd>', 'data-grade="1"', 'ghost').replace('py-2.5', 'py-3')}
          ${btn('💡 Lo sabía <kbd class="hidden md:inline text-[10px] opacity-60">3</kbd>', 'data-grade="2"', 'ghost').replace('py-2.5', 'py-3')}
        </div>
      </div>` : ''}`;

    if (ok) {
      fb.querySelectorAll('[data-grade]').forEach(b => b.onclick = async () => {
        fb.querySelector('.grid').remove();
        await commit(q, ok, +b.dataset.grade);
        renderAdvance();
      });
    } else {
      await commit(q, ok, 0);
      renderAdvance();
    }
  }

  async function commit(q, ok, grade) {
    const updated = applyResult(q, ok, grade);
    s.queue[s.i] = updated;
    await db.put('questions', updated);
    await db.put('attempts', { questionId: q.id, category: q.category, correct: ok, grade, at: Date.now(), mode: s.mode });
    s.log.push({ questionId: q.id, correct: ok });
  }

  function renderAdvance() {
    const last = s.i === s.queue.length - 1;
    const box = root.querySelector('#advance');
    box.innerHTML = last
      ? btn('Finalizar ✓', 'data-advance', 'success').replace('py-2.5', 'py-3 w-full sm:w-auto px-8')
      : btn('Siguiente →', 'data-advance').replace('py-2.5', 'py-3 w-full sm:w-auto px-8');
    box.firstElementChild.onclick = () => (last ? finish(false) : (s.i++, render()));
    box.firstElementChild.focus({ preventScroll: true });
  }

  async function finish(aborted) {
    cleanup();
    const answered = s.log.length;
    if (answered) {
      await db.put('sessions', {
        mode: s.mode, at: s.startedAt, durationMs: Date.now() - s.startedAt,
        total: s.queue.length, answered, correct: s.correct, aborted,
      });
    }
    onDone({ ...s, answered, aborted });
  }
}

export function renderSummary(root, s, { onRetryWrong, onHome }) {
  const pct = s.answered ? Math.round(100 * s.correct / s.answered) : 0;
  const wrong = s.log.filter(l => !l.correct).map(l => l.questionId);
  const mins = Math.max(1, Math.round((Date.now() - s.startedAt) / 60000));
  const emoji = pct >= 90 ? '🏆' : pct >= 70 ? '🎉' : pct >= 50 ? '💪' : '📚';
  const msg = pct >= 90 ? 'Dominio excelente.' : pct >= 70 ? 'Buen resultado, sigue así.' : pct >= 50 ? 'Vas por buen camino: repasa los fallos.' : 'Repasa la teoría y vuelve a intentarlo.';

  root.innerHTML = `
    <div class="fade-in max-w-lg mx-auto">
      ${card(`
        <div class="text-center">
          <div class="text-5xl mb-3">${emoji}</div>
          <h2 class="text-2xl font-extrabold">${s.aborted ? 'Sesión interrumpida' : 'Sesión completada'}</h2>
          <p class="text-slate-500 text-sm mt-1 mb-6">${esc(msg)}</p>
          <div class="text-6xl font-black text-brand-600 tabular-nums">${pct}<span class="text-2xl">%</span></div>
          <div class="grid grid-cols-3 gap-3 mt-6 text-center">
            <div class="bg-emerald-50 rounded-xl p-3"><div class="text-2xl font-black text-emerald-600">${s.correct}</div><div class="text-[10px] font-bold uppercase text-emerald-700/70">Aciertos</div></div>
            <div class="bg-rose-50 rounded-xl p-3"><div class="text-2xl font-black text-rose-500">${s.answered - s.correct}</div><div class="text-[10px] font-bold uppercase text-rose-700/70">Fallos</div></div>
            <div class="bg-slate-50 rounded-xl p-3"><div class="text-2xl font-black text-slate-700">${mins}′</div><div class="text-[10px] font-bold uppercase text-slate-500">Tiempo</div></div>
          </div>
          <div class="flex flex-col gap-2 mt-7">
            ${wrong.length ? btn(`🔁 Repetir los ${wrong.length} fallos`, 'data-retry', 'amber').replace('py-2.5', 'py-3') : ''}
            ${btn('Volver al inicio', 'data-home', 'ghost').replace('py-2.5', 'py-3')}
          </div>
          <p class="text-xs text-slate-400 mt-5">Tu progreso se guarda automáticamente en este dispositivo.</p>
        </div>`)}
    </div>`;
  root.querySelector('[data-retry]')?.addEventListener('click', () => onRetryWrong(wrong));
  root.querySelector('[data-home]').addEventListener('click', onHome);
  if (!s.aborted && s.answered) toast(`${s.correct}/${s.answered} correctas`);
}

const modeLabel = (m) => ({ practice: 'Práctica', exam: 'Examen', review: 'Repaso' }[m] ?? m);
