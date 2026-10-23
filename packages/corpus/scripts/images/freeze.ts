import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inputPaths, sha } from '../../src/image-experiment.js';
const root=resolve(import.meta.dirname,'../../../../eval/images');
const repository=resolve(root,'../..');
const code=['packages/corpus/src/image-experiment.ts','packages/corpus/src/bm25.ts','packages/corpus/src/tokeniser.ts','packages/corpus/scripts/images/encode.mjs','packages/corpus/scripts/images/ocr.swift','packages/corpus/scripts/images/evaluate.ts'];
writeFileSync(resolve(root,'freeze.json'),JSON.stringify({version:'image-freeze-1',frozenAt:new Date().toISOString(),files:Object.fromEntries(inputPaths(root).map(path=>[path,sha(readFileSync(resolve(root,path)))])),code:Object.fromEntries(code.map(path=>[path,sha(readFileSync(resolve(repository,path)))]))},null,2)+'\n',{flag:'wx'});
console.log('Froze all corpus, protocol, query and execution inputs.');
