FROM golang:1.25-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/torrent-worker ./cmd/torrent-worker

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=builder /out/torrent-worker /usr/local/bin/torrent-worker
EXPOSE 8090
ENTRYPOINT ["/usr/local/bin/torrent-worker"]
