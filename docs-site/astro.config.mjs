// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// Standalone engineering-docs site for Mac Markdown Workspace. Deployed as its
// OWN Vercel project (root directory: docs-site/) so it never touches the app's
// build, lint, or typecheck. Content lives in src/content/docs/ and is curated
// from the repo's /docs design notes into a public, portfolio-facing narrative.
export default defineConfig({
  site: "https://mac-markdown-docs.vercel.app",
  integrations: [
    starlight({
      title: "Mac Markdown Workspace",
      description:
        "Engineering docs for a local-first, cross-platform Markdown notes app with passwordless, end-to-end-encrypted cloud sync.",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/andrewsolomon/mac-markdown-workspace",
        },
      ],
      editLink: {
        baseUrl:
          "https://github.com/andrewsolomon/mac-markdown-workspace/edit/main/docs-site/",
      },
      sidebar: [
        { label: "Overview", link: "/" },
        {
          label: "Architecture",
          items: [
            { label: "Platform abstraction", link: "/architecture/platform-abstraction/" },
            { label: "Design system", link: "/architecture/design-system/" },
          ],
        },
        {
          label: "Cloud sync",
          items: [
            { label: "Overview & threat model", link: "/sync/overview/" },
            { label: "Crypto & sync engine", link: "/sync/crypto-engine/" },
            { label: "API & storage", link: "/sync/api-storage/" },
          ],
        },
        {
          label: "Platforms",
          items: [
            { label: "iOS storage & iCloud", link: "/platforms/ios-storage/" },
            { label: "Visual testing", link: "/platforms/visual-testing/" },
          ],
        },
      ],
    }),
  ],
});
