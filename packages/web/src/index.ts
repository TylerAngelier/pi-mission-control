export interface WebHealth {
  service: "web";
  status: "ok";
}

export const health = (): WebHealth => ({
  service: "web",
  status: "ok",
});

export {
  createSessionStore,
  type SessionStatus,
  type SessionStore,
  type SessionSummary,
} from "./session-store.js";

export * from "./chat/index.js";
