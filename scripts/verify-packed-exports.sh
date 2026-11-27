#!/bin/sh

# Packs the package, installs the tarball into an empty ESM project and imports every
# subpath in the published `exports` map, so an export that points at a file missing
# from the tarball fails here instead of in a consumer's build.

set -eu

consumer_directory="$(mktemp -d -t payload-billing-esm-XXXXXX)"
trap 'rm -rf "$consumer_directory"' EXIT

package_tarball="$(pnpm pack --pack-destination "$consumer_directory" | tail -n 1)"

cd "$consumer_directory"
node --input-type=module --eval \
  "import { writeFileSync } from 'node:fs'; writeFileSync('package.json', JSON.stringify({ name: 'payload-billing-esm-consumer', private: true, type: 'module' }))"
npm_config_cache="$consumer_directory/npm-cache" npm install \
  --offline \
  --ignore-scripts \
  --legacy-peer-deps \
  "$package_tarball"

node --input-type=module --eval '
  import { existsSync } from "node:fs"
  import { readFile } from "node:fs/promises"
  import { join } from "node:path"

  const packageDirectory = "node_modules/@xtr-dev/payload-billing"
  const packageJson = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"))

  // The package ships no React components: the placeholder /client and /rsc entry points
  // were removed, and React must not come back as a peer dependency without a real import.
  const expectedSubpaths = [".", "./mollie", "./stripe"]
  const publishedSubpaths = Object.keys(packageJson.exports).sort()
  if (JSON.stringify(publishedSubpaths) !== JSON.stringify(expectedSubpaths)) {
    throw new Error(`Expected exports ${expectedSubpaths.join(", ")} but the tarball has ${publishedSubpaths.join(", ")}`)
  }
  if (packageJson.peerDependencies?.react) {
    throw new Error("The package has no React import, so it must not declare a react peer dependency")
  }

  // Every condition of every export (import, types, default) has to point at a packed file.
  for (const [subpath, conditions] of Object.entries(packageJson.exports)) {
    for (const [condition, target] of Object.entries(conditions)) {
      if (!existsSync(join(packageDirectory, target))) {
        throw new Error(`Export "${subpath}" (${condition}) points at ${target}, which is not in the tarball`)
      }
    }
  }

  const importSpecifiers = publishedSubpaths.map((subpath) =>
    subpath === "." ? packageJson.name : `${packageJson.name}/${subpath.slice(2)}`,
  )
  await Promise.all(importSpecifiers.map((specifier) => import(specifier)))

  // The removed subpaths must be rejected by Node rather than resolve to a leftover file.
  for (const removedSubpath of ["client", "rsc"]) {
    const resolved = await import(`${packageJson.name}/${removedSubpath}`).then(() => true, () => false)
    if (resolved) {
      throw new Error(`${packageJson.name}/${removedSubpath} still resolves`)
    }
  }
'
