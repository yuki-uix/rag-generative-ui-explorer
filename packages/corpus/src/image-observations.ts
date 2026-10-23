import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { sha, readJSON, safePath, verifyFreeze, Encoding } from './image-experiment.js';
const Hash=z.string().regex(/^[a-f0-9]{64}$/);
export function verifyImageObservations(root:string) {
  const inputs=verifyFreeze(root);
  const ledger=z.strictObject({version:z.literal('image-observation-ledger-1'),sealedAt:z.iso.datetime(),freezeSha256:Hash,files:z.record(z.string(),Hash)}).parse(readJSON(resolve(root,'observations.json')));
  if(ledger.freezeSha256!==inputs.freezeSha256) throw new Error('Observation ledger belongs to another freeze.');
  const expected=['artifacts/ocr.json','artifacts/encoding.json','artifacts/weights-download.json','artifacts/preflight-freeze.json','results/2026-10-21/records.jsonl','results/2026-10-21/summary.json','results/2026-10-21/report.md'];
  if(JSON.stringify(Object.keys(ledger.files).sort())!==JSON.stringify(expected.sort())) throw new Error('Incomplete observation ledger.');
  for(const [path,hash] of Object.entries(ledger.files)) if(sha(readFileSync(safePath(root,path)))!==hash) throw new Error('Measured observation changed.');
  const encoding=Encoding.parse(readJSON(resolve(root,'artifacts/encoding.json')));
  const weights=[['text_model_quantized.onnx','73baab855d406190da9faa498cfedf65f15cf309f4cc7385b7b032e6d08e5c3a',64504507],['vision_model_quantized.onnx','583fd1110a514667812fee7d684952aaf82a99b959760c8d7dca7e0ab9839299',89117001]] as const;
  for(const [name,hash,bytes] of weights) {
    const matches=encoding.modelFiles.filter(f=>f.path===`${inputs.config.model}/${inputs.config.revision}/onnx/${name}`);
    if(matches.length!==1 || matches[0]!.sha256!==hash || matches[0]!.bytes!==bytes) throw new Error('Published q8 weight identity mismatch.');
  }
  return ledger;
}
