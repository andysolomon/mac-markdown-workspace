type AppApi = import("../shared/types/ipc").AppApi;

interface Window {
  appApi: AppApi;
}

/** Injected by Vite define — short commit sha of the running build. */
declare const __BUILD_ID__: string;
