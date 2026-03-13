type AppApi = import("../shared/types/ipc").AppApi;

interface Window {
  appApi: AppApi;
}
