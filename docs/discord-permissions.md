# Discord Permissions

Intents requeridos:

```txt
Guilds
GuildMembers
GuildMessages
```

`MessageContent` no se habilita. El bot puede recibir eventos `messageCreate` sin leer el contenido del mensaje; esto se usa solo para proteger canales informativos.

Permisos recomendados del bot:

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

`ManageMessages` se usa para retirar mensajes no autorizados en canales informativos. Si falta, el bot debe seguir encendido y registrar una advertencia.

`/mensaje` requiere `SendMessages`, `MentionEveryone` y `ManageMessages` en `GENERAL_CHAT_CHANNEL_ID` para publicar, alertar con `@everyone` y fijar el anuncio.

No se debe depender de `Administrator`.

## Canales Informativos

Canales protegidos:

- bienvenida
- reglas
- anuncios
- datos-del-servidor
- elige-tus-roles

Permisos esperados para `@everyone`, `MEMBER_ROLE_ID` y `PENDING_MEMBER_ROLE_ID`:

```txt
Allow: ViewChannel, ReadMessageHistory
Deny: SendMessages, SendMessagesInThreads, CreatePublicThreads, CreatePrivateThreads, AttachFiles, SendVoiceMessages, UseApplicationCommands, MentionEveryone, ManageMessages, ManageThreads, ManageChannels, CreateInstantInvite
```

`Admin`, `Palworld Server Manager`, `Moderador`, `Bots` y el bot conservan permisos para publicar o actualizar paneles.

Reparacion:

```sh
npm run info:repair
```

Tambien existe `/informacion reparar` si los comandos slash estan registrados.

## Canal De Crianza

`BREEDING_CHANNEL_ID` debe apuntar a `🥚・crianza`.

Permisos esperados para `@everyone`, `MEMBER_ROLE_ID` y `PENDING_MEMBER_ROLE_ID`:

```txt
Allow: ViewChannel, ReadMessageHistory, UseApplicationCommands
Deny: SendMessages, SendMessagesInThreads, CreatePublicThreads, CreatePrivateThreads, AttachFiles, SendVoiceMessages, MentionEveryone, ManageMessages, ManageThreads, ManageChannels, CreateInstantInvite
```

Reparacion/publicacion:

```sh
npm run breeding:publish
npm run breeding:repair
```

Tambien existe `/crianza-panel reparar` para roles autorizados.

## Visibilidad De Comandos Slash

El registro de comandos reemplaza de forma determinista la lista del servidor con `commands:register`.

Comandos publicos:

- `/crianza`
- `/estado`
- `/sugerencia`
- `/vincular`

Comandos restringidos a moderacion:

- `/gremio`
- `/evento`
- `/cuarentena`

Comandos restringidos a administracion con `default_member_permissions=Administrator`:

- `/palworld`
- `/informacion`
- `/crianza-panel`
- `/mensaje`
- `/solicitudes-pendientes`

`/palworld` contiene acciones como `iniciar`, `detener` y `reiniciar-ahora`, por lo que queda oculto para usuarios normales en el selector slash. El manejador global conserva una segunda validacion y responde de forma efimera si alguien intenta ejecutar una interaccion antigua o manipulada.

El rol del bot debe estar por encima de:

- MEMBER_ROLE_ID
- PENDING_MEMBER_ROLE_ID, si se usa
- Roles de self-roles
- Roles Gremio 1 a Gremio 5
- QUARANTINE_ROLE_ID, si se usa
