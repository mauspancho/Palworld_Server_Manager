# Debian systemd

No se crea ni modifica ningun servicio automaticamente.

Ejemplo manual:

```ini
[Unit]
Description=Palworld Server Manager Discord Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/palworld-server-manager
EnvironmentFile=/opt/palworld-server-manager/.env
ExecStart=/usr/bin/npm run bot:start
Restart=on-failure
RestartSec=10
User=palworldbot
Group=palworldbot

[Install]
WantedBy=multi-user.target
```

Pasos manuales:

```sh
npm ci
npm run build
npm run validate:all
sudo systemctl daemon-reload
sudo systemctl enable --now palworld-server-manager.service
```
