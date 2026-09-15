import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    // Stable binary identity for launchers/PKGBUILDs (#25/#24): the executable is
    // always `mac-markdown-workspace` even though the display name (productName)
    // is "Mac Markdown Workspace".
    executableName: 'mac-markdown-workspace',
    appBundleId: 'com.andrewsolomon.mac-markdown-workspace',
    appCategoryType: 'public.app-category.productivity',
    // Extensionless: Packager resolves icon.icns (darwin) / icon.png (linux, 512px).
    icon: './assets/icons/icon',
    // Optional local Electron ZIP source for repeat builds in network-isolated
    // environments. Normal clean builds leave this unset and use @electron/get.
    electronZipDir: process.env.ELECTRON_ZIP_DIR,
    // Ship the application's MIT license inside resources/ so it stays distinct
    // from Electron's top-level LICENSE and LICENSES.chromium.html, plus the icon
    // artwork so the Linux ZIP is self-contained for launcher integration (#25).
    extraResource: [
      './LICENSE',
      './assets/icons/icon.png',
      './assets/icons/icon.svg',
      './packaging/linux',
    ],
    // Uncomment for production signing:
    // osxSign: {},
    // osxNotarize: { appleId: '', appleIdPassword: '', teamId: '' },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin', 'linux']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
