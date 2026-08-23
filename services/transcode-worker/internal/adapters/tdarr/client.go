// Package tdarr implements ports.TdarrClient against Tdarr's HTTP API.
//
// IMPORTANT / NEEDS EMPIRICAL VERIFICATION: unlike qBittorrent's Web API, Tdarr does not publish
// a stable, versioned API spec for querying an individual file's job status by source path. The
// endpoints and payload shapes below reflect the most consistent behavior observed across Tdarr's
// open-source server code and community tooling at the time this was written, but MUST be
// verified against a real running Tdarr instance (`docker compose up tdarr` then inspect
// requests made by the Tdarr web UI at localhost:8265 in the browser network tab) before relying
// on this in production. Two things are assumed that may not hold:
//
//  1. `POST /api/v2/client/status` returns currently-active worker records with a `file`/`path`
//     field that can be substring-matched against our known sourcePath.
//  2. `POST /api/v2/cruddb` can list a Library's known files via
//     {"data": {"collection": "<TdarrLibraryID>", "mode": "getAll"}}, and each file record
//     exposes enough of ffProbe's output (or Tdarr's own summarized fields) to fill in
//     video/audio codec, container, and before/after size once transcoding completes.
//
// Tdarr Library IDs (a Tdarr-internal id per Library, NOT the Jellyfin library ids this service
// already receives) are required to query #2 and are not currently plumbed into this service's
// environment — see README.md in this package for the env vars that need adding once verified.
package tdarr

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"home-streaming/transcode-worker/internal/domain"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
	// libraryIDs maps our contentType (movie/episode/track) to a Tdarr Library ID, so we know
	// which cruddb collection to search. Populated from TDARR_MOVIES_LIBRARY_ID /
	// TDARR_TV_LIBRARY_ID / TDARR_MUSIC_LIBRARY_ID if set; queries are skipped (job stays
	// "queued") for content types with no configured library id, rather than guessing wrong.
	libraryIDs map[string]string
}

func NewClient(baseURL string, libraryIDs map[string]string) *Client {
	return &Client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{Timeout: 15 * time.Second},
		libraryIDs: libraryIDs,
	}
}

type clientStatusWorker struct {
	File       string  `json:"file"`
	Percentage float64 `json:"percentage"`
}

type clientStatusResponse struct {
	Workers []clientStatusWorker `json:"workers"`
}

type cruddbFileRecord struct {
	File            string `json:"file"`
	FilePath        string `json:"_id"`
	TranscodeStatus string `json:"TranscodeDecisionMaker"`
	IsTranscoded    bool   `json:"transcode"`
	OutputFilePath  string `json:"outputFilePath"`
	SizeBefore      int64  `json:"file_size"`
	SizeAfter       int64  `json:"TranscodeOutputFileSize"`
	VideoCodec      string `json:"videoCodec"`
	AudioCodec      string `json:"audioCodec"`
	Container       string `json:"container"`
	HasError        bool   `json:"HasError"`
}

// FindJobStatus implements ports.TdarrClient.
func (c *Client) FindJobStatus(ctx context.Context, sourcePath string) (*domain.TdarrJobStatus, error) {
	if inProgress, err := c.isCurrentlyProcessing(ctx, sourcePath); err != nil {
		return nil, fmt.Errorf("checking active workers: %w", err)
	} else if inProgress {
		return &domain.TdarrJobStatus{Status: domain.StatusTranscoding, ObservedAt: time.Now().UTC()}, nil
	}

	rec, err := c.findFileRecord(ctx, sourcePath)
	if err != nil {
		return nil, fmt.Errorf("querying file record: %w", err)
	}
	if rec == nil {
		// Tdarr hasn't scanned/indexed this file yet.
		return nil, nil
	}
	if rec.HasError {
		return &domain.TdarrJobStatus{
			Status:     domain.StatusFailed,
			Detail:     map[string]any{"record": rec},
			ObservedAt: time.Now().UTC(),
		}, nil
	}
	if !rec.IsTranscoded {
		// Indexed, but not yet processed — still queued.
		return &domain.TdarrJobStatus{Status: domain.StatusQueued, ObservedAt: time.Now().UTC()}, nil
	}

	return &domain.TdarrJobStatus{
		Status:          domain.StatusCompleted,
		OutputPath:      rec.OutputFilePath,
		SizeBeforeBytes: rec.SizeBefore,
		SizeAfterBytes:  rec.SizeAfter,
		VideoCodec:      rec.VideoCodec,
		AudioCodec:      rec.AudioCodec,
		ContainerFormat: rec.Container,
		Detail:          map[string]any{"record": rec},
		ObservedAt:      time.Now().UTC(),
	}, nil
}

func (c *Client) isCurrentlyProcessing(ctx context.Context, sourcePath string) (bool, error) {
	var status clientStatusResponse
	if err := c.post(ctx, "/api/v2/client/status", map[string]any{}, &status); err != nil {
		return false, err
	}
	for _, w := range status.Workers {
		if w.File != "" && strings.Contains(w.File, sourcePath) {
			return true, nil
		}
	}
	return false, nil
}

func (c *Client) findFileRecord(ctx context.Context, sourcePath string) (*cruddbFileRecord, error) {
	libraryID := c.libraryIDForPath(sourcePath)
	if libraryID == "" {
		return nil, fmt.Errorf("no Tdarr library id configured for source path %q (set TDARR_MOVIES_LIBRARY_ID / TDARR_TV_LIBRARY_ID / TDARR_MUSIC_LIBRARY_ID)", sourcePath)
	}

	body := map[string]any{
		"data": map[string]any{
			"collection": libraryID,
			"mode":       "getAll",
		},
	}

	var records []cruddbFileRecord
	if err := c.post(ctx, "/api/v2/cruddb", body, &records); err != nil {
		return nil, err
	}
	for i := range records {
		if records[i].File == sourcePath || records[i].FilePath == sourcePath {
			return &records[i], nil
		}
	}
	return nil, nil
}

// libraryIDForPath infers which configured Tdarr library a source path belongs to by matching
// the /data/library/<category> prefix convention documented in tdarr/flows/README.md.
func (c *Client) libraryIDForPath(sourcePath string) string {
	switch {
	case strings.Contains(sourcePath, "/library/movies/"):
		return c.libraryIDs["movie"]
	case strings.Contains(sourcePath, "/library/tv/"):
		return c.libraryIDs["episode"]
	case strings.Contains(sourcePath, "/library/music/"):
		return c.libraryIDs["track"]
	default:
		return ""
	}
}

func (c *Client) post(ctx context.Context, path string, body any, out any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode >= 300 {
		return fmt.Errorf("tdarr %s returned %d: %s", path, resp.StatusCode, string(respBody))
	}
	if len(respBody) == 0 {
		return nil
	}
	return json.Unmarshal(respBody, out)
}
