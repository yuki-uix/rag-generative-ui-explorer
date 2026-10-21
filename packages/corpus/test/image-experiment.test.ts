import { readFileSync, mkdtempSync, cpSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { loadImageInputs, readJSON, rankingMetrics, lexicalRetriever, stats, Encoding, OCR, validateObservations, verifyFreeze, directoryBytes } from '../src/image-experiment.js';
const root=resolve(import.meta.dirname,'../../../eval/images');
function copy(action:(dir:string)=>void) {
  const dir=mkdtempSync(join(tmpdir(),'image-corpus-'));
  try { cpSync(root,dir,{recursive:true,filter:path=>!path.includes('/.cache')&&!path.includes('/runs')});action(dir); }
  finally {rmSync(dir,{recursive:true,force:true});}
}
describe('independent image retrieval',()=>{
  it('loads 24 figures/52 queries, source-disjoint splits and exact frozen bytes',()=>{
    const inputs=verifyFreeze(root);
    expect(inputs.figures).toHaveLength(24); expect(inputs.questions).toHaveLength(52);
    expect(inputs.questions.filter(q=>q.goldenImageIds.length===0)).toHaveLength(4);
    expect(directoryBytes(root)).toBeLessThan(inputs.config.artifactBudgetBytes);
    expect(directoryBytes(root)).toBeGreaterThan(1); // lowering budget to 1 refuses all real corpora
  });
  it('rejects changed image/source bytes and renamed group leakage',()=>{
    copy(dir=>{const m=readJSON(join(dir,'manifest.json')) as any;m.figures[0].imageSha256='0'.repeat(64);writeFileSync(join(dir,'manifest.json'),JSON.stringify(m));expect(()=>loadImageInputs(dir)).toThrow(/Stale/);});
    copy(dir=>{const m=readJSON(join(dir,'manifest.json')) as any;m.figures[0].group='renamed';m.figures[0].split='evaluation';writeFileSync(join(dir,'manifest.json'),JSON.stringify(m));expect(()=>loadImageInputs(dir)).toThrow(/leaks/);});
    copy(dir=>{const q=readJSON(join(dir,'questions.json')) as any;q.questions[0].goldenImageIds=['unknown-image'];writeFileSync(join(dir,'questions.json'),JSON.stringify(q));expect(()=>loadImageInputs(dir)).toThrow(/golden/);});
  });
  it('uses macro recall, bounded reciprocal rank and null negative denominators',()=>{
    expect(rankingMetrics(['wrong','a','b'],['a','b'])).toMatchObject({recall1:0,recall3:1,recall5:1,hit3:1,mrr5:0.5});
    expect(rankingMetrics(['a'],['a','b'])!.recall5).toBe(0.5);
    expect(rankingMetrics([],['a'])!.ndcg5).toBe(0);
    expect(rankingMetrics(['a'],[])).toBeNull();
    expect(stats([])).toBeNull();expect(stats([4,1,3,2])).toEqual({n:4,median:2.5,min:1,max:4});
  });
  it('reuses BM25 with stable ID ties and returns no lexical candidate for OOV',async()=>{
    const search=lexicalRetriever([{id:'b',text:'retrieval pipeline'},{id:'a',text:'retrieval pipeline'}]);
    expect((await search('retrieval')).map(r=>r.evidenceId)).toEqual(['a','b']);
    expect(await search('not-in-this-index')).toEqual([]);
  });
  it('validates real saved OCR and all independently computed encoding passes',()=>{
    const ocr=OCR.parse(readJSON(join(root,'artifacts/ocr.json'))), encoding=Encoding.parse(readJSON(join(root,'artifacts/encoding.json')));
    expect(validateObservations(root,ocr,encoding).questions).toHaveLength(52);
    const bad=structuredClone(encoding);bad.passes[0]!.queries[0]!.vector[0]=100;
    expect(()=>Encoding.parse(bad)).toThrow(/Non-unit/);
    const stale=structuredClone(ocr);stale.records[0]!.imageSha256='0'.repeat(64);
    expect(()=>validateObservations(root,stale,encoding)).toThrow(/OCR/);
    const skipped=structuredClone(encoding);skipped.passes[0]!.images.pop();
    expect(()=>validateObservations(root,ocr,skipped)).toThrow(/coverage/);
  });
});

it('enforces the artifact budget with an intentionally failing lower limit',async()=>{
  const {spawnSync}=await import('node:child_process');
  const script=resolve(import.meta.dirname,'../scripts/images/check-budget.ts');
  const cwd=resolve(import.meta.dirname,'..');
  const result=spawnSync(process.execPath,['--import','tsx',script,'--max-bytes','1'],{cwd,encoding:'utf8'});
  expect(result.status).toBe(1);expect(result.stderr).toContain('budget exceeded');
});

it('preserves exactly the same frozen data across preflight implementation repairs',()=>{
  const initial=readJSON(join(root,'artifacts/preflight-freeze.json')) as {files:unknown};
  const final=readJSON(join(root,'freeze.json')) as {files:unknown};
  expect(final.files).toEqual(initial.files);
});

it('replays every original ranking/metric offline with the sealed observations',async()=>{
  const {spawnSync}=await import('node:child_process');
  const {verifyImageObservations}=await import('../src/image-observations.js');
  expect(verifyImageObservations(root).version).toBe('image-observation-ledger-1');
  const output=mkdtempSync(join(tmpdir(),'image-replay-'));
  try {
    const run=spawnSync(process.execPath,['--import','tsx','scripts/images/replay.ts','--out',output],{cwd:resolve(import.meta.dirname,'..'),encoding:'utf8'});
    expect(run.status,run.stderr).toBe(0);
    const rows=(path:string)=>readFileSync(path,'utf8').trim().split('\n').map(line=>{const {searchMs,...row}=JSON.parse(line);return row;});
    const original=rows(join(root,'results/2026-10-21/records.jsonl'));
    const replayed=rows(join(output,'records.jsonl'));
    // libm/V8 on Linux x64 vs macOS arm64 can differ by one ULP in BM25.
    // IDs, order, metrics and all other observations must still match exactly.
    const withoutScores=(records:typeof original)=>records.map(row=>({...row,ranking:row.ranking.map((item:{evidenceId:string})=>item.evidenceId)}));
    expect(withoutScores(replayed)).toEqual(withoutScores(original));
    for(const [index,row] of replayed.entries()) for(const [rank,item] of row.ranking.entries()) {
      const expected=original[index].ranking[rank].score;
      expect(Math.abs(item.score-expected)).toBeLessThanOrEqual(1e-12*Math.max(1,Math.abs(expected)));
    }
    expect(original).toHaveLength(468);
  } finally {rmSync(output,{recursive:true,force:true});}
},20000);
