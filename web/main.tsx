/** Vite root is `web/`; this shim keeps the HTML entry inside that root so
 *  script URLs resolve under `base` (absolute `/src/...` paths 404 in dev). */
import "../src/web/entry";
