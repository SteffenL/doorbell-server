#!/usr/bin/bash -e

docker build -t doorbell-server-builder -f Dockerfile_deb .
docker run --rm -it -v "${PWD}/dist:/build/dist" doorbell-server-builder
docker image rm doorbell-server-builder
