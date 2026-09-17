#!/usr/bin/env bash
# Idempotent repository bootstrap for the XMUM Orientation Platform.
#
# Runs after checkout. It installs the system tooling the app's local dev stack
# needs (Docker engine + Supabase CLI), installs Node dependencies, and warms
# the Supabase Docker images so the per-boot `start` step is fast. Everything
# here writes durable state that is captured in the environment snapshot; no
# long-running process is expected to survive into a later boot (see start.sh).
set -euo pipefail

SUPABASE_CLI_VERSION="2.117.0"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

log() { echo "[install] $*"; }

# ── 1. System packages (Docker engine + fuse-overlayfs for nested containers) ─
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker engine..."
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sudo sh /tmp/get-docker.sh
else
  log "Docker already installed: $(docker --version)"
fi

if ! command -v fuse-overlayfs >/dev/null 2>&1; then
  log "Installing fuse-overlayfs / uidmap..."
  sudo apt-get update -qq
  # The udev trigger fails harmlessly inside a container; don't abort on it.
  sudo apt-get install -y -qq fuse-overlayfs uidmap || true
fi

# Nested-container VMs have no systemd and nftables is flaky; use legacy iptables
# and the fuse-overlayfs storage driver so dockerd works without a host bridge.
sudo update-alternatives --set iptables /usr/sbin/iptables-legacy >/dev/null 2>&1 || true
sudo update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy >/dev/null 2>&1 || true
sudo mkdir -p /etc/docker
echo '{
  "storage-driver": "fuse-overlayfs"
}' | sudo tee /etc/docker/daemon.json >/dev/null

# ── 2. Supabase CLI ───────────────────────────────────────────────────────────
if ! command -v supabase >/dev/null 2>&1; then
  log "Installing Supabase CLI v${SUPABASE_CLI_VERSION}..."
  ARCH="$(dpkg --print-architecture)"
  curl -fsSL -o /tmp/supabase.deb \
    "https://github.com/supabase/cli/releases/download/v${SUPABASE_CLI_VERSION}/supabase_${SUPABASE_CLI_VERSION}_linux_${ARCH}.deb"
  sudo dpkg -i /tmp/supabase.deb
else
  log "Supabase CLI already installed: $(supabase --version)"
fi

# ── 3. Node dependencies ──────────────────────────────────────────────────────
log "Installing Node dependencies..."
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

# ── 4. Warm the Supabase Docker images (baked into the snapshot) ──────────────
# Pulling here means the per-boot `supabase start` in start.sh does not download
# ~10 images. The daemon must be up for image detection to be reliable, so start
# it first, then pull only when the images are actually missing (a cold install).
# On a warm snapshot the images already exist and this is a fast no-op.
DOCKERD_PID=""
if ! sudo docker info >/dev/null 2>&1; then
  sudo dockerd >/tmp/dockerd-install.log 2>&1 &
  DOCKERD_PID=$!
  for _ in $(seq 1 30); do sudo docker info >/dev/null 2>&1 && break; sleep 1; done
fi
sudo chmod 666 /var/run/docker.sock 2>/dev/null || true

if ! docker image ls --format '{{.Repository}}' 2>/dev/null | grep -q 'supabase/postgres'; then
  log "Warming Supabase images (first run only)..."
  supabase start || true
  supabase stop --no-backup || true
else
  log "Supabase images already present; skipping warm-up."
fi

if [ -n "$DOCKERD_PID" ]; then
  sudo kill "$DOCKERD_PID" 2>/dev/null || true
fi

log "install.sh complete."
