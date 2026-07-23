# Discord Server Manager

Herramienta multiplataforma para administrar la estructura de un servidor de Discord y ejecutar un bot permanente con Node.js, TypeScript y `discord.js`.

La herramienta nunca elimina canales, categorias ni roles. Tampoco modifica usuarios, asignaciones de roles existentes ni los roles protegidos `Admin` y `Palworld Server Manager`.

## Configuracion

1. Copia `.env.example` a `.env`.
2. Completa las variables:

```sh
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=
WELCOME_CHANNEL_ID=
RULES_CHANNEL_ID=
ROLES_CHANNEL_ID=
MEMBER_ROLE_ID=
MEMBER_LOG_CHANNEL_ID=
```

3. Ajusta `config/server-structure.yml` si necesitas cambiar categorias, canales o roles administrativos.

El token no se imprime en consola, logs, respaldos ni archivos generados.

## Comandos

```sh
npm run build
npm run test
npm run discord:validate
npm run discord:list
npm run discord:backup
npm run discord:plan
npm run discord:apply
npm run discord:restore
npm run bot:dev
npm run bot:start
npm run bot:validate
```

`discord:plan` solo lee Discord y muestra las operaciones necesarias para llegar a `config/server-structure.yml`.

`discord:apply` crea un respaldo antes de modificar Discord, muestra el plan y exige escribir `APLICAR` para confirmar. No ejecutes este comando hasta revisar el plan.

`discord:restore` restaura desde el respaldo JSON mas reciente en `backups/` o desde una ruta indicada:

```sh
node dist/cli.js restore backups/server-structure-YYYY-MM-DD.json
```

Tambien crea un respaldo previo y exige escribir `RESTAURAR`.

## Bot permanente

El bot usa exclusivamente estos Gateway Intents:

```txt
Guilds
GuildMembers
```

No usa `MessageContent`.

Flujo implementado:

- Escucha `guildMemberAdd`.
- Ignora otros servidores y cuentas bot.
- Evita bienvenidas duplicadas para el mismo evento de entrada.
- Envia un embed a `WELCOME_CHANNEL_ID`, mencionando al usuario.
- Incluye enlaces a `RULES_CHANNEL_ID` y `ROLES_CHANNEL_ID`.
- Intenta enviar mensaje privado con esos enlaces y maneja usuarios con DM cerrado.
- Registra la entrada en `MEMBER_LOG_CHANNEL_ID`.
- Si `member.pending` es `true`, espera `guildMemberUpdate` y asigna `MEMBER_ROLE_ID` cuando cambie a `false`.
- Maneja errores de permisos sin detener todo el proceso.
- Cierra de forma controlada con `SIGINT` o `SIGTERM`.
- Deja la reconexion automatica en manos de `discord.js`.

Antes de dejarlo permanente, ejecuta:

```sh
npm run build
npm run bot:validate
```

`bot:validate` comprueba que canales y roles existan, que el bot pueda enviar mensajes donde corresponde, que tenga `ManageRoles` y que su rol mas alto este por encima de `MEMBER_ROLE_ID`.

## Windows

1. Instala Node.js 20.11 o superior desde el sitio oficial.
2. En el portal de desarrolladores de Discord, habilita el intent privilegiado `Server Members Intent` para el bot.
3. Abre una terminal en la carpeta del proyecto.
4. Ejecuta:

```sh
npm install
npm run build
npm run test
npm run discord:validate
npm run discord:plan
npm run bot:validate
```

Para ejecutar el bot en modo desarrollo:

```sh
npm run bot:dev
```

## Debian

1. Instala Node.js 20.11 o superior con el metodo que uses para tu servidor.
2. En el portal de desarrolladores de Discord, habilita el intent privilegiado `Server Members Intent` para el bot.
3. Copia el proyecto al servidor, incluyendo `package.json`, `package-lock.json`, `config/` y `src/`.
4. Crea `.env` en la raiz del proyecto.
5. Ejecuta:

```sh
npm ci
npm run build
npm run test
npm run discord:validate
npm run discord:plan
npm run bot:validate
```

Para ejecutar el bot manualmente:

```sh
npm run bot:start
```

No se crea todavia el servicio `systemd`. Cuando se agregue, debe ejecutar `npm run bot:start` desde la carpeta del proyecto y cargar `.env` de forma segura.

## Seguridad operativa

- `apply` y `restore` requieren confirmacion explicita.
- `apply` y `restore` crean respaldos previos.
- Las operaciones se registran en `logs/` sin credenciales.
- La API de Discord se usa mediante `discord.js`, que gestiona las respuestas y limites de velocidad del cliente REST.
- La herramienta evita duplicados buscando canales y categorias existentes por nombre y tipo.
- El bot no lee mensajes y no requiere `MessageContent`.
