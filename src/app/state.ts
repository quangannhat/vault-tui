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
  readonly quitting: boolean
  readonly masterPassword: string
}

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
