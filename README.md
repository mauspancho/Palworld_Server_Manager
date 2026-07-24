# Palworld Server Manager

Herramienta multiplataforma para administrar Discord y automatizaciones comunitarias de Palworld con Node.js, TypeScript y `discord.js`.

## Modulos

- CLI administrativa: `validate`, `list`, `backup`, `plan`, `apply`, `restore`.
- Bot permanente: bienvenida, DM de bienvenida, registro de entradas y asignacion segura de `MEMBER_ROLE_ID`.
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
MEMBER_ROLE_ID=
MEMBER_LOG_CHANNEL_ID=
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
```

No se usa `MessageContent` por defecto.

Permisos recomendados:

```txt
ViewChannel
SendMessages
ReadMessageHistory
ManageChannels
ManageRoles
UseApplicationCommands
CreatePublicThreads
CreatePrivateThreads
```

No dependas de `Administrator`. El rol del bot debe estar por encima de `MEMBER_ROLE_ID`, roles de self-roles, roles de gremios y cuarentena.

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
npm run rcon:validate
npm run commands:register
npm run commands:delete
npm run commands:list
npm run community:publish
npm run validate:all
```

`discord:apply`, `roles:publish`, `guilds:publish`, `status:publish`, `tickets:publish`, `commands:register`, `commands:delete` y `community:publish` modifican Discord. Revisalos antes de ejecutarlos.

## Windows

```sh
npm install
npm run build
npm test
npm run bot:validate
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
```

Consulta:

- `docs/debian-systemd.md`
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
