package ports

import "context"

// EventPublisher publishes the two outbound event types transcode-worker owns, matching
// shared/events/schemas/media.transcode_status_changed.v1.json and
// shared/events/schemas/media.transcoded.v1.json exactly.
type EventPublisher interface {
	PublishTranscodeStatusChanged(ctx context.Context, evt TranscodeStatusChangedEvent) error
	PublishTranscoded(ctx context.Context, evt TranscodedEvent) error
}

type TranscodeStatusChangedEvent struct {
	TranscodeJobID string         `json:"transcodeJobId"`
	MediaItemID    string         `json:"mediaItemId"`
	Status         string         `json:"status"`
	Detail         map[string]any `json:"detail,omitempty"`
	OccurredAt     string         `json:"occurredAt"`
}

type TranscodedEvent struct {
	MediaItemID     string `json:"mediaItemId"`
	TranscodeJobID  string `json:"transcodeJobId"`
	ContentType     string `json:"contentType"`
	OutputPath      string `json:"outputPath"`
	Status          string `json:"status"`
	SizeBeforeBytes int64  `json:"sizeBeforeBytes"`
	SizeAfterBytes  int64  `json:"sizeAfterBytes"`
	VideoCodec      string `json:"videoCodec"`
	AudioCodec      string `json:"audioCodec"`
	ContainerFormat string `json:"containerFormat"`
	OccurredAt      string `json:"occurredAt"`
}
