// A QR code as one SVG path, so it renders on the server with no canvas or injected markup.
import qrcode from "qrcode-generator";

export const QUIET = 4; // modules of white margin every scanner expects

/** Medium error correction; returns the viewBox size and a path of one 1x1 square per dark module. */
export function qrPath(text: string): { size: number; d: string } {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`;
  return { size: n + QUIET * 2, d };
}
