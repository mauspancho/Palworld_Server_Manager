import { describe, expect, it } from "vitest";
import type { DesiredStructure, ServerSnapshot } from "../src/domain.js";
import { sanitizeSecret, userFacingErrorMessage } from "../src/errors.js";
import { createPlan } from "../src/planner.js";

const desired: DesiredStructure = {
  protectedRoleNames: ["Admin", "Palworld Server Manager"],
  administrativeRoleNames: ["Admin", "Palworld Server Manager"],
  categories: [
    {
      name: "🔒 ADMINISTRACIÓN",
      private: true,
      channels: [{ name: "🛡️・moderación", type: "text" }]
    }
  ]
};

function baseSnapshot(): ServerSnapshot {
  return {
    schemaVersion: 1,
    guildId: "guild",
    guildName: "Test",
    createdAt: "2026-07-23T00:00:00.000Z",
    roles: [
      {
        id: "guild",
        name: "@everyone",
        position: 0,
        color: 0,
        hoist: false,
        managed: false,
        mentionable: false,
        permissions: []
      },
      {
        id: "admin",
        name: "Admin",
        position: 10,
        color: 0,
        hoist: false,
        managed: false,
        mentionable: false,
        permissions: []
      },
      {
        id: "palworld",
        name: "Palworld Server Manager",
        position: 9,
        color: 0,
        hoist: false,
        managed: false,
        mentionable: false,
        permissions: []
      }
    ],
    channels: []
  };
}

describe("createPlan", () => {
  it("creates missing categories and channels without duplicate role operations", () => {
    const plan = createPlan(baseSnapshot(), desired);

    expect(plan.operations).toEqual([
      {
        kind: "createCategory",
        name: "🔒 ADMINISTRACIÓN",
        position: 0,
        private: true,
        administrativeRoleNames: ["Admin", "Palworld Server Manager"]
      },
      {
        kind: "createChannel",
        categoryName: "🔒 ADMINISTRACIÓN",
        name: "🛡️・moderación",
        channelType: "text",
        position: 0
      }
    ]);
  });

  it("is idempotent when desired structure already exists", () => {
    const snapshot = baseSnapshot();
    snapshot.channels = [
      {
        id: "cat",
        name: "🔒 ADMINISTRACIÓN",
        type: "category",
        position: 0,
        parentId: null,
        parentName: null,
        permissionOverwrites: [
          { id: "guild", name: "@everyone", type: "role", allow: [], deny: ["ViewChannel"] },
          { id: "admin", name: "Admin", type: "role", allow: ["ViewChannel"], deny: [] },
          { id: "palworld", name: "Palworld Server Manager", type: "role", allow: ["ViewChannel"], deny: [] }
        ]
      },
      {
        id: "chan",
        name: "🛡️・moderación",
        type: "text",
        position: 0,
        parentId: "cat",
        parentName: "🔒 ADMINISTRACIÓN",
        permissionOverwrites: []
      }
    ];

    expect(createPlan(snapshot, desired).operations).toEqual([]);
  });

  it("redacts bot tokens from errors and logs", () => {
    const token = "super.secret.token";
    expect(sanitizeSecret(`Authorization: Bot ${token}`, [token])).not.toContain(token);
  });

  it("explains disallowed Discord intents", () => {
    expect(userFacingErrorMessage(new Error("Used disallowed intents"))).toContain("Server Members Intent");
  });
});
