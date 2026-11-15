#!/bin/bash
# Instalacja Gruz Verify na czystej maszynie Debian/Ubuntu (Google Cloud e2-micro): Node 22, kod z GitHuba, usługa systemd
# z restartem po awarii i po restarcie maszyny. Ponowne uruchomienie = aktualizacja kodu (token zostaje, jeśli już jest).
set -euo pipefail
DIR=/opt/gruz-verify
ENV=/etc/gruz-verify.env

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo apt-get install -y git
if [ -d "$DIR/.git" ]; then sudo git -C "$DIR" pull --ff-only; else sudo git clone https://github.com/ilikemoneyrux/gruz-verify "$DIR"; fi
(cd "$DIR" && sudo npm install --omit=dev --no-audit --no-fund)

if ! sudo test -s "$ENV"; then
  read -rsp "Wklej DISCORD_TOKEN bota Gruz Verify (nie będzie widoczny) i Enter: " TOKEN < /dev/tty; echo  # skrypt idzie przez curl | bash, więc token z terminala, nie ze stdin
  [ -n "$TOKEN" ] || { echo "Pusty token – przerwane."; exit 1; }
  echo "DISCORD_TOKEN=$TOKEN" | sudo tee "$ENV" >/dev/null
  sudo chmod 600 "$ENV"
fi

# 1 GB RAM na e2-micro: swap na wypadek instalacji pakietów
if ! swapon --show | grep -q .; then
  sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

sudo tee /etc/systemd/system/gruz-verify.service >/dev/null <<EOF
[Unit]
Description=Gruz Verify (Discord captcha bot)
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=$DIR
EnvironmentFile=$ENV
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5
DynamicUser=yes

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable gruz-verify >/dev/null 2>&1
sudo systemctl restart gruz-verify
sleep 8
sudo journalctl -u gruz-verify -n 15 --no-pager
