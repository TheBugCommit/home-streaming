package service

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/rs/zerolog"

	"homestream/torrent-worker/internal/domain"
	"homestream/torrent-worker/internal/events"
	"homestream/torrent-worker/internal/ports"
)

// CompletionService reacts to qBittorrent's "run external program on completion" hook: it looks up
// the torrent's files and publishes media.downloaded for core-api to pick up.
type CompletionService struct {
	client    ports.TorrentClient
	publisher ports.EventPublisher
	log       zerolog.Logger
}

func NewCompletionService(client ports.TorrentClient, publisher ports.EventPublisher, log zerolog.Logger) *CompletionService {
	return &CompletionService{client: client, publisher: publisher, log: log.With().Str("component", "completion_service").Logger()}
}

func (s *CompletionService) HandleCompletion(ctx context.Context, evt domain.CompletionEvent) error {
	log := s.log.With().Str("torrentHash", evt.Hash).Str("category", string(evt.Category)).Logger()

	contentType, ok := domain.ContentTypeForCategory(evt.Category)
	if !ok {
		return fmt.Errorf("unknown category %q for torrent %s", evt.Category, evt.Hash)
	}

	files, err := s.client.GetFiles(ctx, evt.Hash)
	if err != nil {
		log.Error().Err(err).Msg("failed to fetch torrent files")
		return err
	}

	payload := events.MediaDownloaded{
		TorrentHash: evt.Hash,
		RequestID:   evt.RequestID,
		ContentType: string(contentType),
		Category:    string(evt.Category),
		CompletedAt: events.NowRFC3339(),
		Files:       make([]events.MediaDownloadedFile, 0, len(files)),
	}
	for _, f := range files {
		payload.Files = append(payload.Files, events.MediaDownloadedFile{
			RelativePath:  f.RelativePath,
			AbsolutePath:  evt.SavePath + "/" + f.RelativePath,
			SizeBytes:     f.SizeBytes,
			FileExtension: f.FileExtension,
		})
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal media.downloaded: %w", err)
	}

	if err := s.publisher.Publish(ctx, events.SubjectMediaDownloaded, data); err != nil {
		log.Error().Err(err).Msg("failed to publish media.downloaded")
		return err
	}

	log.Info().Int("fileCount", len(payload.Files)).Msg("published media.downloaded")
	return nil
}
