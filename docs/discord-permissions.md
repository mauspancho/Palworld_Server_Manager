# Discord Permissions

Intents requeridos:

```txt
Guilds
GuildMembers
```

`MessageContent` no se habilita por defecto. Si se decide generar transcripciones con contenido completo de mensajes de tickets, debe habilitarse manualmente en el Developer Portal y documentar ese cambio operativo.

Permisos recomendados del bot:

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

No se debe depender de `Administrator`.

El rol del bot debe estar por encima de:

- MEMBER_ROLE_ID
- Roles de self-roles
- Roles Gremio 1 a Gremio 5
- QUARANTINE_ROLE_ID, si se usa
