import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { decodePasteBytes } from "@opentui/core"
import { useKeyboard, usePaste, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useEffect, useState } from "react"
import { emptyEntry, entryFields, entryLabels } from "../domain.js"
import { addEntry, copySelected, copySelectedUsername, deleteSelected, duplicateSelected, initialize, moveSelectedToGroup, openSelectedWebsite, quit, renameSelected, unlock, updateSelectedEntry } from "./actions.js"
import { appState, groupsFor, selectedEntry, visibleEntries } from "./state.js"

const colors = {
  background: "#1e1e2e",
  panel: "#181825",
  border: "#45475a",
  accent: "#89dceb",
  text: "#cdd6f4",
  muted: "#a6adc8",
  error: "#f38ba8",
  selected: "#313244"
}

export const App = () => {
  const [helpOpen, setHelpOpen] = useState(false)
  const state = useAtomValue(appState)
  const setState = useAtomSet(appState)
  const runInitialize = useAtomSet(initialize)
  const runUnlock = useAtomSet(unlock)
  const runAdd = useAtomSet(addEntry)
  const runUpdate = useAtomSet(updateSelectedEntry)
  const runDelete = useAtomSet(deleteSelected)
  const runMoveToGroup = useAtomSet(moveSelectedToGroup)
  const runRename = useAtomSet(renameSelected)
  const runDuplicate = useAtomSet(duplicateSelected)
  const runCopy = useAtomSet(copySelected)
  const runCopyUsername = useAtomSet(copySelectedUsername)
  const runOpenWebsite = useAtomSet(openSelectedWebsite)
  const runQuit = useAtomSet(quit)
  const renderer = useRenderer()
  const { width, height } = useTerminalDimensions()
  const groups = groupsFor(state.entries)
  const visible = visibleEntries(state)

  useEffect(() => {
    runInitialize(undefined)
  }, [runInitialize])

  useEffect(() => {
    if (state.quitting) renderer.destroy()
  }, [renderer, state.quitting])

  useEffect(() => {
    const notification = state.notification
    if (!notification) return
    const timer = setTimeout(() => {
      setState((current) =>
        current.notification?.id === notification.id
          ? { ...current, notification: null }
          : current
      )
    }, 2800)
    return () => clearTimeout(timer)
  }, [setState, state.notification])

  usePaste((event) => {
    const pasted = decodePasteBytes(event.bytes).replace(/[\r\n]/g, "")
    if (!pasted) return
    setState((current) =>
      current.screen === "master-password" ||
        current.screen === "adding" ||
        current.screen === "editing" ||
        current.screen === "assign-group" ||
        current.screen === "rename-entry"
        ? { ...current, input: current.input + pasted, error: null }
        : current
    )
  })

  useKeyboard((key) => {
    if (state.quitting || key.eventType === "release") return
    const isEnter = key.name === "return" || key.name === "enter"
    const character = !key.ctrl && !key.meta && key.sequence.length === 1 ? key.sequence : ""

    if (key.ctrl && key.name === "c") {
      runQuit(undefined)
      return
    }
    if (key.ctrl && key.name === "h" && state.screen === "unlocked") {
      setHelpOpen((open) => !open)
      return
    }
    if (helpOpen && state.screen === "unlocked") {
      if (key.name === "escape") setHelpOpen(false)
      else if (key.name === "q") runQuit(undefined)
      return
    }
    if (key.ctrl && key.name === "u") {
      if (
        state.screen === "master-password" ||
        state.screen === "adding" ||
        state.screen === "editing" ||
        state.screen === "assign-group" ||
        state.screen === "rename-entry"
      ) {
        setState((current) => ({ ...current, input: "", error: null }))
      }
      return
    }
    if (state.screen === "master-password") {
      if (key.name === "escape") {
        runQuit(undefined)
      } else if (isEnter) {
        runUnlock(state.input)
      } else if (key.name === "backspace") {
        setState((current) => ({ ...current, input: current.input.slice(0, -1), error: null }))
      } else if (character) {
        setState((current) => ({ ...current, input: current.input + character, error: null }))
      }
      return
    }
    if (state.screen === "adding" || state.screen === "editing") {
      if (key.name === "escape") {
        setState((current) => ({ ...current, screen: "unlocked", input: "", addEntry: emptyEntry() }))
        return
      }
      if (isEnter) {
        const value = state.input
        const addEntryData = { ...state.addEntry, [state.addField]: value }
        const fieldIndex = entryFields.indexOf(state.addField)
        const nextField = entryFields[fieldIndex + 1]
        if (nextField) {
          setState((current) => ({
            ...current,
            addEntry: addEntryData,
            addField: nextField,
            input: addEntryData[nextField] ?? "",
            error: null
          }))
        } else if (!addEntryData.title.trim()) {
          setState((current) => ({ ...current, input: "", error: "Title is required" }))
        } else {
          if (state.screen === "editing") runUpdate(addEntryData)
          else runAdd(addEntryData)
        }
      } else if (key.name === "backspace") {
        setState((current) => ({ ...current, input: current.input.slice(0, -1) }))
      } else if (character) {
        setState((current) => ({ ...current, input: current.input + character }))
      }
      return
    }
    if (state.screen === "assign-group") {
      if (key.name === "escape") {
        setState((current) => ({ ...current, screen: "unlocked", input: "" }))
      } else if (isEnter) {
        runMoveToGroup(state.input)
      } else if (key.name === "backspace") {
        setState((current) => ({ ...current, input: current.input.slice(0, -1) }))
      } else if (character) {
        setState((current) => ({ ...current, input: current.input + character }))
      }
      return
    }
    if (state.screen === "rename-entry") {
      if (key.name === "escape") {
        setState((current) => ({ ...current, screen: "unlocked", input: "", error: null }))
      } else if (isEnter) {
        runRename(state.input)
      } else if (key.name === "backspace") {
        setState((current) => ({ ...current, input: current.input.slice(0, -1), error: null }))
      } else if (character) {
        setState((current) => ({ ...current, input: current.input + character, error: null }))
      }
      return
    }
    if (state.screen === "confirm-delete") {
      if (character.toLowerCase() === "y") runDelete(undefined)
      else setState((current) => ({ ...current, screen: "unlocked", status: "Delete cancelled" }))
      return
    }
    if (key.name === "q" || key.name === "escape") runQuit(undefined)
    else if (key.name === "j" || key.name === "down") {
      setState((current) => ({
        ...current,
        selected: visibleEntries(current).length
          ? (current.selected + 1) % visibleEntries(current).length
          : 0
      }))
    } else if (key.name === "k" || key.name === "up") {
      setState((current) => ({
        ...current,
        selected: visibleEntries(current).length
          ? (current.selected + visibleEntries(current).length - 1) % visibleEntries(current).length
          : 0
      }))
    } else if (key.name === "h" || key.name === "left" || key.name === "l" || key.name === "right") {
      setState((current) => {
        const options = groupsFor(current.entries)
        const currentIndex = Math.max(0, options.indexOf(current.groupFilter))
        const direction = key.name === "h" || key.name === "left" ? -1 : 1
        const nextIndex = (currentIndex + direction + options.length) % options.length
        return { ...current, groupFilter: options[nextIndex]!, selected: 0 }
      })
    } else if (key.name === "v" || key.name === "space") {
      setState((current) => ({ ...current, showPassword: !current.showPassword }))
    } else if (key.name === "y") runCopy(undefined)
    else if (key.name === "u") runCopyUsername(undefined)
    else if (key.name === "o") runOpenWebsite(undefined)
    else if (key.name === "c" && selectedEntry(state)) runDuplicate(undefined)
    else if (key.name === "a") {
      setState((current) => ({
        ...current,
        screen: "adding",
        addEntry: emptyEntry(),
        addField: entryFields[0],
        input: "",
        error: null
      }))
    } else if (key.name === "d" && selectedEntry(state)) {
      setState((current) => ({ ...current, screen: "confirm-delete" }))
    } else if (key.name === "g" && selectedEntry(state)) {
      setState((current) => ({
        ...current,
        screen: "assign-group",
        input: selectedEntry(current)?.group || "Personal",
        error: null
      }))
    } else if (key.name === "r" && selectedEntry(state)) {
      setState((current) => ({
        ...current,
        screen: "rename-entry",
        input: selectedEntry(current)?.title ?? "",
        error: null
      }))
    } else if (key.name === "e" && selectedEntry(state)) {
      const entry = selectedEntry(state)!
      setState((current) => ({
        ...current,
        screen: "editing",
        addEntry: { ...entry, group: entry.group || "Personal" },
        addField: entryFields[0],
        input: entry.title,
        error: null
      }))
    }
  })

  const selected = selectedEntry(state)
  const isSecretInput = state.screen === "master-password" ||
    ((state.screen === "adding" || state.screen === "editing") && state.addField === "password")
  const displayedInput = isSecretInput
    ? "•".repeat(state.input.length)
    : state.input

  return (
    <box width={width} height={height} flexDirection="column" backgroundColor={colors.background} padding={1}>
      <box height={3} flexDirection="row" justifyContent="space-between">
        <text fg={colors.accent}><strong> PWD </strong><span fg={colors.text}>Personal vault</span></text>
        <text fg={colors.muted}>AES-256-GCM · encrypted at rest</text>
      </box>

      {state.screen === "loading" || state.screen === "master-password" ? (
        <box flexGrow={1} alignItems="center" justifyContent="center">
          <box width={Math.min(64, width - 6)} border borderColor={colors.border} backgroundColor={colors.panel} padding={2} flexDirection="column" gap={1}>
            <text fg={colors.accent}><strong>{state.vaultExists ? "Unlock your vault" : "Create your vault"}</strong></text>
            <text fg={colors.muted}>{state.status}</text>
            <box border borderColor={colors.border} paddingLeft={1} paddingRight={1}>
              <text fg={colors.text}>{displayedInput || "Type master password…"}<span fg={colors.accent}>▌</span></text>
            </box>
            {state.error ? <text fg={colors.error}>{state.error}</text> : null}
            <text fg={colors.muted}>Enter to continue · Backspace to edit · Esc to quit</text>
          </box>
        </box>
      ) : state.screen === "adding" || state.screen === "editing" ? (
        <box flexGrow={1} alignItems="center" justifyContent="center">
          <box width={Math.min(64, width - 6)} border borderColor={colors.border} backgroundColor={colors.panel} padding={2} flexDirection="column" gap={1}>
            <text fg={colors.accent}><strong>{state.screen === "editing" ? "Edit entry" : "Add entry"} · {entryLabels[state.addField]}</strong></text>
            <text fg={colors.muted}>Field {entryFields.indexOf(state.addField) + 1} of {entryFields.length}</text>
            <box border borderColor={colors.border} paddingLeft={1} paddingRight={1}>
              <text fg={colors.text}>{displayedInput || `Enter ${entryLabels[state.addField].toLowerCase()}…`}<span fg={colors.accent}>▌</span></text>
            </box>
            {state.error ? <text fg={colors.error}>{state.error}</text> : null}
            <text fg={colors.muted}>Enter next field · Esc cancels</text>
          </box>
        </box>
      ) : state.screen === "confirm-delete" ? (
        <box flexGrow={1} alignItems="center" justifyContent="center">
          <box border borderColor={colors.error} backgroundColor={colors.panel} padding={2} flexDirection="column" gap={1}>
            <text fg={colors.error}><strong>Delete “{selected?.title}”?</strong></text>
            <text fg={colors.text}>Press y to confirm · any other key to cancel</text>
            {state.error ? <text fg={colors.error}>{state.error}</text> : null}
          </box>
        </box>
      ) : state.screen === "assign-group" ? (
        <box flexGrow={1} alignItems="center" justifyContent="center">
          <box width={Math.min(64, width - 6)} border borderColor={colors.border} backgroundColor={colors.panel} padding={2} flexDirection="column" gap={1}>
            <text fg={colors.accent}><strong>Move “{selected?.title}” to a group</strong></text>
            <box border borderColor={colors.border} paddingLeft={1} paddingRight={1}>
              <text fg={colors.text}>{state.input || "Enter group name…"}<span fg={colors.accent}>▌</span></text>
            </box>
            <text fg={colors.muted}>Enter to save · a new name creates a group · Esc cancels</text>
            {state.error ? <text fg={colors.error}>{state.error}</text> : null}
          </box>
        </box>
      ) : state.screen === "rename-entry" ? (
        <box flexGrow={1} alignItems="center" justifyContent="center">
          <box width={Math.min(64, width - 6)} border borderColor={colors.border} backgroundColor={colors.panel} padding={2} flexDirection="column" gap={1}>
            <text fg={colors.accent}><strong>Rename entry</strong></text>
            <box border borderColor={colors.border} paddingLeft={1} paddingRight={1}>
              <text fg={colors.text}>{state.input || "Enter a title…"}<span fg={colors.accent}>▌</span></text>
            </box>
            <text fg={colors.muted}>Enter to save · Esc cancels</text>
            {state.error ? <text fg={colors.error}>{state.error}</text> : null}
          </box>
        </box>
      ) : helpOpen ? (
        <box flexGrow={1} alignItems="center" justifyContent="center">
          <box
            width={Math.min(68, width - 6)}
            border
            borderColor={colors.accent}
            backgroundColor={colors.panel}
            padding={2}
            flexDirection="column"
            gap={1}
          >
            <text fg={colors.accent}><strong>Keyboard shortcuts</strong></text>
            <text fg={colors.text}>j / k or ↑ / ↓   Navigate entries</text>
            <text fg={colors.text}>h / l or ← / →   Switch group</text>
            <text fg={colors.text}>a                 Add entry</text>
            <text fg={colors.text}>e                 Edit entry</text>
            <text fg={colors.text}>c                 Duplicate entry</text>
            <text fg={colors.text}>r                 Rename entry</text>
            <text fg={colors.text}>g                 Move to a group</text>
            <text fg={colors.text}>o                 Open website</text>
            <text fg={colors.text}>u / y             Copy username / password</text>
            <text fg={colors.text}>d                 Delete entry</text>
            <text fg={colors.text}>v / Space         Reveal or hide password</text>
            <text fg={colors.text}>q / Ctrl+C        Quit</text>
            <text fg={colors.muted}>Ctrl+H or Esc closes help</text>
          </box>
        </box>
      ) : (
        <box flexGrow={1} flexDirection="column">
          <box height={2} flexDirection="row" gap={1}>
            <text fg={colors.muted}>GROUP</text>
            {groups.map((group) => (
              <box key={group} backgroundColor={group === state.groupFilter ? colors.selected : colors.background} paddingLeft={1} paddingRight={1}>
                <text fg={group === state.groupFilter ? colors.accent : colors.text}>{group}</text>
              </box>
            ))}
          </box>
          <box flexGrow={1} flexDirection="row" gap={1}>
            <box width={Math.max(24, Math.floor(width * 0.36))} border borderColor={colors.border} backgroundColor={colors.panel} flexDirection="column">
              <text fg={colors.accent}><strong> Entries ({visible.length}) </strong></text>
              <scrollbox flexGrow={1} focused>
                {visible.length ? visible.map((entry, index) => (
                  <box key={`${entry.title}-${index}`} backgroundColor={index === state.selected ? colors.selected : colors.panel} paddingLeft={1}>
                    <text fg={index === state.selected ? colors.accent : colors.text}>
                      {index === state.selected ? "› " : "  "}{entry.title || "(untitled)"}
                    </text>
                  </box>
                )) : <text fg={colors.muted}>No entries in this group. Press a to add one.</text>}
              </scrollbox>
            </box>
            <box flexGrow={1} border borderColor={colors.border} backgroundColor={colors.panel} padding={1} flexDirection="column" gap={1}>
              {selected ? (
                <>
                  <text fg={colors.accent}><strong>{selected.title}</strong></text>
                  <text fg={colors.muted}>GROUP</text>
                  <text fg={colors.text}>{selected.group || "Personal"}</text>
                  <text fg={colors.muted}>USERNAME</text>
                  <text fg={colors.text}>{selected.username || "—"}</text>
                  <text fg={colors.muted}>PASSWORD</text>
                  <text fg={colors.text}>{state.showPassword ? selected.password : "••••••••••••"}</text>
                  <text fg={colors.muted}>WEBSITE</text>
                  <text fg={colors.text}>{selected.url || "—"}</text>
                  <text fg={colors.muted}>NOTES</text>
                  <text fg={colors.text}>{selected.notes || "—"}</text>
                </>
              ) : <text fg={colors.muted}>Select an entry to view details.</text>}
            </box>
          </box>
        </box>
      )}

      {state.screen === "unlocked" ? (
        state.notification ? (
          <box
            height={3}
            border
            borderColor={state.notification.type === "error" ? colors.error : colors.accent}
            backgroundColor={colors.panel}
            paddingLeft={1}
            justifyContent="center"
          >
            <text fg={state.notification.type === "error" ? colors.error : colors.accent}>
              {state.notification.type === "error" ? "!" : "✓"} {state.notification.message}
            </text>
          </box>
        ) : <box height={1}>
          <text fg={state.error ? colors.error : colors.muted}>{state.error ?? state.status}</text>
        </box>
      ) : null}
    </box>
  )
}
