import { randomBytes, createCipheriv, createDecipheriv, scrypt } from "node:crypto"
import { access, chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { Context, Effect, Layer, Schema } from "effect"
import { EnvelopeSchema, Entry, VaultDataSchema } from "../domain.js"

export class VaultError extends Schema.TaggedError<VaultError>()("VaultError", {
  message: Schema.String,
  cause: Schema.Defect()
}) {}

const keyLength = 32
const scryptOptions = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

const deriveKey = (password: string, salt: Buffer) =>
  Effect.tryPromise({
    try: () => new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, keyLength, scryptOptions, (error, key) => {
        if (error) reject(error)
        else resolve(key)
      })
    }),
    catch: (cause) => new VaultError({ message: "Could not derive vault key", cause })
  })

export class Vault extends Context.Service<Vault, {
  readonly exists: () => Effect.Effect<boolean, VaultError>
  readonly open: (masterPassword: string) => Effect.Effect<readonly Entry[], VaultError>
  readonly save: (entries: readonly Entry[], masterPassword: string) => Effect.Effect<void, VaultError>
}>()("pwd-manager/Vault") {
  static layer(path: string) {
    return Layer.succeed(Vault, Vault.of({
      exists: Effect.fn("Vault.exists")(function* () {
        return yield* Effect.tryPromise(() => access(path)).pipe(
          Effect.as(true),
          Effect.catch((cause) => (cause as NodeJS.ErrnoException).code === "ENOENT"
            ? Effect.succeed(false)
            : Effect.fail(new VaultError({ message: "Could not access vault", cause })))
        )
      }),
      open: Effect.fn("Vault.open")(function* (masterPassword: string) {
        const text = yield* Effect.tryPromise({
          try: () => readFile(path, "utf8"),
          catch: (cause) => new VaultError({ message: "Could not read vault", cause })
        })
        const envelope = yield* Effect.try({
          try: () => Schema.decodeUnknownSync(EnvelopeSchema)(JSON.parse(text)),
          catch: (cause) => new VaultError({ message: "Vault format is invalid or unsupported", cause })
        })
        const key = yield* deriveKey(masterPassword, Buffer.from(envelope.salt, "base64"))
        const opened = Effect.try({
          try: () => {
            const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"))
            decipher.setAuthTag(Buffer.from(envelope.tag, "base64"))
            const plaintext = Buffer.concat([
              decipher.update(Buffer.from(envelope.ciphertext, "base64")),
              decipher.final()
            ]).toString("utf8")
            return Schema.decodeUnknownSync(VaultDataSchema)(JSON.parse(plaintext)).entries
          },
          catch: (cause) => new VaultError({
            message: "Could not unlock vault: wrong master password or damaged vault",
            cause
          })
        })
        return yield* opened.pipe(Effect.ensuring(Effect.sync(() => { key.fill(0) })))
      }),
      save: Effect.fn("Vault.save")(function* (entries: readonly Entry[], masterPassword: string) {
        const salt = randomBytes(16)
        const iv = randomBytes(12)
        const key = yield* deriveKey(masterPassword, salt)
        const saveFile = Effect.gen(function* () {
          const cipher = createCipheriv("aes-256-gcm", key, iv)
          const ciphertext = Buffer.concat([
            cipher.update(JSON.stringify({ entries }), "utf8"),
            cipher.final()
          ])
          const envelope = {
            version: 1,
            kdf: "scrypt",
            salt: salt.toString("base64"),
            iv: iv.toString("base64"),
            tag: cipher.getAuthTag().toString("base64"),
            ciphertext: ciphertext.toString("base64")
          }
          yield* Effect.tryPromise({
            try: () => mkdir(dirname(path), { recursive: true, mode: 0o700 }),
            catch: (cause) => new VaultError({ message: "Could not create vault directory", cause })
          })
          const tempPath = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`
          yield* Effect.tryPromise({
            try: () => writeFile(tempPath, `${JSON.stringify(envelope)}\n`, { mode: 0o600 }),
            catch: (cause) => new VaultError({ message: "Could not write vault", cause })
          })
          yield* Effect.tryPromise({
            try: () => chmod(tempPath, 0o600),
            catch: (cause) => new VaultError({ message: "Could not secure temporary vault", cause })
          })
          yield* Effect.tryPromise({
            try: () => rename(tempPath, path),
            catch: (cause) => new VaultError({ message: "Could not replace vault", cause })
          })
          yield* Effect.tryPromise({
            try: () => chmod(path, 0o600),
            catch: (cause) => new VaultError({ message: "Could not secure vault", cause })
          })
        })
        return yield* saveFile.pipe(Effect.ensuring(Effect.sync(() => { key.fill(0) })))
      })
    }))
  }
}
