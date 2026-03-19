import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/index.js",
  banner: {
    js: '#!/usr/bin/env node',
  },
  packages: "external",
  sourcemap: true,
});

console.log("✅ Built to dist/index.js");
