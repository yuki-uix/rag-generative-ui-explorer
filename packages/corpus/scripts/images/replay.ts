import { resolve } from 'node:path';
import { verifyImageObservations } from '../../src/image-observations.js';
verifyImageObservations(resolve(import.meta.dirname,'../../../../eval/images'));
await import('./evaluate.js');
