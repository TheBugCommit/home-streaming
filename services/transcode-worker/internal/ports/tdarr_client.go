package ports

import (
	"context"

	"home-streaming/transcode-worker/internal/domain"
)

// TdarrClient correlates a known source file path with Tdarr's own internal notion of that
// file's transcode job. Tdarr scans its configured Library folders itself; nothing here ever
// asks Tdarr to start a job — only to report on one it already knows about.
//
// Tdarr's REST API is not documented to the same standard as qBittorrent's Web API, so the
// concrete query this interface's implementation performs should be treated as needing
// empirical verification against a running Tdarr instance (see internal/adapters/tdarr).
type TdarrClient interface {
	// FindJobStatus looks up the current status of the file at sourcePath. It returns
	// (nil, nil) if Tdarr does not know about this file yet (e.g. it hasn't scanned the
	// library folder yet), which the poller treats as "still queued, keep polling".
	FindJobStatus(ctx context.Context, sourcePath string) (*domain.TdarrJobStatus, error)
}
