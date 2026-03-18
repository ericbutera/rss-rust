#!/bin/sh
set -e
npm install -g pnpm
# tsconfig.json maps @ericbutera/kaleido to the cloned source, so we must
# install the kaleido typescript package's own deps so tsc can resolve them.
# kaleido's pnpm-lock.yaml is gitignored, so --no-frozen-lockfile is required.
(cd ../kaleido/typescript/packages/kaleido && pnpm install --no-frozen-lockfile)
cd ui-next
pnpm install --frozen-lockfile
pnpm run typecheck
