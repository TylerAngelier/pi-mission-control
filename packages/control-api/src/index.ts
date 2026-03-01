import { createServer, type Server } from "node:http";

import { createControlApiApp, type AppOptions } from "./app.js";

export interface ControlApiHealth {
  service: "control-api";
  status: "ok";
}

export const health = (): ControlApiHealth => ({
  service: "control-api",
  status: "ok",
});

export const startControlApiServer = (port: number, options: AppOptions = {}): Promise<Server> => {
  const app = createControlApiApp(options);

  return new Promise((resolve, reject) => {
    const server = createServer(app);

    server.once("error", (error) => {
      reject(error);
    });

    server.listen(port, () => {
      resolve(server);
    });
  });
};

export { createControlApiApp };
export { InMemoryControlApiStore } from "./store.js";
export { createControlApiStoreFromEnv } from "./store-factory.js";
export type { ControlApiStore } from "./control-api-store.js";
