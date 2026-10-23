#!/usr/bin/env bash
# Usage: npm run release -- 0.2.0
# Bumps the version everywhere, commits, tags v<version> and pushes; CI then builds all packages
# and publishes the GitHub release.
set -euo pipefail
version="${1:?usage: npm run release -- <version, e.g. 0.2.0>}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "version must look like 1.2.3" >&2; exit 1; }
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$root"
[ -z "$(git status --porcelain)" ] || { echo "commit or stash your changes first" >&2; exit 1; }
git rev-parse "v$version" >/dev/null 2>&1 && { echo "tag v$version already exists" >&2; exit 1; }
npm version "$version" --no-git-tag-version >/dev/null
sed -i -E "0,/^version = \".*\"/s//version = \"$version\"/" Cargo.toml
sed -i -E "s/\"version\": \"[^\"]+\"/\"version\": \"$version\"/" src-tauri/tauri.conf.json
sed -i -E "s/^pkgver=.*/pkgver=$version/" packaging/arch/PKGBUILD
cargo update --workspace --offline >/dev/null 2>&1 || cargo update --workspace >/dev/null
git add package.json package-lock.json Cargo.toml Cargo.lock src-tauri/tauri.conf.json packaging/arch/PKGBUILD
git commit -m "release: v$version"
git tag -a "v$version" -m "BBForge $version"
git push origin HEAD "v$version"
echo "Pushed v$version — CI publishes the release: https://github.com/1VicTim1/BBForge/actions"
