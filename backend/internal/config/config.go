package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// envPrefix namespaces every variable. Leave it empty to read the bare names from .env.example;
// set it (e.g. "HOMESTREAM_") if the process ever shares an environment with unrelated variables.
const envPrefix = ""

// Config is the single, fully validated source of truth for the process configuration.
//
// The rest of the application never calls os.Getenv: everything is read once, here, parsed into
// typed values and validated, so the process either starts with a complete configuration or fails
// immediately with a clear, aggregated error (fail-fast).
type Config struct {
	Environment string
	MediaPath   string
	Timezone    string

	DatabaseURL string

	Qbittorrent Qbittorrent
	Auth        Auth
	TMDb        TMDb
	Jellyfin    Jellyfin
	HTTP        HTTP
	Transcode   Transcode
}

// Qbittorrent holds the connection details for the qBittorrent Web API.
type Qbittorrent struct {
	URL    string
	APIKey string
}

// Auth holds everything needed to issue sessions and bootstrap the first admin.
type Auth struct {
	JWTSecret       string
	AccessTokenTTL  time.Duration
	RefreshTokenTTL time.Duration
	AdminEmail      string
	AdminPassword   string
}

// TMDb holds the metadata provider credentials.
type TMDb struct {
	APIKey string
}

// Jellyfin holds the Jellyfin connection and the library ids it targets.
type Jellyfin struct {
	URL             string
	APIKey          string
	MoviesLibraryID string
	TVLibraryID     string
}

// HTTP holds the public API listener settings.
type HTTP struct {
	Addr        string
	Debug       bool
	CORSOrigins []string
}

// Transcode holds the hardware endpoints used by the ffmpeg runner.
type Transcode struct {
	RenderDevice string
	RenderGID    int
}

// Load reads and validates the configuration from the process environment.
//
// It reads every variable and collects *all* problems before returning, so a misconfigured
// deployment reports every missing or invalid variable at once instead of one per run.
func Load() (*Config, error) {
	var errs []error

	// required returns the value (trimmed) and records an error when it is unset or empty.
	required := func(key string) string {
		v := strings.TrimSpace(os.Getenv(envPrefix + key))
		if v == "" {
			errs = append(errs, fmt.Errorf("%s is required", envPrefix+key))
		}
		return v
	}
	// optional returns the value, or def when the variable is unset or empty.
	optional := func(key, def string) string {
		if v := strings.TrimSpace(os.Getenv(envPrefix + key)); v != "" {
			return v
		}
		return def
	}

	cfg := &Config{
		Environment: optional("APP_ENV", "development"),
		MediaPath:   required("MEDIA_PATH"),
		Timezone:    optional("TZ", "UTC"),
		DatabaseURL: required("DATABASE_URL"),
		Qbittorrent: Qbittorrent{
			URL:    required("QBITTORRENT_URL"),
			APIKey: required("QBITTORRENT_API_KEY"),
		},
		Auth: Auth{
			JWTSecret:     required("JWT_SECRET"),
			AdminEmail:    required("ADMIN_EMAIL"),
			AdminPassword: required("ADMIN_INITIAL_PASSWORD"),
		},
		TMDb: TMDb{
			APIKey: required("TMDB_API_KEY"),
		},
		Jellyfin: Jellyfin{
			URL:             optional("JELLYFIN_URL", "http://localhost:8096"),
			APIKey:          required("JELLYFIN_API_KEY"),
			MoviesLibraryID: optional("JELLYFIN_MOVIES_LIBRARY_ID", ""),
			TVLibraryID:     optional("JELLYFIN_TV_LIBRARY_ID", ""),
		},
		HTTP: HTTP{
			Addr:        optional("HTTP_ADDR", ":3000"),
			Debug:       optional("APP_ENV", "development") == "development",
			CORSOrigins: splitCSV(optional("CORS_ORIGINS", "")),
		},
		Transcode: Transcode{
			RenderDevice: optional("RENDER_DEVICE", "/dev/dri/renderD128"),
		},
	}

	if d, err := duration("ACCESS_TOKEN_TTL", 15*time.Minute); err != nil {
		errs = append(errs, err)
	} else {
		cfg.Auth.AccessTokenTTL = d
	}
	if d, err := duration("REFRESH_TOKEN_TTL", 720*time.Hour); err != nil {
		errs = append(errs, err)
	} else {
		cfg.Auth.RefreshTokenTTL = d
	}
	if gid, err := integer("RENDER_GID", 0); err != nil {
		errs = append(errs, err)
	} else {
		cfg.Transcode.RenderGID = gid
	}

	if err := errors.Join(errs...); err != nil {
		return nil, fmt.Errorf("invalid configuration:\n%w", err)
	}
	return cfg, nil
}

// duration parses a Go duration string (e.g. "15m", "720h") and falls back to def when unset.
func duration(key string, def time.Duration) (time.Duration, error) {
	raw := strings.TrimSpace(os.Getenv(envPrefix + key))
	if raw == "" {
		return def, nil
	}
	d, err := time.ParseDuration(raw)
	if err != nil {
		return 0, fmt.Errorf("%s: %q is not a valid duration (e.g. 15m, 720h): %w", envPrefix+key, raw, err)
	}
	return d, nil
}

// integer parses an int and falls back to def when unset.
func integer(key string, def int) (int, error) {
	raw := strings.TrimSpace(os.Getenv(envPrefix + key))
	if raw == "" {
		return def, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("%s: %q is not a valid integer: %w", envPrefix+key, raw, err)
	}
	return n, nil
}

// splitCSV turns "a,b , c" into ["a", "b", "c"], dropping empty entries.
func splitCSV(raw string) []string {
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
