import * as Atom from "effect/reactivity/Atom"
import { homedir } from "node:os"
import { join } from "node:path"
import { Effect, Exit, Layer } from "effect"
import { entryFields, emptyEntry, type Entry } from "../domain.js"
import { Browser } from "../services/Browser.js"
import { Clipboard } from "../services/Clipboard.js"
import { Keychain } from "../services/Keychain.js"
import { Vault } from "../services/Vault.js"
import { allGroupsFilter, appState, groupsFor, selectedEntry, visibleEntries, withNotification } from "./state.js"

export const appLayer = Layer.mergeAll(
  Vault.layer(join(homedir(), ".config", "pwd-manager", "vault.json")),
  Clipboard.layer,
  Browser.layer,
  Keychain.layer
)

export const appRuntime = Atom.runtime(appLayer)

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : "Unexpected application error"

const setError = (get: Atom.FnContext, error: unknown) =>
  Effect.sync(() => {
    const state = get(appState)
    const message = messageOf(error)
    get.set(appState, withNotification({
      ...state,
      ...(state.screen === "loading" ? { screen: "master-password" as const } : {}),
      ...(state.screen === "master-password" ? { input: "" } : {})
    }, message, "error"))
  })

export const initialize = appRuntime.fn<void>()((_, get) =>
  Effect.gen(function* () {
    const vault = yield* Vault
    const vaultExists = yield* vault.exists()
    const state = get(appState)
    const keychain = yield* Keychain
    const savedPassword = yield* keychain.get().pipe(Effect.catch(() => Effect.succeed(null)))
    if (vaultExists && savedPassword) {
      const opened = yield* vault.open(savedPassword).pipe(Effect.exit)
      if (Exit.isSuccess(opened)) {
        get.set(appState, withNotification({
          ...state,
          screen: "unlocked",
          vaultExists: true,
          entries: opened.value,
          input: "",
          masterPassword: savedPassword
        }, "Vault unlocked from OS keychain"))
        return
      }
      yield* keychain.delete().pipe(Effect.catch(() => Effect.void))
    }
    get.set(appState, {
      ...state,
      screen: "master-password",
      vaultExists,
      status: vaultExists
        ? "Enter your master password"
        : "Create a master password (12+ characters)"
    })
  }).pipe(Effect.catch((error) => setError(get, error)))
)

export const unlock = appRuntime.fn<string>()((password, get) =>
  Effect.gen(function* () {
    const state = get(appState)
    if (!state.vaultExists && password.length < 12) {
      get.set(appState, { ...state, input: "", error: "Master password must be at least 12 characters" })
      return
    }
    const vault = yield* Vault
    const entries = state.vaultExists
      ? yield* vault.open(password)
      : yield* Effect.as(vault.save([], password), [] as readonly Entry[])
    const keychain = yield* Keychain
    const saved = yield* keychain.set(password).pipe(
      Effect.as(true),
      Effect.catch(() => Effect.succeed(false))
    )
    const message = saved
      ? state.vaultExists ? "Vault unlocked · password saved in OS keychain" : "Vault created · password saved in OS keychain"
      : state.vaultExists ? "Vault unlocked" : "Encrypted vault created"
    get.set(appState, withNotification({
      ...state,
      screen: "unlocked",
      entries,
      input: "",
      masterPassword: password
    }, message))
  }).pipe(Effect.catch((error) => setError(get, error)))
)

export const addEntry = appRuntime.fn<Entry>()((entry, get) =>
  Effect.gen(function* () {
    const state = get(appState)
    const groupedEntry = { ...entry, group: entry.group?.trim() || "Personal" }
    const entries = [...state.entries, groupedEntry]
    const vault = yield* Vault
    yield* vault.save(entries, state.masterPassword)
    get.set(appState, withNotification({
      ...state,
      screen: "unlocked",
      entries,
      groupFilter: allGroupsFilter,
      selected: entries.length - 1,
      addEntry: emptyEntry(),
      addField: entryFields[0],
      input: ""
    }, `Created “${groupedEntry.title}”`))
  }).pipe(Effect.catch((error) => setError(get, error)))
)

export const updateSelectedEntry = appRuntime.fn<Entry>()((updatedEntry, get) =>
  Effect.gen(function* () {
    const state = get(appState)
    const selected = selectedEntry(state)
    const title = updatedEntry.title.trim()
    if (!selected) return
    if (!title) {
      get.set(appState, { ...state, error: "Title is required" })
      return
    }
    const updated = { ...updatedEntry, title, group: updatedEntry.group?.trim() || "Personal" }
    const entries = state.entries.map((entry) => entry === selected ? updated : entry)
    const groupFilter = state.groupFilter !== allGroupsFilter && state.groupFilter !== updated.group
      ? updated.group
      : state.groupFilter
    const nextState = { ...state, entries, groupFilter }
    const vault = yield* Vault
    yield* vault.save(entries, state.masterPassword)
    get.set(appState, withNotification({
      ...nextState,
      screen: "unlocked",
      selected: Math.max(0, visibleEntries(nextState).indexOf(updated)),
      addEntry: emptyEntry(),
      addField: entryFields[0],
      input: ""
    }, `Updated “${updated.title}”`))
  }).pipe(Effect.catch((error) => setError(get, error)))
)

export const deleteSelected = appRuntime.fn<void>()((_, get) =>
  Effect.gen(function* () {
    const state = get(appState)
    const selected = selectedEntry(state)
    if (!selected) return
    const entries = state.entries.filter((entry) => entry !== selected)
    const vault = yield* Vault
    yield* vault.save(entries, state.masterPassword)
    const groupFilter = state.groupFilter !== allGroupsFilter &&
      !groupsFor(entries).includes(state.groupFilter)
      ? allGroupsFilter
      : state.groupFilter
    const nextState = { ...state, entries, groupFilter }
    get.set(appState, withNotification({
      ...nextState,
      screen: "unlocked",
      selected: Math.max(0, Math.min(state.selected, visibleEntries(nextState).length - 1))
    }, `Deleted “${selected.title}”`))
  }).pipe(Effect.catch((error) => setError(get, error)))
)

export const moveSelectedToGroup = appRuntime.fn<string>()((groupName, get) =>
  Effect.gen(function* () {
    const state = get(appState)
    const selected = selectedEntry(state)
    if (!selected) return
    const group = groupName.trim() || "Personal"
    const moved = { ...selected, group }
    const entries = state.entries.map((entry) => entry === selected ? moved : entry)
    const vault = yield* Vault
    yield* vault.save(entries, state.masterPassword)
    const nextState = { ...state, entries, groupFilter: group }
    get.set(appState, withNotification({
      ...nextState,
      screen: "unlocked",
      selected: Math.max(0, visibleEntries(nextState).indexOf(moved)),
      input: ""
    }, `Moved “${selected.title}” to ${group}`))
  }).pipe(Effect.catch((error) => setError(get, error)))
)

export const renameSelected = appRuntime.fn<string>()((title, get) =>
  Effect.gen(function* () {
    const state = get(appState)
    const selected = selectedEntry(state)
    const normalizedTitle = title.trim()
    if (!selected) return
    if (!normalizedTitle) {
      get.set(appState, { ...state, error: "Title cannot be empty" })
      return
    }
    const renamed = { ...selected, title: normalizedTitle }
    const entries = state.entries.map((entry) => entry === selected ? renamed : entry)
    const vault = yield* Vault
    yield* vault.save(entries, state.masterPassword)
    get.set(appState, withNotification({
      ...state,
      screen: "unlocked",
      entries,
      input: "",
    }, `Renamed to “${renamed.title}”`))
  }).pipe(Effect.catch((error) => setError(get, error)))
)

export const duplicateSelected = appRuntime.fn<void>()((_, get) =>
  Effect.gen(function* () {
    const state = get(appState)
    const selected = selectedEntry(state)
    if (!selected) return
    const baseTitle = `${selected.title} (copy)`
    let title = baseTitle
    let suffix = 2
    while (state.entries.some((entry) => entry.title === title)) {
      title = `${baseTitle} ${suffix}`
      suffix++
    }
    const duplicate = { ...selected, title }
    const entries = [...state.entries, duplicate]
    const vault = yield* Vault
    yield* vault.save(entries, state.masterPassword)
    const nextState = { ...state, entries }
    get.set(appState, withNotification({
      ...nextState,
      screen: "unlocked",
      selected: visibleEntries(nextState).length - 1
    }, `Created “${title}”`))
  }).pipe(Effect.catch((error) => setError(get, error)))
)

export const copySelected = appRuntime.fn<void>()((_, get) =>
  Effect.gen(function* () {
    const state = get(appState)
    const selected = selectedEntry(state)
    if (!selected) return
    const clipboard = yield* Clipboard
    yield* clipboard.copy(selected.password)
    get.set(appState, withNotification(state, "Password copied · clipboard clears in 30s"))
  }).pipe(Effect.catch((error) => setError(get, error)))
)

export const copySelectedUsername = appRuntime.fn<void>()((_, get) =>
  Effect.gen(function* () {
    const state = get(appState)
    const selected = selectedEntry(state)
    if (!selected?.username) {
      get.set(appState, { ...state, status: "Selected entry has no username", error: null })
      return
    }
    const clipboard = yield* Clipboard
    yield* clipboard.copy(selected.username)
    get.set(appState, withNotification(state, "Username copied · clipboard clears in 30s"))
  }).pipe(Effect.catch((error) => setError(get, error)))
)

export const openSelectedWebsite = appRuntime.fn<void>()((_, get) =>
  Effect.gen(function* () {
    const state = get(appState)
    const selected = selectedEntry(state)
    if (!selected?.url.trim()) {
      get.set(appState, { ...state, status: "Selected entry has no website link", error: null })
      return
    }
    const browser = yield* Browser
    yield* browser.open(selected.url.trim())
    get.set(appState, withNotification(state, "Opened website"))
  }).pipe(Effect.catch((error) => setError(get, error)))
)

export const quit = appRuntime.fn<void>()((_, get) =>
  Effect.gen(function* () {
    const clipboard = yield* Clipboard
    yield* clipboard.clear().pipe(Effect.catch(() => Effect.void))
    const state = get(appState)
    get.set(appState, { ...state, quitting: true, input: "", masterPassword: "" })
  })
)
