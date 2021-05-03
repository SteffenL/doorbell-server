#!/usr/bin/env bash

platform=${1}
architecture=${platform##*/}
echo "${architecture}"
