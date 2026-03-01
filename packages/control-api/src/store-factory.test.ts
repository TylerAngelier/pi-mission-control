import { describe, expect, it } from "vitest";

import { InMemoryControlApiStore } from "./store.js";
import { createControlApiStoreFromEnv } from "./store-factory.js";

describe("createControlApiStoreFromEnv", () => {
  it("defaults to in-memory mode", async () => {
    const previousMode = process.env.PERSISTENCE_MODE;

    delete process.env.PERSISTENCE_MODE;

    const { store, close } = await createControlApiStoreFromEnv();
    expect(store).toBeInstanceOf(InMemoryControlApiStore);

    await close();
    process.env.PERSISTENCE_MODE = previousMode;
  });

  it("throws when postgres mode lacks database URL", async () => {
    const previousMode = process.env.PERSISTENCE_MODE;
    const previousUrl = process.env.MISSION_CONTROL_DATABASE_URL;

    process.env.PERSISTENCE_MODE = "postgres";
    delete process.env.MISSION_CONTROL_DATABASE_URL;

    await expect(createControlApiStoreFromEnv()).rejects.toThrow(
      "MISSION_CONTROL_DATABASE_URL is required"
    );

    process.env.PERSISTENCE_MODE = previousMode;
    process.env.MISSION_CONTROL_DATABASE_URL = previousUrl;
  });
});
