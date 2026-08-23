package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog"

	"homestream/torrent-worker/internal/adapters/qbittorrent"
	"homestream/torrent-worker/internal/config"
	"homestream/torrent-worker/internal/domain"
	"homestream/torrent-worker/internal/events"
	"homestream/torrent-worker/internal/httpserver"
	"homestream/torrent-worker/internal/messaging"
	"homestream/torrent-worker/internal/service"
)

func main() {
	log := zerolog.New(os.Stdout).With().Timestamp().Str("service", "torrent-worker").Logger()

	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("invalid configuration")
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	qbClient, err := qbittorrent.New(cfg.QBittorrentURL, cfg.QBittorrentUsername, cfg.QBittorrentPassword)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to build qbittorrent client")
	}

	// qBittorrent's WebUI can take longer to come up than this container (compose's `depends_on`
	// only orders container start, not app readiness), so retry with backoff instead of giving up
	// after one attempt. Bootstrap is idempotent, so retrying is always safe.
	if err := bootstrapWithRetry(ctx, qbClient, cfg, log); err != nil {
		log.Error().Err(err).Msg("qbittorrent bootstrap did not succeed before startup deadline; retrying in background")
		go func() {
			for {
				select {
				case <-ctx.Done():
					return
				case <-time.After(30 * time.Second):
				}
				if err := bootstrapQBittorrent(ctx, qbClient, cfg, log); err == nil {
					return
				}
				log.Warn().Msg("qbittorrent bootstrap retry failed; will try again")
			}
		}()
	}

	bus, err := messaging.Connect(ctx, cfg.NATSURL)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to nats")
	}
	defer bus.Close()

	enqueueSvc := service.NewEnqueueService(qbClient, log)
	completionSvc := service.NewCompletionService(qbClient, bus, log)

	if err := bus.Subscribe(ctx, events.SubjectTorrentEnqueue, "torrent-worker-enqueue", enqueueSvc.HandleTorrentEnqueue); err != nil {
		log.Fatal().Err(err).Msg("failed to subscribe to torrent.enqueue")
	}

	router := httpserver.NewRouter(completionSvc, log)
	srv := &http.Server{
		Addr:              ":" + cfg.HTTPPort,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Info().Str("port", cfg.HTTPPort).Msg("starting http server")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("http server failed")
		}
	}()

	<-ctx.Done()
	log.Info().Msg("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}

// bootstrapWithRetry retries bootstrapQBittorrent with exponential backoff for up to ~1 minute
// (covers normal container startup jitter) before giving up and handing off to a slower background
// retry loop, so torrent-worker never needs a manual restart just because qBittorrent was slow.
func bootstrapWithRetry(ctx context.Context, client *qbittorrent.Client, cfg config.Config, log zerolog.Logger) error {
	backoff := 2 * time.Second
	const maxBackoff = 16 * time.Second
	deadline := time.Now().Add(60 * time.Second)

	for {
		err := bootstrapQBittorrent(ctx, client, cfg, log)
		if err == nil {
			return nil
		}
		if time.Now().After(deadline) {
			return err
		}
		log.Warn().Err(err).Dur("retryIn", backoff).Msg("qbittorrent not ready yet; retrying bootstrap")
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(backoff):
		}
		if backoff < maxBackoff {
			backoff *= 2
		}
	}
}

// bootstrapQBittorrent idempotently configures categories, the incomplete-downloads directory,
// and the on-completion webhook. Safe to run on every container start.
func bootstrapQBittorrent(ctx context.Context, client *qbittorrent.Client, cfg config.Config, log zerolog.Logger) error {
	categories := []domain.Category{domain.CategoryMovies, domain.CategoryTV, domain.CategoryMusic}
	for _, cat := range categories {
		if err := client.EnsureCategory(ctx, cat, domain.SavePathForCategory(cat)); err != nil {
			return fmt.Errorf("ensure category %s: %w", cat, err)
		}
	}

	if err := client.ConfigureIncompleteDir(ctx, "/data/incoming"); err != nil {
		return fmt.Errorf("configure incomplete dir: %w", err)
	}

	hookCmd := fmt.Sprintf(
		`curl -s -X POST %s -H "Content-Type: application/json" -d "{\"hash\":\"%%I\",\"category\":\"%%L\",\"savePath\":\"%%F\",\"name\":\"%%N\"}"`,
		cfg.PublicHookURL,
	)
	if err := client.ConfigureCompletionHook(ctx, hookCmd); err != nil {
		return fmt.Errorf("configure completion hook: %w", err)
	}

	log.Info().Msg("qbittorrent bootstrap complete")
	return nil
}
