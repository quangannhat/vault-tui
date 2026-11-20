#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { RegistryProvider } from "@effect/atom-react"
import { App } from "./app/App.js"

const renderer = await createCliRenderer({ exitOnCtrlC: false })
createRoot(renderer).render(
  <RegistryProvider>
    <App />
  </RegistryProvider>
)

await renderer.closed
renderer.destroy()
