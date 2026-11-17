import { defineConfig } from "vitest/config";

// Lets tests render client components (JSX) without a React plugin; tsconfig keeps jsx "preserve" for Next.
export default defineConfig({ oxc: { jsx: { runtime: "automatic" } } });
