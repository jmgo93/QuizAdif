const TOPIC_VISUALS = {
  'Código Ético y gestión': ['📜', '#fff7d6', '#e9c96b'],
  'Declaración sobre la Red': ['🌐', '#e5f1ff', '#85b7e8'],
  'II Plan de Igualdad': ['⚖️', '#fde8f2', '#e6a1bf'],
  'Plan Estratégico 2030': ['🧭', '#eee9ff', '#ac9be8'],
  'Información y gestión de riesgos': ['🛡️', '#ddf7f7', '#79caca'],
  'Inspección de obras de tierra': ['⛰️', '#ffeddd', '#dda77a'],
  'Vigilancia de vía en cabina': ['🚆', '#e2f7e8', '#87c89a'],
  'Inspección de aparatos de vía': ['🔀', '#e8ecff', '#99a8e6'],
  'Seguridad en obras de construcción': ['🦺', '#fff6cf', '#dec467'],
  'Trabajos y pruebas ferroviarias': ['🚧', '#ffe7e4', '#df9991'],
  'Mantenimiento de infraestructura y vía': ['🔧', '#dcf8ef', '#79c5ab'],
  'Designación de vías y componentes': ['🛤️', '#edf1f5', '#a3afbb'],
  'Trabajos compatibles con la circulación': ['🚦', '#f8e7ff', '#c79add'],
};

export const topicVisual = topic => TOPIC_VISUALS[topic] || ['📚', '#f1f5f9', '#cbd5e1'];

export const categoryIcon = category => {
  const c = String(category || '').toLowerCase();
  if (/seguridad|prevenci|riesgo|emergencia/.test(c)) return '🛡️';
  if (/document|comunica|informaci|registro|dato/.test(c)) return '📄';
  if (/responsab|competencia|funci|organiz/.test(c)) return '👥';
  if (/plazo|tiempo|frecuencia|periodic/.test(c)) return '⏱️';
  if (/proced|actuaci|operaci|trabajo/.test(c)) return '⚙️';
  if (/definici|concept|objeto|alcance/.test(c)) return '💡';
  if (/material|componente|elemento|equipo/.test(c)) return '🧩';
  if (/inspecci|control|verifica|comprob/.test(c)) return '🔎';
  if (/norma|disposici|legal|requisito/.test(c)) return '⚖️';
  return '🏷️';
};
