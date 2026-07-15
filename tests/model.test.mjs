import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuestion, applyResult, stratifiedSample } from '../js/model.js';

const raw={id:'q1',scope:'specific',topic:'Vía',category:'Geometría',documentId:'DOC',section:'1',enunciado:'Pregunta',options:['A','B','C','D'],correctIndex:2,feedback:'Razón',difficulty:3,status:'verified'};
test('normaliza y conserva la jerarquía',()=>{const q=normalizeQuestion(raw);assert.equal(q.scope,'specific');assert.equal(q.topic,'Vía');assert.equal(q.correctIndex,2);});
test('un fallo crea deuda y dos aciertos la recuperan',()=>{let q=normalizeQuestion(raw);q=applyResult(q,false,0,0);assert.equal(q.mistakeDebt,2);q=applyResult(q,true,2,1);q=applyResult(q,true,2,2);assert.equal(q.mistakeDebt,0);});
test('muestreo estratificado respeta límite y reparte temas',()=>{const xs=[...Array(10)].map((_,i)=>({...raw,id:`a${i}`,topic:i<8?'A':'B'}));const out=stratifiedSample(xs,4);assert.equal(out.length,4);assert.equal(new Set(out.map(x=>x.topic)).size,2);});
