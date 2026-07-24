# Palworld Control Helper

El bot no ejecuta `systemctl restart` directamente. Cuando `PALWORLD_CONTROL_ENABLED=true`, solo invoca el helper configurado en `PALWORLD_CONTROL_HELPER` con una accion permitida:

```txt
status
start
stop
restart
```

Ejemplo de helper:

```sh
#!/bin/sh
set -eu

case "${1:-}" in
  status) systemctl is-active palworld.service ;;
  start) systemctl start palworld.service ;;
  stop) systemctl stop palworld.service ;;
  restart) systemctl restart palworld.service ;;
  *) exit 64 ;;
esac
```

Ejemplo de sudoers restringido:

```txt
palworldbot ALL=(root) NOPASSWD: /usr/local/sbin/palworld-discord-control status
palworldbot ALL=(root) NOPASSWD: /usr/local/sbin/palworld-discord-control start
palworldbot ALL=(root) NOPASSWD: /usr/local/sbin/palworld-discord-control stop
palworldbot ALL=(root) NOPASSWD: /usr/local/sbin/palworld-discord-control restart
```

Instalacion manual:

```sh
sudo install -o root -g root -m 0750 palworld-discord-control /usr/local/sbin/palworld-discord-control
sudo visudo -f /etc/sudoers.d/palworld-discord-control
```
