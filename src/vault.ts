import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt
} from "node:crypto"
import { access, chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { Effect, Schema } from "effect"

class VaultError extends Schema.TaggedError<VaultError>()("VaultError", {
  message: Schema.String
}) {}

export type Entry = {
  title: string
  username: string
  password: string
  url: string
  notes: string
}

const EntrySchema = Schema.Struct({
  title: Schema.String,
  username: Schema.String,
  password: Schema.String,
  url: Schema.String,
  notes: Schema.String
})
const VaultDataSchema = Schema.Struct({ entries: Schema.Array(EntrySchema) })
type VaultData = typeof VaultDataSchema.Type
const EnvelopeSchema = Schema.Struct({
  version: Schema.Literal(1),
  kdf: Schema.Literal("scrypt"),
  salt: Schema.String,
  iv: Schema.String,
  tag: Schema.String,
  ciphertext: Schema.String
})
type Envelope = typeof EnvelopeSchema.Type

const keyLength = 32
const scryptOptions = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

export const exists = Effect.fn("exists")(function* (path: string) {
  return yield* Effect.tryPromise(() => access(path)).pipe(
    Effect.as(true),
    Effect.catch((error) =>
      (error as NodeJS.ErrnoException).code === "ENOENT"
        ? Effect.succeed(false)
        : Effect.fail(error)
    )
  )
})

export const openVault = Effect.fn("openVault")(function* (path: string, masterPassword: string) {
  const text = yield* Effect.tryPromise(() => readFile(path, "utf8"))
  const envelope = yield* Effect.try({
    try: () => Schema.decodeUnknownSync(EnvelopeSchema)(JSON.parse(text)),
    catch: () => new VaultError({ message: "Unsupported or damaged vault format" })
  })
  const salt = Buffer.from(envelope.salt, "base64")
  const key = yield* deriveKey(masterPassword, salt)
  const opened = Effect.try({
    try: () => {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"))
      decipher.setAuthTag(Buffer.from(envelope.tag, "base64"))
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64")),
        decipher.final()
      ]).toString("utf8")
      return Schema.decodeUnknownSync(VaultDataSchema)(JSON.parse(plaintext))
    },
    catch: () => new VaultError({ message: "Could not unlock vault: wrong master password or damaged vault" })
  })
  return yield* opened.pipe(Effect.ensuring(Effect.sync(() => key.fill(0))))
})

export const saveVault = Effect.fn("saveVault")(function* (path: string, data: VaultData, masterPassword: string) {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = yield* deriveKey(masterPassword, salt)
  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv)
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(data), "utf8"),
      cipher.final()
    ])
    const envelope: Envelope = {
      version: 1,
      kdf: "scrypt",
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64")
    }
    yield* Effect.tryPromise(() => mkdir(dirname(path), { recursive: true, mode: 0o700 }))
    const tempPath = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`
    yield* Effect.tryPromise(() => writeFile(tempPath, `${JSON.stringify(envelope)}\n`, { mode: 0o600 }))
    yield* Effect.tryPromise(() => chmod(tempPath, 0o600))
    yield* Effect.tryPromise(() => rename(tempPath, path))
    yield* Effect.tryPromise(() => chmod(path, 0o600))
  } finally {
    key.fill(0)
  }
})

const deriveKey = Effect.fnUntraced(function* (password: string, salt: Buffer) {
  return yield* Effect.tryPromise(() => new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, scryptOptions, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  }))
})
