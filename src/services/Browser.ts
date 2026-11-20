import { spawn } from "node:child_process"
import { Context, Effect, Layer, Schema } from "effect"

export class BrowserError extends Schema.TaggedError<BrowserError>()("BrowserError", {
  message: Schema.String,
  cause: Schema.Defect()
}) {}

const validateUrl = (value: string) => Effect.try({
  try: () => {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Only http and https links can be opened")
    }
    return url.toString()
  },
  catch: (cause) => new BrowserError({
    message: cause instanceof Error ? cause.message : "Invalid website link",
    cause
  })
})

const openCommand = (url: string) => {
  if (process.platform === "darwin") return ["open", [url]] as const
  if (process.platform === "win32") return ["rundll32.exe", ["url.dll,FileProtocolHandler", url]] as const
  return ["xdg-open", [url]] as const
}

export class Browser extends Context.Service<Browser, {
  readonly open: (url: string) => Effect.Effect<void, BrowserError>
}>()("pwd-manager/Browser") {
  static readonly layer = Layer.succeed(Browser, Browser.of({
    open: Effect.fn("Browser.open")(function* (value: string) {
      const url = yield* validateUrl(value)
      const [command, args] = openCommand(url)
      yield* Effect.tryPromise({
        try: () => new Promise<void>((resolve, reject) => {
          const child = spawn(command, [...args], { detached: true, stdio: "ignore" })
          child.once("error", reject)
          child.once("spawn", () => {
            child.unref()
            resolve()
          })
        }),
        catch: (cause) => new BrowserError({
          message: cause instanceof Error ? cause.message : "Could not open website",
          cause
        })
      })
    })
  }))
}
