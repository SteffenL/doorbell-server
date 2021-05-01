#!/usr/bin/env bash

npm ci || exit 1
npx tsc || exit 1
mkdir -p deb/opt/doorbell-server/ || exit 1
mv node_modules/ deb/opt/doorbell-server/ || exit 1
mv lib/* deb/opt/doorbell-server/ || exit 1
dpkg-deb --build deb/ dist/doorbell-server.deb || exit 1
