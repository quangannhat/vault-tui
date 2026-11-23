import * as Atom from "effect/reactivity/Atom"
import { emptyEntry, type Entry, type EntryField } from "../domain.js"

export type Screen =
  | "loading"
  | "master-password"
  | "unlocked"
  | "adding"
  | "editing"
  | "assign-group"
  | "rename-entry"
  | "confirm-delete"

export interface AppState {
  readonly screen: Screen
  readonly vaultExists: boolean
  readonly entries: readonly Entry[]
  readonly selected: number
  readonly groupFilter: string
  readonly showPassword: boolean
  readonly input: string
  readonly addEntry: Entry
  readonly addField: EntryField
  readonly status: string
  readonly error: string | null
  readonly notification: Notification | null
  readonly quitting: boolean
  readonly masterPassword: string
}

export interface Notification {
  readonly id: number
  readonly message: string
  readonly type: "success" | "error"
}

let notificationId = 0

export const withNotification = (
  state: AppState,
  message: string,
  type: Notification["type"] = "success"
): AppState => ({
  ...state,
  status: message,
  error: type === "error" ? message : null,
  notification: { id: ++notificationId, message, type }
})

export const allGroupsFilter = "All groups"

export const initialState: AppState = {
  screen: "loading",
  vaultExists: false,
  entries: [],
  selected: 0,
  groupFilter: allGroupsFilter,
  showPassword: false,
  input: "",
  addEntry: emptyEntry(),
  addField: "title",
  status: "Loading vault…",
  error: null,
  notification: null,
  quitting: false,
  masterPassword: ""
}

export const appState = Atom.make(initialState)

export const updateState = (state: AppState, patch: Partial<AppState>): AppState => ({
  ...state,
  ...patch
})

export const groupsFor = (entries: readonly Entry[]): readonly string[] =>
  [allGroupsFilter, ...new Set(entries.map((entry) => entry.group?.trim() || "Personal"))]

export const visibleEntries = (state: AppState): readonly Entry[] =>
  state.groupFilter === allGroupsFilter
    ? state.entries
    : state.entries.filter((entry) => (entry.group?.trim() || "Personal") === state.groupFilter)

export const selectedEntry = (state: AppState): Entry | undefined =>
  visibleEntries(state)[state.selected]
