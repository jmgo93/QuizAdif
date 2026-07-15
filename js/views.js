// Vistas de la aplicación.
import * as db from './db.js';
import {
  normalizeQuestion, extractQuestions, dedupeKey, blankQuestion, summarize,
  dailySeries, streakDays, mastery, isDue, relTime, clamp,
} from './model.js';
import { h, esc, btn, card, stat, bar, empty, toast, copy, download, confirmDialog, barChart } from './ui.js';

// ---------------------------------------------------------------- HOME
export async function home(root, ctx) {
  const qs = await db.getAll('questions');
  const attempts = await db.getAll('attempts');
  const s = summarize(qs, attempts);
  const streak = streakDays(attempts);

  if (!qs.length) {
    root.innerHTML = `
      <div class="fade-in max-w-xl mx-auto">
        ${card(`
          <div class="text-center py-4">
            <div class="text-5xl mb-4">👋</div>
            <h1 class="text-2xl font-extrabold mb-2">Bienvenido a QuizAdif</h1>
            <p class="text-slate-500 text-sm mb-7 leading-relaxed">Estudia con tests, repite lo que fallas en el momento justo y mide tu progreso. Todo se guarda en tu dispositivo y funciona sin conexión.</p>
            <div class="flex flex-col gap-2">
              ${btn('📥 Importar preguntas (JSON)', 'data-nav="bank"').replace('py-2.5', 'py-3.5')}
              ${btn('✍️ Crear mi primera pregunta', 'data-new', 'ghost').replace('py-2.5', 'py-3.5')}
              ${btn('🤖 Generar preguntas con IA', 'data-nav="prompt"', 'ghost').replace('py-2.5', 'py-3.5')}
              ${btn('📘 ¿Cómo funciona esto?', 'data-nav="help"', 'ghost').replace('py-2.5', 'py-3.5')}
            </div>
          </div>`)}
      </div>`;
    root.querySelector('[data-new]').onclick = () => ctx.go('bank', { edit: 'new' });
    return;
  }

  const dueNow = s.due;
  root.innerHTML = `
    <div class="fade-in space-y-5">
      ${dueNow ? `
      <div class="bg-gradient-to-br from-brand-600 to-brand-900 text-white rounded-2xl p-5 md:p-6 shadow-lg">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-indigo-200 text-xs font-bold uppercase tracking-wider">Repaso de hoy</p>
            <h2 class="text-2xl font-extrabold mt-0.5">${dueNow} pregunta${dueNow > 1 ? 's' : ''} lista${dueNow > 1 ? 's' : ''}</h2>
            <p class="text-indigo-200 text-sm mt-1">Repásalas ahora para fijarlas en tu memoria.</p>
          </div>
          <div class="text-4xl">🧠</div>
        </div>
        <button data-review class="mt-4 w-full bg-white text-brand-700 font-extrabold py-3 rounded-xl active:scale-[.98] transition">Empezar repaso →</button>
      </div>` : `
      <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
        <div class="text-3xl mb-1">✅</div>
        <p class="font-extrabold text-emerald-800">Repaso al día</p>
        <p class="text-emerald-700 text-sm">No hay preguntas pendientes. Puedes practicar libremente.</p>
      </div>`}

      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        ${stat(s.totalQuestions, 'Preguntas', 'slate')}
        ${stat(`${s.rate}%`, 'Tasa acierto', 'emerald')}
        ${stat(s.byMastery.weak, 'Débiles', 'rose')}
        ${stat(`${streak}d`, 'Racha', 'amber')}
      </div>

      <div class="grid md:grid-cols-2 gap-4">
        ${card(`
          <h3 class="font-extrabold mb-3">Empezar a estudiar</h3>
          <div class="flex flex-col gap-2">
            ${btn('🎯 Práctica libre', 'data-nav="study"').replace('py-2.5', 'py-3')}
            ${btn('⏱️ Simulacro de examen', 'data-exam', 'amber').replace('py-2.5', 'py-3')}
            ${s.byMastery.weak ? btn(`🔥 Reforzar mis ${s.byMastery.weak} puntos débiles`, 'data-weak', 'ghost').replace('py-2.5', 'py-3') : ''}
          </div>`)}
        ${card(`
          <h3 class="font-extrabold mb-3">Tu dominio</h3>
          ${masteryBars(s)}
          <button data-nav="stats" class="text-xs font-bold text-brand-600 mt-4 hover:underline">Ver progreso detallado →</button>`)}
      </div>
    </div>`;

  root.querySelector('[data-review]')?.addEventListener('click', () => ctx.go('study', { auto: 'review' }));
  root.querySelector('[data-exam]')?.addEventListener('click', () => ctx.go('study', { auto: 'exam-combined' }));
  root.querySelector('[data-weak]')?.addEventListener('click', () => ctx.go('study', { auto: 'weak' }));
}

const masteryBars = (s) => {
  const t = Math.max(1, s.totalQuestions);
  const rows = [
    ['Dominadas', s.byMastery.mastered, 'emerald'],
    ['Aprendiendo', s.byMastery.learning, 'amber'],
    ['Débiles', s.byMastery.weak, 'rose'],
    ['Sin ver', s.byMastery.new, 'slate'],
  ];
  return rows.map(([l, n, c]) => `
    <div class="mb-2.5">
      <div class="flex justify-between text-xs font-bold mb-1"><span class="text-slate-600">${l}</span><span class="text-${c}-600 tabular-nums">${n}</span></div>
      ${bar(100 * n / t, c)}
    </div>`).join('');
};

// ---------------------------------------------------------------- STUDY (setup)
export async function study(root, ctx) {
  const qs = await db.getAll('questions');
  if (!qs.length) { root.innerHTML = empty('Sin preguntas', 'Importa o crea preguntas antes de estudiar.', btn('Ir al banco', 'data-nav="bank"')); return; }

  const topics = [...new Set(qs.map(q => q.topic))].sort();
  const cats = [...new Set(qs.map(q => q.category))].sort();
  const prefs = await db.getMeta('studyPrefs', { scope: 'all', topic:'ALL', category: 'ALL', limit: 20, shuffleOptions: true });
  const dueCount = qs.filter(isDue).length;
  const weakCount = qs.filter(q => mastery(q).key === 'weak').length;

  root.innerHTML = `
    <div class="fade-in max-w-2xl mx-auto space-y-4">
      <h1 class="text-2xl font-extrabold">Configurar sesión</h1>

      ${card(`
        <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Bloque</label>
        <select id="scope" class="w-full border-2 border-slate-200 rounded-xl px-4 py-3 font-semibold bg-white">
          <option value="all">General + Específico (${qs.length})</option>
          <option value="general" ${prefs.scope==='general'?'selected':''}>General (${qs.filter(q=>q.scope==='general').length})</option>
          <option value="specific" ${prefs.scope==='specific'?'selected':''}>Específico (${qs.filter(q=>q.scope==='specific').length})</option>
        </select>
        <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mt-5 mb-2">Tema</label>
        <select id="topic" class="w-full border-2 border-slate-200 rounded-xl px-4 py-3 font-semibold bg-white">
          <option value="ALL">Todos los temas</option>
          ${topics.map(c => `<option value="${esc(c)}" ${prefs.topic === c ? 'selected' : ''}>${esc(c)} (${qs.filter(q => q.topic === c).length})</option>`).join('')}
        </select>
        <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Categoría</label>
        <select id="cat" class="w-full border-2 border-slate-200 rounded-xl px-4 py-3 font-semibold bg-white focus:border-brand-500 focus:ring-0">
          <option value="ALL">Todas las categorías (${qs.length})</option>
          ${cats.map(c => `<option value="${esc(c)}" ${prefs.category === c ? 'selected' : ''}>${esc(c)} (${qs.filter(q => q.category === c).length})</option>`).join('')}
        </select>

        <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mt-5 mb-2">Nº de preguntas: <span id="limitVal" class="text-brand-600">${prefs.limit}</span></label>
        <input id="limit" type="range" min="5" max="100" step="5" value="${prefs.limit}" class="w-full accent-indigo-600">
        <div class="flex justify-between text-[10px] font-bold text-slate-400"><span>5</span><span>100</span></div>

        <label class="flex items-center gap-3 mt-5 cursor-pointer">
          <input id="shuf" type="checkbox" ${prefs.shuffleOptions ? 'checked' : ''} class="w-5 h-5 rounded accent-indigo-600">
          <span class="text-sm font-semibold">Barajar el orden de las respuestas <span class="text-slate-400 font-normal">(evita memorizar posiciones)</span></span>
        </label>
      `)}

      <div class="grid gap-3">
        ${modeCard('practice', '🎯', 'Práctica', 'Respuesta y explicación inmediatas. Ideal para aprender.', 'brand')}
        ${modeCard('new', '✨', 'Preguntas nuevas', 'Recorre primero lo que aún no has visto.', 'brand')}
        ${modeCard('mistakes', '🔁', 'Fallos pendientes', 'Recupera errores hasta consolidarlos con dos aciertos.', 'rose', !qs.some(q => q.mistakeDebt > 0))}
        ${modeCard('bookmarked', '🔖', 'Marcadas', 'Practica las preguntas que hayas guardado.', 'amber', !qs.some(q => q.bookmarked))}
        ${modeCard('review', '🧠', `Repaso inteligente${dueCount ? ` · ${dueCount} pendientes` : ''}`, 'Solo lo que toca repasar hoy según tu memoria.', 'emerald', !dueCount)}
        ${modeCard('weak', '🔥', `Puntos débiles${weakCount ? ` · ${weakCount}` : ''}`, 'Solo las preguntas que sueles fallar.', 'rose', !weakCount)}
      </div>
      <h2 class="text-xl font-extrabold pt-4">Simulacros</h2>
      <div class="grid md:grid-cols-3 gap-3">
        ${modeCard('exam-general','⏱️','General · 10','10 preguntas del bloque General.','amber',qs.filter(q=>q.scope==='general').length<10)}
        ${modeCard('exam-specific','⏱️','Específico · 20','20 preguntas del bloque Específico.','amber',qs.filter(q=>q.scope==='specific').length<20)}
        ${modeCard('exam-combined','🏁','Completo · 30','10 generales y 20 específicas.','amber',qs.filter(q=>q.scope==='general').length<10||qs.filter(q=>q.scope==='specific').length<20)}
      </div>
    </div>`;

  const $ = (id) => root.querySelector(id);
  $('#limit').oninput = e => $('#limitVal').textContent = e.target.value;

  const launch = async (mode) => {
    const isExam = mode.startsWith('exam-');
    const cfg = {
      scope: $('#scope').value,
      topic: $('#topic').value,
      category: $('#cat').value,
      limit: isExam ? null : +$('#limit').value,
      shuffleOptions: $('#shuf').checked,
      mode: isExam ? 'exam' : (['weak','new','mistakes','bookmarked'].includes(mode) ? 'practice' : mode),
      onlyWeak: mode === 'weak',
      state: ['new','mistakes','bookmarked'].includes(mode) ? mode : 'all',
      examType: isExam ? mode.replace('exam-','') : null,
    };
    await db.setMeta('studyPrefs', { scope:cfg.scope, topic:cfg.topic, category: cfg.category, limit: +$('#limit').value, shuffleOptions: cfg.shuffleOptions });
    ctx.launch(cfg);
  };
  root.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => launch(b.dataset.mode));

  if (ctx.params.auto) launch(ctx.params.auto);
}

const modeCard = (mode, icon, title, desc, color, disabled = false) => `
  <button data-mode="${mode}" ${disabled ? 'disabled' : ''} class="text-left bg-white border-2 border-slate-200 hover:border-${color}-500 rounded-2xl p-5 flex items-center gap-4 transition active:scale-[.99] disabled:opacity-40 disabled:pointer-events-none">
    <span class="text-3xl">${icon}</span>
    <span class="flex-1">
      <span class="block font-extrabold">${title}</span>
      <span class="block text-sm text-slate-500 mt-0.5">${desc}</span>
    </span>
    <span class="text-slate-300 text-xl">›</span>
  </button>`;

// ---------------------------------------------------------------- BANK
export async function bank(root, ctx) {
  const qs = await db.getAll('questions');
  const cats = [...new Set(qs.map(q => q.category))].sort();
  let filter = { text: '', category: 'ALL', state: 'ALL' };

  root.innerHTML = `
    <div class="fade-in space-y-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <h1 class="text-2xl font-extrabold">Banco de preguntas <span class="text-slate-400 font-bold text-lg">(${qs.length})</span></h1>
        <div class="flex gap-2">
          ${btn('＋ Nueva', 'data-new').replace('py-2.5 px-4', 'py-2 px-3 text-sm')}
          ${btn('📥 Importar', 'data-import', 'ghost').replace('py-2.5 px-4', 'py-2 px-3 text-sm')}
          ${btn('📤 Exportar', 'data-export', 'ghost').replace('py-2.5 px-4', 'py-2 px-3 text-sm')}
        </div>
      </div>

      ${card(`
        <p class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Importar preguntas</p>
        <div id="drop" class="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-brand-500 hover:bg-brand-50/40 transition cursor-pointer">
          <p class="font-bold text-slate-600 text-sm">Arrastra tu archivo .json aquí</p>
          <p class="text-xs text-slate-400 mt-1">o pulsa para seleccionarlo · también puedes pegar el JSON abajo</p>
          <input id="file" type="file" accept=".json,application/json" multiple hidden>
        </div>
        <details class="mt-3 group">
          <summary class="text-xs font-bold text-brand-600 cursor-pointer select-none">✎ Pegar JSON manualmente</summary>
          <textarea id="paste" rows="6" placeholder='{"questions":[{"enunciado":"...","options":["A","B"],"correctIndex":0,"feedback":"...","category":"Tema 1"}]}' class="w-full mt-2 border-2 border-slate-200 rounded-xl p-3 font-mono text-xs focus:border-brand-500 focus:ring-0"></textarea>
          <div class="flex gap-2 mt-2">${btn('Importar texto', 'data-paste').replace('py-2.5 px-4', 'py-2 px-3 text-sm')}</div>
        </details>
        <p class="text-[11px] text-slate-400 mt-3">Se detectan duplicados automáticamente. Tu progreso se conserva al reimportar.</p>
      `)}

      ${qs.length ? `
      <div class="flex gap-2 flex-wrap">
        <input id="q" placeholder="🔍 Buscar…" class="flex-1 min-w-[180px] border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:border-brand-500 focus:ring-0">
        <select id="fcat" class="border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold bg-white"><option value="ALL">Todas</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select>
        <select id="fst" class="border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold bg-white">
          <option value="ALL">Cualquier estado</option><option value="new">Nuevas</option><option value="learning">Aprendiendo</option><option value="weak">Débiles</option><option value="mastered">Dominadas</option><option value="due">Toca repasar</option>
        </select>
      </div>
      <div id="list" class="space-y-2"></div>` : empty('El banco está vacío', 'Importa un JSON, créalas a mano o genera un prompt para que una IA te las escriba.', btn('🤖 Ir al generador de prompts', 'data-nav="prompt"', 'ghost'))}
    </div>`;

  const $ = s => root.querySelector(s);

  // --- importación
  const doImport = async (text, name = 'JSON') => {
    try {
      const raw = extractQuestions(JSON.parse(text));
      const existing = await db.getAll('questions');
      const byKey = new Map(existing.map(q => [dedupeKey(q), q]));
      const byId = new Map(existing.map(q => [q.id, q]));

      let added = 0, dup = 0, bad = 0;
      const batch = [];
      for (const r of raw) {
        const q = normalizeQuestion(r);
        if (!q) { bad++; continue; }
        const prev = byId.get(q.id) ?? byKey.get(dedupeKey(q));
        if (prev) { // conserva progreso, actualiza contenido
          batch.push({ ...q, id: prev.id, srs: prev.srs, hist: prev.hist });
          dup++;
        } else { batch.push(q); byKey.set(dedupeKey(q), q); added++; }
      }
      if (batch.length) await db.putMany('questions', batch);
      toast(`${added} nuevas · ${dup} actualizadas${bad ? ` · ${bad} inválidas` : ''}`, bad ? 'warn' : 'ok');
      ctx.go('bank');
    } catch (e) {
      toast(`Error en ${name}: ${e.message}`, 'err');
    }
  };

  $('#drop').onclick = () => $('#file').click();
  $('#drop').ondragover = e => { e.preventDefault(); $('#drop').classList.add('border-brand-500', 'bg-brand-50'); };
  $('#drop').ondragleave = () => $('#drop').classList.remove('border-brand-500', 'bg-brand-50');
  $('#drop').ondrop = async e => {
    e.preventDefault();
    for (const f of e.dataTransfer.files) await doImport(await f.text(), f.name);
  };
  $('#file').onchange = async e => { for (const f of e.target.files) await doImport(await f.text(), f.name); };
  $('[data-paste]').onclick = () => { const t = $('#paste').value.trim(); t ? doImport(t, 'texto pegado') : toast('Pega el JSON primero', 'warn'); };

  $('[data-new]').onclick = () => editor(root, ctx, blankQuestion(), true);
  $('[data-export]').onclick = () => exportDialog(ctx);
  $('[data-import]').onclick = () => $('#file').click();

  if (!qs.length) return;
  if (ctx.params.edit === 'new') editor(root, ctx, blankQuestion(), true);

  // --- listado filtrado
  const renderList = () => {
    const f = qs.filter(q => {
      if (filter.category !== 'ALL' && q.category !== filter.category) return false;
      if (filter.state === 'due' ? !isDue(q) : filter.state !== 'ALL' && mastery(q).key !== filter.state) return false;
      if (filter.text && !(q.enunciado + q.options.join(' ')).toLowerCase().includes(filter.text)) return false;
      return true;
    });
    const list = $('#list');
    if (!f.length) { list.innerHTML = `<p class="text-center text-slate-400 text-sm py-10 font-semibold">Sin resultados.</p>`; return; }
    list.innerHTML = f.map(q => {
      const m = mastery(q);
      const rate = q.hist.seen ? Math.round(100 * q.hist.correct / q.hist.seen) : null;
      return `
      <div class="bg-white border border-slate-200 rounded-xl p-4 flex gap-3 items-start hover:border-brand-300 transition">
        <div class="flex-1 min-w-0">
          <p class="font-bold text-sm leading-snug line-clamp-2">${esc(q.enunciado)}</p>
          <div class="flex flex-wrap gap-1.5 mt-2 text-[10px] font-bold">
            <span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">${esc(q.category)}</span>
            <span class="px-2 py-0.5 rounded-full bg-${m.color}-100 text-${m.color}-700">${m.label}</span>
            ${rate !== null ? `<span class="px-2 py-0.5 rounded-full bg-slate-50 text-slate-500">${rate}% · ${q.hist.seen} intentos</span>` : ''}
            <span class="px-2 py-0.5 rounded-full bg-slate-50 text-slate-400">Repaso ${relTime(q.srs.dueAt)}</span>
          </div>
        </div>
        <div class="flex flex-col gap-1 shrink-0">
          <button data-edit="${q.id}" class="w-8 h-8 rounded-lg hover:bg-slate-100 grid place-items-center" title="Editar">✎</button>
          <button data-del="${q.id}" class="w-8 h-8 rounded-lg hover:bg-rose-50 text-rose-500 grid place-items-center" title="Eliminar">🗑</button>
        </div>
      </div>`;
    }).join('');

    list.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editor(root, ctx, qs.find(q => q.id === b.dataset.edit), false));
    list.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (await confirmDialog('¿Eliminar pregunta?', 'También se borra su historial de repaso.', 'Eliminar')) {
        await db.del('questions', b.dataset.del); toast('Pregunta eliminada'); ctx.go('bank');
      }
    });
  };

  $('#q').oninput = e => { filter.text = e.target.value.toLowerCase(); renderList(); };
  $('#fcat').onchange = e => { filter.category = e.target.value; renderList(); };
  $('#fst').onchange = e => { filter.state = e.target.value; renderList(); };
  renderList();
}

// ---------------------------------------------------------------- EDITOR (modal)
function editor(root, ctx, q0, isNew) {
  const q = structuredClone(q0);
  const el = h(`<div class="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm overflow-y-auto p-0 md:p-6"></div>`);
  const render = () => {
    el.innerHTML = `
      <div class="bg-white w-full md:max-w-2xl md:mx-auto rounded-t-2xl md:rounded-2xl min-h-full md:min-h-0 p-6 fade-in">
        <div class="flex justify-between items-center mb-5">
          <h2 class="text-xl font-extrabold">${isNew ? 'Nueva pregunta' : 'Editar pregunta'}</h2>
          <button data-close class="w-9 h-9 rounded-lg hover:bg-slate-100 text-xl">✕</button>
        </div>

        <label class="block text-xs font-bold uppercase text-slate-500 mb-1.5">Enunciado *</label>
        <textarea id="e" rows="3" class="w-full border-2 border-slate-200 rounded-xl p-3 focus:border-brand-500 focus:ring-0">${esc(q.enunciado)}</textarea>

        <label class="block text-xs font-bold uppercase text-slate-500 mt-4 mb-1.5">Opciones * <span class="normal-case font-normal text-slate-400">(marca la correcta)</span></label>
        <div id="opts" class="space-y-2">
          ${q.options.map((o, i) => `
            <div class="flex gap-2 items-center">
              <input type="radio" name="ok" ${i === q.correctIndex ? 'checked' : ''} data-ok="${i}" class="w-5 h-5 accent-emerald-600 shrink-0">
              <input value="${esc(o)}" data-opt="${i}" placeholder="Opción ${String.fromCharCode(65 + i)}" class="flex-1 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:border-brand-500 focus:ring-0">
              ${q.options.length > 2 ? `<button data-rm="${i}" class="w-9 h-9 rounded-lg text-rose-500 hover:bg-rose-50 shrink-0">✕</button>` : ''}
            </div>`).join('')}
        </div>
        ${q.options.length < 8 ? `<button data-add class="text-xs font-bold text-brand-600 mt-2 hover:underline">＋ Añadir opción</button>` : ''}

        <label class="block text-xs font-bold uppercase text-slate-500 mt-4 mb-1.5">Explicación <span class="normal-case font-normal text-slate-400">(el porqué — clave para aprender)</span></label>
        <textarea id="f" rows="3" class="w-full border-2 border-slate-200 rounded-xl p-3 focus:border-brand-500 focus:ring-0">${esc(q.feedback)}</textarea>

        <div class="grid grid-cols-2 gap-3 mt-4">
          <div>
            <label class="block text-xs font-bold uppercase text-slate-500 mb-1.5">Categoría</label>
            <input id="c" value="${esc(q.category)}" class="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:border-brand-500 focus:ring-0">
          </div>
          <div>
            <label class="block text-xs font-bold uppercase text-slate-500 mb-1.5">Dificultad</label>
            <select id="d" class="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 bg-white">
              ${[1, 2, 3].map(n => `<option value="${n}" ${q.difficulty === n ? 'selected' : ''}>${['Fácil', 'Media', 'Difícil'][n - 1]}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="flex gap-3 mt-7">
          ${btn('Cancelar', 'data-close', 'ghost').replace('py-2.5', 'py-3 flex-1')}
          ${btn('Guardar', 'data-save').replace('py-2.5', 'py-3 flex-1')}
        </div>
      </div>`;

    el.querySelectorAll('[data-close]').forEach(b => b.onclick = () => el.remove());
    el.querySelectorAll('[data-opt]').forEach(i => i.oninput = e => q.options[+e.target.dataset.opt] = e.target.value);
    el.querySelectorAll('[data-ok]').forEach(i => i.onchange = e => q.correctIndex = +e.target.dataset.ok);
    el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      const i = +b.dataset.rm; sync();
      q.options.splice(i, 1);
      q.correctIndex = clamp(q.correctIndex >= i ? q.correctIndex - 1 : q.correctIndex, 0, q.options.length - 1);
      render();
    });
    el.querySelector('[data-add]')?.addEventListener('click', () => { sync(); q.options.push(''); render(); });
    el.querySelector('[data-save]').onclick = async () => {
      sync();
      const norm = normalizeQuestion(q);
      if (!norm) return toast('Falta el enunciado o hay menos de 2 opciones con texto', 'err');
      await db.put('questions', { ...norm, id: q.id, srs: q.srs, hist: q.hist });
      toast(isNew ? 'Pregunta creada' : 'Cambios guardados');
      el.remove(); ctx.go('bank');
    };
  };
  const sync = () => {
    q.enunciado = el.querySelector('#e').value;
    q.feedback = el.querySelector('#f').value;
    q.category = el.querySelector('#c').value;
    q.difficulty = +el.querySelector('#d').value;
    el.querySelectorAll('[data-opt]').forEach(i => q.options[+i.dataset.opt] = i.value);
  };
  render();
  document.body.appendChild(el);
}

// ---------------------------------------------------------------- EXPORT
async function exportDialog(ctx) {
  const questions = await db.getAll('questions');
  const attempts = await db.getAll('attempts');
  const sessions = await db.getAll('sessions');
  const date = new Date().toISOString().slice(0, 10);

  const el = h(`
    <div class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4">
      <div class="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 fade-in">
        <h2 class="text-xl font-extrabold mb-1">Exportar</h2>
        <p class="text-slate-500 text-sm mb-5">Guarda una copia o llévala a otro dispositivo.</p>
        <div class="flex flex-col gap-2">
          ${btn('💾 Copia completa (preguntas + progreso)', 'data-full').replace('py-2.5', 'py-3 text-left')}
          ${btn('📄 Solo preguntas (para compartir)', 'data-only', 'ghost').replace('py-2.5', 'py-3 text-left')}
          ${btn('📋 Copiar al portapapeles', 'data-clip', 'ghost').replace('py-2.5', 'py-3 text-left')}
          ${btn('🗑️ Borrar todos los datos', 'data-wipe', 'danger').replace('py-2.5', 'py-3 text-left')}
          ${btn('Cerrar', 'data-close', 'ghost').replace('py-2.5', 'py-3')}
        </div>
      </div>
    </div>`);
  const full = () => JSON.stringify({ version: 1, exportedAt: Date.now(), questions, attempts, sessions }, null, 2);
  const only = () => JSON.stringify({ questions: questions.map(({ srs, hist, ...q }) => q) }, null, 2);

  el.querySelector('[data-full]').onclick = () => { download(`quizadif-backup-${date}.json`, full()); el.remove(); };
  el.querySelector('[data-only]').onclick = () => { download(`preguntas-${date}.json`, only()); el.remove(); };
  el.querySelector('[data-clip]').onclick = () => { copy(only()); el.remove(); };
  el.querySelector('[data-wipe]').onclick = async () => {
    el.remove();
    if (await confirmDialog('¿Borrar TODO?', 'Se eliminarán preguntas, progreso e historial. Exporta antes si quieres conservarlos.', 'Borrar todo')) {
      await Promise.all(['questions', 'attempts', 'sessions'].map(s => db.clear(s)));
      toast('Datos borrados'); ctx.go('home');
    }
  };
  el.querySelector('[data-close]').onclick = () => el.remove();
  el.onclick = e => { if (e.target === el) el.remove(); };
  document.body.appendChild(el);
}

// ---------------------------------------------------------------- STATS
export async function stats(root) {
  const qs = await db.getAll('questions');
  const attempts = await db.getAll('attempts');
  const sessions = await db.getAll('sessions');
  if (!attempts.length) { root.innerHTML = empty('Aún sin datos', 'Completa una sesión de estudio y aquí verás tu evolución.', btn('Estudiar ahora', 'data-nav="study"')); return; }

  const s = summarize(qs, attempts);
  const series = dailySeries(attempts, 14);
  const streak = streakDays(attempts);
  const cats = Object.entries(s.byCategory).sort((a, b) => (a[1].rate ?? 101) - (b[1].rate ?? 101));
  const worst = cats.filter(([, c]) => c.rate !== null && c.rate < 70);
  const gen = attempts.filter(a=>a.scope==='general'), spec=attempts.filter(a=>a.scope==='specific');
  const rateOf = a => a.length ? Math.round(100*a.filter(x=>x.correct).length/a.length) : 0;
  const exams = sessions.filter(x=>x.mode==='exam').sort((a,b)=>b.at-a.at).slice(0,10);
  const mistakeCount = qs.filter(q=>(q.mistakeDebt??0)>0).length;
  const avgSeconds = attempts.filter(a=>a.elapsedMs).length ? Math.round(attempts.filter(a=>a.elapsedMs).reduce((n,a)=>n+a.elapsedMs,0)/attempts.filter(a=>a.elapsedMs).length/1000) : 0;

  root.innerHTML = `
    <div class="fade-in space-y-4">
      <h1 class="text-2xl font-extrabold">Tu progreso</h1>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        ${stat(s.answered, 'Respuestas', 'slate')}
        ${stat(`${s.rate}%`, 'Tasa acierto', 'emerald')}
        ${stat(`${streak}d`, 'Racha', 'amber')}
        ${stat(sessions.length, 'Sesiones', 'brand'.replace('brand', 'slate'))}
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        ${stat(`${rateOf(gen)}%`,'General','brand')}${stat(`${rateOf(spec)}%`,'Específico','amber')}${stat(mistakeCount,'Fallos pendientes','rose')}${stat(`${avgSeconds}s`,'Tiempo/pregunta','slate')}
      </div>

      ${card(`
        <h3 class="font-extrabold mb-1">Actividad (14 días)</h3>
        <p class="text-xs text-slate-400 mb-3"><span class="text-emerald-500 font-bold">■</span> aciertos · <span class="text-rose-400 font-bold">■</span> fallos</p>
        ${barChart(series)}`)}

      ${worst.length ? `
      <div class="bg-amber-50 border border-amber-200 rounded-2xl p-5">
        <h3 class="font-extrabold text-amber-900 mb-1">💡 Dónde centrarte</h3>
        <p class="text-sm text-amber-800">Tu punto más flojo es <b>${esc(worst[0][1].topic)} · ${esc(worst[0][1].category)}</b> (${worst[0][1].rate}% de acierto).</p>
      </div>` : ''}

      ${card(`
        <h3 class="font-extrabold mb-4">Rendimiento por categoría</h3>
        <div class="space-y-3">
          ${cats.map(([, c]) => `
            <div>
              <div class="flex justify-between text-xs font-bold mb-1">
                <span class="text-slate-700 truncate pr-2">${c.scope==='specific'?'Específico':'General'} · ${esc(c.topic)} · ${esc(c.category)}</span>
                <span class="tabular-nums shrink-0 ${c.rate === null ? 'text-slate-300' : c.rate >= 80 ? 'text-emerald-600' : c.rate >= 60 ? 'text-amber-600' : 'text-rose-500'}">${c.rate === null ? 'sin datos' : c.rate + '%'} · ${c.total}p</span>
              </div>
              ${bar(c.rate ?? 0, c.rate === null ? 'slate' : c.rate >= 80 ? 'emerald' : c.rate >= 60 ? 'amber' : 'rose')}
            </div>`).join('')}
        </div>`)}

      ${card(`
        <h3 class="font-extrabold mb-4">Estado de tus preguntas</h3>
        ${masteryBars(s)}
        <p class="text-xs text-slate-400 mt-3">Una pregunta se considera <b>dominada</b> tras 3 aciertos seguidos con ≥80% de acierto histórico.</p>`)}
      ${exams.length?card(`<h3 class="font-extrabold mb-4">Últimos simulacros</h3><div class="space-y-2">${exams.map(x=>`<div class="flex justify-between border-b pb-2 text-sm"><span>${new Date(x.at).toLocaleDateString('es')} · ${x.examType||'simulacro'}</span><b>${x.correct}/${x.total} · ${Math.round(100*x.correct/x.total)}%</b></div>`).join('')}</div>`):''}
    </div>`;
}

// ---------------------------------------------------------------- PROMPT GENERATOR
export async function prompt(root) {
  const cfg = await db.getMeta('promptCfg', { topic: '', n: 20, level: 'Intermedio', opts: 4, lang: 'Español', style: 'Aplicación práctica', source: '' });

  root.innerHTML = `
    <div class="fade-in max-w-3xl mx-auto space-y-4">
      <div>
        <h1 class="text-2xl font-extrabold">Generador de prompts para IA</h1>
        <p class="text-slate-500 text-sm mt-1">Rellena el formulario, copia el prompt y pégalo en ChatGPT, Claude o Gemini. Te devolverá un JSON que puedes importar directamente en el <b>Banco</b>.</p>
      </div>

      ${card(`
        <label class="block text-xs font-bold uppercase text-slate-500 mb-1.5">Tema / asignatura *</label>
        <input id="topic" value="${esc(cfg.topic)}" placeholder="p. ej. Constitución Española, Título II" class="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:border-brand-500 focus:ring-0">

        <label class="block text-xs font-bold uppercase text-slate-500 mt-4 mb-1.5">Material de origen <span class="normal-case font-normal text-slate-400">(opcional: pega tus apuntes y la IA solo usará eso)</span></label>
        <textarea id="source" rows="4" placeholder="Pega aquí tus apuntes, temario o resumen…" class="w-full border-2 border-slate-200 rounded-xl p-3 text-sm focus:border-brand-500 focus:ring-0">${esc(cfg.source)}</textarea>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <div><label class="block text-xs font-bold uppercase text-slate-500 mb-1.5">Nº preguntas</label>
            <input id="n" type="number" min="5" max="100" value="${cfg.n}" class="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5"></div>
          <div><label class="block text-xs font-bold uppercase text-slate-500 mb-1.5">Opciones</label>
            <select id="opts" class="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 bg-white">${[3, 4, 5].map(n => `<option ${cfg.opts === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          <div><label class="block text-xs font-bold uppercase text-slate-500 mb-1.5">Nivel</label>
            <select id="level" class="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 bg-white">${['Básico', 'Intermedio', 'Avanzado', 'Oposición/Certificación'].map(l => `<option ${cfg.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div><label class="block text-xs font-bold uppercase text-slate-500 mb-1.5">Idioma</label>
            <select id="lang" class="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 bg-white">${['Español', 'English', 'Català', 'Français'].map(l => `<option ${cfg.lang === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        </div>

        <label class="block text-xs font-bold uppercase text-slate-500 mt-4 mb-1.5">Enfoque cognitivo</label>
        <select id="style" class="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 bg-white">
          ${['Memorización de datos', 'Comprensión de conceptos', 'Aplicación práctica', 'Análisis y casos', 'Mixto (recomendado)'].map(l => `<option ${cfg.style === l ? 'selected' : ''}>${l}</option>`).join('')}
        </select>

        <div class="flex gap-2 mt-6">
          ${btn('📋 Copiar prompt', 'data-copy').replace('py-2.5', 'py-3 flex-1')}
          ${btn('⬇️ Descargar .txt', 'data-dl', 'ghost').replace('py-2.5', 'py-3')}
        </div>
      `)}

      ${card(`
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-extrabold">Vista previa del prompt</h3>
          <span class="text-[10px] font-bold text-slate-400" id="chars"></span>
        </div>
        <pre id="out" class="bg-slate-900 text-slate-100 rounded-xl p-4 text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap font-mono max-h-96 overflow-y-auto"></pre>
      `)}

      <div class="bg-brand-50 border border-brand-100 rounded-2xl p-5 text-sm text-slate-700 leading-relaxed">
        <p class="font-extrabold text-brand-900 mb-2">Cómo usarlo (3 pasos)</p>
        <ol class="list-decimal ml-5 space-y-1">
          <li>Pulsa <b>Copiar prompt</b>.</li>
          <li>Pégalo en tu IA favorita y espera la respuesta.</li>
          <li>Copia el JSON que te devuelva y pégalo en <b>Banco → Pegar JSON manualmente</b>.</li>
        </ol>
      </div>
    </div>`;

  const $ = s => root.querySelector(s);
  const read = () => ({
    topic: $('#topic').value.trim(), source: $('#source').value.trim(),
    n: clamp(+$('#n').value, 1, 200), opts: +$('#opts').value,
    level: $('#level').value, lang: $('#lang').value, style: $('#style').value,
  });

  const update = async () => {
    const c = read();
    const text = buildPrompt(c);
    $('#out').textContent = text;
    $('#chars').textContent = `${text.length} caracteres`;
    await db.setMeta('promptCfg', c);
  };
  root.querySelectorAll('input,select,textarea').forEach(i => i.oninput = update);
  $('[data-copy]').onclick = () => copy(buildPrompt(read()));
  $('[data-dl]').onclick = () => download('prompt-quizadif.txt', buildPrompt(read()), 'text/plain');
  update();
}

function buildPrompt(c) {
  const topic = c.topic || '[ESCRIBE AQUÍ TU TEMA]';
  const letters = 'ABCDE'.slice(0, c.opts).split('').join(', ');
  return `Actúa como un experto en ${topic} y en diseño de evaluaciones educativas.

TAREA
Genera ${c.n} preguntas tipo test sobre: ${topic}
Nivel: ${c.level}. Idioma: ${c.lang}. Enfoque: ${c.style}.
${c.source ? `\nUSA EXCLUSIVAMENTE ESTE MATERIAL COMO FUENTE (no inventes nada fuera de él):\n"""\n${c.source}\n"""\n` : ''}
REGLAS DE CALIDAD
1. Cada pregunta tiene exactamente ${c.opts} opciones (${letters}) y UNA sola correcta.
2. Los distractores deben ser plausibles y del mismo largo/registro que la correcta: nada de opciones absurdas o descartables a simple vista.
3. Prohibido "todas las anteriores", "ninguna de las anteriores" y pistas gramaticales que delaten la respuesta.
4. El enunciado debe entenderse sin ver las opciones.
5. El campo "feedback" explica POR QUÉ la correcta es correcta y, si aporta, por qué falla el error más típico. 1-3 frases. Es lo que el estudiante leerá para aprender: cuídalo.
6. Varía la posición de la respuesta correcta entre preguntas.
7. Agrupa las preguntas en "category" por subtema real (3-8 subtemas), no uses una sola categoría genérica.
8. "difficulty": 1 = fácil, 2 = media, 3 = difícil. Reparte aproximadamente 30/50/20.
9. Sin preguntas duplicadas ni redundantes entre sí.

FORMATO DE SALIDA (OBLIGATORIO)
Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, sin bloques de código markdown, sin comentarios.
"correctIndex" es el índice de la opción correcta EMPEZANDO EN 0 (0 = primera opción).

{
  "questions": [
    {
      "enunciado": "Texto completo de la pregunta",
      "options": [${Array.from({ length: c.opts }, (_, i) => `"Opción ${'ABCDE'[i]}"`).join(', ')}],
      "correctIndex": 0,
      "feedback": "Explicación de por qué esta es la respuesta correcta.",
      "category": "Subtema concreto",
      "difficulty": 2,
      "tags": ["palabra-clave"]
    }
  ]
}

Antes de responder, verifica internamente: ¿el JSON parsea?, ¿hay ${c.n} preguntas?, ¿todos los "correctIndex" están entre 0 y ${c.opts - 1}?, ¿ninguna opción está repetida dentro de su pregunta?`;
}

// ---------------------------------------------------------------- HELP
export async function help(root) {
  const u = await db.usage();
  const mb = u ? (u.usage / 1048576).toFixed(1) : null;

  root.innerHTML = `
    <div class="fade-in max-w-3xl mx-auto space-y-4">
      <div>
        <h1 class="text-2xl font-extrabold">¿Qué es esto y cómo se usa?</h1>
        <p class="text-slate-500 text-sm mt-1">Explicado sin tecnicismos. Léelo una vez y ya lo sabrás todo.</p>
      </div>

      ${section('🎓', 'En una frase', `
        <p>QuizAdif es una app para <b>preparar exámenes tipo test de ADIF</b>. Incluye un banco clasificado, simulacros, explicación de fallos y repaso inteligente.</p>`)}

      ${section('🧠', 'El truco: la repetición espaciada', `
        <p>Nuestro cerebro olvida rápido lo que solo lee una vez. La ciencia dice que lo mejor es <b>repasar justo antes de olvidarlo</b>.</p>
        <p class="mt-2">La app lleva esa cuenta por ti:</p>
        <ul class="list-disc ml-5 mt-2 space-y-1">
          <li>Si <b>fallas</b> una pregunta, te la vuelve a sacar en minutos.</li>
          <li>Si <b>aciertas dudando</b>, te la saca en pocos días.</li>
          <li>Si la <b>tienes dominada</b>, la espacia semanas.</li>
        </ul>
        <p class="mt-2">Por eso, cuando aciertas, te pregunta si dudaste o lo tenías claro: esa respuesta afina el calendario. Sé sincero contigo mismo, es lo que hace que funcione.</p>`)}

      ${section('🗂️', 'Las cinco pantallas', `
        <dl class="space-y-3">
          <div><dt class="font-bold">Inicio</dt><dd class="text-slate-600">Tu resumen del día: qué toca repasar y accesos rápidos.</dd></div>
          <div><dt class="font-bold">Estudiar</dt><dd class="text-slate-600">Eliges categoría, cuántas preguntas y el modo:
            <ul class="list-disc ml-5 mt-1">
              <li><b>Práctica</b>: te corrige al instante y te explica. Para aprender.</li>
              <li><b>Examen</b>: no te dice nada hasta el final. Para medirte.</li>
              <li><b>Repaso inteligente</b>: solo lo que hoy toca según tu memoria.</li>
              <li><b>Puntos débiles</b>: solo lo que sueles fallar.</li>
            </ul>
          </dd></div>
          <div><dt class="font-bold">Banco</dt><dd class="text-slate-600">Tu almacén de preguntas. Aquí importas, creas, buscas, editas, borras y exportas.</dd></div>
          <div><dt class="font-bold">Progreso</dt><dd class="text-slate-600">Tu tasa de acierto, tu racha de días y en qué temas cojeas.</dd></div>
          <div><dt class="font-bold">Generador IA</dt><dd class="text-slate-600">Fabrica el texto que debes pegarle a una IA para que te escriba las preguntas con el formato exacto.</dd></div>
        </dl>`)}

      ${section('🤖', 'Cómo conseguir preguntas sin escribirlas', `
        <ol class="list-decimal ml-5 space-y-1">
          <li>Ve a <b>Generador IA</b> y escribe tu tema (y pega tus apuntes si los tienes).</li>
          <li>Pulsa <b>Copiar prompt</b>.</li>
          <li>Pégalo en ChatGPT, Claude o Gemini.</li>
          <li>Copia el bloque JSON que te devuelva.</li>
          <li>Ve a <b>Banco → Pegar JSON manualmente</b>, pégalo e importa.</li>
        </ol>
        <p class="mt-2 text-slate-500 text-sm">Si la IA se equivoca de formato, la app te avisará y te dirá cuántas preguntas ha descartado.</p>`)}

      ${section('💾', '¿Dónde se guardan mis datos?', `
        <p><b>En tu propio dispositivo</b>, en la memoria del navegador. No hay servidores, no hay cuentas y nadie más ve tus datos.</p>
        <p class="mt-2">Consecuencias prácticas:</p>
        <ul class="list-disc ml-5 mt-1 space-y-1">
          <li>Todo funciona <b>sin internet</b>.</li>
          <li>El progreso <b>no viaja solo</b> de tu móvil al ordenador. Para pasarlo: <b>Banco → Exportar → Copia completa</b> y luego importa ese archivo en el otro dispositivo.</li>
          <li>Si borras los datos de navegación o desinstalas, se pierden. <b>Exporta de vez en cuando.</b></li>
        </ul>
        ${mb ? `<p class="mt-3 text-xs text-slate-400">Ahora mismo ocupas <b>${mb} MB</b> de ${(u.quota / 1073741824).toFixed(1)} GB disponibles.</p>` : ''}`)}

      ${section('📱', 'Instalarla como app en el móvil', `
        <p><b>Android / Chrome:</b> pulsa el botón <b>⤓ Instalar</b> de arriba, o el menú ⋮ → «Añadir a pantalla de inicio».</p>
        <p class="mt-2"><b>iPhone / Safari:</b> pulsa el botón Compartir <b>􀈂</b> → «Añadir a pantalla de inicio».</p>
        <p class="mt-2">Aparecerá un icono como cualquier otra app, se abrirá a pantalla completa y funcionará sin conexión.</p>`)}

      ${section('⌨️', 'Atajos (ordenador)', `
        <div class="grid grid-cols-2 gap-2 text-sm">
          <div><kbd class="px-2 py-1 bg-slate-100 rounded font-mono text-xs">A</kbd>–<kbd class="px-2 py-1 bg-slate-100 rounded font-mono text-xs">D</kbd> Elegir respuesta</div>
          <div><kbd class="px-2 py-1 bg-slate-100 rounded font-mono text-xs">Enter</kbd> Siguiente pregunta</div>
          <div><kbd class="px-2 py-1 bg-slate-100 rounded font-mono text-xs">2</kbd> «Dudé»</div>
          <div><kbd class="px-2 py-1 bg-slate-100 rounded font-mono text-xs">3</kbd> «Lo sabía»</div>
        </div>`)}

      ${section('📋', 'El formato de las preguntas (por si lo escribes a mano)', `
        <pre class="bg-slate-900 text-slate-100 rounded-xl p-4 text-[11px] overflow-x-auto font-mono">{
  "questions": [
    {
      "enunciado": "¿Cuál es la capital de Francia?",
      "options": ["Lyon", "París", "Marsella", "Niza"],
      "correctIndex": 1,
      "feedback": "París es la capital desde 987.",
      "category": "Geografía",
      "difficulty": 1
    }
  ]
}</pre>
        <p class="mt-2 text-sm text-slate-600">Lo único delicado: <code class="bg-slate-100 px-1 rounded">correctIndex</code> <b>empieza a contar en 0</b>. Si la correcta es la segunda opción, el valor es <code class="bg-slate-100 px-1 rounded">1</code>.</p>
        <p class="mt-1 text-sm text-slate-500">Solo <code>enunciado</code>, <code>options</code> y <code>correctIndex</code> son obligatorios.</p>`)}

      ${section('🧯', 'Problemas típicos', `
        <dl class="space-y-2 text-sm">
          <div><dt class="font-bold">«Error en el JSON»</dt><dd class="text-slate-600">La IA añadió texto o comillas raras. Asegúrate de copiar solo desde <code>{</code> hasta el <code>}</code> final.</dd></div>
          <div><dt class="font-bold">«X inválidas»</dt><dd class="text-slate-600">Esas preguntas no tenían enunciado, tenían menos de 2 opciones o un <code>correctIndex</code> fuera de rango. Las demás sí se importaron.</dd></div>
          <div><dt class="font-bold">Reimporté y perdí el progreso</dt><dd class="text-slate-600">No: si la pregunta ya existía, la app conserva su historial y solo actualiza el texto.</dd></div>
        </dl>`)}
    </div>`;
}

const section = (icon, title, body) => card(`
  <h2 class="font-extrabold text-lg flex items-center gap-2 mb-3"><span>${icon}</span>${esc(title)}</h2>
  <div class="text-slate-700 text-sm leading-relaxed">${body}</div>`);
