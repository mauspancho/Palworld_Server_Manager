import {
  ApplicationCommandOptionType,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  Routes,
  REST
} from "discord.js";
import type { BotEnv } from "./bot-config.js";
import { applyDefaultCommandPermissions } from "./command-access.js";

export function slashCommandDefinitions(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  const commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
    {
      name: "gremio",
      description: "Administrar gremios",
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "solicitar",
          description: "Solicitar la creacion de un gremio privado",
          options: [
            { type: ApplicationCommandOptionType.String, name: "nombre", description: "Nombre del gremio", required: true },
            { type: ApplicationCommandOptionType.User, name: "miembro1", description: "Integrante inicial opcional", required: false },
            { type: ApplicationCommandOptionType.User, name: "miembro2", description: "Integrante inicial opcional", required: false },
            { type: ApplicationCommandOptionType.User, name: "miembro3", description: "Integrante inicial opcional", required: false },
            { type: ApplicationCommandOptionType.User, name: "miembro4", description: "Integrante inicial opcional", required: false },
            { type: ApplicationCommandOptionType.User, name: "miembro5", description: "Integrante inicial opcional", required: false }
          ]
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "solicitudes",
          description: "Listar solicitudes pendientes de gremio"
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "aprobar",
          description: "Aprobar una solicitud de gremio",
          options: [{ type: ApplicationCommandOptionType.String, name: "solicitud", description: "ID de solicitud", required: true }]
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "rechazar",
          description: "Rechazar una solicitud de gremio",
          options: [{ type: ApplicationCommandOptionType.String, name: "solicitud", description: "ID de solicitud", required: true }]
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "agregar",
          description: "Agregar un integrante al gremio que lideras",
          options: [{ type: ApplicationCommandOptionType.User, name: "usuario", description: "Usuario", required: true }]
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "eliminar",
          description: "Eliminar un integrante del gremio que lideras",
          options: [{ type: ApplicationCommandOptionType.User, name: "usuario", description: "Usuario", required: true }]
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "asignar",
          description: "Asignar un usuario a un gremio",
          options: [
            { type: ApplicationCommandOptionType.User, name: "usuario", description: "Usuario", required: true },
            { type: ApplicationCommandOptionType.String, name: "gremio", description: "ID o nombre del gremio", required: true }
          ]
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "quitar",
          description: "Quitar gremio de un usuario",
          options: [{ type: ApplicationCommandOptionType.User, name: "usuario", description: "Usuario", required: true }]
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "ver",
          description: "Ver gremio de un usuario",
          options: [{ type: ApplicationCommandOptionType.User, name: "usuario", description: "Usuario", required: true }]
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "miembros",
          description: "Listar miembros de un gremio",
          options: [{ type: ApplicationCommandOptionType.String, name: "gremio", description: "ID o nombre del gremio", required: true }]
        }
      ]
    },
    {
      name: "solicitudes-pendientes",
      description: "Republicar solicitudes pendientes de gremio para revision admin"
    },
    {
      name: "mensaje",
      description: "Redactar un anuncio para publicar y fijar en el chat general"
    },
    {
      name: "donaciones",
      description: "Administrar el mensaje de donaciones",
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "editar",
          description: "Editar el mensaje del canal de donaciones"
        }
      ]
    },
    { name: "estado", description: "Mostrar estado actual del servidor Palworld" },
    {
      name: "sugerencia",
      description: "Sugerencias",
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "crear",
          description: "Crear sugerencia",
          options: [
            { type: ApplicationCommandOptionType.String, name: "titulo", description: "Titulo", required: true },
            { type: ApplicationCommandOptionType.String, name: "descripcion", description: "Descripcion", required: true }
          ]
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "estado",
          description: "Cambiar estado de sugerencia",
          options: [
            { type: ApplicationCommandOptionType.String, name: "id", description: "ID", required: true },
            { type: ApplicationCommandOptionType.String, name: "estado", description: "Estado", required: true }
          ]
        }
      ]
    },
    {
      name: "evento",
      description: "Eventos comunitarios",
      options: [
        { type: ApplicationCommandOptionType.Subcommand, name: "crear", description: "Crear evento" },
        { type: ApplicationCommandOptionType.Subcommand, name: "cancelar", description: "Cancelar evento" },
        { type: ApplicationCommandOptionType.Subcommand, name: "listar", description: "Listar eventos" }
      ]
    },
    {
      name: "palworld",
      description: "Control seguro de Palworld",
      options: [
        { type: ApplicationCommandOptionType.Subcommand, name: "reinicio-programar", description: "Programar reinicio", options: [{ type: ApplicationCommandOptionType.Integer, name: "minutos", description: "Minutos", required: true }] },
        { type: ApplicationCommandOptionType.Subcommand, name: "reinicio-cancelar", description: "Cancelar reinicio" },
        { type: ApplicationCommandOptionType.Subcommand, name: "reiniciar-ahora", description: "Reiniciar ahora" },
        { type: ApplicationCommandOptionType.Subcommand, name: "iniciar", description: "Iniciar servidor" },
        { type: ApplicationCommandOptionType.Subcommand, name: "detener", description: "Detener servidor" }
      ]
    },
    {
      name: "cuarentena",
      description: "Administrar cuarentena",
      options: [
        { type: ApplicationCommandOptionType.Subcommand, name: "aprobar", description: "Aprobar usuario", options: [{ type: ApplicationCommandOptionType.User, name: "usuario", description: "Usuario", required: true }] },
        { type: ApplicationCommandOptionType.Subcommand, name: "mantener", description: "Mantener usuario", options: [{ type: ApplicationCommandOptionType.User, name: "usuario", description: "Usuario", required: true }] },
        { type: ApplicationCommandOptionType.Subcommand, name: "liberar", description: "Liberar usuario", options: [{ type: ApplicationCommandOptionType.User, name: "usuario", description: "Usuario", required: true }] }
      ]
    },
    {
      name: "informacion",
      description: "Administrar canales informativos",
      options: [
        { type: ApplicationCommandOptionType.Subcommand, name: "reparar", description: "Reparar permisos de canales informativos" }
      ]
    },
    {
      name: "crianza",
      description: "Consultar combinaciones de crianza de Palworld",
      options: [
        {
          type: ApplicationCommandOptionType.String,
          name: "pal",
          description: "Pal que deseas obtener",
          required: true,
          autocomplete: true
        }
      ]
    },
    {
      name: "crianza-panel",
      description: "Administrar el panel de crianza",
      options: [
        { type: ApplicationCommandOptionType.Subcommand, name: "publicar", description: "Publicar o actualizar el panel de crianza" },
        { type: ApplicationCommandOptionType.Subcommand, name: "reparar", description: "Reparar permisos y panel de crianza" }
      ]
    },
    { name: "vincular", description: "Generar codigo temporal de vinculacion" }
  ];
  return commands.map(applyDefaultCommandPermissions);
}

export async function registerGuildCommands(env: BotEnv): Promise<number> {
  const rest = new REST({ version: "10" }).setToken(env.DISCORD_BOT_TOKEN);
  const definitions = slashCommandDefinitions();
  await rest.put(Routes.applicationGuildCommands(await applicationId(rest), env.DISCORD_GUILD_ID), { body: definitions });
  return definitions.length;
}

export async function deleteGuildCommands(env: BotEnv): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(env.DISCORD_BOT_TOKEN);
  await rest.put(Routes.applicationGuildCommands(await applicationId(rest), env.DISCORD_GUILD_ID), { body: [] });
}

export async function listGuildCommands(env: BotEnv): Promise<string[]> {
  const rest = new REST({ version: "10" }).setToken(env.DISCORD_BOT_TOKEN);
  const commands = await rest.get(Routes.applicationGuildCommands(await applicationId(rest), env.DISCORD_GUILD_ID)) as Array<{ name: string }>;
  return commands.map((command) => command.name).sort();
}

async function applicationId(rest: REST): Promise<string> {
  const application = await rest.get(Routes.oauth2CurrentApplication()) as { id: string };
  return application.id;
}
