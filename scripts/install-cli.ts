#!/usr/bin/env bun
import { chmod, mkdir, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const destination = join(homedir(), ".local", "bin", "vault")

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
const launcher = `#!/bin/sh
exec ${quote(process.execPath)} ${quote(join(projectRoot, "src", "main.tsx"))} "$@"
`

await mkdir(dirname(destination), { recursive: true })
await writeFile(destination, launcher, { mode: 0o755 })
await chmod(destination, 0o755)
console.log(`Installed ${destination}`)
console.log("Run `vault` from any directory to open the password manager.")
