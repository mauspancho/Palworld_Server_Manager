# Palworld Server Manager

Herramienta multiplataforma para administrar Discord y automatizaciones comunitarias de Palworld con Node.js, TypeScript y `discord.js`.

## Modulos

- CLI administrativa: `validate`, `list`, `backup`, `plan`, `apply`, `restore`.
- Bot permanente: bienvenida, DM de bienvenida, registro de entradas y asignacion segura de `MEMBER_ROLE_ID`.
- Aceptacion de reglas: botones persistentes `Aceptar reglas` y `Rechazar reglas`, rol pendiente opcional y acceso al chat general solo tras aceptar.
- Canales informativos: permisos de solo lectura para bienvenida, reglas, anuncios, datos del servidor y seleccion de roles, con reparacion administrativa y proteccion secundaria.
- Crianza Palworld: panel persistente, `/crianza` con autocompletado y datos locales versionados en `config/breeding-combinations.json`.
- Self-roles: menus persistentes en `ROLES_CHANNEL_ID`.
- Gremios: roles y canales privados por gremio, mas comandos `/gremio`.
- Estado Palworld: panel persistente, `/estado` y alertas por cambio.
- Tickets: panel persistente y base de datos en `data/tickets.json`.
- Sugerencias: comandos y votos persistentes.
- Eventos: base de recordatorios persistentes.
- Anti-raid: base desactivada por defecto, sin ban ni kick automatico.
- RCON: abstraccion separada, desactivada por defecto.
- Control Palworld: helper externo permitido, desactivado por defecto.
- Vinculacion Discord-Palworld: base desactivada, sin verificacion automatica.

## Variables

Copia `.env.example` a `.env` y completa los valores necesarios.

Variables principales:

```txt
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=
WELCOME_CHANNEL_ID=
RULES_CHANNEL_ID=
ROLES_CHANNEL_ID=
GENERAL_CHAT_CHANNEL_ID=
MEMBER_ROLE_ID=
PENDING_MEMBER_ROLE_ID=
MEMBER_LOG_CHANNEL_ID=
BREEDING_CHANNEL_ID=
```

Estado Palworld:

```txt
PALWORLD_STATUS_ENABLED=true
PALWORLD_STATUS_CHANNEL_ID=
PALWORLD_SERVICE_NAME=palworld.service
PALWORLD_HOST=127.0.0.1
PALWORLD_GAME_PORT=8211
PALWORLD_RCON_ENABLED=false
PALWORLD_RCON_HOST=127.0.0.1
PALWORLD_RCON_PORT=
PALWORLD_RCON_PASSWORD=
PALWORLD_STATUS_INTERVAL_SECONDS=60
PALWORLD_ALERT_CHANNEL_ID=
```

Tickets, sugerencias, eventos y seguridad:

```txt
TICKETS_ENABLED=true
TICKET_PANEL_CHANNEL_ID=
TICKET_LOG_CHANNEL_ID=
TICKET_CATEGORY_ID=
TICKET_ADMIN_ROLE_NAMES=Admin,Moderador
SUGGESTIONS_ENABLED=true
SUGGESTIONS_CHANNEL_ID=
BOT_TIMEZONE=America/Mexico_City
ANTI_RAID_ENABLED=false
QUARANTINE_ROLE_ID=
PLAYER_LINKING_ENABLED=false
```

Control Palworld:

```txt
PALWORLD_CONTROL_ENABLED=false
PALWORLD_RESTART_ENABLED=false
PALWORLD_CONTROL_HELPER=/usr/local/sbin/palworld-discord-control
PALWORLD_ANNOUNCEMENT_CHANNEL_ID=
```

Nunca guardes tokens, contrasenas RCON ni secretos en Git.

## Permisos E Intents

Intents requeridos:

```txt
Guilds
GuildMembers
GuildMessages
```

No se usa `MessageContent`. El bot no lee contenido de mensajes; `GuildMessages` se usa solo para detectar y retirar mensajes no autorizados en canales informativos.

Permisos recomendados:

```txt
ViewChannel
SendMessages
ReadMessageHistory
ManageChannels
ManageRoles
ManageMessages
UseApplicationCommands
CreatePublicThreads
CreatePrivateThreads
```

`ManageMessages` permite borrar mensajes no autorizados en canales informativos. Si falta, el bot arrancara con advertencia y esa limpieza quedara deshabilitada hasta corregir permisos.

No dependas de `Administrator`. El rol del bot debe estar por encima de `MEMBER_ROLE_ID`, `PENDING_MEMBER_ROLE_ID`, roles de self-roles, roles de gremios y cuarentena.

## Aceptacion De Reglas

Cuando un usuario entra:

1. El bot envia bienvenida.
2. Si `PENDING_MEMBER_ROLE_ID` esta configurado, asigna ese rol temporal.
3. Publica en `RULES_CHANNEL_ID` un mensaje individual con botones persistentes:
   - `Aceptar reglas`
   - `Rechazar reglas`
4. Al aceptar, asigna `MEMBER_ROLE_ID`, retira `PENDING_MEMBER_ROLE_ID` y muestra enlace/boton hacia `GENERAL_CHAT_CHANNEL_ID`.
5. Al rechazar, mantiene el acceso restringido y vuelve a mostrar los botones.

Los botones usan IDs estables:

```txt
rules_accept
rules_reject
```

El estado se guarda en:

```txt
data/rules-acceptance.json
```

Para restringir canales antes de aceptar, configura permisos de Discord con roles:

- `PENDING_MEMBER_ROLE_ID`: solo bienvenida, reglas y canales publicos permitidos.
- `MEMBER_ROLE_ID`: chat general, voz general y comunidad.

El bot no intenta controlar acceso ocultando botones; el acceso real depende de roles y permisos de Discord.

## Canales Informativos

Los canales `bienvenida`, `reglas`, `anuncios`, `datos-del-servidor` y `elige-tus-roles` deben ser de solo lectura para usuarios normales y miembros.

Permisos aplicados a `@everyone`, `MEMBER_ROLE_ID` y `PENDING_MEMBER_ROLE_ID`:

```txt
Allow: ViewChannel, ReadMessageHistory
Deny: SendMessages, SendMessagesInThreads, CreatePublicThreads, CreatePrivateThreads, AttachFiles, SendVoiceMessages, UseApplicationCommands, MentionEveryone, ManageMessages, ManageThreads, ManageChannels, CreateInstantInvite
```

`Admin`, `Palworld Server Manager`, `Moderador`, `Bots` y el bot conservan permisos de publicacion/gestion necesarios. La reparacion no elimina canales, roles ni excepciones manuales ajenas a esos targets.

Para reparar permisos:

```sh
npm run info:repair
```

Tambien puedes registrar comandos y usar `/informacion reparar` desde Discord con un rol autorizado.

Si un usuario normal logra escribir en uno de esos canales por una configuracion incorrecta, el bot intentara borrar el mensaje, avisar por DM y registrar el evento en `MEMBER_LOG_CHANNEL_ID`. No aplica sanciones automaticas.

## Crianza Palworld

El canal de crianza se configura con:

```txt
BREEDING_CHANNEL_ID=
```

Debe apuntar al canal visible `🥚・crianza`. El panel usa permisos de solo lectura para `@everyone`, `MEMBER_ROLE_ID` y `PENDING_MEMBER_ROLE_ID`: pueden ver, leer historial, usar componentes y ejecutar `/crianza`, pero no enviar mensajes, adjuntar archivos, crear hilos ni crear invitaciones.

Los datos locales estan en:

```txt
config/breeding-combinations.json
```

El archivo se valida con 86 Pals objetivo, 113 combinaciones unicas, 42 combinaciones de GAMES.GG y 71 adicionales de Vandal. La combinacion `Ghangler + Sootseer = Ghangler Ignis` se conserva una sola vez con ambas fuentes.

Publicar o reparar el panel:

```sh
npm run breeding:publish
npm run breeding:repair
```

Tambien existe `/crianza-panel publicar` y `/crianza-panel reparar` para roles autorizados. Los usuarios consultan con:

```txt
/crianza pal:Anubis
```

El comando incluye autocompletado y responde de forma efimera. El panel usa un selector persistente de Pal con botones de navegacion, por lo que sigue funcionando tras reiniciar el bot.

## Scripts

```sh
npm run build
npm test
npm run discord:validate
npm run discord:list
npm run discord:backup
npm run discord:plan
npm run discord:apply
npm run discord:restore
npm run bot:dev
npm run bot:start
npm run bot:validate
npm run roles:publish
npm run guilds:publish
npm run status:publish
npm run status:validate
npm run tickets:publish
npm run info:repair
npm run breeding:publish
npm run breeding:repair
npm run rcon:validate
npm run commands:register
npm run commands:delete
npm run commands:list
npm run community:publish
npm run validate:all
```

`discord:apply`, `roles:publish`, `guilds:publish`, `status:publish`, `tickets:publish`, `info:repair`, `breeding:publish`, `breeding:repair`, `commands:register`, `commands:delete` y `community:publish` modifican Discord. Revisalos antes de ejecutarlos.

## Windows

```sh
npm install
npm run build
npm test
npm run bot:validate
npm run info:repair
npm run breeding:publish
npm run validate:all
```

Windows se usa para desarrollo. El probe de systemd devuelve estado no disponible porque `systemctl` y `ss` son propios de Debian.

## Debian

```sh
git pull
npm ci
npm run build
npm test
npm run validate:all
npm run info:repair
npm run breeding:publish
```

Si el servicio sale con `status=1/FAILURE`, revisa el mensaje real con:

```sh
journalctl -u palworld-server-manager -n 80 --no-pager
```

El servicio debe apuntar a la carpeta del proyecto con `WorkingDirectory=/home/maus/servers/Palworld_Server_Manager` para encontrar `.env`, `config/`, `state/` y `logs/`.

Consulta:

- `docs/debian-systemd.md`
- `docs/breeding.md`
- `docs/palworld-control-helper.md`
- `docs/discord-permissions.md`
- `docs/status-panel.md`
- `docs/guilds.md`
- `docs/tickets.md`

No se modifica systemd automaticamente.

## Publicacion De Paneles

Publicadores individuales:

```sh
npm run roles:publish
npm run guilds:publish
npm run status:publish
npm run tickets:publish
npm run breeding:publish
```

Publicador agrupado:

```sh
npm run community:publish
```

No ejecuta `discord:apply`.

## Comandos Slash

Durante desarrollo se registran solo en `DISCORD_GUILD_ID`.

```sh
npm run commands:register
npm run commands:list
npm run commands:delete
```

La visibilidad en Discord no sustituye las validaciones internas de roles.

## Desactivar Modulos

Usa estas variables:

```txt
PALWORLD_STATUS_ENABLED=false
TICKETS_ENABLED=false
SUGGESTIONS_ENABLED=false
ANTI_RAID_ENABLED=false
PALWORLD_RCON_ENABLED=false
PALWORLD_CONTROL_ENABLED=false
PALWORLD_RESTART_ENABLED=false
PLAYER_LINKING_ENABLED=false
```

## Estado Y Datos

No se versionan:

```txt
state/
data/
transcripts/
logs/
backups/
dist/
node_modules/
.env
```

`docs/` si se versiona.

## Errores Comunes

- `Used disallowed intents`: habilita Server Members Intent en Discord Developer Portal.
- `El rol mas alto del bot debe estar por encima...`: mueve el rol del bot por encima del rol que debe asignar.
- `PALWORLD_STATUS_CHANNEL_ID no esta configurado`: completa `.env` o desactiva el modulo.
- `RCON desactivado`: define `PALWORLD_RCON_ENABLED=true`, puerto y contrasena solo cuando quieras validarlo.
