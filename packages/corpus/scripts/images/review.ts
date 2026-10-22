import { resolve } from 'node:path';
import { verifyReviewObservations } from '../../src/image-review-observations.js';
verifyReviewObservations(resolve(import.meta.dirname, '../../../../eval/images-review'));
await import('./evaluate-controls.js');
