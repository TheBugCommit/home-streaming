// Package domain holds the plain data types transcode-worker operates on, free of any
// NATS/HTTP/Tdarr-specific transport concerns.
package domain

import "time"

// Status mirrors the enum used in shared/events/schemas/media.transcode_status_changed.v1.json
// and media.transcoded.v1.json.
type Status string

const (
	StatusQueued      Status = "queued"
	StatusTranscoding Status = "transcoding"
	StatusCompleted   Status = "completed"
	StatusFailed      Status = "failed"
	StatusSkipped     Status = "skipped"
)

// PendingJob is what we learn from a media.transcode_pending event: a file we now expect
// Tdarr to pick up and eventually finish transcoding.
type PendingJob struct {
	TranscodeJobID string
	MediaItemID    string
	ContentType    string // movie | episode | track
	SourcePath     string
}

// TdarrJobStatus is the normalized result of correlating a PendingJob against Tdarr's own
// job/file records, independent of Tdarr's actual internal API shape.
type TdarrJobStatus struct {
	Status          Status
	OutputPath      string
	SizeBeforeBytes int64
	SizeAfterBytes  int64
	VideoCodec      string
	AudioCodec      string
	ContainerFormat string
	Detail          map[string]any
	ObservedAt      time.Time
}
