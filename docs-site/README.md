# Mac Markdown Workspace — docs site

A standalone [Astro](https://astro.build) + [Starlight](https://starlight.astro.build)
engineering-docs site for the Mac Markdown Workspace project. It lives in this repo
but builds, lints, and deploys **independently** of the app — it is not part of the
app's Vite build, `tsc`, or ESLint runs.

## Develop

```bash
cd docs-site
bun install
bun run dev        # local dev server
bun run build      # static build to dist/
bun run preview    # serve the built site
```

## Content

Pages are Markdown/MDX in `src/content/docs/`, curated from the repo's `/docs`
design notes into a public-facing narrative. The sidebar is configured in
`astro.config.mjs`.

## Deploy (Vercel, separate project)

Create a **new** Vercel project pointed at this repo and set:

- **Root Directory:** `docs-site`
- **Framework preset:** Astro (auto-detected)

Vercel builds `bun run build` and serves the static `dist/` output. Keeping it as a
distinct project means pushing the app never rebuilds the docs and vice-versa. Update
the `site` URL in `astro.config.mjs` once the production domain is assigned.
