import fs from "node:fs";
import path from "node:path";

const localKaleido = path.resolve(
  process.cwd(),
  "../../kaleido/typescript/packages/kaleido/src/index.ts",
);

const nextConfig = {
  output: "standalone",
  // ensure Turbopack has an explicit config so builds won't error when a
  // webpack customization (like an alias) is present
  turbopack: {},
  experimental: {
    optimizePackageImports: ["@ericbutera/kaleido"],
  },
  webpack: (config: any) => {
    if (fs.existsSync(localKaleido)) {
      config.resolve.alias = config.resolve.alias || {};
      config.resolve.alias["@ericbutera/kaleido"] = localKaleido;
    }
    return config;
  },
};

export default nextConfig;
