import type { InkReviewPhoto } from "@/lib/reviews/parse";

/**
 * A photo goes through our optimizer from the ORIGINAL INK keeps, not from INK's 320 px thumbnail: that thumbnail drops the camera's rotation (a phone
 * photo taken upright comes out lying down, and it is soft on a retina screen), while the optimizer applies the rotation and resizes to what is shown.
 * Only when the original's address could not be read does the thumbnail stand in (as it is, unoptimized; INK's host is the only one the parser keeps).
 */
export const srcOf = (photo: InkReviewPhoto): { src: string; unoptimized: boolean } => (photo.full ? { src: photo.full, unoptimized: false } : { src: photo.thumb, unoptimized: true });
