import { describe, expect, it } from "vitest";

import { health } from "./index.js";

describe("worker health", () => {
  it("returns ok status", () => {
    expect(health()).toEqual({ service: "worker", status: "ok" });
  });
});
