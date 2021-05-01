# Doorbell Server

## Building (Linux)

Environment variables:

```
CONFIG_DIR=/etc/opt/doorbell-server
DATA_DIR=/var/opt/doorbell-server
```

Config/Data dir defaults to `${HOME}/.doorbell-server`.

Place files:

* Server certificate (`server.cert.pem`) and private key (`server.key.pem`) for HTTPS in `${CONFIG_DIR}/certificates/`.
* FCM credentials (`firebase-service-account.json`) in `${CONFIG_DIR}/credentials/`.
* Firmware updates (`update.bin`) in `${CONFIG_DIR}/public/firmware/<version>/`.

Build Debian package:

```
scripts/build_deb.sh
```
