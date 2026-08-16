# Palworld Server Manager

Herramienta multiplataforma para administrar Discord y automatizaciones comunitarias de Palworld con Node.js, TypeScript y `discord.js`.

## Modulos

- CLI administrativa: `validate`, `list`, `backup`, `plan`, `apply`, `restore`.
- Bot permanente: bienvenida, DM de bienvenida, registro de entradas y asignacion segura de `MEMBER_ROLE_ID`.
- Mensajes administrativos: `/mensaje` redacta desde el canal de registro, publica en chat general con `@everyone` y fija el mensaje.
- Aceptacion de reglas: panel persistente unico en el canal de reglas, botones `Aceptar reglas` y `Rechazar reglas`, respuestas efimeras por usuario, rol pendiente opcional y acceso al chat general solo tras aceptar.
- Canales informativos: permisos de solo lectura para bienvenida, reglas, anuncios, datos del servidor, seleccion de roles y donaciones, con reparacion administrativa y proteccion secundaria.
- Crianza Palworld: panel persistente, `/crianza` con autocompletado y datos locales versionados en `config/breeding-combinations.json`.
- Self-roles: menus persistentes en `ROLES_CHANNEL_ID`.
- Gremios: solicitudes aprobadas por administradores, lider de gremio, integrantes gestionados por el lider, roles y canales privados por gremio.
- Estado Palworld: panel persistente, `/estado` y alertas por cambio.
- Tickets: panel persistente y base de datos en `data/tickets.json`.
- Sugerencias: comandos y votos persistentes.
- Eventos: base de recordatorios persistentes.
- Anti-raid: base desactivada por defecto, sin ban ni kick automatico.
- RCON: abstraccion separada, desactivada por defecto.
- Control Palworld: helper externo permitido, desactivado por defecto.
- TikTok Alerts: Login Kit Web para conectar una cuenta TikTok por DM, detectar videos nuevos, publicar en `GENERAL_CHAT_CHANNEL_ID`, republicar videos existentes y deduplicar anuncios.
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
GUILD_REQUEST_CHANNEL_ID=
DONATIONS_CHANNEL_ID=
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

TikTok Alerts:

```txt
TIKTOK_ALERTS_ENABLED=false
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_REDIRECT_URI=
TIKTOK_CALLBACK_HOST=127.0.0.1
TIKTOK_CALLBACK_PORT=8788
TIKTOK_TOKEN_ENCRYPTION_KEY=
TIKTOK_POLLING_INTERVAL_SECONDS=300
TIKTOK_MENTION=ninguna
```

`TIKTOK_MENTION` acepta `ninguna`, `everyone` o `here`. Si `TIKTOK_ALERTS_ENABLED=false`, el bot no exige credenciales TikTok y arranca igual que antes.

Control Palworld:

```txt
PALWORLD_CONTROL_ENABLED=false
PALWORLD_RESTART_ENABLED=false
PALWORLD_CONTROL_HELPER=/usr/local/sbin/palworld-discord-control
PALWORLD_ANNOUNCEMENT_CHANNEL_ID=
```

Nunca guardes tokens, contrasenas RCON ni secretos en Git.

`GUILD_REQUEST_CHANNEL_ID` es opcional para gremios: si no se configura, el bot crea o reutiliza automaticamente el canal privado definido por `requestChannelName` en `config/guilds.yml`.

`DONATIONS_CHANNEL_ID` es opcional: si no se configura, la bienvenida busca el canal `💖・apoya-el-servidor` por nombre para mostrarlo como mencion.

## TikTok Alerts

La integracion TikTok es single-guild y usa solamente `DISCORD_GUILD_ID`. No crea canales, categorias ni roles. Todas las publicaciones van al canal existente `GENERAL_CHAT_CHANNEL_ID`.

Comandos administrativos:

```txt
/tiktok conectar
/tiktok estado
/tiktok activar
/tiktok desactivar
/tiktok desconectar
/tiktok prueba
/tiktok republicar
```

Flujo de conexion:

1. Un administrador ejecuta `/tiktok conectar`.
2. El bot responde de forma efimera con un boton hacia TikTok Login Kit.
3. TikTok redirige a `TIKTOK_REDIRECT_URI`.
4. El proceso del bot recibe `GET /tiktok/callback` en `TIKTOK_CALLBACK_HOST:TIKTOK_CALLBACK_PORT`.
5. El bot intercambia el `code`, valida scopes y manda un DM al mismo administrador.
6. El administrador confirma la cuenta por DM.
7. El bot crea baseline con videos existentes y no publica historicos.

Scopes requeridos en TikTok Developer:

```txt
user.info.basic
video.list
```

Redirect URI para el despliegue previsto:

```txt
https://tiktok-palworld.linuxred.lat/tiktok/callback
```

Ejemplo Debian con Cloudflare Tunnel externo:

```txt
TIKTOK_ALERTS_ENABLED=true
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_REDIRECT_URI=https://tiktok-palworld.linuxred.lat/tiktok/callback
TIKTOK_CALLBACK_HOST=172.17.0.1
TIKTOK_CALLBACK_PORT=8788
TIKTOK_TOKEN_ENCRYPTION_KEY=
TIKTOK_POLLING_INTERVAL_SECONDS=300
TIKTOK_MENTION=everyone
```

Cloudflare Tunnel se configura fuera del bot:

```txt
tiktok-palworld.linuxred.lat -> HTTP -> 172.17.0.1:8788
```

No se modifica Docker, Cloudflare ni systemd desde el codigo.

Login Kit Web tambien requiere configurar en TikTok Developer los enlaces publicos de la app. Pueden ser externos, por ejemplo:

```txt
Website: https://tiktok.linuxred.lat/
Terms: https://tiktok.linuxred.lat/terms
Privacy: https://tiktok.linuxred.lat/privacy
```

Sandbox y Production usan el mismo codigo. Solo cambian en `.env`:

```txt
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
```

El Target User de Sandbox se administra en TikTok Developer.

Generar `TIKTOK_TOKEN_ENCRYPTION_KEY`:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

O con OpenSSL:

```sh
openssl rand -base64 32
```

La llave debe representar exactamente 32 bytes en base64 o hexadecimal. No la guardes en Git.

Seguridad:

- Los tokens OAuth se guardan cifrados con AES-256-GCM en `data/tiktok-state.json`.
- Cada token usa IV aleatorio.
- No se registran access tokens, refresh tokens, client secret, encryption key, authorization code ni OAuth state completo.
- Los botones de confirmacion por DM funcionan aunque `interaction.guildId === null`, pero solo para custom IDs TikTok conocidos.
- Antes de confirmar, el bot vuelve a comprobar que el usuario sigue teniendo rol `Admin`.

Monitoreo:

- `TIKTOK_POLLING_INTERVAL_SECONDS` controla el polling; minimo validado: 60 segundos.
- El access token se refresca automaticamente antes de expirar.
- Si TikTok rota `refresh_token`, el bot guarda el nuevo valor cifrado.
- El dedupe persistente usa `openId + videoId`.
- Si Discord falla al enviar un video, ese video no se marca como publicado y se reintentara despues.

Publicacion:

- Automatico: titulo `Nuevo video en TikTok`.
- `/tiktok prueba`: publica el video mas reciente como `TikTok prueba manual` y lo marca publicado para evitar duplicado inmediato.
- `/tiktok republicar`: muestra un selector efimero con hasta 20 videos por pagina y botones `Anterior`/`Siguiente`.
- La republicacion manual puede volver a publicar un video ya anunciado, pero no modifica dedupe, baseline, `lastVideoId`, `lastCheckAt` ni `lastSuccessAt`.
- Las paginas de republicacion se guardan en una sesion en memoria por 10 minutos; un video de pagina 2+ se publica desde la pagina cacheada, no desde una nueva consulta de pagina 1.

Estado persistente:

```txt
data/tiktok-state.json
```

Incluye conexion cifrada, OAuth states temporales, pending connections, videos publicados y estado de polling. El archivo no se versiona.

Troubleshooting:

- `TikTok Alerts esta desactivado`: configura `TIKTOK_ALERTS_ENABLED=true`.
- `TIKTOK_REDIRECT_URI debe usar HTTPS`: TikTok Login Kit Web requiere callback HTTPS publico.
- `TikTok no concedio los permisos requeridos`: revisa scopes `user.info.basic` y `video.list`.
- `Discord no pudo enviar DM`: habilita mensajes directos y ejecuta `/tiktok conectar` otra vez.
- `GENERAL_CHAT_CHANNEL_ID no corresponde...`: corrige el ID del canal general existente; el bot no crea uno nuevo.

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
MentionEveryone
UseApplicationCommands
CreatePublicThreads
CreatePrivateThreads
```

`ManageMessages` permite borrar mensajes no autorizados en canales informativos. Si falta, el bot arrancara con advertencia y esa limpieza quedara deshabilitada hasta corregir permisos.

`/mensaje` requiere `SendMessages`, `MentionEveryone` y `ManageMessages` en `GENERAL_CHAT_CHANNEL_ID` para publicar, alertar y fijar el anuncio.

No dependas de `Administrator`. El rol del bot debe estar por encima de `MEMBER_ROLE_ID`, `PENDING_MEMBER_ROLE_ID`, roles de self-roles, roles de gremios y cuarentena.

## Aceptacion De Reglas

Cuando un usuario entra:

1. El bot envia bienvenida.
2. Si `PENDING_MEMBER_ROLE_ID` esta configurado, asigna ese rol temporal.
3. Publica o actualiza en `RULES_CHANNEL_ID` un panel unico con las reglas completas y botones persistentes:
   - `Aceptar reglas`
   - `Rechazar reglas`
4. Al aceptar, responde solo de forma efimera al usuario, asigna `MEMBER_ROLE_ID`, retira `PENDING_MEMBER_ROLE_ID` y muestra enlace/boton hacia `GENERAL_CHAT_CHANNEL_ID`.
5. No se crean mensajes publicos por cada usuario que acepta, para que el canal de reglas no quede enterrado por historial.
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

Los canales `bienvenida`, `reglas`, `anuncios`, `datos-del-servidor`, `elige-tus-roles` y `apoya-el-servidor` deben ser de solo lectura para usuarios normales y miembros.

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
npm run donations:publish
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

`discord:apply`, `roles:publish`, `guilds:publish`, `status:publish`, `tickets:publish`, `donations:publish`, `info:repair`, `breeding:publish`, `breeding:repair`, `commands:register`, `commands:delete` y `community:publish` modifican Discord. Revisalos antes de ejecutarlos.

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
npm run donations:publish
npm run breeding:publish
```

Publicador agrupado:

```sh
npm run community:publish
```

No ejecuta `discord:apply`.

`donations:publish` crea o reutiliza `💖・apoya-el-servidor`, asegura permisos de solo lectura para usuarios normales y publica o actualiza el mensaje de PayPal sin duplicarlo.

El texto del mensaje puede editarse desde Discord con `/donaciones editar`. El bot abre un modal con el titulo y cuerpo actuales, actualiza el mismo mensaje existente y guarda la personalizacion en:

```txt
data/donations-message-config.json
```

`donations:publish` y `community:publish` respetan esa personalizacion y no restauran el texto predeterminado mientras exista una configuracion valida.

## Comandos Slash

Durante desarrollo se registran solo en `DISCORD_GUILD_ID`.

```sh
npm run commands:register
npm run commands:list
npm run commands:delete
```

La visibilidad en Discord no sustituye las validaciones internas de roles.

Para recuperar solicitudes antiguas de gremio que quedaron pendientes sin tarjeta de revision, registra comandos y usa `/solicitudes-pendientes`. El bot publicara las tarjetas con botones en el canal privado de solicitudes.

Para enviar un anuncio administrativo, usa `/mensaje` desde el canal configurado en `MEMBER_LOG_CHANNEL_ID`. Discord mostrara un modal con titulo y cuerpo; al enviarlo, el bot publicara el mensaje en `GENERAL_CHAT_CHANNEL_ID` con `@everyone` y lo fijara.

Para editar el texto del canal de donaciones sin modificar archivos manualmente, usa `/donaciones editar`. Debe existir primero el mensaje publicado por `npm run donations:publish`.

Para TikTok, registra comandos con `npm run commands:register` y usa `/tiktok conectar` desde un usuario con rol `Admin`. El callback HTTP se inicia junto con `npm run bot:start` cuando `TIKTOK_ALERTS_ENABLED=true`.

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
