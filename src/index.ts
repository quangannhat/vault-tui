import { Effect } from "effect"
import * as readline from "node:readline"
import { homedir } from "node:os"
import { join } from "node:path"
import { exists, openVault, saveVault, type Entry } from "./vault.js"
import { clearClipboard, copyToClipboard } from "./clipboard.js"

const vaultPath = join(homedir(), ".config", "pwd-manager", "vault.json")
let entries: Entry[] = []
let masterPassword = ""
let selected = 0
let focusedPane = 1
let showPassword = false
let status = ""
let notification = ""
let notificationKind: "success" | "error" | "info" = "info"
let notificationTimer: NodeJS.Timeout | undefined
let mode: "loading" | "password" | "unlocked" | "add" | "delete" = "loading"
let input = ""
let field = 0
let newEntry: Entry = { title: "", username: "", password: "", url: "", notes: "" }
let vaultExists = false
let busy = false
let clipboardTimer: NodeJS.Timeout | undefined
let keyQueue: Promise<void> = Promise.resolve()

const fields: (keyof Entry)[] = ["title", "username", "password", "url", "notes"]
const labels: Record<keyof Entry, string> = {
  title: "Title",
  username: "Username",
  password: "Password",
  url: "Website",
  notes: "Notes"
}
const clear = "\u001b[2J\u001b[H"
const dim = "\u001b[2m"
const cyan = "\u001b[32m"
const bold = "\u001b[1m"
const reverse = "\u001b[7m"
const reset = "\u001b[0m"

function notify(message: string, kind: "success" | "error" | "info" = "success"): void {
  notification = message
  notificationKind = kind
  if (notificationTimer) clearTimeout(notificationTimer)
  notificationTimer = setTimeout(() => {
    notification = ""
    notificationTimer = undefined
    render()
  }, 3_500)
  notificationTimer.unref()
  render()
}

function panel(width: number, height: number, title: string, content: string[], focused: boolean): string[] {
  const inner = Math.max(1, width - 2)
  const heading = ` ${focused ? `${cyan}${bold}${title}${reset}` : title} `
  const top = `${focused ? cyan : dim}┌${heading}${"─".repeat(Math.max(0, width - title.length - 4))}┐${reset}`
  const lines = [top]
  for (let row = 0; row < height - 2; row++) {
    const raw = content[row] ?? ""
    const plain = raw.replace(/\u001b\[[0-9;]*m/g, "")
    const text = raw + " ".repeat(Math.max(0, inner - plain.length))
    lines.push(`${focused ? cyan : dim}│${reset}${text}${focused ? cyan : dim}│${reset}`)
  }
  lines.push(`${focused ? cyan : dim}└${"─".repeat(inner)}┘${reset}`)
  return lines
}

function renderGate(): void {
  const title = vaultExists ? "Unlock vault" : "Create your vault"
  const lines = [
    `${bold}${cyan}PWD${reset}  ${title}`,
    "",
    vaultExists
      ? "Enter your master password:"
      : "Choose a strong master password (12+ characters):",
    "",
    `  ${"•".repeat(Math.min(input.length, 32))}${input.length > 32 ? "…" : ""}`,
    "",
    status,
    "",
    `${dim}Enter confirm · Backspace edit · Ctrl-C quit${reset}`
  ]
  process.stdout.write(`${clear}${lines.join("\n")}\n`)
}

function render(): void {
  if (mode === "password" || mode === "loading") return renderGate()
  const cols = process.stdout.columns || 100
  const rows = process.stdout.rows || 30
  const leftWidth = Math.max(28, Math.floor(cols * 0.33))
  const rightWidth = Math.max(20, cols - leftWidth - 1)
  const usableHeight = Math.max(10, rows - 2)
  const statusHeight = 4
  const listHeight = usableHeight - statusHeight
  const entry = entries[selected]
  const left = [
    ...panel(leftWidth, statusHeight, "[1] Vault", [
      `${bold}${cyan}PWD${reset}  Personal vault`,
      `${dim}● Encrypted / unlocked${reset}`
    ], focusedPane === 0),
    ...panel(leftWidth, listHeight, "[2] Entries", [
      ...entries.map((item, i) => i === selected
        ? `${reverse}${cyan}▶ ${item.title}${reset}`
        : `  ${item.title}`),
      "",
      `${entries.length} entries`
    ], focusedPane === 1)
  ]
  const details = entry ? [
    `${bold}${entry.title}${reset}`,
    "",
    `${cyan}Username${reset}`,
    `  ${entry.username}`,
    "",
    `${cyan}Password${reset}`,
    `  ${showPassword ? entry.password : "••••••••••••"}`,
    "",
    `${cyan}Website${reset}`,
    `  ${entry.url}`,
    "",
    `${cyan}Notes${reset}`,
    `  ${entry.notes}`
  ] : ["No entries yet. Press a to add one."]
  const right = panel(rightWidth, usableHeight, "[4] Entry details", details, focusedPane === 3)
  const composed = Array.from({ length: usableHeight }, (_, i) => `${left[i] ?? ""} ${right[i] ?? ""}`)
  process.stdout.write(`${clear}${composed.join("\n")}\n`)
  if (mode === "add") {
    const key = fields[field]!
    const displayed = key === "password" ? "•".repeat(input.length) : input
    process.stdout.write(`\n${bold}Add entry · ${labels[key]}${reset}: ${displayed}█\n`)
    process.stdout.write(`${dim}Enter next field · Esc cancel${reset}\n`)
  } else if (mode === "delete") {
    process.stdout.write(`\nDelete "${entry?.title ?? ""}"? Press y to confirm, any other key to cancel.\n`)
  } else {
    const message = notification || status
    const color = notificationKind === "error" ? "\u001b[31m" : notificationKind === "success" ? cyan : dim
    const prefix = notification ? (notificationKind === "error" ? "✗ " : "✓ ") : ""
    process.stdout.write(`${dim} h/l pane   j/k item   a add   d delete   y copy   v reveal   q quit${reset}  ${color}${prefix}${message}${reset}\n`)
  }
}

async function unlockOrCreate(): Promise<void> {
  if (!vaultExists && input.length < 12) {
    status = "Master password must be at least 12 characters."
    input = ""
    render()
    return
  }
  masterPassword = input
  input = ""
  try {
    if (vaultExists) {
      const data = await Effect.runPromise(openVault(vaultPath, masterPassword))
      entries = data.entries.map((entry) => ({ ...entry }))
      status = "Vault unlocked"
      notify("Vault unlocked")
    } else {
      entries = []
      await Effect.runPromise(saveVault(vaultPath, { entries }, masterPassword))
      status = "Vault created and encrypted"
      notify("Encrypted vault created")
    }
    mode = "unlocked"
  } catch (error) {
    masterPassword = ""
    status = error instanceof Error ? error.message : "Could not open vault"
    notification = ""
  }
  render()
}

async function persist(): Promise<void> {
  try {
    await Effect.runPromise(saveVault(vaultPath, { entries }, masterPassword))
    status = "Saved"
    notify("Vault saved")
  } catch (error) {
    status = `Save failed: ${error instanceof Error ? error.message : "unknown error"}`
    notify(status, "error")
  }
  render()
}

async function handleKey(inputKey: string, key: readline.Key): Promise<void> {
  if (busy) return
  if (key.ctrl && key.name === "c") return quit()
  if (mode === "password") {
    if (key.name === "return") {
      busy = true
      try {
        await unlockOrCreate()
      } finally {
        busy = false
      }
    } else if (key.name === "backspace") input = input.slice(0, -1)
    else if (key.name === "escape") return quit()
    else if (inputKey && !key.ctrl && inputKey.length === 1) input += inputKey
    render()
    return
  }
  if (mode === "add") {
    if (key.name === "escape") {
      mode = "unlocked"
      input = ""
      status = "Add cancelled"
    } else if (key.name === "backspace") input = input.slice(0, -1)
    else if (key.name === "return") {
      const current = fields[field]!
      newEntry[current] = input
      input = ""
      field++
      if (field >= fields.length) {
        if (!newEntry.title.trim()) {
          status = "Title is required; entry discarded"
        } else {
          entries.push(newEntry)
          selected = entries.length - 1
          status = "Entry added"
          mode = "unlocked"
          newEntry = { title: "", username: "", password: "", url: "", notes: "" }
          notify("Entry added")
          await persist()
          return
        }
        newEntry = { title: "", username: "", password: "", url: "", notes: "" }
        mode = "unlocked"
        field = 0
      }
    } else if (inputKey && !key.ctrl && inputKey.length === 1) input += inputKey
    render()
    return
  }
  if (mode === "delete") {
    if (inputKey.toLowerCase() === "y" && entries[selected]) {
      entries.splice(selected, 1)
      selected = Math.max(0, Math.min(selected, entries.length - 1))
      status = "Entry deleted"
      mode = "unlocked"
      notify("Entry deleted")
      await persist()
    } else {
      mode = "unlocked"
      status = "Delete cancelled"
      notify("Delete cancelled", "info")
    }
    render()
    return
  }
  if (key.name === "q" || key.name === "escape") return quit()
  if (key.name === "k" || key.name === "up") {
    if (focusedPane === 1 && entries.length) selected = (selected + entries.length - 1) % entries.length
  }
  if (key.name === "j" || key.name === "down") {
    if (focusedPane === 1 && entries.length) selected = (selected + 1) % entries.length
  }
  if (key.name === "h" || key.name === "left") focusedPane = (focusedPane + 2) % 3
  if (key.name === "l" || key.name === "right" || key.name === "tab") focusedPane = (focusedPane + 1) % 3
  if (key.name === "v" || key.name === "space") showPassword = !showPassword
  if (key.name === "y" && entries[selected]) {
    try {
      await Effect.runPromise(copyToClipboard(entries[selected]!.password))
      if (clipboardTimer) clearTimeout(clipboardTimer)
      notify("Password copied · clipboard clears in 30s")
      clipboardTimer = setTimeout(() => {
        clipboardTimer = undefined
        void Effect.runPromise(clearClipboard).then(
          () => notify("Clipboard cleared"),
          () => notify("Could not clear clipboard", "error")
        )
      }, 30_000)
      clipboardTimer.unref()
    } catch (error) {
      status = error instanceof Error ? error.message : "Clipboard copy failed"
      notify(status, "error")
    }
  }
  if (key.name === "a") {
    mode = "add"
    field = 0
    input = ""
    newEntry = { title: "", username: "", password: "", url: "", notes: "" }
  }
  if (key.name === "d" && entries[selected]) mode = "delete"
  render()
}

async function quit(): Promise<void> {
  masterPassword = ""
  if (clipboardTimer) {
    clearTimeout(clipboardTimer)
    clipboardTimer = undefined
    try {
      await Effect.runPromise(clearClipboard)
    } catch {
      // Clipboard clearing is best effort during shutdown.
    }
  }
  if (notificationTimer) clearTimeout(notificationTimer)
  if (process.stdin.isTTY) process.stdin.setRawMode(false)
  process.stdout.write("\u001b[0m\n")
  process.exit(0)
}

const program = Effect.gen(function* () {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log("PWD requires an interactive terminal.")
    return
  }
  vaultExists = yield* exists(vaultPath)
  mode = "password"
  status = vaultExists ? `Vault file: ${vaultPath}` : `New vault: ${vaultPath}`
  readline.emitKeypressEvents(process.stdin)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.on("keypress", (keyText, key) => {
    keyQueue = keyQueue
      .then(() => handleKey(keyText, key))
      .catch((error: unknown) => {
        status = error instanceof Error ? error.message : "Unexpected key handler failure"
        notify(status, "error")
      })
  })
  process.stdout.on("resize", render)
  render()
})

Effect.runPromise(program)
