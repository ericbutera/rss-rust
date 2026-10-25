#!/bin/sh
# Deploy script for the rss app.
# Called from the Woodpecker CI deploy step.
# Expects these env vars (injected from Woodpecker secrets):
#   PULUMI_ACCESS_TOKEN, GITHUB_TOKEN, PULUMI_IAC_REPO, CI_PIPELINE_EVENT,
#   CI_COMMIT_BEFORE, CI_COMMIT_SHA
set -e

# Accept the infrastructure layout before and after its directory migration.
enter_iac_project() {
  project_root=/tmp/pulumi-iac/services/applications/rss
  if [ ! -d "$project_root" ]; then
    project_root=/tmp/pulumi-iac/rss
  fi
  cd "$project_root"
}

MANUAL="${CI_PIPELINE_EVENT}"
BEFORE="${CI_COMMIT_BEFORE}"
FALLBACK_DEPLOY_ALL=false

if [ -n "$BEFORE" ] && [ "$BEFORE" != "0000000000000000000000000000000000000000" ]; then
  git fetch --depth=1 origin "$BEFORE" 2>/dev/null || true
  CHANGED=$(git diff --name-only "$BEFORE" "${CI_COMMIT_SHA}" 2>/dev/null || true)
  if [ -z "$CHANGED" ]; then
    FALLBACK_DEPLOY_ALL=true
  fi
else
  FALLBACK_DEPLOY_ALL=true
fi

API_TAG=""
WORKER_TAG=""
UI_TAG=""

if [ "$MANUAL" = "manual" ] || [ "$FALLBACK_DEPLOY_ALL" = "true" ] || echo "$CHANGED" | grep -qE "^(api/|migration/|Cargo\.toml|Cargo\.lock|\.woodpecker/)"; then
  API_TAG="${CI_COMMIT_SHA}"
fi
if [ "$MANUAL" = "manual" ] || [ "$FALLBACK_DEPLOY_ALL" = "true" ] || echo "$CHANGED" | grep -qE "^(api/|worker/|migration/|Cargo\.toml|Cargo\.lock|\.woodpecker/)"; then
  WORKER_TAG="${CI_COMMIT_SHA}"
fi
if [ "$MANUAL" = "manual" ] || [ "$FALLBACK_DEPLOY_ALL" = "true" ] || echo "$CHANGED" | grep -qE "^(ui-next/|\.woodpecker/)"; then
  UI_TAG="${CI_COMMIT_SHA}"
fi

if [ -z "$API_TAG" ] && [ -z "$WORKER_TAG" ] && [ -z "$UI_TAG" ]; then
  echo "No deployable changes detected, skipping deploy"
  exit 0
fi

git clone "https://x-access-token:${GITHUB_TOKEN}@github.com/${PULUMI_IAC_REPO}" /tmp/pulumi-iac
enter_iac_project
pulumi stack select ericbutera/rss/rss --non-interactive

if [ -n "$API_TAG" ];    then pulumi config set rss:apiTag    "$API_TAG";    fi
if [ -n "$WORKER_TAG" ]; then pulumi config set rss:workerTag "$WORKER_TAG"; fi
if [ -n "$UI_TAG" ];     then pulumi config set rss:uiTag     "$UI_TAG";     fi

pulumi up --yes --skip-preview
