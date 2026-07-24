import {
  CategoryChannel,
  ChannelType,
  ForumChannel,
  Guild,
  GuildChannel,
  OverwriteResolvable,
  PermissionsBitField,
  TextChannel,
  VoiceChannel
} from "discord.js";
import type { DesiredChannelType, PlannedOperation, ServerSnapshot, SnapshotChannelType } from "./domain.js";
import { SafeError } from "./errors.js";
import { OperationLogger } from "./logger.js";

const PROTECTED_ROLE_FALLBACKS = ["Admin", "Palworld Server Manager"];

export async function executeOperations(
  guild: Guild,
  operations: PlannedOperation[],
  logger: OperationLogger
): Promise<void> {
  for (const operation of operations) {
    await logger.log("Ejecutando operacion", operation);
    switch (operation.kind) {
      case "createCategory":
        await createCategory(guild, operation.name, operation.position, operation.private, operation.administrativeRoleNames);
        break;
      case "createChannel":
        await createChannel(guild, operation);
        break;
      case "moveChannel":
        await moveChannel(guild, operation.channelName, operation.channelType, operation.toCategoryName);
        break;
      case "updateCategoryPrivacy":
        await updateCategoryPrivacy(guild, operation.categoryName, operation.administrativeRoleNames);
        break;
    }
  }
}

export async function restoreSnapshot(
  guild: Guild,
  snapshot: ServerSnapshot,
  protectedRoleNames: string[],
  logger: OperationLogger
): Promise<void> {
  const protectedRoles = new Set([...PROTECTED_ROLE_FALLBACKS, ...protectedRoleNames]);
  const currentRoles = await guild.roles.fetch();

  for (const role of snapshot.roles.filter((candidate) => candidate.name !== "@everyone")) {
    if (protectedRoles.has(role.name)) {
      await logger.log("Rol protegido omitido durante restore", { roleName: role.name });
      continue;
    }

    const existingRole = currentRoles.find((candidate) => candidate.name === role.name);
    if (!existingRole) {
      await logger.log("Creando rol desde respaldo", { roleName: role.name });
      await guild.roles.create({
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        mentionable: role.mentionable,
        permissions: permissionsFromNames(role.permissions),
        reason: "discord-structure restore"
      });
    } else if (!existingRole.managed) {
      await logger.log("Actualizando rol desde respaldo", { roleName: role.name });
      await existingRole.edit({
        color: role.color,
        hoist: role.hoist,
        mentionable: role.mentionable,
        permissions: permissionsFromNames(role.permissions),
        reason: "discord-structure restore"
      });
    }
  }

  for (const category of snapshot.channels.filter((channel) => channel.type === "category")) {
    if (!(await findCategory(guild, category.name))) {
      await logger.log("Creando categoria desde respaldo", { categoryName: category.name });
      await guild.channels.create({
        name: category.name,
        type: ChannelType.GuildCategory,
        position: category.position,
        reason: "discord-structure restore"
      });
    }
  }

  for (const channel of snapshot.channels.filter(isRestorableChildChannel)) {
      const existing = await findChannel(guild, channel.name, channel.type);
    const parent = channel.parentName ? await findCategory(guild, channel.parentName) : null;

    if (!existing) {
      await logger.log("Creando canal desde respaldo", { channelName: channel.name, type: channel.type });
      await guild.channels.create({
        name: channel.name,
        type: discordChannelType(channel.type),
        parent: parent?.id,
        position: channel.position,
        topic: channel.type === "text" || channel.type === "forum" ? channel.topic ?? undefined : undefined,
        nsfw: channel.type === "text" ? channel.nsfw : undefined,
        rateLimitPerUser: channel.type === "text" ? channel.rateLimitPerUser : undefined,
        bitrate: channel.type === "voice" ? channel.bitrate : undefined,
        userLimit: channel.type === "voice" ? channel.userLimit : undefined,
        reason: "discord-structure restore"
      });
    } else if (parent && existing.parentId !== parent.id) {
      await logger.log("Moviendo canal desde respaldo", { channelName: channel.name, parentName: parent.name });
      await existing.setParent(parent.id, { lockPermissions: false, reason: "discord-structure restore" });
    }
  }
}

async function createCategory(
  guild: Guild,
  name: string,
  position: number,
  isPrivate: boolean,
  administrativeRoleNames: string[]
): Promise<void> {
  if (await findCategory(guild, name)) {
    return;
  }

  await guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
    position,
    permissionOverwrites: isPrivate ? await administrativeOverwrites(guild, administrativeRoleNames) : undefined,
    reason: "discord-structure apply"
  });
}

async function createChannel(
  guild: Guild,
  operation: Extract<PlannedOperation, { kind: "createChannel" }>
): Promise<void> {
  if (await findChannel(guild, operation.name, operation.channelType)) {
    return;
  }

  const category = await findCategory(guild, operation.categoryName);
  if (!category) {
    throw new SafeError(`No existe la categoria "${operation.categoryName}" para crear "${operation.name}".`);
  }

  await guild.channels.create({
    name: operation.name,
    type: discordChannelType(operation.channelType),
    parent: category.id,
    position: operation.position,
    topic: operation.channelType === "text" || operation.channelType === "forum" ? operation.topic ?? operation.guidelines : undefined,
    availableTags: operation.channelType === "forum"
      ? operation.tags?.map((name) => ({ name, moderated: false }))
      : undefined,
    reason: "discord-structure apply"
  });
}

async function moveChannel(guild: Guild, channelName: string, channelType: DesiredChannelType, toCategoryName: string): Promise<void> {
  const channel = await findChannel(guild, channelName, channelType);
  const category = await findCategory(guild, toCategoryName);
  if (!channel || !category || channel.parentId === category.id) {
    return;
  }

  await channel.setParent(category.id, { lockPermissions: false, reason: "discord-structure apply" });
}

async function updateCategoryPrivacy(guild: Guild, categoryName: string, administrativeRoleNames: string[]): Promise<void> {
  const category = await findCategory(guild, categoryName);
  if (!category) {
    throw new SafeError(`No existe la categoria "${categoryName}" para ajustar privacidad.`);
  }

  await category.permissionOverwrites.set(await administrativeOverwrites(guild, administrativeRoleNames), "discord-structure apply");
}

async function findCategory(guild: Guild, name: string): Promise<CategoryChannel | null> {
  const channels = await guild.channels.fetch();
  const found = channels.find((channel): channel is CategoryChannel => channel?.type === ChannelType.GuildCategory && channel.name === name);
  return found ?? null;
}

async function findChannel(guild: Guild, name: string, channelType: DesiredChannelType): Promise<TextChannel | VoiceChannel | ForumChannel | null> {
  const expected = discordChannelType(channelType);
  const channels = await guild.channels.fetch();
  const found = channels.find(
    (channel): channel is TextChannel | VoiceChannel | ForumChannel =>
      (channel?.type === ChannelType.GuildText || channel?.type === ChannelType.GuildVoice || channel?.type === ChannelType.GuildForum)
      && channel.type === expected
      && channel.name === name
  );
  return found ?? null;
}

async function administrativeOverwrites(guild: Guild, administrativeRoleNames: string[]): Promise<OverwriteResolvable[]> {
  const roles = await guild.roles.fetch();
  const overwrites: OverwriteResolvable[] = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel]
    }
  ];

  for (const roleName of administrativeRoleNames) {
    const role = roles.find((candidate) => candidate.name === roleName);
    if (role) {
      overwrites.push({
        id: role.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.Connect,
          PermissionsBitField.Flags.Speak
        ]
      });
    }
  }

  return overwrites;
}

function permissionsFromNames(names: string[]): PermissionsBitField {
  const flags = names
    .map((name) => PermissionsBitField.Flags[name as keyof typeof PermissionsBitField.Flags])
    .filter((flag): flag is bigint => flag !== undefined);
  return new PermissionsBitField(flags);
}

function isRestorableChildChannel(
  channel: ServerSnapshot["channels"][number]
): channel is ServerSnapshot["channels"][number] & { type: Extract<SnapshotChannelType, DesiredChannelType> } {
  return channel.type === "text" || channel.type === "voice" || channel.type === "forum";
}

function discordChannelType(channelType: DesiredChannelType): ChannelType.GuildText | ChannelType.GuildVoice | ChannelType.GuildForum {
  if (channelType === "voice") {
    return ChannelType.GuildVoice;
  }
  if (channelType === "forum") {
    return ChannelType.GuildForum;
  }
  return ChannelType.GuildText;
}
