#!/usr/bin/env bash
set -euo pipefail
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/infra/tls"
cp "$(dirname "$0")/generar-ca.sh" "$work/infra/tls/"
bash "$work/infra/tls/generar-ca.sh"
openssl verify -CAfile "$work/secrets/tls/ca.crt" "$work/secrets/tls/server.crt"
openssl x509 -in "$work/secrets/tls/server.crt" -noout -text | grep -q 'DNS:localhost, IP Address:127.0.0.1'
openssl x509 -in "$work/secrets/tls/server.crt" -noout -text | grep -q 'CA:FALSE'
before=$(openssl dgst -sha256 "$work/secrets/tls/server.key")
if bash "$work/infra/tls/generar-ca.sh"; then echo 'No debe sobrescribir archivos' >&2; exit 1; fi
after=$(openssl dgst -sha256 "$work/secrets/tls/server.key")
test "$before" = "$after"
