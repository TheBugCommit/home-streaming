package qbittorrent

import (
	"context"
	"fmt"
	"log/slog"

	qbt "github.com/TheBugCommit/go-qbittorrent-api/qbittorrent"
)

// Client is the port the rest of the application depends on.
//
// Keeping it an interface means consumers (the torrent watcher, API handlers) never import the
// third-party qbt library, and the implementation can be replaced with a fake in tests. Implemented
// by the unexported adapter below.
type Client interface {
	ApplicationVersion(ctx context.Context) (string, error)
}

// Options is what this adapter needs to connect. It deliberately does not import the config
// package, so infrastructure stays a self-contained detail that the composition root adapts.
type Options struct {
	URL    string
	APIKey string
}

type client struct {
	options Options
	qbt     *qbt.Client
	logger  *slog.Logger
}

// New builds a qBittorrent adapter. It performs no I/O; call Login to authenticate.
func New(options Options, logger *slog.Logger) (Client, error) {

	qbtClient, err := qbt.New(options.URL, qbt.WithAPIKey(options.APIKey))
	if err != nil {
		return nil, err
	}

	return &client{
		options: options,
		qbt:     qbtClient,
		logger:  logger.With("component", "qbittorrent"),
	}, nil
}

func (c *client) ApplicationVersion(ctx context.Context) (string, error) {
	version, err := c.qbt.Version(ctx)
	if err != nil {
		return "", fmt.Errorf("qBittorrent application version: %w", err)
	}
	return version, nil
}
