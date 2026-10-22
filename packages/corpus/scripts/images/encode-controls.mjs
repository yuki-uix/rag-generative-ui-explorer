import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cpus } from 'node:os';
import { createRequire } from 'node:module';
import { AutoTokenizer, AutoProcessor, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, RawImage, env } from '@huggingface/transformers';
import { verifyControlFreeze, sha } from '../../src/image-review.ts';
const root = resolve(import.meta.dirname, '../../../../eval/images-review');
if (process.argv.length !== 2) throw new Error('encode-controls.mjs takes no arguments; outputs are write-once.');
const inputs = verifyControlFreeze(root);
const startedAt = new Date().toISOString(), began = performance.now();
const legacy = resolve(root, '../images');
const cache = resolve(legacy, '.cache');
const original = JSON.parse(readFileSync(resolve(legacy, 'artifacts/encoding.json'), 'utf8'));
for (const f of original.modelFiles) if (sha(readFileSync(resolve(cache, f.path))) !== f.sha256) throw new Error('Cached model file changed.');
env.cacheDir = cache; env.allowRemoteModels = false;
const { config, figures, questions, freezeSha256 } = inputs;
const options = { revision: config.revision, local_files_only: true, device: 'cpu', dtype: 'q8', session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 } };
const loadStart = performance.now();
const tokenizer = await AutoTokenizer.from_pretrained(config.model, options);
const processor = await AutoProcessor.from_pretrained(config.model, options);
const text = await CLIPTextModelWithProjection.from_pretrained(config.model, options);
const vision = await CLIPVisionModelWithProjection.from_pretrained(config.model, options);
const loadMs = performance.now() - loadStart;
for (const q of questions) if (tokenizer(q.question, { truncation: false, padding: false }).input_ids.dims.at(-1) > 77) throw new Error('Query would truncate.');
const passes = [];
for (let repetition = 1; repetition <= 3; repetition++) {
  const rows = [], vectors = [];
  for (const f of figures) {
    const start = performance.now();
    const result = await vision(await processor(await RawImage.read(resolve(root, f.image))));
    const vector = result.image_embeds.tolist()[0];
    rows.push({ id: f.id, kind: 'image', elapsedMs: performance.now() - start }); vectors.push(vector);
  }
  for (const q of questions) {
    const start = performance.now();
    const result = await text(tokenizer(q.question, { truncation: false, padding: false }));
    rows.push({ id: q.id, kind: 'query', elapsedMs: performance.now() - start }); vectors.push(result.text_embeds.tolist()[0]);
  }
  // Raw projected outputs are float32 tensors. Preserve them exactly, then
  // normalize in the offline scorer, without decimal JSON rounding or fixtures.
  const binary = Buffer.alloc(rows.length * 512 * 4);
  vectors.forEach((v, row) => {
    if (v.length !== 512 || v.some(x => !Number.isFinite(x))) throw new Error('Invalid projected vector.');
    v.forEach((x, col) => binary.writeFloatLE(x, (row * 512 + col) * 4));
  });
  const file = `artifacts/pass-${repetition}.f32`;
  writeFileSync(resolve(root, file), binary, { flag: 'wx' });
  passes.push({ repetition, file, sha256: sha(binary), bytes: binary.length, rows });
  console.log(JSON.stringify({ repetition, images: figures.length, queries: questions.length }));
}
const require = createRequire(import.meta.url);
const ort = createRequire(require.resolve('@huggingface/transformers')).resolve('onnxruntime-node/package.json');
const output = { version: 'image-control-encoding-1', freezeSha256, startedAt, completedAt: new Date().toISOString(), loadMs, totalMs: performance.now() - began, peakRssKiB: process.resourceUsage().maxRSS,
  runtime: { node: process.version, cpu: cpus()[0].model, platform: process.platform, arch: process.arch, transformers: '3.8.1', onnxruntime: JSON.parse(readFileSync(ort, 'utf8')).version },
  model: config.model, revision: config.revision, dtype: 'q8', device: 'cpu', storage: 'raw-projected-float32-le; L2 normalize during scoring', providerApiCalls: 0, modelFiles: original.modelFiles, passes };
writeFileSync(resolve(root, 'artifacts/encoding.json'), JSON.stringify(output, null, 2) + '\n', { flag: 'wx' });
await text.dispose(); await vision.dispose();
console.log(JSON.stringify({ totalMs: output.totalMs, loadMs }));
