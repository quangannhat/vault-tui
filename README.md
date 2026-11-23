# PWD — personal password manager

A local terminal password manager built with Bun, OpenTUI, React, and Effect.
Vault data is encrypted with AES-256-GCM; a key is derived from the master
password using scrypt.

## Run

```sh
bun install
bun run install:cli
vault
```

The installer creates `~/.local/bin/vault`, which launches the TUI from any
working directory. Ensure `~/.local/bin` is on your `PATH`.

On first run, create a master password of at least 12 characters. Later runs
prompt to unlock the vault unless the password is available in the OS keychain.
After a successful unlock or vault creation, the password is saved there for
automatic unlock on later runs. Bun uses macOS Keychain, Linux Secret Service,
or Windows Credential Manager. The encrypted vault is stored at
`~/.config/pwd-manager/vault.json`.

Keys:

- `j` / `k` or Up / Down: navigate entries in the selected group
- `h` / `l` or Left / Right: switch group filter
- `a`: add an entry (title, username, password, website, notes, group)
- `c`: duplicate the selected entry
- `e`: edit the selected entry's content
- `r`: rename the selected entry
- `g`: move the selected entry to a group (or create a group by name)
- `d`: delete the selected entry, then press `y` to confirm
- `u`: copy the selected username to the clipboard
- `y`: copy the selected password to the clipboard
- Clipboard contents are cleared after 30 seconds.
- `o`: open the selected entry's website in your browser
- `v` or Space: reveal/hide the selected password
- `q` or Ctrl+C: quit
- Ctrl+H: toggle the keyboard-shortcuts help modal

Text fields accept terminal paste (usually Ctrl+Shift+V). Press Ctrl+U to clear
the current field.

## Security notes

The vault is encrypted at rest and written with restrictive file permissions.
The optional saved master password is protected by the operating system's
credential store; anyone with access to your unlocked OS account may be able to
unlock the vault. This is an early personal tool, not a professionally audited
password manager. It does not yet include automatic locking, secure-memory
guarantees, backups, or recovery if the master password is lost. Clipboard
clearing is best effort. Keep a secure backup of the encrypted vault file.
