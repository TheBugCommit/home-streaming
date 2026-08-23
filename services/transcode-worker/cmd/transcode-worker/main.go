// Command transcode-worker correlates files handed to Tdarr's library folders with Tdarr's own
// transcode job lifecycle, and notifies Jellyfin once a file is ready to be served. It never
// triggers a transcode itself — see internal/correlation for the full rationale.
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"home-streaming/transcode-worker/internal/adapters/jellyfin"
	"home-streaming/transcode-worker/internal/adapters/tdarr"
	"home-streaming/transcode-worker/internal/config"
	"home-streaming/transcode-worker/internal/correlation"
	"home-streaming/transcode-worker/internal/domain"
	"home-streaming/transcode-worker/internal/messaging"
)

const pollInterval = 15 * time.Second

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil)).With("service", "transcode-worker")
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("invalid configuration", "error", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	bus, err := connectWithRetry(ctx, cfg.NATSURL, logger)
	if err != nil {
		logger.Error("could not connect to NATS", "error", err)
		os.Exit(1)
	}
	defer bus.Close()

	tdarrClient := tdarr.NewClient(cfg.TdarrURL, cfg.TdarrLibraryIDs())
	jellyfinClient := jellyfin.NewClient(cfg.JellyfinURL, cfg.JellyfinKey)
	publisher := messaging.NewPublisher(bus)

	poller := correlation.NewPoller(tdarrClient, jellyfinClient, publisher, cfg, pollInterval, logger)

	handler := func(ctx context.Context, job domain.PendingJob, ack func(), inProgress func()) {
		poller.Handle(ctx, job, ack, inProgress)
	}

	if err := bus.ConsumePending(ctx, handler); err != nil {
		logger.Error("failed to start consuming media.transcode_pending", "error", err)
		os.Exit(1)
	}

	logger.Info("transcode-worker started", "tdarrUrl", cfg.TdarrURL, "jellyfinUrl", cfg.JellyfinURL)

	<-ctx.Done()
	logger.Info("shutting down")
}

// connectWithRetry tolerates NATS not being up yet at container start (compose brings services up
// concurrently; there's no strict startup ordering guarantee beyond depends_on's container-ready,
// not application-ready).
func connectWithRetry(ctx context.Context, url string, logger *slog.Logger) (*messaging.Bus, error) {
	var lastErr error
	for attempt := 1; attempt <= 10; attempt++ {
		bus, err := messaging.Connect(ctx, url)
		if err == nil {
			return bus, nil
		}
		lastErr = err
		logger.Warn("nats connect failed, retrying", "attempt", attempt, "error", err)
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(3 * time.Second):
		}
	}
	return nil, lastErr
}
