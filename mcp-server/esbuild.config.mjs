import { build } from "esbuild";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));

await build({
  alias: {
    "@lib": "./src/lib",
    "@prompts": "./src/prompts",
    "@tools": "./src/tools",
  },
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import{createRequire}from"node:module";const require=createRequire(import.meta.url);',
    ].join("\n"),
  },
  bundle: true,
  define: {
    __VERSION__: JSON.stringify(version),
  },
  entryPoints: ["src/index.ts"],
  format: "esm",
  minify: true,
  outfile: "dist/index.js",
  platform: "node",
  target: "node18",
  treeShaking: true,
});
