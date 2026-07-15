// Modelo de dominio: esquema de pregunta, normalización, SRS (SM-2 simplificado) y métricas.

export const DAY = 86400000;

/**
 * Pregunta canónica:
 * { id, scope, topic, category, subtopic, documentId, section, page,
 *   enunciado, options[], correctIndex, feedback, difficulty, tags[],
 *   source, createdAt, srs:{ ease, interval, reps, lapses, dueAt, lastAt }, hist:{ seen, correct, incorrect, streak } }
 */

const uid = () => (crypto.randomUUID?.() ?? `q_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);

const newSrs = () => ({ ease: 2.5, interval: 0, reps: 0, lapses: 0, dueAt: Date.now(), lastAt: null });
const newHist = () => ({ seen: 0, correct: 0, incorrect: 0, streak: 0 });

/** Acepta variantes comunes de nombres de campo y devuelve la pregunta canónica (o null si es inválida). */
export function normalizeQuestion(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const enunciado = String(raw.enunciado ?? raw.question ?? raw.pregunta ?? raw.text ?? '').trim();
  const options = (raw.options ?? raw.opciones ?? raw.choices ?? []).map(o =>
    typeof o === 'string' ? o.trim() : String(o?.text ?? o?.label ?? '').trim()
  ).filter(Boolean);

  let correctIndex = raw.correctIndex ?? raw.correcta ?? raw.answerIndex ?? raw.correct;
  if (typeof correctIndex === 'string') {
    const letter = correctIndex.trim().toUpperCase();
    correctIndex = /^[A-Z]$/.test(letter) ? letter.charCodeAt(0) - 65 : Number(correctIndex);
  }
  correctIndex = Number(correctIndex);

  if (!enunciado || options.length < 2 || !Number.isInteger(correctIndex)) return null;
  if (correctIndex < 0 || correctIndex >= options.length) return null;

  return {
    id: String(raw.id ?? uid()),
    enunciado,
    options,
    correctIndex,
    feedback: String(raw.feedback ?? raw.explicacion ?? raw.explanation ?? '').trim(),
    scope: ['general', 'specific'].includes(raw.scope) ? raw.scope : 'general',
    topic: String(raw.topic ?? raw.tema ?? raw.category ?? 'General').trim() || 'General',
    category: String(raw.category ?? raw.categoria ?? raw.tema ?? 'General').trim() || 'General',
    subtopic: String(raw.subtopic ?? raw.subtema ?? '').trim(),
    documentId: String(raw.documentId ?? raw.documento ?? raw.source ?? '').trim(),
    documentRevision: String(raw.documentRevision ?? '').trim(),
    section: String(raw.section ?? raw.epigrafe ?? '').trim(),
    page: raw.page == null ? null : Number(raw.page),
    sourceQuote: String(raw.sourceQuote ?? '').trim(),
    status: ['draft', 'reviewed', 'verified'].includes(raw.status) ? raw.status : 'draft',
    difficulty: clamp(Number(raw.difficulty ?? raw.dificultad ?? 2), 1, 3),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    source: String(raw.source ?? raw.fuente ?? '').trim(),
    bookmarked: Boolean(raw.bookmarked),
    mistakeDebt: Math.max(0, Number(raw.mistakeDebt ?? 0)),
    createdAt: Number(raw.createdAt ?? Date.now()),
    srs: raw.srs ?? newSrs(),
    hist: raw.hist ?? newHist(),
  };
}

export const blankQuestion = () => ({
  id: uid(), enunciado: '', options: ['', '', '', ''], correctIndex: 0,
  feedback: '', scope: 'general', topic: 'General', category: 'General', subtopic: '',
  documentId: '', documentRevision: '', section: '', page: null, sourceQuote: '', status: 'draft',
  difficulty: 2, tags: [], source: '', bookmarked: false, mistakeDebt: 0,
  createdAt: Date.now(), srs: newSrs(), hist: newHist(),
});

/** Clave de deduplicación: enunciado normalizado. */
export const dedupeKey = (q) =>
  q.enunciado.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Extrae array de preguntas de cualquier envoltorio razonable de JSON. */
export function extractQuestions(data) {
  const arr = Array.isArray(data) ? data
    : Array.isArray(data?.questions) ? data.questions
    : Array.isArray(data?.preguntas) ? data.preguntas
    : Array.isArray(data?.items) ? data.items
    : null;
  if (!arr) throw new Error('No se encontró un array de preguntas (usa {"questions":[...]}).');
  return arr;
}

// ---- SRS (SM-2 simplificado, 3 grados) --------------------------------------
/** grade: 0 = fallo, 1 = acierto dudoso, 2 = acierto claro */
export function schedule(srs, grade, now = Date.now()) {
  const s = { ...srs, lastAt: now };
  if (grade === 0) {
    s.lapses++; s.reps = 0; s.interval = 0;
    s.ease = clamp(s.ease - 0.2, 1.3, 3.0);
    s.dueAt = now + 10 * 60000;           // reaparece en 10 min
    return s;
  }
  s.reps++;
  s.ease = clamp(s.ease + (grade === 2 ? 0.1 : -0.05), 1.3, 3.0);
  s.interval = s.reps === 1 ? 1 : s.reps === 2 ? 3 : Math.round(s.interval * s.ease);
  s.dueAt = now + s.interval * DAY;
  return s;
}

export const isDue = (q, now = Date.now()) => (q.srs?.dueAt ?? 0) <= now;

/** Estado de dominio de la pregunta para la UI. */
export function mastery(q) {
  const { seen, correct, streak } = q.hist;
  if (!seen) return { key: 'new', label: 'Nueva', color: 'slate' };
  const rate = correct / seen;
  if (streak >= 3 && rate >= 0.8) return { key: 'mastered', label: 'Dominada', color: 'emerald' };
  if (rate < 0.5) return { key: 'weak', label: 'Débil', color: 'rose' };
  return { key: 'learning', label: 'Aprendiendo', color: 'amber' };
}

export function applyResult(q, isCorrect, grade, now = Date.now()) {
  const hist = { ...q.hist };
  hist.seen++;
  if (isCorrect) { hist.correct++; hist.streak++; } else { hist.incorrect++; hist.streak = 0; }
  const mistakeDebt = isCorrect ? Math.max(0, (q.mistakeDebt ?? 0) - 1) : Math.min(3, (q.mistakeDebt ?? 0) + 2);
  return { ...q, hist, mistakeDebt, srs: schedule(q.srs, grade, now) };
}

// ---- Métricas ---------------------------------------------------------------
export function summarize(questions, attempts) {
  const seen = questions.filter(q => q.hist.seen > 0);
  const correct = attempts.filter(a => a.correct).length;
  const byMastery = { new: 0, learning: 0, weak: 0, mastered: 0 };
  questions.forEach(q => byMastery[mastery(q).key]++);

  const byCategory = {};
  for (const q of questions) {
    const key = `${q.scope}|${q.topic}|${q.category}`;
    const c = (byCategory[key] ??= { scope:q.scope, topic:q.topic, category:q.category, total: 0, seen: 0, correct: 0, incorrect: 0, due: 0 });
    c.total++; c.seen += q.hist.seen; c.correct += q.hist.correct; c.incorrect += q.hist.incorrect;
    if (isDue(q)) c.due++;
  }
  Object.values(byCategory).forEach(c => c.rate = c.seen ? Math.round(100 * c.correct / c.seen) : null);

  return {
    totalQuestions: questions.length,
    studied: seen.length,
    answered: attempts.length,
    correct,
    incorrect: attempts.length - correct,
    rate: attempts.length ? Math.round(100 * correct / attempts.length) : 0,
    due: questions.filter(q => isDue(q)).length,
    byMastery,
    byCategory,
  };
}

/** Serie diaria de aciertos/fallos de los últimos n días. */
export function dailySeries(attempts, days = 14) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const from = today.getTime() - i * DAY, to = from + DAY;
    const a = attempts.filter(x => x.at >= from && x.at < to);
    out.push({
      label: new Date(from).toLocaleDateString('es', { day: '2-digit', month: '2-digit' }),
      correct: a.filter(x => x.correct).length,
      incorrect: a.filter(x => !x.correct).length,
    });
  }
  return out;
}

/** Racha de días consecutivos con actividad. */
export function streakDays(attempts) {
  if (!attempts.length) return 0;
  const set = new Set(attempts.map(a => new Date(a.at).toDateString()));
  let n = 0; const d = new Date();
  if (!set.has(d.toDateString())) d.setDate(d.getDate() - 1); // permite que hoy aún no haya empezado
  while (set.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [r[i], r[j]] = [r[j], r[i]]; } return r; };
export function stratifiedSample(items, limit, key = q => q.topic) {
  if (!limit || items.length <= limit) return shuffle(items);
  const groups = new Map();
  shuffle(items).forEach(x => { const k = key(x); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); });
  const out = [], buckets = [...groups.values()];
  while (out.length < limit && buckets.some(b => b.length)) for (const b of buckets) {
    if (out.length < limit && b.length) out.push(b.pop());
  }
  return shuffle(out);
}
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
export const relTime = (ts) => {
  if (!ts) return '—';
  const d = ts - Date.now(), abs = Math.abs(d);
  const f = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  if (abs < 3600e3) return f.format(Math.round(d / 60000), 'minute');
  if (abs < DAY) return f.format(Math.round(d / 3600e3), 'hour');
  return f.format(Math.round(d / DAY), 'day');
};
