import { spawn } from "node:child_process"
import { Effect } from "effect"

type ClipboardCommand = { command: string; args: string[] }

function clipboardCommand(): ClipboardCommand {
  if (process.platform === "darwin") return { command: "pbcopy", args: [] }
  if (process.platform === "win32") return { command: "clip.exe", args: [] }
  if (process.env.WAYLAND_DISPLAY) return { command: "wl-copy", args: [] }
  if (process.env.DISPLAY) {
    return { command: "xclip", args: ["-selection", "clipboard", "-in"] }
  }
  throw new Error("No supported clipboard detected (need Wayland, X11, macOS, or Windows)")
}

const writeClipboard = Effect.fn("writeClipboard")(function* (value: string) {
  const { command, args } = clipboardCommand()
  return yield* Effect.tryPromise(() => new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "ignore", "pipe"] })
    let stderr = ""
    child.stderr.setEncoding("utf8")
    child.stderr.on("data", (chunk: string) => { stderr += chunk })
    child.once("error", (error) => reject(new Error(`${command} failed: ${error.message}`)))
    child.once("close", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`))
    })
    child.stdin.end(value)
  }))
})

export const copyToClipboard = writeClipboard

export const clearClipboard = writeClipboard("")
