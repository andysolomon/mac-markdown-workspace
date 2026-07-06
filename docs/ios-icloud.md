# iOS storage & iCloud (W-000005 / issue #5)

## Where notes live today

The notes library on iOS is written with `@capacitor/filesystem` under
**`Directory.Documents`** (`src/ios/capacitorApi.ts` → `Documents/notes/*.md`).
That location is:

- included in device backups (iCloud Backup / Finder backup) by default, and
- surfaceable in the Files app once the keys below are set.

A user-facing **save-location option** (iCloud vs. on-device) lands with
W-000008 in the Settings screen.

## Making the library visible in Files / iCloud Drive

These steps require Xcode on the generated project (`ios/App/App.xcworkspace`)
and cannot be automated from this repository:

1. **Expose the Documents folder in the Files app** — in `ios/App/App/Info.plist`
   add:

   ```xml
   <key>UIFileSharingEnabled</key>
   <true/>
   <key>LSSupportsOpeningDocumentsInPlace</key>
   <true/>
   ```

   After this, the `notes/` folder is browsable under *On My iPhone/iPad →
   Mac Markdown*, and note files can be opened in place by other apps.

2. **True iCloud Drive syncing (optional, entitlement required)** — in Xcode:
   - Target **App** → *Signing & Capabilities* → **+ Capability** → **iCloud**.
   - Check **iCloud Documents** and create/select a container, e.g.
     `iCloud.com.andrewsolomon.macmarkdownworkspace`.
   - Add to `Info.plist`:

     ```xml
     <key>NSUbiquitousContainers</key>
     <dict>
       <key>iCloud.com.andrewsolomon.macmarkdownworkspace</key>
       <dict>
         <key>NSUbiquitousContainerIsDocumentScopePublic</key>
         <true/>
         <key>NSUbiquitousContainerName</key>
         <string>Mac Markdown</string>
       </dict>
     </dict>
     ```

   - Writing into the ubiquity container (rather than the sandbox Documents
     directory) needs a small native bridge or a Capacitor plugin that exposes
     the container URL; the JS shim keeps `Directory.Documents` until that
     lands. Track alongside W-000008.

3. Rebuild: `bun run ios:sync && bun run ios:open`, then run on a device
   signed with a provisioning profile that includes the iCloud entitlement.

## Behavior summary

| Setting (W-000008) | Storage | Synced |
|---|---|---|
| Default today | App sandbox `Documents/notes` | Backed up with the device; Files-visible after step 1 |
| iCloud (after step 2) | Ubiquity container `Documents` | iCloud Drive, cross-device |
| On device | App sandbox `Library` (no backup flag optional) | Local only |
