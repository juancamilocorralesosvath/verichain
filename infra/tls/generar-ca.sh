#!/usr/bin/env bash
set -euo pipefail
export MSYS2_ARG_CONV_EXCL='/CN='

raiz=$(cd -- "$(dirname -- "$0")/../.." && pwd)
destino="$raiz/secrets/tls"
umask 077
mkdir -p -- "$destino"
for archivo in ca.key ca.crt server.key server.crt; do
  if [[ -e "$destino/$archivo" || -L "$destino/$archivo" ]]; then
    printf 'Ya existe %s; no se sobrescribe.\n' "$destino/$archivo" >&2
    exit 1
  fi
done
trabajo=$(mktemp -d "$destino/.generar-XXXXXX")
trap 'rm -rf -- "$trabajo"' EXIT
openssl ecparam -name prime256v1 -genkey -noout -out "$trabajo/ca.key"
openssl req -new -x509 -sha256 -key "$trabajo/ca.key" -out "$trabajo/ca.crt" \
  -days 1825 -subj '/CN=Blockchain Integridad CA' \
  -addext 'basicConstraints=critical,CA:TRUE' \
  -addext 'keyUsage=critical,keyCertSign,cRLSign'
openssl ecparam -name prime256v1 -genkey -noout -out "$trabajo/server.key"
openssl req -new -sha256 -key "$trabajo/server.key" -out "$trabajo/server.csr" -subj '/CN=localhost'
cat > "$trabajo/ext.cnf" <<'EOF'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=serverAuth
subjectAltName=DNS:localhost,IP:127.0.0.1
EOF
openssl x509 -req -sha256 -in "$trabajo/server.csr" -CA "$trabajo/ca.crt" \
  -CAkey "$trabajo/ca.key" -CAcreateserial -out "$trabajo/server.crt" -days 397 -extfile "$trabajo/ext.cnf"
chmod 600 "$trabajo/ca.key" "$trabajo/server.key"
for archivo in ca.key ca.crt server.key server.crt; do
  # Enlazar falla si aparece el destino durante la generación y nunca lo sobrescribe.
  ln -- "$trabajo/$archivo" "$destino/$archivo"
done
printf 'CA y certificado creados en %s\n' "$destino"
