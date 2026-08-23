#!/usr/bin/env bash
SESSION="homestream"

if ! command -v tmux &>/dev/null; then
  echo "Error: tmux no està instal·lat. Instal·la'l amb: sudo pacman -S tmux"
  exit 1
fi

tmux kill-session -t "$SESSION" 2>/dev/null

tmux new-session -d -s "$SESSION" -x "$(tput cols)" -y "$(tput lines)"

# Panell superior esquerra: docker stats (CPU, RAM, xarxa per contenidor)
tmux send-keys -t "$SESSION:0.0" \
  "docker stats --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}'" Enter

# Panell superior dret: GPU encode/decode en temps real
tmux split-window -h -t "$SESSION:0.0"
tmux send-keys -t "$SESSION:0.1" \
  "nvidia-smi dmon -s uce -d 1" Enter

# Panell inferior: estat contenidors + fitxers en procés
tmux split-window -v -t "$SESSION:0.0"
tmux send-keys -t "$SESSION:0.2" \
  "watch -n 2 'printf \"\\033[1m=== CONTENIDORS ===\\033[0m\n\"; docker ps --format \"table {{.Names}}\t{{.Status}}\t{{.Ports}}\"; printf \"\n\\033[1m=== ORIGINALS ===\\033[0m\n\"; ls -lh ~/Videos/VidioTestServer/originals/ 2>/dev/null || echo \"(buit)\"; printf \"\n\\033[1m=== TRANSCODATS ===\\033[0m\n\"; ls -lh ~/Videos/VidioTestServer/transcoded/ 2>/dev/null || echo \"(buit)\"'" Enter

tmux attach-session -t "$SESSION"
