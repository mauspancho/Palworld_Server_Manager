# Gremios

La configuracion vive en `config/guilds.yml`.

## Flujo De Solicitud

Los miembros pueden solicitar un gremio con:

```txt
/gremio solicitar nombre:<nombre> miembro1:<opcional> ...
```

La solicitud queda pendiente en `data/guild-communities.json`. No crea canales ni roles hasta que un administrador o moderador la apruebe.

Administracion:

```txt
/gremio solicitudes
/gremio aprobar solicitud:<id>
/gremio rechazar solicitud:<id>
```

Al aprobar:

- Se crea un rol privado `Gremio - <nombre>`.
- Se crea un canal de texto `gremio-<nombre>`.
- Se crea un canal de voz `voz-<nombre>`.
- `@everyone` no puede ver los canales.
- Solo el rol del gremio y los roles administrativos configurados pueden verlos.
- Quien solicito el gremio queda como lider.
- El lider y los integrantes iniciales reciben el rol del gremio.

El lider puede administrar integrantes de su gremio:

```txt
/gremio agregar usuario:<miembro>
/gremio eliminar usuario:<miembro>
```

El lider no puede eliminarse a si mismo. Un usuario no puede agregarse a otro gremio activo mediante este flujo.

## Publicador Inicial

`npm run guilds:publish` crea o actualiza:

- Categoria de gremios.
- Roles Gremio 1 a Gremio 5.
- Canales privados de texto y voz por gremio.
- Permisos para Admin, Moderador, Palworld Server Manager y el rol del gremio.

No elimina gremios, roles ni canales existentes.

Los roles de gremio no forman parte de `config/self-roles.yml`; se asignan mediante aprobacion administrativa o comandos `/gremio`.
