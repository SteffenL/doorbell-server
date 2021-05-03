# Doorbell Server

## Building (Linux)

Build Debian package:

```
scripts/build_deb.sh
```

## App Config (Linux)

Environment variables:

```
CONFIG_DIR=/etc/opt/doorbell-server
DATA_DIR=/var/opt/doorbell-server
```

Create the config/data directory if needed. Defaults to `${HOME}/.doorbell-server/config` and `${HOME}/.doorbell-server/data`.

Place files:

* Server certificate (`server.cert.pem`) and private key (`server.key.pem`) for HTTPS in `${CONFIG_DIR}/certificates/`.
* FCM credentials (`firebase-service-account.json`) in `${CONFIG_DIR}/credentials/`.
* Firmware updates (`update.bin`) in `${CONFIG_DIR}/public/firmware/<version>/`.

Create/Edit app config file at `${CONFIG_DIR}/app.config.json`:

Example #1:

```json
{
    "server": {
        "httpPort": 80,
        "httpsPort": 443
    },
    "database": {
        "dbms": "sqlite3"
    }
}
```

Example #2:

```json
{
    "server": {
        "httpPort": 80,
        "httpsPort": 443
    },
    "database": {
        "dbms": "mysql",
        "database": "doorbell-server",
        "username": "doorbell-server-user",
        "password": "secret password",
        "hostname": "localhost",
        "port": 3306
    }
}
```

## TODO

* Update server certificates automatically when the files change.
* Delete records of (disconnected) monitors in the database on startup.
