# Linux launcher integration

Operator notes for launching Mac Markdown Workspace from a desktop or
terminal on Arch/Omarchy (issue #25). This does **not** install a
system package — that is issue #24.

The Linux ZIP from `bun run make:linux` already has a stable executable
name (`mac-markdown-workspace`) and ships a desktop-entry *template*
plus icon under `resources/linux/`. Copying those into
`~/.local/share/applications` / icon themes is optional and opt-in.
This project never runs `xdg-mime default` or `update-desktop-database`.

## Identity

| Item | Value |
|------|--------|
| Executable | `mac-markdown-workspace` |
| StartupWMClass | `mac-markdown-workspace` |
| Icon name | `mac-markdown-workspace` |
| Template | `resources/linux/mac-markdown-workspace.desktop` (inside the ZIP) |
| Icon file | `resources/linux/icon.png` (512×512, also at `resources/icon.png`) |

`Exec=mac-markdown-workspace %F` passes **one or more files**. There is
no `x-scheme-handler` line; URI schemes are unsupported.

## CLI

From an unpacked ZIP (quote the directory — it contains spaces):

```bash
"$HOME/Applications/Mac Markdown Workspace-linux-x64/mac-markdown-workspace"
"$HOME/Applications/Mac Markdown Workspace-linux-x64/mac-markdown-workspace" notes.md
"$HOME/Applications/Mac Markdown Workspace-linux-x64/mac-markdown-workspace" \
  "file with spaces.md" 日本語.md -- -leading.md
```

`--` is required when a filename begins with `-`, so Chromium does not
eat it as a switch.

Each path is imported as a **new library note** (same as File → Open).
A second process does not start a second writer: it activates the
running window and forwards the files. Existing edits are flushed or
confirmed before import. Missing or unreadable files show an error
toast and leave other notes alone.

## Optional desktop entry

To appear in the Omarchy launcher without a pacman package:

```bash
APP="$HOME/Applications/Mac Markdown Workspace-linux-x64"
install -Dm644 "$APP/resources/linux/mac-markdown-workspace.desktop" \
  ~/.local/share/applications/mac-markdown-workspace.desktop
install -Dm644 "$APP/resources/linux/icon.png" \
  ~/.local/share/icons/hicolor/512x512/apps/mac-markdown-workspace.png
# Optional, user-initiated only — do not run from packaging scripts here:
# update-desktop-database ~/.local/share/applications
```

Edit `Exec=` if the binary is not on `PATH`. MIME types
`text/markdown` and `text/x-markdown` are advertised so "Open With" can
list the app; they do not steal the default handler. Check with:

```bash
desktop-file-validate ~/.local/share/applications/mac-markdown-workspace.desktop
xdg-mime query default text/markdown
```

## macOS

Finder / `open` still use the existing dialog-based Open menu and the
`open-file` event. That event joins the same import queue; it does not
replace File → Open.
