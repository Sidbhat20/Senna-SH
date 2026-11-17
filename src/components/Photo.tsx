import Image from "next/image";
import type { Sport } from "@/lib/sports";

// Self-hosted, openly licensed photography (credits on /credits). Shown in monochrome via the `photo` utility.
export const PHOTOS = {
  smash: "/photos/hero-smash.webp",
  court: "/photos/court.webp",
  pickleball: "/photos/pickleball.webp",
  stadium: "/photos/stadium.webp",
} as const;

/** A photo for events without a poster, chosen by sport. */
export function sportPhoto(sport: Sport): string {
  if (sport === "pickleball" || sport === "tennis") return PHOTOS.pickleball;
  if (sport === "football" || sport === "futsal" || sport === "cricket" || sport === "box_cricket") return PHOTOS.stadium;
  return PHOTOS.court;
}

/** A cropped monochrome photo in a box. Decorative unless given alt text. */
export function PhotoTile({ src, className = "aspect-[4/3]", sizes = "(min-width: 768px) 40vw, 100vw", alt = "", priority = false }: {
  src: string; className?: string; sizes?: string; alt?: string; priority?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden rounded-[6px] bg-surface-2 ${className}`}>
      <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="photo object-cover" />
    </div>
  );
}
