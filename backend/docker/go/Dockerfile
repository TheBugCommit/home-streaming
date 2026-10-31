FROM golang:1.27-bookworm

# 1. Corregim la línia per activar els repositoris non-free al format modern de Debian Bookworm
RUN sed -i 's/Components: main/Components: main contrib non-free non-free-firmware/g' /etc/apt/sources.list.d/debian.sources

# 2. Instal·lem utilitzant els noms exactes de paquets de Debian
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    intel-media-va-driver-non-free \
    libva-drm2 \
    libva2 \
    va-driver-all \
    vainfo \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

CMD ["go", "run", "cmd/server/main.go"]
