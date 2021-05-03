#!/usr/bin/env bash

cleanup() {
    rm -rf deb-build || return 1
}

trap cleanup EXIT

package_name=${1}
package_version=${2}

docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --output=type=local,dest=deb-build \
    --file Dockerfile_deb \
    --build-arg "PACKAGE_NAME=${package_name}" \
    --build-arg "PACKAGE_VERSION=${package_version}" \
    . || exit 1

mkdir --parent dist/deb || exit 1
cp -f deb-build/*/build/dist/*.deb dist/deb || exit 1
