#!/bin/sh
set -e

# Fix ownership of data directory for users upgrading from root-based images.
if [ "$(stat -c '%u' "$GIST_DATA_DIR" 2>/dev/null)" != "$(id -u gist)" ]; then
    chown -R gist:gist "$GIST_DATA_DIR"
fi

exec su-exec gist "$@"
