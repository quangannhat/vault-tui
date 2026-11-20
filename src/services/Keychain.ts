import { Context, Effect, Layer, Schema } from "effect"

interface BunSecrets {
  get(options: { readonly service: string; readonly name: string }): Promise<string | null>
  set(options: { readonly service: string; readonly name: string; readonly value: string }): Promise<void>
  delete(options: { readonly service: string; readonly name: string }): Promise<boolean>
}

const secrets = (globalThis as typeof globalThis & {
  readonly Bun?: { readonly secrets?: BunSecrets }
}).Bun?.secrets

const service = "com.pwd-manager"
const name = "default-vault"

export class KeychainError extends Schema.TaggedError<KeychainError>()("KeychainError", {
  message: Schema.String,
  cause: Schema.Defect()
}) {}

export class Keychain extends Context.Service<Keychain, {
  readonly get: () => Effect.Effect<string | null, KeychainError>
  readonly set: (password: string) => Effect.Effect<void, KeychainError>
  readonly delete: () => Effect.Effect<void, KeychainError>
}>()("pwd-manager/Keychain") {
  static readonly layer = Layer.succeed(Keychain, Keychain.of({
    get: Effect.fn("Keychain.get")(function* () {
      if (!secrets) return null
      return yield* Effect.tryPromise({
        try: () => secrets.get({ service, name }),
        catch: (cause) => new KeychainError({ message: "Could not read the OS keychain", cause })
      })
    }),
    set: Effect.fn("Keychain.set")(function* (password: string) {
      if (!secrets) return
      yield* Effect.tryPromise({
        try: () => secrets.set({ service, name, value: password }),
        catch: (cause) => new KeychainError({ message: "Could not save password to the OS keychain", cause })
      })
    }),
    delete: Effect.fn("Keychain.delete")(function* () {
      if (!secrets) return
      yield* Effect.tryPromise({
        try: () => secrets.delete({ service, name }).then(() => undefined),
        catch: (cause) => new KeychainError({ message: "Could not remove password from the OS keychain", cause })
      })
    })
  }))
}
