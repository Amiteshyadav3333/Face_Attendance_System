#!/bin/sh
set -eu

android_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
web_dir="$android_dir/../frontend"
assets_dir="$android_dir/app/build/generated/attendanceWeb/web"

cd "$web_dir"
REACT_APP_BACKEND_URL="${REACT_APP_BACKEND_URL:-https://face-attendance-system-s4gb.onrender.com}" \
    BUILD_PATH="$assets_dir" npm run build
cd "$android_dir"
exec ./gradlew assembleDebug "$@"
