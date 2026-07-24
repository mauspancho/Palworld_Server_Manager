# Status Panel

Variables:

```txt
PALWORLD_STATUS_ENABLED=true
PALWORLD_STATUS_CHANNEL_ID=
PALWORLD_SERVICE_NAME=palworld.service
PALWORLD_GAME_PORT=8211
PALWORLD_STATUS_INTERVAL_SECONDS=60
PALWORLD_ALERT_CHANNEL_ID=
```

`npm run status:publish` publica o actualiza el mensaje persistente y guarda:

```txt
state/palworld-status-message.json
```

En Debian usa:

- `systemctl is-active`
- `systemctl show`
- `ss -lun`

En Windows el probe devuelve un estado local no disponible, suficiente para desarrollo sin systemd.
