import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

const localKaleidoEntry = path.resolve(
  __dirname,
  "../../kaleido/typescript/packages/kaleido/src/index.ts",
);

const localKaleidoEntryForTurbopack = path
  .relative(__dirname, localKaleidoEntry)
  .split(path.sep)
  .join("/");

const useLocalKaleido =
  process.env.NODE_ENV !== "production" && fs.existsSync(localKaleidoEntry);

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@ericbutera/kaleido"],
  experimental: {
    externalDir: true,
  },
  turbopack: {
    resolveAlias: useLocalKaleido
      ? {
          "@ericbutera/kaleido": localKaleidoEntryForTurbopack,
        }
      : undefined,
  },
  webpack: (config) => {
    if (useLocalKaleido) {
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        "@ericbutera/kaleido": localKaleidoEntry,
      };
    }
    return config;
  },
};

export default nextConfig;
