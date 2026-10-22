import { resolve } from 'node:path';
import { verifyImageObservations } from '../../src/image-observations.js';
verifyImageObservations(resolve(import.meta.dirname,'../../../../eval/images'));
console.warn('Historical v1 replay: concept gold and layout confounds limit effectiveness claims; see eval/images-review/REVIEW.md.');
await import('./evaluate.js');
