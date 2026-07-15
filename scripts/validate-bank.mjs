import { readFile } from 'node:fs/promises';

const bank = JSON.parse(await readFile(new URL('../bank/questions.json', import.meta.url), 'utf8'));
const errors = [], ids = new Set(), statements = new Set();
const required = ['id','scope','topic','category','documentId','section','enunciado','options','correctIndex','feedback','difficulty','status'];
for (const [n,q] of bank.questions.entries()) {
  for (const k of required) if (q[k] === undefined || q[k] === '') errors.push(`#${n+1}: falta ${k}`);
  if (ids.has(q.id)) errors.push(`id duplicado: ${q.id}`); ids.add(q.id);
  const key=q.enunciado.toLocaleLowerCase('es').replace(/\W/g,''); if(statements.has(key)) errors.push(`enunciado duplicado: ${q.id}`); statements.add(key);
  if (!['general','specific'].includes(q.scope)) errors.push(`${q.id}: scope inválido`);
  if (!Array.isArray(q.options)||q.options.length!==4||new Set(q.options).size!==4) errors.push(`${q.id}: necesita 4 opciones únicas`);
  if (!Number.isInteger(q.correctIndex)||q.correctIndex<0||q.correctIndex>=q.options.length) errors.push(`${q.id}: correctIndex inválido`);
  if (![1,2,3].includes(q.difficulty)) errors.push(`${q.id}: dificultad inválida`);
}
const general=bank.questions.filter(q=>q.scope==='general').length;
const specific=bank.questions.filter(q=>q.scope==='specific').length;
if(general<10) errors.push(`se necesitan ≥10 generales; hay ${general}`);
if(specific<20) errors.push(`se necesitan ≥20 específicas; hay ${specific}`);
const expectedDocs=['Código Ético y de Conducta','DRC-1-2','II Plan de Igualdad. Excepto punto 5','Plan Estratégico PE2030 Del 1 al 8','P.O.P. 02','ADIF-IT-301-001-VIA-22','ADIF-IT-301-001-VIA-26','ADIF-IT-301-001-VIA-28','RD 1627/1997','Libro 03 Capítulo 03','MIN-PE-IV-002','NAG 2-0-1.0_1E','NAR 6/16'];
for(const doc of expectedDocs) if(!bank.questions.some(q=>q.documentId===doc)) errors.push(`sin cobertura: ${doc}`);
const expectedTopics=['Código Ético y gestión','Declaración sobre la Red','II Plan de Igualdad','Plan Estratégico 2030','Información y gestión de riesgos','Inspección de obras de tierra','Vigilancia de vía en cabina','Inspección de aparatos de vía','Seguridad en obras de construcción','Trabajos y pruebas ferroviarias','Mantenimiento de infraestructura y vía','Designación de vías y componentes','Trabajos compatibles con la circulación'];
for(const topic of expectedTopics){const n=bank.questions.filter(q=>q.topic===topic).length;if(n<50)errors.push(`${topic}: ${n}/50 preguntas`);}
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log(`Banco válido: ${bank.questions.length} preguntas (${general} generales, ${specific} específicas), ${expectedTopics.length} temas con ≥50 y ${expectedDocs.length} documentos cubiertos.`);
