// Package jellyfin implements ports.JellyfinClient against Jellyfin's admin API.
package jellyfin

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

func NewClient(baseURL, apiKey string) *Client {
	return &Client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		apiKey:     apiKey,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// RefreshLibrary implements ports.JellyfinClient. Jellyfin's per-library refresh is
// POST /Items/{itemId}/Refresh (a library counts as an Item in Jellyfin's model); when no
// libraryID is configured yet we fall back to POST /Library/Refresh, a full library scan.
func (c *Client) RefreshLibrary(ctx context.Context, libraryID string) error {
	path := "/Library/Refresh"
	if libraryID != "" {
		path = fmt.Sprintf("/Items/%s/Refresh?Recursive=true&ImageRefreshMode=Default&MetadataRefreshMode=Default", libraryID)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-Emby-Token", c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("jellyfin %s returned %d: %s", path, resp.StatusCode, string(body))
	}
	return nil
}
