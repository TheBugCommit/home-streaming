package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"

	"github.com/rs/zerolog"

	"homestream/torrent-worker/internal/domain"
	"homestream/torrent-worker/internal/events"
	"homestream/torrent-worker/internal/ports"
)

// EnqueueService handles torrent.enqueue commands from core-api: it decodes the uploaded .torrent
// and submits it to the torrent client under the right category/save path.
type EnqueueService struct {
	client ports.TorrentClient
	log    zerolog.Logger
}

func NewEnqueueService(client ports.TorrentClient, log zerolog.Logger) *EnqueueService {
	return &EnqueueService{client: client, log: log.With().Str("component", "enqueue_service").Logger()}
}

func (s *EnqueueService) HandleTorrentEnqueue(ctx context.Context, data []byte) error {
	var cmd events.TorrentEnqueue
	if err := json.Unmarshal(data, &cmd); err != nil {
		return fmt.Errorf("decode torrent.enqueue: %w", err)
	}

	category := domain.Category(cmd.Category)
	torrentBytes, err := base64.StdEncoding.DecodeString(cmd.TorrentFileBase64)
	if err != nil {
		return fmt.Errorf("decode torrentFileBase64: %w", err)
	}

	savePath := domain.SavePathForCategory(category)
	log := s.log.With().Str("requestId", cmd.RequestID).Str("category", cmd.Category).Logger()

	if _, err := s.client.Add(ctx, torrentBytes, category, savePath); err != nil {
		log.Error().Err(err).Msg("failed to add torrent to client")
		return err
	}

	log.Info().Msg("torrent submitted to client")
	return nil
}
