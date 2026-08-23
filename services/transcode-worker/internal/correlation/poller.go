// Package correlation implements the core responsibility of transcode-worker: given a file we
// know was handed to Tdarr's library folder, repeatedly ask Tdarr (never Tdarr's Flow engine
// itself, which is out of our control) what happened to it, and translate that into our own
// domain events.
package correlation

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"home-streaming/transcode-worker/internal/config"
	"home-streaming/transcode-worker/internal/domain"
	"home-streaming/transcode-worker/internal/ports"
)

type Poller struct {
	tdarr     ports.TdarrClient
	jellyfin  ports.JellyfinClient
	publisher ports.EventPublisher
	cfg       config.Config
	interval  time.Duration
	logger    *slog.Logger

	mu       sync.Mutex
	inFlight map[string]bool // keyed by transcodeJobId, guards against duplicate goroutines on redelivery
}

func NewPoller(tdarr ports.TdarrClient, jellyfin ports.JellyfinClient, publisher ports.EventPublisher, cfg config.Config, interval time.Duration, logger *slog.Logger) *Poller {
	return &Poller{
		tdarr:     tdarr,
		jellyfin:  jellyfin,
		publisher: publisher,
		cfg:       cfg,
		interval:  interval,
		logger:    logger,
		inFlight:  make(map[string]bool),
	}
}

// Handle implements messaging.PendingHandler. It blocks the calling goroutine (the NATS
// consumer's own dispatch goroutine) for the lifetime of the poll — jetstream.Consume already
// dispatches each message on its own goroutine, so this is safe and keeps the ack/inProgress
// closures trivially scoped to this one job.
func (p *Poller) Handle(ctx context.Context, job domain.PendingJob, ack func(), inProgress func()) {
	log := p.logger.With("mediaItemId", job.MediaItemID, "transcodeJobId", job.TranscodeJobID, "sourcePath", job.SourcePath)

	p.mu.Lock()
	if p.inFlight[job.TranscodeJobID] {
		p.mu.Unlock()
		log.Warn("duplicate delivery for already in-flight job, ignoring")
		return
	}
	p.inFlight[job.TranscodeJobID] = true
	p.mu.Unlock()
	defer func() {
		p.mu.Lock()
		delete(p.inFlight, job.TranscodeJobID)
		p.mu.Unlock()
	}()

	log.Info("tracking transcode job")

	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()

	var lastStatus domain.Status

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			inProgress()

			result, err := p.tdarr.FindJobStatus(ctx, job.SourcePath)
			if err != nil {
				log.Error("tdarr correlation query failed, will retry", "error", err)
				continue
			}
			if result == nil {
				continue // not indexed by Tdarr yet
			}

			if result.Status != lastStatus {
				lastStatus = result.Status
				if err := p.publisher.PublishTranscodeStatusChanged(ctx, ports.TranscodeStatusChangedEvent{
					TranscodeJobID: job.TranscodeJobID,
					MediaItemID:    job.MediaItemID,
					Status:         string(result.Status),
					Detail:         result.Detail,
					OccurredAt:     time.Now().UTC().Format(time.RFC3339),
				}); err != nil {
					log.Error("failed to publish transcode status change", "error", err)
				}
			}

			switch result.Status {
			case domain.StatusCompleted, domain.StatusSkipped:
				if err := p.publisher.PublishTranscoded(ctx, ports.TranscodedEvent{
					MediaItemID:     job.MediaItemID,
					TranscodeJobID:  job.TranscodeJobID,
					ContentType:     job.ContentType,
					OutputPath:      result.OutputPath,
					Status:          string(result.Status),
					SizeBeforeBytes: result.SizeBeforeBytes,
					SizeAfterBytes:  result.SizeAfterBytes,
					VideoCodec:      result.VideoCodec,
					AudioCodec:      result.AudioCodec,
					ContainerFormat: result.ContainerFormat,
					OccurredAt:      time.Now().UTC().Format(time.RFC3339),
				}); err != nil {
					log.Error("failed to publish media.transcoded", "error", err)
				}

				libraryID := p.cfg.LibraryIDFor(job.ContentType)
				if err := p.jellyfin.RefreshLibrary(ctx, libraryID); err != nil {
					log.Error("jellyfin library refresh failed", "error", err, "libraryId", libraryID)
				}

				log.Info("transcode job finished", "status", result.Status, "outputPath", result.OutputPath)
				ack()
				return

			case domain.StatusFailed:
				log.Error("tdarr reported transcode failure", "detail", result.Detail)
				ack() // terminal: don't keep polling a job Tdarr has given up on
				return
			}
		}
	}
}
