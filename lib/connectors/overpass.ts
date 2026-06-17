/**
 * Day 5 commit 1 placeholder.
 *
 * Commit 2 replaces this stub with the real OpenStreetMap Overpass
 * connector. This stub exists so lib/connectors/registry.ts compiles
 * before the full implementation lands.
 */

import type { Connector } from "./types";

export const overpassConnector: Connector = {
  id: "overpass",
  name: "OpenStreetMap Overpass (stub — full impl in commit 2)",
  vertical: "all",
  fetch: async () => {
    return [];
  },
};
