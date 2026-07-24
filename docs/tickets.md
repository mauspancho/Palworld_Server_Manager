# Tickets

Variables:

```txt
TICKETS_ENABLED=true
TICKET_PANEL_CHANNEL_ID=
TICKET_LOG_CHANNEL_ID=
TICKET_CATEGORY_ID=
TICKET_ADMIN_ROLE_NAMES=Admin,Moderador
```

`npm run tickets:publish` publica o actualiza el panel persistente.

Datos persistentes:

```txt
data/tickets.json
transcripts/
```

Reglas:

- Un usuario solo puede tener un ticket abierto.
- Cerrar no elimina el canal.
- Cerrar marca el ticket como cerrado, bloquea al usuario y genera transcripcion.
- Solo Admin o Moderador pueden tomar, cerrar o reabrir.
