import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
