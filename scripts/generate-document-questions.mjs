import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const bankPath = join(ROOT, 'bank', 'questions.json');
const docsRoot = join(ROOT, 'Recursos', 'Documentación');
const MIN_PER_TOPIC = 50;
const EXTRA_PER_TYPE = 50;
const EXTRA_TYPES = ['Selección conceptual','Relación de conceptos','Caso aplicado','Correspondencia normativa','Excepción o afirmación incorrecta'];

const specs = [
  ['general','Código Ético y gestión','Código Ético y de Conducta','Codigo Etico'],
  ['general','Declaración sobre la Red','DRC-1-2','DRC-1-2'],
  ['general','II Plan de Igualdad','II Plan de Igualdad. Excepto punto 5','Plan de Igualdad'],
  ['general','Plan Estratégico 2030','Plan Estratégico PE2030 Del 1 al 8','Plan Estrategico'],
  ['general','Información y gestión de riesgos','P.O.P. 02','POP 02'],
  ['specific','Inspección de obras de tierra','ADIF-IT-301-001-VIA-22','VIA-22'],
  ['specific','Vigilancia de vía en cabina','ADIF-IT-301-001-VIA-26','VIA-26'],
  ['specific','Inspección de aparatos de vía','ADIF-IT-301-001-VIA-28','VIA-28'],
  ['specific','Seguridad en obras de construcción','RD 1627/1997','BOE-A-1997'],
  ['specific','Trabajos y pruebas ferroviarias','Libro 03 Capítulo 03','Libro 03'],
  ['specific','Mantenimiento de infraestructura y vía','MIN-PE-IV-002','MIN-PE'],
  ['specific','Designación de vías y componentes','NAG 2-0-1.0_1E','NAG 2-0'],
  ['specific','Trabajos compatibles con la circulación','NAR 6/16','NAR Nº616']
];

async function files(dir) {
  const out=[]; for(const e of await readdir(dir,{withFileTypes:true})) {
    const p=join(dir,e.name); e.isDirectory()?out.push(...await files(p)):out.push(p);
  } return out;
}

const clean = s => s.replace(/\f/g,' ').replace(/[ \t]+/g,' ').replace(/\s*\n\s*/g,' ').trim();
const bad = s => /autenticidad|código seguro|verificable en|pág(?:ina|\.)|control de modificaciones|dirección general|dirección de |subdirección|legislación consolidada|índice|anexos y formatos|revisión \d/i.test(s)
  || /[A-Z0-9]{18,}/.test(s)
  || (s.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g)?.length ?? 0) < s.length*.55;
const sentences = text => clean(text).split(/(?<=[.;:!?])\s+(?=[A-ZÁÉÍÓÚÜÑ0-9“«])/)
  .map(clean).filter(s=>s.length>=90&&s.length<=360&&!bad(s)&&!s.includes('.....'));
const words = s => [...s.matchAll(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{5,}/g)].map(m=>({word:m[0],index:m.index}));
const stop = new Set('sobre entre desde hasta donde cuando todos todas tiene tienen para como esta este estos estas serán será debe deben puede pueden mediante dentro dicho dicha presente objeto forma parte'.split(' '));
function targetOf(s, salt=0){
  const numeric=[...s.matchAll(/\b\d+(?:[.,]\d+)?\s?(?:%|mm|cm|km|m|días?|horas?|meses?|años?)\b/gi)];
  if(numeric.length) return numeric[salt%numeric.length][0];
  const quoted=[...s.matchAll(/[“«"]([^”»"]{5,55})[”»"]/g)];
  if(quoted.length) return quoted[salt%quoted.length][1];
  const ws=words(s).filter(x=>!stop.has(x.word.toLowerCase()));
  if(ws.length<3) return null;
  const pos=(salt*7+Math.floor(ws.length/2))%ws.length;
  return ws[pos].word;
}
const kind = t => /\d/.test(t)?'number':t.includes(' ')?'phrase':'word';
const norm = s => s.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const statementKey = s => s.toLocaleLowerCase('es').replace(/\W/g,'');
const hash = s => createHash('sha1').update(s).digest('hex');
const categoryOf = s => {
  if(/objeto|alcance|ámbito|aplicación/i.test(s)) return 'Objeto, alcance y aplicación';
  if(/definici|se entiende|concepto|denomina/i.test(s)) return 'Definiciones y conceptos';
  if(/responsab|corresponde|competencia|encargad|deberá/i.test(s)) return 'Responsabilidades y competencias';
  if(/riesgo|seguridad|salud|protección|peligro|prevención/i.test(s)) return 'Seguridad y prevención';
  if(/registro|document|parte|informe|comunica|solicitud/i.test(s)) return 'Documentación y comunicaciones';
  if(/\d|plazo|límite|distancia|velocidad|porcentaje|frecuencia/i.test(s)) return 'Datos, límites y plazos';
  return 'Procedimientos y actuaciones';
};
const replaceOnce = (s,a,b) => s.slice(0,s.indexOf(a))+b+s.slice(s.indexOf(a)+a.length);
const clip = (s,n=210) => s.length<=n?s:s.slice(0,n).replace(/\s+\S*$/,'')+'…';
const around = (s,target,n=240) => {const p=s.indexOf(target),from=Math.max(0,p-Math.floor(n/2)),to=Math.min(s.length,p+target.length+Math.floor(n/2));return `${from?'…':''}${s.slice(from,to)}${to<s.length?'…':''}`;};

const bank=JSON.parse(await readFile(bankPath,'utf8'));
bank.questions=bank.questions.filter(q=>!q.generatedAuto);
bank.questions.forEach(q=>{q.questionType ||= 'Selección conceptual';q.category=categoryOf(q.sourceQuote||q.feedback||q.enunciado);});
const generatedIds=new Set(bank.questions.map(q=>q.id));
const generatedStatements=new Set(bank.questions.map(q=>statementKey(q.enunciado)));
const all=await files(docsRoot);
for(const [scope,topic,documentId,needle] of specs){
  const path=all.find(p=>p.toLowerCase().includes(needle.toLowerCase())&&p.endsWith('.txt'));
  if(!path) throw new Error(`No se encontró ${needle}`);
  const ss=[...new Set(sentences(await readFile(path,'utf8')))];
  const targets=ss.flatMap((s,i)=>[0,1,2,3,4,5].map(n=>targetOf(s,i+n))).filter(Boolean);
  const existing=bank.questions.filter(q=>q.topic===topic).length;
  let needed=Math.max(0,MIN_PER_TOPIC-existing), made=0;
  for(let i=0;i<ss.length*10&&made<needed;i++){
    const source=ss[i%ss.length], variant=Math.floor(i/ss.length), target=targetOf(source,i+variant); if(!target) continue;
    const k=kind(target);
    let pool=[...new Set(targets.filter(t=>kind(t)===k&&norm(t)!==norm(target)))];
    if(k==='word'){
      const upper=/^[A-ZÁÉÍÓÚÜÑ]/.test(target); const tight=pool.filter(t=>/^[A-ZÁÉÍÓÚÜÑ]/.test(t)===upper&&Math.abs(t.length-target.length)<=4);
      if(tight.length>=3) pool=tight;
    }
    if(pool.length<3) continue;
    const seed=parseInt(hash(topic+source+target).slice(0,8),16);
    const distractors=[];
    for(let n=0;distractors.length<3&&n<pool.length;n++){
      const d=pool[(seed+n*37)%pool.length]; if(!distractors.some(x=>norm(x)===norm(d))) distractors.push(d);
    }
    if(distractors.length<3) continue;
    const blank=source.replace(target,'_____'); if(blank===source) continue;
    const correctIndex=seed%4, options=[...distractors]; options.splice(correctIndex,0,target);
    const id=`auto-${scope.slice(0,3)}-${hash(topic+source+target).slice(0,14)}`;
    if(generatedIds.has(id)) continue; generatedIds.add(id);
    bank.questions.push({
      id,scope,topic,
      category:categoryOf(source),subtopic:'Comprensión literal precisa',questionType:'Completar enunciado',documentId,
      section:'Texto extraído',page:null,enunciado:`Según ${documentId}, ¿qué término o dato completa correctamente el siguiente fragmento? «${blank}»`,
      options,correctIndex,feedback:`El texto establece: «${source}»`,sourceQuote:source,
      difficulty:3,tags:['documentación','detalle','generada'],status:'draft',generatedAuto:true
    }); made++;
  }
  if(made<needed) throw new Error(`${topic}: solo se pudieron generar ${made} de ${needed}`);

  const sourceRows=ss.map((source,i)=>({source,target:targetOf(source,i)})).filter(x=>x.target);
  for(const type of EXTRA_TYPES){
    let added=0;
    for(let i=0;i<sourceRows.length*6&&added<EXTRA_PER_TYPE;i++){
      const row=sourceRows[i%sourceRows.length], target=targetOf(row.source,i); if(!target) continue;
      let alternatives=[...new Set(targets.filter(t=>kind(t)===kind(target)&&norm(t)!==norm(target)))];
      if(kind(target)==='word'){
        const upper=/^[A-ZÁÉÍÓÚÜÑ]/.test(target); const tight=alternatives.filter(t=>/^[A-ZÁÉÍÓÚÜÑ]/.test(t)===upper&&Math.abs(t.length-target.length)<=5); if(tight.length>=3) alternatives=tight;
      }
      if(alternatives.length<3) continue;
      const seed=parseInt(hash(type+topic+row.source+target).slice(0,8),16);
      const wrong=[]; for(let n=0;wrong.length<3&&n<alternatives.length;n++){const d=alternatives[(seed+n*41)%alternatives.length];if(!wrong.some(x=>norm(x)===norm(d)))wrong.push(d);}
      if(wrong.length<3) continue;
      const context=around(row.source,target).replace(target,'[…]');
      let enunciado,options,correctIndex=seed%4,feedback=`La referencia exacta es: «${row.source}»`;
      if(type==='Selección conceptual'){
        enunciado=`Según ${documentId}, ¿qué opción expresa correctamente el contenido del siguiente pasaje? «${context}»`;
        options=wrong.map(x=>replaceOnce(row.source,target,x)); options.splice(correctIndex,0,row.source);
      } else if(type==='Relación de conceptos'){
        enunciado=`¿En cuál de estos contextos emplea ${documentId} el término o dato «${target}»?`;
        const contexts=wrong.map(x=>clip(replaceOnce(row.source,target,x))); options=contexts; options.splice(correctIndex,0,clip(row.source));
      } else if(type==='Caso aplicado'){
        const claim=replaceOnce(row.source,target,wrong[0]);
        enunciado=`En una actuación se sostiene lo siguiente: «${clip(claim)}». Conforme a ${documentId}, ¿qué corrección procede?`;
        options=[`Sustituir «${wrong[0]}» por «${target}»`,`Mantener «${wrong[0]}» sin cambios`,`Sustituirlo por «${wrong[1]}»`,`Sustituirlo por «${wrong[2]}»`]; correctIndex=0;
      } else if(type==='Correspondencia normativa'){
        const at=row.source.indexOf(target),left=clip(row.source.slice(0,at),140);
        enunciado=`En ${documentId}, ¿qué elemento se relaciona correctamente con «${left.trim()}»?`;
        options=[...wrong]; options.splice(correctIndex,0,target);
      } else {
        const other=sourceRows.filter(x=>x.source!==row.source).slice((seed%Math.max(1,sourceRows.length-4)),(seed%Math.max(1,sourceRows.length-4))+3).map(x=>clip(x.source));
        if(other.length<3) continue;
        enunciado=`Al contrastar en ${documentId} el elemento «${target}», ¿qué afirmación NO se ajusta literalmente al documento?`;
        options=other; options.splice(correctIndex,0,clip(replaceOnce(row.source,target,wrong[0])));
        feedback=`La opción señalada altera «${target}» por «${wrong[0]}». El texto correcto dice: «${row.source}»`;
      }
      if(options.some(x=>!x)||new Set(options.map(norm)).size!==4) continue;
      const id=`type-${scope.slice(0,3)}-${hash(type+topic+row.source+target).slice(0,16)}`; if(generatedIds.has(id)||generatedStatements.has(statementKey(enunciado)))continue; generatedIds.add(id);generatedStatements.add(statementKey(enunciado));
      bank.questions.push({id,scope,topic,category:categoryOf(row.source),subtopic:'Aplicación y discriminación',questionType:type,documentId,section:'Texto extraído',page:null,enunciado,options,correctIndex,feedback,sourceQuote:row.source,difficulty:3,tags:['documentación','tipo-test',norm(type).replace(/\s+/g,'-')],status:'draft',generatedAuto:true});
      added++;
    }
    if(added<EXTRA_PER_TYPE) throw new Error(`${topic}/${type}: ${added}/${EXTRA_PER_TYPE}`);
  }
}
bank.questions=bank.questions.filter(q=>q.questionType!=='Completar enunciado');
bank.version=`2026.07.15-no-completion-balanced`;
await writeFile(bankPath,JSON.stringify(bank,null,2)+'\n','utf8');
const counts=Object.fromEntries(specs.map(([,t])=>[t,bank.questions.filter(q=>q.topic===t).length]));
console.log(JSON.stringify({total:bank.questions.length,counts},null,2));
