# Gremios

La configuracion vive en `config/guilds.yml`.

`npm run guilds:publish` crea o actualiza:

- Categoria de gremios.
- Roles Gremio 1 a Gremio 5.
- Canales privados de texto y voz por gremio.
- Permisos para Admin, Moderador, Palworld Server Manager y el rol del gremio.

No elimina gremios, roles ni canales existentes.

Los roles de gremio no forman parte de `config/self-roles.yml`; deben asignarse mediante administradores o comandos `/gremio`.
