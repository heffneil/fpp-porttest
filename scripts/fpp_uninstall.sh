#!/bin/bash

# fpp-porttest uninstall script

. ${FPPDIR}/scripts/common

# Stop any test this plugin left running. Bounded, and a failure is not worth
# blocking removal over.
curl -s --connect-timeout 2 --max-time 10 \
     -X POST -H 'Content-Type: application/json' \
     -d '{"command":"Test Stop","args":[]}' \
     "http://localhost/api/command" >/dev/null 2>&1 || true

echo "fpp-porttest uninstalled."
exit 0
