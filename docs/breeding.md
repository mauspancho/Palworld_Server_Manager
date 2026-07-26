# Palworld Breeding

La funcionalidad de crianza publica un panel persistente en `🥚・crianza` y permite consultar combinaciones sin que los usuarios escriban mensajes en el canal.

## Configuracion

```txt
BREEDING_CHANNEL_ID=
```

El canal debe ser de texto y su nombre visible debe contener `crianza`.

## Datos

Archivo versionado:

```txt
config/breeding-combinations.json
```

Conteos validados:

- 86 Pals objetivo
- 113 combinaciones unicas
- 42 combinaciones de GAMES.GG
- 71 combinaciones adicionales de Vandal

Vandal se muestra como fuente anterior a Palworld 1.0 y requiere confirmacion. GAMES.GG se muestra como fuente marcada para Palworld 1.0.

## Publicacion

```sh
npm run breeding:publish
npm run breeding:repair
```

Ambos scripts localizan `BREEDING_CHANNEL_ID`, reparan permisos del canal, editan el panel existente si el mensaje sigue disponible y crean uno nuevo solo si fue eliminado. El estado persistente se guarda en:

```txt
state/breeding-panel-message.json
```

Tambien puedes usar:

```txt
/crianza-panel publicar
/crianza-panel reparar
```

## Consulta

```txt
/crianza pal:Anubis
```

El parametro `pal` tiene autocompletado. La busqueda ignora mayusculas, espacios repetidos, espacios al inicio/final, aliases y nombres compuestos.

El panel ofrece:

- filtro por estado
- pagina por rango de iniciales
- selector de Pal
- resultado efimero
- botones para volver, cambiar filtro o cerrar

## Permisos

Usuarios normales, `MEMBER_ROLE_ID` y `PENDING_MEMBER_ROLE_ID`:

```txt
Allow: ViewChannel, ReadMessageHistory, UseApplicationCommands
Deny: SendMessages, SendMessagesInThreads, CreatePublicThreads, CreatePrivateThreads, AttachFiles, SendVoiceMessages, MentionEveryone, ManageMessages, ManageThreads, ManageChannels, CreateInstantInvite
```

Admins y el bot pueden publicar y actualizar el panel. El bot no debe depender de `Administrator`.
