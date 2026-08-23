package config

import (
	"fmt"
	"os"
)

type Config struct {
	NATSURL             string
	QBittorrentURL      string
	QBittorrentUsername string
	QBittorrentPassword string
	HTTPPort            string
	PublicHookURL       string
}

func Load() (Config, error) {
	cfg := Config{
		NATSURL:             os.Getenv("NATS_URL"),
		QBittorrentURL:      os.Getenv("QBITTORRENT_URL"),
		QBittorrentUsername: os.Getenv("QBITTORRENT_USERNAME"),
		QBittorrentPassword: os.Getenv("QBITTORRENT_PASSWORD"),
		HTTPPort:            "8090",
	}
	if cfg.NATSURL == "" {
		return cfg, fmt.Errorf("NATS_URL is required")
	}
	if cfg.QBittorrentURL == "" {
		return cfg, fmt.Errorf("QBITTORRENT_URL is required")
	}
	cfg.PublicHookURL = "http://torrent-worker:" + cfg.HTTPPort + "/hooks/qbittorrent/completed"
	return cfg, nil
}
