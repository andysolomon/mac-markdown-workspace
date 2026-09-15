# Hyprland / Omarchy desktop adaptation

Mac Markdown Workspace on Omarchy (Hyprland + Wayland) should feel like a
native tiled Linux app: Ctrl chords, compositor-owned Super, no fake traffic
lights, and a window that can sit at half width.

## What shipped (issue #26)

| Concern | Behavior |
| --- | --- |
| Window minimum | 640×480 (was 980×640) so a 1920 half-tile (~960) fits |
| Menus | macOS Services/Hide/front only on darwin; Linux File menu includes Quit |
| Shortcuts | Linux/Windows: Control only; macOS: Cmd; web: either |
| Shift chords | `e.key` lowercased so Ctrl+Shift+S is Save As |
| Export menu | File → Export as Text/PDF/Word/HTML calls the same `exportDocument` path as the toolbar |
| WindowDots | Hidden when `appApi.platform.showWindowDots === false` (Linux/Windows/iOS) |
| Ozone | No global `--ozone-platform=x11`; prefer native Wayland and document fallback |

## Platform snapshot

`window.appApi.platform` (sync):

```ts
{
  os: "darwin" | "linux" | "win32" | "web" | "ios" | "unknown";
  commandUsesCtrl: boolean;
  showWindowDots: boolean;
}
```

## Manual Wayland checklist

See `docs/hyprland-desktop-validation-2026-09.md` for the dated Omarchy record
covering focus, clipboard, drag/drop, file dialogs, resize, IME/dead keys, and
font rendering. Test XWayland separately only if native Wayland is unavailable.

## Related

- Launcher / MIME / single-instance: `docs/launcher-integration.md` (#25)
- Linux ZIP build: `docs/linux-build.md` (#23)
- PKGBUILD install of `.desktop` + icon: issue #24
