import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Encoding, OCR, validateObservations, readJSON, lexicalRetriever, rankingMetrics, stats, sha, directoryBytes, type ImageQuestion } from '../../src/image-experiment.js';
const root=resolve(import.meta.dirname,'../../../../eval/images');
const args=process.argv.slice(2);
if(args.length!==2 || args[0]!=='--out') throw new Error('Usage: evaluate.ts --out FRESH_OUTPUT_DIRECTORY');
const out=resolve(args[1]!);
const ocrPath=resolve(root,'artifacts/ocr.json'), encodingPath=resolve(root,'artifacts/encoding.json');
const ocr=OCR.parse(readJSON(ocrPath)), encoding=Encoding.parse(readJSON(encodingPath));
const {figures,questions,config,freezeSha256,freeze}=validateObservations(root,ocr,encoding);
if(Date.parse(freeze.frozenAt)>Date.parse(encoding.startedAt) || Date.parse(freeze.frozenAt)>Date.parse(ocr.startedAt)) throw new Error('Observation predates freeze.');
const body=(source:string)=>readFileSync(resolve(root,source),'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\s*/, '');
const buildStart=performance.now();
const text=lexicalRetriever(figures.map(f=>({id:f.id,text:body(f.source)})));
const textIndexMs=performance.now()-buildStart;
const ocrStart=performance.now();
const optical=lexicalRetriever(ocr.records.map(r=>({id:r.id,text:r.text})));
const ocrIndexMs=performance.now()-ocrStart;
const arms=['text','ocr','clip'] as const;
type Arm = typeof arms[number];
type Row = { repetition: number; arm: Arm; questionId: string; split: string; category: string; order: Arm[]; ranking: { evidenceId: string; score: number }[]; searchMs: number; queryEncodingMs: number; metrics: ReturnType<typeof rankingMetrics> };
const records: Row[]=[];
for(const pass of encoding.passes) {
  for(const [i,q] of questions.entries()) {
    const rotation=(i+pass.repetition-1)%arms.length;
    const order=[...arms.slice(rotation),...arms.slice(0,rotation)];
    for(const arm of order) {
      const start=performance.now();
      const query=pass.queries.find(row=>row.id===q.id)!;
      const ranking=arm==='text' ? await text(q.question) : arm==='ocr' ? await optical(q.question)
        : pass.images.map(image=>({evidenceId:image.id,score:image.vector.reduce((sum,v,i)=>sum+v*query.vector[i]!,0)})).sort((a,b)=>b.score-a.score || a.evidenceId.localeCompare(b.evidenceId));
      const searchMs=performance.now()-start;
      records.push({repetition:pass.repetition,arm,questionId:q.id,split:q.split,category:q.category,order,ranking,searchMs,queryEncodingMs:arm==='clip'?query.elapsedMs:0,metrics:rankingMetrics(ranking.map(r=>r.evidenceId),q.goldenImageIds)});
    }
  }
}
const average=(values:number[])=>values.length?values.reduce((s,v)=>s+v,0)/values.length:null;
const slices=(split:string,category:string)=>arms.map(arm=>{
  const subset=records.filter(r=>r.arm===arm && (split==='all'||r.split===split) && (category==='all'||r.category===category));
  const scored=subset.filter(r=>r.metrics!==null);
  const keys=['recall1','recall3','recall5','hit1','hit3','hit5','mrr5','ndcg5'] as const;
  const repetitions=[1,2,3].map(repetition=>({repetition,metrics:Object.fromEntries(keys.map(key=>[key,average(scored.filter(r=>r.repetition===repetition).map(r=>r.metrics![key]))]))}));
  return {arm,split,category,uniqueQuestions:new Set(subset.map(r=>r.questionId)).size,answerableQuestions:new Set(scored.map(r=>r.questionId)).size,observations:subset.length,
    metrics:Object.fromEntries(keys.map(key=>[key,stats(repetitions.map(r=>r.metrics[key]).filter((v):v is number=>v!==null))])),repetitions,
    searchMs:stats(subset.map(r=>r.searchMs)),queryEncodingMs:arm==='clip'?stats(subset.map(r=>r.queryEncodingMs)):null};
});
const report={version:'image-retrieval-report-1',freezeSha256,ocrSha256:sha(readFileSync(ocrPath)),encodingSha256:sha(readFileSync(encodingPath)),
  samples:{images:figures.length,questions:questions.length,repetitions:config.repetitions},
  observations:{ocr:{totalMs:ocr.totalMs,perImageMs:stats(ocr.records.map(r=>r.elapsedMs)),engine:ocr.engine,revision:ocr.revision,os:ocr.os},
    clip:{loadMs:encoding.loadMs,totalMs:encoding.totalMs,peakRssKiB:encoding.peakRssKiB,imageEncodingMs:stats(encoding.passes.flatMap(p=>p.images.map(r=>r.elapsedMs))),queryEncodingMs:stats(encoding.passes.flatMap(p=>p.queries.map(r=>r.elapsedMs))),modelBytes:encoding.modelFiles.reduce((sum,f)=>sum+f.bytes,0),runtime:encoding.runtime},
    indexes:{textMs:textIndexMs,ocrMs:ocrIndexMs}, costs:{hostedProviderCalls:0,hostedProviderCharge:0,hardwareElectricityEngineering:'unpriced'}},
  slices:['all','development','evaluation'].flatMap(split=>['all','literal','concept','layout','negative'].flatMap(category=>slices(split,category))),
  identicalClipRankingsAcrossPasses:questions.every(q=>{const rs=records.filter(r=>r.arm==='clip'&&r.questionId===q.id);return rs.every(r=>JSON.stringify(r.ranking.map(c=>c.evidenceId))===JSON.stringify(rs[0]!.ranking.map(c=>c.evidenceId)));}),
  negativeQueries:records.filter(r=>r.category==='negative').map(r=>({arm:r.arm,repetition:r.repetition,questionId:r.questionId,top:r.ranking.slice(0,5)})),
};
const bytes=directoryBytes(root);
if(bytes>config.artifactBudgetBytes) throw new Error(`Experiment exceeds ${config.artifactBudgetBytes} byte budget (${bytes}); model cache must be outside the corpus.`);
mkdirSync(out,{recursive:true});
writeFileSync(resolve(out,'records.jsonl'),records.map(r=>JSON.stringify(r)).join('\n')+'\n',{flag:'wx'});
writeFileSync(resolve(out,'summary.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
const fmt=(n:number|null|undefined)=>n===null||n===undefined?'unavailable':(n*100).toFixed(1)+'%';
const lines=['# Image retrieval: measured results','',`24 images; 52 unique questions (48 answerable, 4 negative); three measured encoding passes. Frozen inputs: ${freezeSha256}.`,'',
'| Split | Arm | Answerable n | Recall@1 | Recall@3 | Recall@5 | MRR@5 | nDCG@5 |','| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
...report.slices.filter(s=>s.category==='all').map(s=>`| ${s.split} | ${s.arm} | ${s.answerableQuestions} | ${fmt(s.metrics['recall1']?.median)} | ${fmt(s.metrics['recall3']?.median)} | ${fmt(s.metrics['recall5']?.median)} | ${s.metrics['mrr5']?.median?.toFixed(3)} | ${s.metrics['ndcg5']?.median?.toFixed(3)} |`),'',
'Each metric has three repetition aggregates with median/min/max in summary.json. Repetition does not increase unique-question n. Negatives are excluded from ranking denominators; no abstention threshold is evaluated.',
`All three CLIP ranking orders identical: ${report.identicalClipRankingsAcrossPasses}.`,'',
`Actual OCR total: ${ocr.totalMs.toFixed(1)} ms. CLIP load/cache/download: ${encoding.loadMs.toFixed(1)} ms; total encoding process work: ${encoding.totalMs.toFixed(1)} ms; peak process RSS: ${encoding.peakRssKiB} KiB.`,
`CLIP image encoding median/full range: ${JSON.stringify(report.observations.clip.imageEncodingMs)} ms; query encoding: ${JSON.stringify(report.observations.clip.queryEncodingMs)} ms.`,
`Text/OCR index construction: ${textIndexMs.toFixed(3)}/${ocrIndexMs.toFixed(3)} ms. Query search and encoding are separate in each record.`,
'No hosted API inference calls. Hardware, electricity and engineering costs are unpriced. All diagram sources are repository-authored; this exposed same-author pilot cannot establish general image-retrieval effectiveness.',''];
writeFileSync(resolve(out,'report.md'),lines.join('\n'),{flag:'wx'});
console.log(JSON.stringify({records:records.length,out,bytes,rankingsStable:report.identicalClipRankingsAcrossPasses}));
