import fixture from '../../../fixtures/image-review.json';
import type { ImageReviewData } from '../../../lib/image-review-types';
import { ImageExperimentReview } from '../../../components/review/image-experiment-review';

export default function ImagesPage() {
  return <ImageExperimentReview data={fixture as ImageReviewData} />;
}
