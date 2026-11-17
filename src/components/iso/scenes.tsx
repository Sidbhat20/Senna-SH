// Former illustration slots, now photography (premium direction). Names kept so pages didn't need to change.
import { PHOTOS, PhotoTile } from "../Photo";

type S = { className?: string };
const tile = (src: string) => function Tile({ className = "" }: S) {
  return <PhotoTile src={src} className={`aspect-[4/3] ${className}`} sizes="320px" />;
};

export const HeroCourt = tile(PHOTOS.smash);
export const EmptyCourt = tile(PHOTOS.court);
export const PhoneQR = tile(PHOTOS.court);
export const Clipboard = tile(PHOTOS.court);
export const OutOfBounds = tile(PHOTOS.stadium);
export const Trophy = tile(PHOTOS.stadium);
export const StepFind = tile(PHOTOS.court);
export const StepLive = tile(PHOTOS.smash);

/** A small square colour marker (KPI tiles, sport chips). */
export function Token({ color, className = "" }: { color: string; className?: string }) {
  return <span aria-hidden className={`inline-block size-2.5 rounded-[2px] ${className.replace(/size-\d+/, "")}`} style={{ background: color }} />;
}

/** A tick in a ring: done items on the readiness track. */
export function CheckSticker({ done, className = "" }: { done: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className.replace(/-?rotate-\d+/g, "")}>
      <circle cx="12" cy="12" r="10" fill={done ? "var(--flood)" : "none"} stroke={done ? "var(--flood)" : "var(--line)"} strokeWidth="1.5" />
      {done && <path d="M7.5 12.5l3 3 6-7" fill="none" stroke="var(--on-flood)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}
