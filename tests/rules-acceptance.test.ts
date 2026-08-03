import { describe, expect, it } from "vitest";
import {
  buildGeneralChatLinkRow,
  buildRulesAcceptedEmbed,
  buildRulesActionRow,
  buildRulesPanelPayload,
  buildRulesPromptEmbed,
  rulesAcceptButtonId,
  rulesRejectButtonId
} from "../src/rules-acceptance-components.js";
import { calculateRejectCount, canProcessRulesPrompt, shouldShowAlreadyAccepted } from "../src/rules-acceptance-logic.js";
import { findLatestPendingPromptForUser, findLatestPromptForUser, findPromptByMessage, upsertRulesPanel, upsertRulesPrompt, type RulesAcceptanceData } from "../src/rules-acceptance-state.js";

describe("rules acceptance components", () => {
  it("uses stable persistent button ids", () => {
    const row = buildRulesActionRow().toJSON();
    const ids = row.components.map((component) => component.custom_id);

    expect(ids).toEqual([rulesAcceptButtonId, rulesRejectButtonId]);
    expect(ids).toEqual(["rules_accept", "rules_reject"]);
  });

  it("shows reject warning and accepted link", () => {
    const rejected = buildRulesPromptEmbed("user", 2).toJSON();
    const accepted = buildRulesAcceptedEmbed("user", "general").toJSON();
    const link = buildGeneralChatLinkRow("guild", "general").toJSON();

    expect(rejected.description).toContain("Mientras no las aceptes");
    expect(accepted.description).toContain("<#general>");
    expect(link.components[0]?.url).toBe("https://discord.com/channels/guild/general");
  });

  it("can disable buttons after acceptance", () => {
    const row = buildRulesActionRow(true).toJSON();

    expect(row.components.every((component) => component.disabled)).toBe(true);
  });

  it("builds a persistent rules panel with one action row", () => {
    const payload = buildRulesPanelPayload();

    expect(payload.embeds.length).toBeGreaterThan(1);
    expect(payload.embeds[0]!.toJSON().title).toBe("Reglas de la comunidad");
    expect(JSON.stringify(payload.embeds.map((embed) => embed.toJSON()))).toContain("XBOXPALSERVER");
    expect(payload.components).toHaveLength(1);
    expect(payload.components[0]!.toJSON().components.map((component) => component.custom_id))
      .toEqual([rulesAcceptButtonId, rulesRejectButtonId]);
  });
});

describe("rules acceptance logic", () => {
  it("increments rejections and checks accepted state", () => {
    expect(calculateRejectCount(0)).toBe(1);
    expect(calculateRejectCount(1)).toBe(2);
    expect(shouldShowAlreadyAccepted(true)).toBe(true);
  });

  it("prevents a user from using another user's prompt", () => {
    expect(canProcessRulesPrompt("user-a", "user-a")).toBe(true);
    expect(canProcessRulesPrompt("user-a", "user-b")).toBe(false);
    expect(canProcessRulesPrompt(undefined, "user-b")).toBe(false);
  });
});

describe("rules acceptance state", () => {
  it("persists prompt ownership by message id", () => {
    const data: RulesAcceptanceData = { prompts: [] };
    upsertRulesPrompt(data, {
      guildId: "guild",
      userId: "user",
      channelId: "rules",
      messageId: "message",
      status: "pending",
      rejectCount: 0,
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z"
    });

    expect(findPromptByMessage(data, "message")?.userId).toBe("user");
    expect(findLatestPendingPromptForUser(data, "guild", "user")?.messageId).toBe("message");
  });

  it("stores one acceptance state per user for the shared rules panel", () => {
    const data: RulesAcceptanceData = { prompts: [] };
    upsertRulesPanel(data, {
      guildId: "guild",
      channelId: "rules",
      messageId: "panel",
      updatedAt: "2026-08-02T00:00:00.000Z"
    });
    upsertRulesPrompt(data, {
      guildId: "guild",
      userId: "user-a",
      channelId: "rules",
      messageId: "panel",
      status: "pending",
      rejectCount: 0,
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z"
    });
    upsertRulesPrompt(data, {
      guildId: "guild",
      userId: "user-b",
      channelId: "rules",
      messageId: "panel",
      status: "pending",
      rejectCount: 1,
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z"
    });

    expect(data.panel?.messageId).toBe("panel");
    expect(data.prompts).toHaveLength(2);
    expect(findLatestPromptForUser(data, "guild", "user-a")?.rejectCount).toBe(0);
    expect(findLatestPromptForUser(data, "guild", "user-b")?.rejectCount).toBe(1);
  });
});
