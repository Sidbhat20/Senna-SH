import type { NextConfig } from "next";

// Supabase serves auth, data, realtime and posters; everything else is same-origin.
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://bjndslreyjmfaocuffsj.supabase.co";
const dev = process.env.NODE_ENV !== "production";
const CSP = [
  "default-src 'self'",
  // Next inlines its bootstrap and our no-flash theme script; dev also needs eval for fast refresh
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase}`,
  "font-src 'self'",
  `connect-src 'self' ${supabase} ${supabase.replace("https://", "wss://")}${dev ? " ws:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: CSP },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      ],
    }];
  },
  // a stray package-lock.json in the home folder makes Next guess the wrong workspace root
  outputFileTracingRoot: __dirname,
  // lets `NEXT_DIST_DIR=.next-build npm run build` run without clobbering a running dev server
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Smart Create sends the poster (up to 5 MB, as for poster uploads) to a server action; the default cap is 1 MB
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "bjndslreyjmfaocuffsj.supabase.co", pathname: "/storage/v1/object/public/posters/**" }],
  },
};

export default nextConfig;
