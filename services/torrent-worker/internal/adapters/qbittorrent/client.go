// Package qbittorrent implements ports.TorrentClient against qBittorrent's Web API
// (https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-4.1)).
package qbittorrent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"

	"homestream/torrent-worker/internal/domain"
)

type Client struct {
	session *sessionClient
	baseURL string
}

func New(baseURL, username, password string) (*Client, error) {
	sc, err := newSessionClient(baseURL, username, password)
	if err != nil {
		return nil, err
	}
	return &Client{session: sc, baseURL: strings.TrimRight(baseURL, "/")}, nil
}

func (c *Client) EnsureCategory(ctx context.Context, category domain.Category, savePath string) error {
	form := url.Values{"category": {string(category)}, "savePath": {savePath}}
	resp, err := c.session.do(ctx, func() (*http.Request, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/v2/torrents/createCategory", strings.NewReader(form.Encode()))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		return req, nil
	})
	if err != nil {
		return fmt.Errorf("createCategory %s: %w", category, err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	// qBittorrent returns 409 when the category already exists with a different save path, and
	// plain 200 with body "Category already exists." in some older versions — both are fine, this
	// call must be idempotent across restarts.
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusConflict {
		return fmt.Errorf("createCategory %s: unexpected status %d: %s", category, resp.StatusCode, string(body))
	}
	return nil
}

func (c *Client) ConfigureIncompleteDir(ctx context.Context, path string) error {
	return c.setPreferences(ctx, map[string]interface{}{
		"temp_path_enabled": true,
		"temp_path":         path,
	})
}

func (c *Client) ConfigureCompletionHook(ctx context.Context, command string) error {
	return c.setPreferences(ctx, map[string]interface{}{
		"autorun_enabled": true,
		"autorun_program": command,
	})
}

func (c *Client) setPreferences(ctx context.Context, prefs map[string]interface{}) error {
	raw, err := json.Marshal(prefs)
	if err != nil {
		return err
	}
	form := url.Values{"json": {string(raw)}}
	resp, err := c.session.do(ctx, func() (*http.Request, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/v2/app/setPreferences", strings.NewReader(form.Encode()))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		return req, nil
	})
	if err != nil {
		return fmt.Errorf("setPreferences: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("setPreferences: unexpected status %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

func (c *Client) Add(ctx context.Context, torrentBytes []byte, category domain.Category, savePath string) (string, error) {
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	if err := writer.WriteField("category", string(category)); err != nil {
		return "", err
	}
	if err := writer.WriteField("savepath", savePath); err != nil {
		return "", err
	}
	if err := writer.WriteField("autoTMM", "false"); err != nil {
		return "", err
	}
	part, err := writer.CreateFormFile("torrents", "upload.torrent")
	if err != nil {
		return "", err
	}
	if _, err := part.Write(torrentBytes); err != nil {
		return "", err
	}
	if err := writer.Close(); err != nil {
		return "", err
	}

	contentType := writer.FormDataContentType()
	bodyBytes := buf.Bytes()

	resp, err := c.session.do(ctx, func() (*http.Request, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/v2/torrents/add", bytes.NewReader(bodyBytes))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", contentType)
		return req, nil
	})
	if err != nil {
		return "", fmt.Errorf("torrents/add: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("torrents/add: unexpected status %d: %s", resp.StatusCode, string(respBody))
	}
	if strings.Contains(string(respBody), "Fails.") {
		return "", fmt.Errorf("torrents/add: qbittorrent rejected the torrent: %s", string(respBody))
	}

	// qBittorrent's /add endpoint doesn't return the hash directly; the caller is expected to
	// resolve it afterwards via GetInfo. We surface an empty hash here — the completion webhook
	// is the actual source of truth for hash-to-request correlation (see completion_service.go).
	return "", nil
}

type qbFile struct {
	Name string `json:"name"`
	Size int64  `json:"size"`
}

func (c *Client) GetFiles(ctx context.Context, hash string) ([]domain.FileInfo, error) {
	q := url.Values{"hash": {hash}}
	resp, err := c.session.do(ctx, func() (*http.Request, error) {
		return http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/api/v2/torrents/files?"+q.Encode(), nil)
	})
	if err != nil {
		return nil, fmt.Errorf("torrents/files: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("torrents/files: unexpected status %d: %s", resp.StatusCode, string(body))
	}

	var files []qbFile
	if err := json.NewDecoder(resp.Body).Decode(&files); err != nil {
		return nil, fmt.Errorf("decode torrents/files: %w", err)
	}

	out := make([]domain.FileInfo, 0, len(files))
	for _, f := range files {
		out = append(out, domain.FileInfo{
			RelativePath:  f.Name,
			AbsolutePath:  f.Name, // caller joins with the category save path if it needs an absolute path
			SizeBytes:     f.Size,
			FileExtension: strings.TrimPrefix(filepath.Ext(f.Name), "."),
		})
	}
	return out, nil
}

type qbTorrentInfo struct {
	Hash     string  `json:"hash"`
	Name     string  `json:"name"`
	Category string  `json:"category"`
	Progress float64 `json:"progress"`
	State    string  `json:"state"`
}

func (c *Client) GetInfo(ctx context.Context, hash string) (domain.TorrentInfo, error) {
	q := url.Values{"hashes": {hash}}
	resp, err := c.session.do(ctx, func() (*http.Request, error) {
		return http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/api/v2/torrents/info?"+q.Encode(), nil)
	})
	if err != nil {
		return domain.TorrentInfo{}, fmt.Errorf("torrents/info: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return domain.TorrentInfo{}, fmt.Errorf("torrents/info: unexpected status %d: %s", resp.StatusCode, string(body))
	}

	var infos []qbTorrentInfo
	if err := json.NewDecoder(resp.Body).Decode(&infos); err != nil {
		return domain.TorrentInfo{}, fmt.Errorf("decode torrents/info: %w", err)
	}
	if len(infos) == 0 {
		return domain.TorrentInfo{}, fmt.Errorf("torrent %s not found", hash)
	}

	info := infos[0]
	return domain.TorrentInfo{
		Hash:     info.Hash,
		Name:     info.Name,
		Category: domain.Category(info.Category),
		Progress: info.Progress,
		State:    info.State,
	}, nil
}
