# Respaldos cifrados de SubirFactura (ver backup.sh).
# postgresql16-client debe coincidir con el mayor de la BD (postgres:16-alpine).
FROM alpine:3.20

RUN apk add --no-cache \
      postgresql16-client \
      age \
      rclone \
      curl \
      tzdata

# RD es UTC-4: el cron corre en hora dominicana, no en UTC.
ENV TZ=America/Santo_Domingo

COPY backup.sh /usr/local/bin/backup.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
