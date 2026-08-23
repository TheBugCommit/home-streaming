// Package config loads transcode-worker's process configuration from environment variables.
package config

import (
	"fmt"
	"os"
)

type Config struct {
	NATSURL     string
	TdarrURL    string
	JellyfinURL string
	JellyfinKey string
	MoviesLibID string
	TVLibID     string
	MusicLibID  string

	// Tdarr-internal library ids (NOT the Jellyfin ones above), needed by the cruddb query
	// in internal/adapters/tdarr. Not yet wired into docker-compose.yml's transcode-worker
	// environment block — see internal/adapters/tdarr/client.go doc comment. Optional: a
	// missing entry just means that content type's jobs stay correlated as "queued" only via
	// the active-worker check, never resolving to "completed", until this is set.
	TdarrMoviesLibID string
	TdarrTVLibID     string
	TdarrMusicLibID  string
}

func Load() (Config, error) {
	cfg := Config{
		NATSURL:          os.Getenv("NATS_URL"),
		TdarrURL:         os.Getenv("TDARR_SERVER_URL"),
		JellyfinURL:      os.Getenv("JELLYFIN_URL"),
		JellyfinKey:      os.Getenv("JELLYFIN_API_KEY"),
		MoviesLibID:      os.Getenv("JELLYFIN_MOVIES_LIBRARY_ID"),
		TVLibID:          os.Getenv("JELLYFIN_TV_LIBRARY_ID"),
		MusicLibID:       os.Getenv("JELLYFIN_MUSIC_LIBRARY_ID"),
		TdarrMoviesLibID: os.Getenv("TDARR_MOVIES_LIBRARY_ID"),
		TdarrTVLibID:     os.Getenv("TDARR_TV_LIBRARY_ID"),
		TdarrMusicLibID:  os.Getenv("TDARR_MUSIC_LIBRARY_ID"),
	}

	for name, val := range map[string]string{
		"NATS_URL":         cfg.NATSURL,
		"TDARR_SERVER_URL": cfg.TdarrURL,
		"JELLYFIN_URL":     cfg.JellyfinURL,
	} {
		if val == "" {
			return cfg, fmt.Errorf("missing required env var %s", name)
		}
	}

	return cfg, nil
}

// LibraryIDFor maps an event contentType (movie/episode/track) to the Jellyfin library id
// that should be refreshed once transcoding for that item completes.
func (c Config) LibraryIDFor(contentType string) string {
	switch contentType {
	case "movie":
		return c.MoviesLibID
	case "episode":
		return c.TVLibID
	case "track":
		return c.MusicLibID
	default:
		return ""
	}
}

// TdarrLibraryIDs returns the contentType -> Tdarr library id map consumed by the tdarr adapter.
func (c Config) TdarrLibraryIDs() map[string]string {
	return map[string]string{
		"movie":   c.TdarrMoviesLibID,
		"episode": c.TdarrTVLibID,
		"track":   c.TdarrMusicLibID,
	}
}
