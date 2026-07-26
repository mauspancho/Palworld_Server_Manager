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
UseApplicationCommands
CreatePublicThreads
CreatePrivateThreads
```

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

El rol del bot debe estar por encima de:

- MEMBER_ROLE_ID
- PENDING_MEMBER_ROLE_ID, si se usa
- Roles de self-roles
- Roles Gremio 1 a Gremio 5
- QUARANTINE_ROLE_ID, si se usa
