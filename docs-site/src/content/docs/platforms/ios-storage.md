---
title: iOS storage & iCloud
description: Where notes live on iOS, why the encrypted vault is the cross-device path, and why the native iCloud bridge is deferred.
---

On iOS the notes library is written with `@capacitor/filesystem`. A settings
toggle chooses the location: **iCloud** maps to `Directory.Documents` (backed up,
Files-app visible) and **on-device** maps to `Directory.Data` (app-private). Reads
merge *both* locations so switching never hides existing notes; writes go to the
selected location; deletes cover both.

## The `updatedAt` sidecar

Capacitor's Filesystem exposes no `utimes`, so a pulled note's canonical
`updatedAt` cannot ride on file mtime. A small `.vault-meta.json` sidecar in the
app-private `Data` directory stores the authoritative timestamps (mtime is the
fallback for notes imported outside the app) and the local tombstones, so sync
merges correctly and deletions propagate instead of resurrecting.

## Making the library visible in Files

Two Info.plist keys expose the folder under *On My iPhone/iPad → Mac Markdown*:

```xml
<key>UIFileSharingEnabled</key><true/>
<key>LSSupportsOpeningDocumentsInPlace</key><true/>
```

## Why iCloud Drive sync is *not* wired

The "iCloud" setting today writes to the app-sandbox Documents directory — which
is included in device **backup** but is **not** the iCloud Drive ubiquity
container. Two devices on the same Apple ID will therefore not see each other's
notes live through this setting alone.

A native bridge that writes into a real ubiquity container
(`iCloud.com.andrewsolomon.macmarkdownworkspace`, via `NSFileCoordinator`) was
scoped but **intentionally deferred**, because:

- the [encrypted vault](/sync/overview/) already syncs iPad ↔ iPhone ↔ **web**;
- iCloud Drive is Apple-device-only and cannot include the web app;
- running both at once risks divergent copies with no single source of truth.

If it's ever revived, it needs an Apple Developer provisioning profile with the
iCloud container registered plus the `NSUbiquitousContainers` Info.plist entries —
neither of which the vault path requires.
