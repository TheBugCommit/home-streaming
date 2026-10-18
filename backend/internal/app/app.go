package app

import (
	"context"
	"home-streaming/backend/internal/config"
	"home-streaming/backend/internal/qbittorrent"
	"log/slog"
)

// App is the composition root: the one place that knows how every component is built and wired
// together. It owns the long-lived dependencies for the whole process lifetime.
//
// Nothing else constructs its own dependencies. A consumer receives what it needs through a
// constructor parameter (dependency injection); this file is where concrete implementations are
// chosen. That keeps wiring in one place and all other packages free of global state, which is what
// makes them testable — swap qbittorrent.Client for a fake and the consumer never notices.
type App struct {
	cfg    *config.Config
	logger *slog.Logger

	torrents qbittorrent.Client
}

// New builds the whole dependency graph. It performs no blocking I/O; Run does the work.
func New(cfg *config.Config, logger *slog.Logger) (*App, error) {
	torrents, err := qbittorrent.New(qbittorrent.Options{
		URL:      cfg.Qbittorrent.URL,
		APIKey:   cfg.Qbittorrent.APIKey,
	}, logger)

	if err != nil {
		return nil, err
	}

	return &App{
		cfg:      cfg,
		logger:   logger,
		torrents: torrents,
	}, nil
}

// Run starts every component and blocks until ctx is cancelled.
//
// As the pipeline grows, this is where the worker pool, HTTP server and job queue are started — each
// receiving its dependencies from the fields wired in New.
func (a *App) Run(ctx context.Context) error {
	a.logger.Info("starting worker",
		"env", a.cfg.Environment,
		"mediaPath", a.cfg.MediaPath,
	)

	version, err := a.torrents.ApplicationVersion(ctx)
	if err != nil {
		return err
	}
	a.logger.Info("connected to qBittorrent", "version", version)

	<-ctx.Done()
	a.logger.Info("shutting down", "reason", context.Cause(ctx))
	return nil
}
