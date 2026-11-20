import { spawn } from "node:child_process"
import { Context, Effect, Layer, Schema } from "effect"

export class ClipboardError extends Schema.TaggedError<ClipboardError>()("ClipboardError", {
  message: Schema.String,
  cause: Schema.Defect()
}) {}

const command = (): readonly [string, readonly string[]] => {
  if (process.platform === "darwin") return ["pbcopy", []]
  if (process.platform === "win32") return ["clip.exe", []]
  if (process.env.WAYLAND_DISPLAY) return ["wl-copy", []]
  if (process.env.DISPLAY) return ["xclip", ["-selection", "clipboard", "-in"]]
  throw new Error("No supported clipboard detected")
}

const write = (value: string) => Effect.tryPromise({
  try: () => {
    const [program, args] = command()
    return new Promise<void>((resolve, reject) => {
      const child = spawn(program, [...args], { stdio: ["pipe", "ignore", "pipe"] })
      let stderr = ""
      child.stderr.setEncoding("utf8")
      child.stderr.on("data", (chunk: string) => { stderr += chunk })
      child.once("error", reject)
      child.once("close", (code) => code === 0
        ? resolve()
        : reject(new Error(`${program} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`)))
      child.stdin.end(value)
    })
  },
  catch: (cause) => new ClipboardError({
    message: cause instanceof Error ? cause.message : "Clipboard operation failed",
    cause
  })
})

export class Clipboard extends Context.Service<Clipboard, {
  readonly copy: (value: string) => Effect.Effect<void, ClipboardError>
  readonly clear: () => Effect.Effect<void, ClipboardError>
}>()("pwd-manager/Clipboard") {
  static readonly layer = Layer.effect(Clipboard, Effect.gen(function* () {
    const scope = yield* Effect.scope
    let generation = 0
    const clear = Effect.fn("Clipboard.clear")(function* () {
      generation++
      yield* write("")
    })
    const copy = Effect.fn("Clipboard.copy")(function* (value: string) {
      const current = ++generation
      yield* write(value)
      yield* Effect.sleep("30 seconds").pipe(
        Effect.flatMap(() => current === generation ? write("") : Effect.void),
        Effect.catch(() => Effect.void),
        (effect) => Effect.forkIn(effect, scope)
      )
    })
    return Clipboard.of({ copy, clear })
  }))
}
