#!/usr/bin/env bash
# SubirFactura — deja un droplet recién creado listo para recibir despliegues.
#
#   scp scripts/bootstrap-servidor.sh root@138.197.81.29:/tmp/
#   ssh root@138.197.81.29 'bash /tmp/bootstrap-servidor.sh "<clave-publica-ssh>"'
#
# Hace: usuario `deploy` con su llave · Docker · cortafuegos · swap ·
# actualizaciones de seguridad automáticas · /opt/subirfactura.
#
# Es idempotente: puedes correrlo dos veces sin romper nada.
#
# El endurecimiento de SSH (apagar contraseñas y login de root) va APARTE, a
# propósito: primero comprueba que entras con la llave, y solo entonces:
#   ssh root@IP 'bash /tmp/bootstrap-servidor.sh --endurecer-ssh'
set -euo pipefail

USUARIO=deploy
DESTINO=/opt/subirfactura
SWAP=/swapfile
SWAP_GB=2

say()  { printf "\n\033[1;32m▶ %s\033[0m\n" "$1"; }
info() { printf "  %s\n" "$1"; }
warn() { printf "\033[1;33m⚠ %s\033[0m\n" "$1"; }
fail() { printf "\033[1;31m✗ %s\033[0m\n" "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "Corre esto como root."

# ── Modo endurecer: se invoca por separado, después de probar la llave ────────
if [ "${1:-}" = "--endurecer-ssh" ]; then
  say "Endureciendo SSH"
  if [ ! -s "/home/$USUARIO/.ssh/authorized_keys" ]; then
    fail "El usuario $USUARIO no tiene llaves. Te quedarías fuera. Aborto."
  fi
  if sshd -T 2>/dev/null | grep -q '^passwordauthentication no'; then
    info "el servidor ya venía endurecido — no hay nada que cambiar"
    exit 0
  fi
  install -d -m 755 /etc/ssh/sshd_config.d
  cat > /etc/ssh/sshd_config.d/99-subirfactura.conf <<'EOF'
# Solo llaves: las contraseñas SSH se adivinan, las llaves ed25519 no.
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
  sshd -t || fail "La configuración de sshd no valida — no reinicio el servicio."
  systemctl restart ssh 2>/dev/null || systemctl restart sshd
  info "contraseñas SSH apagadas; root solo con llave"
  warn "NO cierres esta sesión hasta confirmar en otra terminal:  ssh $USUARIO@\$IP"
  exit 0
fi

CLAVE_PUB="${1:-}"
[ -n "$CLAVE_PUB" ] || fail "Uso: bash bootstrap-servidor.sh \"ssh-ed25519 AAAA... comentario\""
case "$CLAVE_PUB" in
  ssh-*|ecdsa-*) : ;;
  *) fail "Eso no parece una clave pública SSH." ;;
esac

# ── 1. Paquetes base ──────────────────────────────────────────────────────────
say "Paquetes base"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl ufw unattended-upgrades >/dev/null
info "ok"

# ── 2. Usuario de despliegue ──────────────────────────────────────────────────
say "Usuario $USUARIO"
if id "$USUARIO" >/dev/null 2>&1; then
  info "ya existe"
else
  adduser --disabled-password --gecos "" "$USUARIO" >/dev/null
  info "creado (sin contraseña: solo entra por llave)"
fi
install -d -m 700 -o "$USUARIO" -g "$USUARIO" "/home/$USUARIO/.ssh"
touch "/home/$USUARIO/.ssh/authorized_keys"
if grep -qxF "$CLAVE_PUB" "/home/$USUARIO/.ssh/authorized_keys"; then
  info "la llave ya estaba autorizada"
else
  echo "$CLAVE_PUB" >> "/home/$USUARIO/.ssh/authorized_keys"
  info "llave autorizada"
fi
chmod 600 "/home/$USUARIO/.ssh/authorized_keys"
chown -R "$USUARIO:$USUARIO" "/home/$USUARIO/.ssh"

# ── 3. Docker ─────────────────────────────────────────────────────────────────
say "Docker"
if command -v docker >/dev/null 2>&1; then
  info "ya instalado ($(docker --version | cut -d, -f1))"
else
  curl -fsSL https://get.docker.com | sh >/dev/null
  info "instalado"
fi
usermod -aG docker "$USUARIO"
systemctl enable --now docker >/dev/null 2>&1 || true
docker compose version >/dev/null 2>&1 || fail "Falta el plugin 'docker compose'."
info "$USUARIO puede usar docker"

# ── 4. Cortafuegos ────────────────────────────────────────────────────────────
# Nada más se expone: Postgres, Redis y MinIO viven en la red interna de Docker.
#
# Si el servidor ya tenía ufw configurado (p. ej. con un LIMIT en el 22 contra
# fuerza bruta), NO lo pisamos: solo añadimos lo que falta. Meter un `allow
# OpenSSH` encima de un `limit 22/tcp` no rompe nada, pero ensucia el conjunto
# de reglas y confunde a quien lo lea después.
say "Cortafuegos"
ufw status 2>/dev/null | grep -q '^Status: active' && info "ufw ya estaba activo — conservo sus reglas"
if ufw status 2>/dev/null | grep -qE '^(22/tcp|OpenSSH)'; then
  info "la regla de SSH que ya existía queda intacta"
else
  ufw allow OpenSSH >/dev/null
  info "SSH permitido"
fi
for PUERTO in 80 443; do
  if ufw status 2>/dev/null | grep -q "^${PUERTO}/tcp"; then
    info "$PUERTO/tcp ya estaba abierto"
  else
    ufw allow "${PUERTO}/tcp" >/dev/null
    info "$PUERTO/tcp abierto"
  fi
done
ufw --force enable >/dev/null
info "$(ufw status | head -1)"
# Docker inserta sus propias reglas por delante de ufw: los puertos que publique
# un contenedor quedan expuestos aunque ufw diga lo contrario. Aquí solo publica
# Caddy (80/443), que es justo lo que queremos público — pero conviene saberlo.

# ── 5. Swap ───────────────────────────────────────────────────────────────────
# Los droplets vienen sin swap. Es el seguro barato contra un OOM que se lleve
# a Postgres por delante en un pico de OCR.
say "Swap de ${SWAP_GB} GB"
if swapon --show | grep -q "$SWAP"; then
  info "ya activo"
else
  fallocate -l "${SWAP_GB}G" "$SWAP" 2>/dev/null || dd if=/dev/zero of="$SWAP" bs=1M count=$((SWAP_GB*1024)) status=none
  chmod 600 "$SWAP"
  mkswap "$SWAP" >/dev/null
  swapon "$SWAP"
  grep -q "^$SWAP" /etc/fstab || echo "$SWAP none swap sw 0 0" >> /etc/fstab
  # Con 4 GB de RAM, tocar swap pronto es peor que usar la memoria que hay.
  sysctl -qw vm.swappiness=10
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
  info "activo"
fi

# ── 6. Actualizaciones de seguridad automáticas ───────────────────────────────
say "Actualizaciones de seguridad automáticas"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
info "activadas (solo parches de seguridad; no reinicia sola)"

# ── 7. Carpeta del proyecto ───────────────────────────────────────────────────
say "Carpeta $DESTINO"
install -d -m 755 -o "$USUARIO" -g "$USUARIO" "$DESTINO"
install -d -m 755 -o "$USUARIO" -g "$USUARIO" "$DESTINO/docker"
install -d -m 755 -o "$USUARIO" -g "$USUARIO" "$DESTINO/scripts"
# Atajo: el CD deja el script en scripts/, pero se usa desde la raíz.
# El enlace apunta a un archivo que aún no existe; se resuelve al desplegar.
ln -sfn scripts/actualizar.sh "$DESTINO/actualizar.sh"
chown -h "$USUARIO:$USUARIO" "$DESTINO/actualizar.sh"
info "lista"

# ── Resumen ───────────────────────────────────────────────────────────────────
IP=$(hostname -I | awk '{print $1}')
cat <<EOF

$(printf '\033[1;32m════ Servidor listo ════\033[0m')

  RAM   : $(free -h | awk '/^Mem:/{print $2}')  ·  swap $(free -h | awk '/^Swap:/{print $2}')
  Disco : $(df -h / | awk 'NR==2{print $4}') libres
  Docker: $(docker --version | cut -d, -f1)

Ahora, DESDE TU MÁQUINA:

  1. Comprueba que entras sin contraseña:
       ssh -i .despliegue/deploy_key $USUARIO@$IP 'echo ok'

  2. Sube las variables (el .env.prod nunca pasa por git):
       scp -i .despliegue/deploy_key .despliegue/.env.prod $USUARIO@$IP:$DESTINO/.env.prod
       ssh -i .despliegue/deploy_key $USUARIO@$IP 'chmod 600 $DESTINO/.env.prod'

  3. Cuando el paso 1 funcione, cierra la puerta de las contraseñas:
       ssh root@$IP 'bash /tmp/bootstrap-servidor.sh --endurecer-ssh'

  4. Despliega:  git push origin main

EOF
