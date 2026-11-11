# CA local para Verichain

Desde la raíz, con Bash y OpenSSL instalados:

```bash
bash infra/tls/generar-ca.sh
openssl verify -CAfile secrets/tls/ca.crt secrets/tls/server.crt
openssl x509 -in secrets/tls/server.crt -noout -text
```

El script crea `ca.key`, `ca.crt`, `server.key` y `server.crt` en `secrets/tls/`, ignorado por Git. Si alguno existe, se detiene sin sobrescribirlo. Las llaves privadas reciben permisos `600` en sistemas que los admiten. Protege especialmente `ca.key`: quien la posea puede emitir certificados confiables por esa CA.

Para confiar en la CA en Linux (por ejemplo, Debian/Ubuntu):

```bash
sudo cp secrets/tls/ca.crt /usr/local/share/ca-certificates/verichain-ca.crt
sudo update-ca-certificates
```

Chrome usa normalmente el almacén de confianza del sistema; después de instalar la CA, reinícialo. En Firefox abre **Ajustes → Privacidad y seguridad → Certificados → Ver certificados → Autoridades → Importar**, elige `ca.crt` y autoriza su uso para identificar sitios web. Solo instala esta CA en equipos de confianza y retírala al terminar la demostración.

Para la sustentación, con el servicio HTTPS en marcha, muestra el certificado del sitio desde el candado del navegador o ejecuta:

```bash
openssl s_client -connect localhost:443 -servername localhost -showcerts -CAfile secrets/tls/ca.crt
```

Inspecciona la CA y el certificado de servidor con `openssl x509 -in secrets/tls/ca.crt -noout -subject -issuer` y el comando equivalente para `server.crt`. La infraestructura que sirve HTTPS se implementa en H11.2.
