#!/usr/bin/env bash

ssh_host=${1}
scp dist/doorbell-server.deb "${ssh_host}:~/doorbell-server.deb" || exit 1
ssh "${ssh_host}" 'sudo apt-get remove -y doorbell-server; \
    sudo apt-get -y install ~/doorbell-server.deb; \
    rm -f ~/doorbell-server.deb; \
    sudo systemctl enable doorbell-server' || exit 1
