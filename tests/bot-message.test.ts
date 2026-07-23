import { describe, expect, it } from "vitest";
import { buildDirectWelcomeMessage, buildWelcomeEmbed } from "../src/bot-message.js";

describe("welcome message", () => {
  it("builds a welcome embed with user mention and configured channel links", () => {
    const embed = buildWelcomeEmbed({
      memberId: "123",
      displayName: "Mauricio",
      avatarUrl: "https://cdn.example/avatar.png",
      joinedAt: new Date("2026-07-23T07:00:00.000Z"),
      memberCount: 42,
      rulesChannelId: "rules",
      rolesChannelId: "roles"
    }).toJSON();

    expect(embed.title).toBe("Bienvenido a XBOXPALSERVER");
    expect(embed.description).toContain("Hola <@123>");
    expect(embed.description).toContain("<#rules>");
    expect(embed.description).toContain("<#roles>");
    expect(embed.thumbnail?.url).toBe("https://cdn.example/avatar.png");
    expect(embed.fields?.some((field) => field.name === "Miembros actuales" && field.value === "42")).toBe(true);
  });

  it("builds a direct message without needing message content intent", () => {
    const message = buildDirectWelcomeMessage("rules", "roles");

    expect(message).toContain("<#rules>");
    expect(message).toContain("<#roles>");
    expect(message).toContain("recibiras el rol");
  });
});
