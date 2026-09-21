import Image from "next/image";

/**
 * INK product photo on the page ground. INK photos are 800x820 on flat #e5e5e5, the same as the
 * page, so the garment reads as cut out. Reserve the aspect ratio to avoid layout shift.
 */
export function ProductPhoto({
  src,
  alt,
  sizes,
  priority = false,
  poster = false,
  className = "",
}: {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  /** 4:5 frame with a consistent crop, for merchandise whose photos have their own backgrounds. */
  poster?: boolean;
  className?: string;
}) {
  return (
    <span className={`photo ${poster ? "photo-poster" : ""} ${className}`}>
      <Image src={src} alt={alt} fill sizes={sizes} quality={80} loading={priority ? "eager" : undefined} fetchPriority={priority ? "high" : undefined} />
    </span>
  );
}
