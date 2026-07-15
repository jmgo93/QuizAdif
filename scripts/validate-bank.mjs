import { readFile } from 'node:fs/promises';

const base = JSON.parse(await readFile(new URL('../bank/questions.json', import.meta.url), 'utf8'));
const expansion = JSON.parse(await readFile(new URL('../bank/editorial-expansion.json', import.meta.url), 'utf8'));
const ethics = JSON.parse(await readFile(new URL('../bank/editorial-code-ethics.json', import.meta.url), 'utf8'));
const drc = JSON.parse(await readFile(new URL('../bank/editorial-drc.json', import.meta.url), 'utf8'));
const equality = JSON.parse(await readFile(new URL('../bank/editorial-equality.json', import.meta.url), 'utf8'));
const pe2030 = JSON.parse(await readFile(new URL('../bank/editorial-pe2030.json', import.meta.url), 'utf8'));
const risks = JSON.parse(await readFile(new URL('../bank/editorial-risks.json', import.meta.url), 'utf8'));
const earthworks = JSON.parse(await readFile(new URL('../bank/editorial-earthworks.json', import.meta.url), 'utf8'));
const cab = JSON.parse(await readFile(new URL('../bank/editorial-cab.json', import.meta.url), 'utf8'));
const turnouts = JSON.parse(await readFile(new URL('../bank/editorial-turnouts.json', import.meta.url), 'utf8'));
const construction = JSON.parse(await readFile(new URL('../bank/editorial-construction-safety.json', import.meta.url), 'utf8'));
const railwayWorks = JSON.parse(await readFile(new URL('../bank/editorial-railway-works.json', import.meta.url), 'utf8'));
const maintenance = JSON.parse(await readFile(new URL('../bank/editorial-maintenance.json', import.meta.url), 'utf8'));
const designation = JSON.parse(await readFile(new URL('../bank/editorial-designation.json', import.meta.url), 'utf8'));
const compatibleWorks = JSON.parse(await readFile(new URL('../bank/editorial-compatible-works.json', import.meta.url), 'utf8'));
const bank = { questions: [base, expansion, ethics, drc, equality, pe2030, risks, earthworks, cab, turnouts, construction, railwayWorks, maintenance, designation, compatibleWorks].flatMap(b => b.questions) };
const errors = [], ids = new Set(), statements = new Set();
const required = ['id','scope','topic','category','questionType','documentId','section','enunciado','options','correctIndex','feedback','difficulty','status'];
for (const [n,q] of bank.questions.entries()) {
  for (const k of required) if (q[k] === undefined || q[k] === '') errors.push(`#${n+1}: falta ${k}`);
  if (ids.has(q.id)) errors.push(`id duplicado: ${q.id}`); ids.add(q.id);
  const key=q.enunciado.toLocaleLowerCase('es').replace(/\W/g,''); if(statements.has(key)) errors.push(`enunciado duplicado: ${q.id}`); statements.add(key);
  if (!['general','specific'].includes(q.scope)) errors.push(`${q.id}: scope inválido`);
  if (!Array.isArray(q.options)||q.options.length!==4||new Set(q.options).size!==4) errors.push(`${q.id}: necesita 4 opciones únicas`);
  if (!Number.isInteger(q.correctIndex)||q.correctIndex<0||q.correctIndex>=q.options.length) errors.push(`${q.id}: correctIndex inválido`);
  if (![1,2,3].includes(q.difficulty)) errors.push(`${q.id}: dificultad inválida`);
  if (q.generatedAuto) errors.push(`${q.id}: generación automática no permitida`);
  if (/completa correctamente|qué término o dato|emplea .+ término o dato|no se ajusta literalmente|sustituir [«\"].+[»\"] por/i.test(q.enunciado)) {
    errors.push(`${q.id}: patrón léxico o de sustitución no permitido`);
  }
}
const general=bank.questions.filter(q=>q.scope==='general').length;
const specific=bank.questions.filter(q=>q.scope==='specific').length;
if(general<10) errors.push(`se necesitan ≥10 generales; hay ${general}`);
if(specific<20) errors.push(`se necesitan ≥20 específicas; hay ${specific}`);
const expectedDocs=['Código Ético y de Conducta','DRC-1-2','II Plan de Igualdad. Excepto punto 5','Plan Estratégico PE2030 Del 1 al 8','P.O.P. 02','ADIF-IT-301-001-VIA-22','ADIF-IT-301-001-VIA-26','ADIF-IT-301-001-VIA-28','RD 1627/1997','Libro 03 Capítulo 03','MIN-PE-IV-002','NAG 2-0-1.0_1E','NAR 6/16'];
for(const doc of expectedDocs) if(!bank.questions.some(q=>q.documentId===doc)) errors.push(`sin cobertura: ${doc}`);
const expectedTopics=['Código Ético y gestión','Declaración sobre la Red','II Plan de Igualdad','Plan Estratégico 2030','Información y gestión de riesgos','Inspección de obras de tierra','Vigilancia de vía en cabina','Inspección de aparatos de vía','Seguridad en obras de construcción','Trabajos y pruebas ferroviarias','Mantenimiento de infraestructura y vía','Designación de vías y componentes','Trabajos compatibles con la circulación'];
for(const topic of expectedTopics){const n=bank.questions.filter(q=>q.topic===topic).length;if(n<20)errors.push(`${topic}: ${n}/20 preguntas editoriales`);}
const categories=[...new Set(bank.questions.map(q=>q.category))];
if(bank.questions.some(q=>q.questionType==='Completar enunciado'))errors.push('todavía hay preguntas de completar enunciado');
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log(`Banco editorial válido: ${bank.questions.length} preguntas (${general} generales, ${specific} específicas), ${expectedTopics.length} temas cubiertos y sin patrones de completar o sustituir palabras.`);
