#!/bin/sh

set -eu

consumer_directory="$(mktemp -d -t payload-billing-esm-XXXXXX)"
trap 'rm -rf "$consumer_directory"' EXIT

package_tarball="$(pnpm pack --pack-destination "$consumer_directory" | tail -n 1)"
zod_tarball="$consumer_directory/$(npm_config_cache="$consumer_directory/npm-cache" npm pack --silent --pack-destination "$consumer_directory" ./node_modules/zod | tail -n 1)"
react_tarball="$consumer_directory/$(npm_config_cache="$consumer_directory/npm-cache" npm pack --silent --pack-destination "$consumer_directory" ./node_modules/react | tail -n 1)"

PACKAGE_TARBALL="$package_tarball" node --input-type=module --eval '
  import { readFile } from "node:fs/promises"
  import { execFileSync } from "node:child_process"

  const packageJson = JSON.parse(
    execFileSync("tar", ["-xOf", process.env.PACKAGE_TARBALL, "package/package.json"]),
  )
  const reactPackageJson = JSON.parse(await readFile("node_modules/react/package.json", "utf8"))

  if (!packageJson.peerDependencies?.react) {
    throw new Error("The published package must declare its React runtime import as a peer dependency")
  }
  if (!reactPackageJson.version.startsWith("19.")) {
    throw new Error(`The React fixture ${reactPackageJson.version} does not satisfy ${packageJson.peerDependencies.react}`)
  }
'

cd "$consumer_directory"
node --input-type=module --eval \
  "import { writeFileSync } from 'node:fs'; writeFileSync('package.json', JSON.stringify({ name: 'payload-billing-esm-consumer', private: true, type: 'module' }))"
npm_config_cache="$consumer_directory/npm-cache" npm install \
  --offline \
  --ignore-scripts \
  --legacy-peer-deps \
  "$package_tarball" \
  "$react_tarball" \
  "$zod_tarball"

node --input-type=module --eval '
  import { readFile } from "node:fs/promises"

  const packageJson = JSON.parse(
    await readFile("node_modules/@xtr-dev/payload-billing/package.json", "utf8"),
  )
  const importSpecifiers = Object.keys(packageJson.exports).map((subpath) =>
    subpath === "." ? packageJson.name : `${packageJson.name}/${subpath.slice(2)}`,
  )

  await Promise.all(importSpecifiers.map((specifier) => import(specifier)))
'
