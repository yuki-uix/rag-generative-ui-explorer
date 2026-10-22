import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadControls, sha } from '../../src/image-review.js';
const root = resolve(import.meta.dirname, '../../../../eval/images-review');
const { figures } = loadControls(root);
const files = ['config.json', 'PROTOCOL.md', 'manifest.json', 'questions.json', 'build-controls.py', 'corrections/query-transformation.png', ...figures.map(f => f.image)].sort();
const code = ['packages/corpus/src/image-review.ts', 'packages/corpus/scripts/images/encode-controls.mjs', 'packages/corpus/scripts/images/evaluate-controls.ts', 'packages/corpus/scripts/images/ocr.swift'];
writeFileSync(resolve(root, 'freeze.json'), JSON.stringify({ version: 'image-control-freeze-1', frozenAt: new Date().toISOString(),
  legacyFreezeSha256: sha(readFileSync(resolve(root, '../images/freeze.json'))), legacyLedgerSha256: sha(readFileSync(resolve(root, '../images/observations.json'))),
  files: Object.fromEntries(files.map(p => [p, sha(readFileSync(resolve(root, p)))])),
  code: Object.fromEntries(code.map(p => [p, sha(readFileSync(resolve(root, '../..', p)))])),
}, null, 2) + '\n', { flag: 'wx' });
console.log('Froze review control inputs and execution, retaining legacy measurements.');
