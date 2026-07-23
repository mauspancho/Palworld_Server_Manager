import type { ServerSnapshot } from "./domain.js";

export function printServerSnapshot(snapshot: ServerSnapshot): void {
  console.log(`Servidor: ${snapshot.guildName} (${snapshot.guildId})`);
  console.log("");
  console.log("Roles:");
  for (const role of snapshot.roles) {
    console.log(`- ${role.name} | posicion ${role.position} | permisos ${role.permissions.join(", ") || "ninguno"}`);
  }

  console.log("");
  console.log("Canales:");
  for (const category of snapshot.channels.filter((channel) => channel.type === "category")) {
    console.log(`- [categoria] ${category.name} | posicion ${category.position}`);
    printOverwrites(category.permissionOverwrites, "  ");
    const children = snapshot.channels
      .filter((channel) => channel.parentId === category.id)
      .sort((left, right) => left.position - right.position);
    for (const channel of children) {
      console.log(`  - [${channel.type}] ${channel.name} | posicion ${channel.position}`);
      printOverwrites(channel.permissionOverwrites, "    ");
    }
  }

  const uncategorized = snapshot.channels.filter((channel) => channel.type !== "category" && channel.parentId === null);
  if (uncategorized.length > 0) {
    console.log("- Sin categoria");
    for (const channel of uncategorized) {
      console.log(`  - [${channel.type}] ${channel.name} | posicion ${channel.position}`);
      printOverwrites(channel.permissionOverwrites, "    ");
    }
  }
}

function printOverwrites(overwrites: ServerSnapshot["channels"][number]["permissionOverwrites"], prefix: string): void {
  if (overwrites.length === 0) {
    return;
  }

  console.log(`${prefix}permisos:`);
  for (const overwrite of overwrites) {
    console.log(
      `${prefix}- ${overwrite.type}:${overwrite.name ?? overwrite.id} allow=[${overwrite.allow.join(", ")}] deny=[${overwrite.deny.join(", ")}]`
    );
  }
}
