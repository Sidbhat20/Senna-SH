import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // a stray package-lock.json in the home folder makes Next guess the wrong workspace root
  outputFileTracingRoot: __dirname,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "bjndslreyjmfaocuffsj.supabase.co", pathname: "/storage/v1/object/public/posters/**" }],
  },
};

export default nextConfig;
