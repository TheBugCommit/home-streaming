package ports

import "context"

// JellyfinClient triggers Jellyfin to notice newly-transcoded files. transcode-worker never
// touches the filesystem itself; Jellyfin's own scanner does the actual discovery once asked
// to refresh.
type JellyfinClient interface {
	// RefreshLibrary asks Jellyfin to rescan the library identified by libraryID. If
	// libraryID is empty (not configured yet), implementations should fall back to a
	// full-server refresh rather than erroring, since library ids are only known once an
	// operator has created the corresponding library in the Jellyfin dashboard.
	RefreshLibrary(ctx context.Context, libraryID string) error
}
