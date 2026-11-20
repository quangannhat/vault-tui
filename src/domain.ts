import { Schema } from "effect"

export class Entry extends Schema.Class<Entry>("Entry")({
  title: Schema.String,
  username: Schema.String,
  password: Schema.String,
  url: Schema.String,
  notes: Schema.String,
  group: Schema.optionalKey(Schema.String)
}) {}

export const VaultDataSchema = Schema.Struct({
  entries: Schema.Array(Entry)
})

export const EnvelopeSchema = Schema.Struct({
  version: Schema.Literal(1),
  kdf: Schema.Literal("scrypt"),
  salt: Schema.String,
  iv: Schema.String,
  tag: Schema.String,
  ciphertext: Schema.String
})

export const emptyEntry = (): Entry => new Entry({
  title: "",
  username: "",
  password: "",
  url: "",
  notes: "",
  group: "Personal"
})

export const entryFields = ["title", "username", "password", "url", "notes", "group"] as const
export type EntryField = typeof entryFields[number]

export const entryLabels: Record<EntryField, string> = {
  title: "Title",
  username: "Username",
  password: "Password",
  url: "Website",
  notes: "Notes",
  group: "Group"
}
