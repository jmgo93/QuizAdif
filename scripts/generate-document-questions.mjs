import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const bankPath = join(ROOT, 'bank', 'questions.json');
const docsRoot = join(ROOT, 'Recursos', 'Documentación');
const MIN_PER_TOPIC = 50;

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
const hash = s => createHash('sha1').update(s).digest('hex');

const bank=JSON.parse(await readFile(bankPath,'utf8'));
bank.questions=bank.questions.filter(q=>!q.generatedAuto);
const generatedIds=new Set(bank.questions.map(q=>q.id));
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
      category:'Contenido y disposiciones',subtopic:'Comprensión literal precisa',documentId,
      section:'Texto extraído',page:null,enunciado:`Según ${documentId}, ¿qué término o dato completa correctamente el siguiente fragmento? «${blank}»`,
      options,correctIndex,feedback:`El texto establece: «${source}»`,sourceQuote:source,
      difficulty:3,tags:['documentación','detalle','generada'],status:'draft',generatedAuto:true
    }); made++;
  }
  if(made<needed) throw new Error(`${topic}: solo se pudieron generar ${made} de ${needed}`);
}
bank.version=`2026.07.15-50x13`;
await writeFile(bankPath,JSON.stringify(bank,null,2)+'\n','utf8');
const counts=Object.fromEntries(specs.map(([,t])=>[t,bank.questions.filter(q=>q.topic===t).length]));
console.log(JSON.stringify({total:bank.questions.length,counts},null,2));
