# AUR submission — mac-markdown-workspace

This doc is the operator-facing checklist for publishing
`mac-markdown-workspace` to the Arch User Repository. The artifact, PKGBUILD,
and `.SRCINFO` are already prepared and merged to `main` on the public repo
[`andysolomon/mac-markdown-workspace`](https://github.com/andysolomon/mac-markdown-workspace).
Release `v1.0.0` is public and downloadable anonymously.

The release artifact has a TODO Maintainer email that needs to be filled in
before the AUR push (AUR requires a real, contactable address).

## One-time AUR account setup

1. Create an AUR account at <https://aur.archlinux.org/register>.
2. Add an SSH public key at <https://aur.archlinux.org/account/edit/> under
   "SSH Public Key". Use the same key you'd use for `aur.archlinux.org`
   git+ssh access. Paste the **public** key (`ssh-ed25519 AAAA…` or
   `ssh-rsa AAAA…`) — never the private half.
3. Verify SSH access works:
   ```sh
   ssh -T aur@aur.archlinux.org
   ```
   You should see a greeting that ends with "Please remember to use your
   AUR account email when committing." If it asks for a password, your key
   isn't authorized — go back to step 2.

## Fill in the Maintainer email

The PKGBUILD in `main` (commit `435d1d4`) has a `TODO` placeholder:

```
# Maintainer: Andrew Solomon <TODO: replace with real AUR email>
```

Edit it in place on a fresh branch:

```sh
git checkout main
git pull
git checkout -b chore/aur-maintainer-email
# edit packaging/arch/PKGBUILD — replace the TODO line with your real AUR email
sed -i 's|<TODO: replace with real AUR email>|<your-real-name@your-domain>|' packaging/arch/PKGBUILD
# regenerate .SRCINFO from the edited PKGBUILD (it embeds the new maintainer)
cd packaging/arch && makepkg --printsrcinfo > .SRCINFO && cd ../..
git diff
git add packaging/arch/PKGBUILD packaging/arch/.SRCINFO
git commit -m "chore: set AUR maintainer email"
git push -u origin chore/aur-maintainer-email
```

Open a PR, get it merged, then proceed with the AUR push below.

## First-time AUR push

```sh
# One-time clone of the AUR package repo (currently empty).
git clone ssh://aur@aur.archlinux.org/mac-markdown-workspace.git
cd mac-markdown-workspace

# Copy PKGBUILD + .SRCINFO from the (now-merged) commit on main.
git checkout 435d1d4 -- packaging/arch/PKGBUILD packaging/arch/.SRCINFO 2>/dev/null || \
  curl -sSL https://raw.githubusercontent.com/andysolomon/mac-markdown-workspace/main/packaging/arch/PKGBUILD -o PKGBUILD
curl -sSL https://raw.githubusercontent.com/andysolomon/mac-markdown-workspace/main/packaging/arch/.SRCINFO -o .SRCINFO

# Inspect the diff against AUR (should be empty if you only pushed the
# maintainer email change).
cat PKGBUILD
cat .SRCINFO

# Commit + push. AUR parses the commit author email; use the AUR account's
# registered email.
git config user.name  "Your Name"
git config user.email "your-real-name@your-domain"
git add PKGBUILD .SRCINFO
git commit -m "upgpkg: mac-markdown-workspace 1.0.0-1

Initial upload to AUR. Sourced from the public v1.0.0 GitHub release:
https://github.com/andysolomon/mac-markdown-workspace/releases/tag/v1.0.0

The Linux x86_64 Electron build is verified end-to-end on Omarchy with the
sandbox enabled and native Wayland launch."
git push
```

If push succeeds, the package is live. Test from any Arch box:

```sh
yay -S mac-markdown-workspace
# or, via Omarchy: Install ▸ AUR → mac-markdown-workspace
```

AUR build servers will compile and lint the package on push. Watch the
[AUR package page](https://aur.archlinux.org/packages/mac-markdown-workspace)
for the build status — a successful push yields a "Votes: 0, Popularity:
0.0X" entry almost immediately; a successful AUR build takes a few minutes.

## Updating to a new version (future)

1. Cut a new release on GitHub:
   ```sh
   # from the workspace root, after bumping package.json version
   bun run make:linux
   # re-zip with lowercase internal directory if you haven't changed Forge output:
   unzip -q "out/make/zip/linux/x64/Mac Markdown Workspace-linux-x64-X.Y.Z.zip" -d rezip
   mv "rezip/Mac Markdown Workspace-linux-x64" "rezip/mac-markdown-workspace-X.Y.Z-linux-x64"
   (cd rezip && zip -qr ../mac-markdown-workspace-X.Y.Z-linux-x64.zip mac-markdown-workspace-X.Y.Z-linux-x64)
   sha256sum mac-markdown-workspace-X.Y.Z-linux-x64.zip > SHA256SUMS
   gh release create "vX.Y.Z" mac-markdown-workspace-X.Y.Z-linux-x64.zip SHA256SUMS --target main
   ```
2. Bump `pkgver` (and `pkgrel=1`) in `packaging/arch/PKGBUILD` and update the
   `sha256sums` to the new artifact's hash. Regenerate `.SRCINFO` with
   `makepkg --printsrcinfo > .SRCINFO`.
3. Commit on a branch, PR, merge to main.
4. From the AUR clone:
   ```sh
   git pull origin main   # or re-clone if the URL changed
   cp PKGBUILD .SRCINFO /path/to/aur-clone/   # from the merged commit
   cd /path/to/aur-clone
   git add PKGBUILD .SRCINFO
   git commit -m "upgpkg: mac-markdown-workspace X.Y.Z-1"
   git push
   ```

## Troubleshooting

- `git push` asks for a password → SSH key not authorized on AUR; check
  <https://aur.archlinux.org/account/edit/>.
- `package not found` in `yay -S mac-markdown-workspace` → push hasn't
  propagated yet; AUR mirror lag is usually <1 minute. If it's been more
  than a few minutes, check the [package page](https://aur.archlinux.org/packages/mac-markdown-workspace)
  to confirm it exists.
- AUR build error `FAILED` (visible on the package page) → read the build
  log. Most common cause: a missing `makedepends` (we removed all of them
  in PR #43; if a future PKGBUILD needs to compile something, add it back).
- `chrome-sandbox` permission denied at runtime → confirm `/opt/mac-markdown-workspace/chrome-sandbox`
  is `4755` after install: `stat -c '%a %n' /opt/mac-markdown-workspace/chrome-sandbox`.
  Reinstall with `pacman -S --overwrite '*' mac-markdown-workspace` if the
  mode is wrong.
