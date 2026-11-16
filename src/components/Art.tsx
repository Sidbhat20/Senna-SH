"use client";

// Isometric stickers (fun-isometric kit in src/stickers) in SportsHunt's colours. Canvas-drawn, so client only;
// reduced motion shows each icon's resting frame.
import type { Palette } from "@/stickers/fun";
import { calendar, notes, pen, phone, trophy } from "@/stickers/icons";
import { Sticker } from "@/stickers/Sticker";

const PALETTE = {
  main: "#2e9a2c", // turf: bodies
  gold: "#f5c518", // floodlight: trophies, highlights
  tint: "#d5ecce", // pale turf
  ok: "#2e9a2c",
  hot: "#d9472b",
  deep: "#0f3b1e", // pitch: dark parts
} as Palette;

const ICONS = { calendar, notes, pen, phone, trophy };
export type ArtName = keyof typeof ICONS;

export function Art({ name, size = 120, label, loop = false }: { name: ArtName; size?: number; label?: string; loop?: boolean }) {
  return (
    <Sticker icon={ICONS[name]} palette={PALETTE} loop={loop} replayOnHover enter={0.15} label={label}
      style={{ width: size, height: size }} />
  );
}
