package ports

import (
	"context"

	"homestream/torrent-worker/internal/domain"
)

// TorrentClient abstracts the torrent backend (qBittorrent today). Swapping to Transmission/Deluge
// later only requires a new adapter implementing this interface — the rest of the service is
// unaware of which backend is in use (Adapter/Strategy pattern).
type TorrentClient interface {
	// EnsureCategory creates the category with the given save path if it doesn't already exist.
	// Must be idempotent — safe to call on every startup.
	EnsureCategory(ctx context.Context, category domain.Category, savePath string) error

	// ConfigureIncompleteDir sets the global staging directory for in-progress downloads.
	ConfigureIncompleteDir(ctx context.Context, path string) error

	// ConfigureCompletionHook sets the "run external program on completion" preference to invoke
	// the given shell command, with qBittorrent's %I/%L/%F/%N placeholders.
	ConfigureCompletionHook(ctx context.Context, command string) error

	// Add submits a new torrent for download under the given category/save path, returning its hash.
	Add(ctx context.Context, torrentBytes []byte, category domain.Category, savePath string) (hash string, err error)

	// GetFiles returns the files belonging to a torrent (by hash).
	GetFiles(ctx context.Context, hash string) ([]domain.FileInfo, error)

	// GetInfo returns the current tracked state of a torrent (by hash).
	GetInfo(ctx context.Context, hash string) (domain.TorrentInfo, error)
}
