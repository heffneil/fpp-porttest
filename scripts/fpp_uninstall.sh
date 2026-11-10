#!/bin/bash

# fpp-porttest uninstall script

. ${FPPDIR}/scripts/common

# Stop any test this plugin left running. Bounded, and a failure is not worth
# blocking removal over.
curl -s --connect-timeout 2 --max-time 10 \
     -X POST -H 'Content-Type: application/json' \
     -d '{"command":"Test Stop","args":[]}' \
     "http://localhost/api/command" >/dev/null 2>&1 || true

# Stop any test effect this plugin left playing and delete its temporary files.
# Names are porttest_<pattern>_<ports>: letters, digits and underscores only.
for name in $(curl -s --connect-timeout 2 --max-time 10 "http://localhost/api/fppd/effects" 2>/dev/null \
                  | grep -o '"name":"porttest_[A-Za-z0-9_]*"' | cut -d'"' -f4); do
    curl -s --connect-timeout 2 --max-time 10 \
         -X POST -H 'Content-Type: application/json' \
         -d "{\"command\":\"Effect Stop\",\"args\":[\"${name}\"]}" \
         "http://localhost/api/command" >/dev/null 2>&1 || true
done
for name in $(curl -s --connect-timeout 2 --max-time 10 "http://localhost/api/sequence" 2>/dev/null \
                  | grep -o '"porttest_[A-Za-z0-9_]*"' | tr -d '"'); do
    curl -s --connect-timeout 2 --max-time 10 -X DELETE \
         "http://localhost/api/file/sequences/${name}.fseq" >/dev/null 2>&1 || true
done

echo "fpp-porttest uninstalled."
exit 0
