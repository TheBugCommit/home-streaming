package qbittorrent

import (
	"context"
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"sync"
)

// sessionClient wraps an *http.Client whose cookie jar holds qBittorrent's SID session cookie,
// transparently re-authenticating on demand. qBittorrent's Web API uses cookie-based sessions
// rather than bearer tokens.
type sessionClient struct {
	baseURL  string
	username string
	password string

	mu     sync.Mutex
	client *http.Client
}

func newSessionClient(baseURL, username, password string) (*sessionClient, error) {
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, fmt.Errorf("create cookie jar: %w", err)
	}
	return &sessionClient{
		baseURL:  strings.TrimRight(baseURL, "/"),
		username: username,
		password: password,
		client:   &http.Client{Jar: jar},
	}, nil
}

func (s *sessionClient) login(ctx context.Context) error {
	form := url.Values{"username": {s.username}, "password": {s.password}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.baseURL+"/api/v2/auth/login", strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Referer", s.baseURL)

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("login request: %w", err)
	}
	defer resp.Body.Close()
	// qBittorrent's login endpoint has been observed returning both 200 (with body "Ok.") and 204
	// (no body) on success depending on version/build — treat any 2xx as success rather than
	// pinning to one status code, since the cookie jar already captures the session either way.
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("login failed: status %d", resp.StatusCode)
	}
	return nil
}

// do executes req, transparently logging in first if the client has no session yet, and retrying
// once after a fresh login if the server responds 403 (session expired).
func (s *sessionClient) do(ctx context.Context, buildReq func() (*http.Request, error)) (*http.Response, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	needsLogin := len(s.client.Jar.Cookies(mustParseURL(s.baseURL))) == 0
	if needsLogin {
		if err := s.login(ctx); err != nil {
			return nil, err
		}
	}

	req, err := buildReq()
	if err != nil {
		return nil, err
	}
	req.Header.Set("Referer", s.baseURL)
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode == http.StatusForbidden {
		resp.Body.Close()
		if err := s.login(ctx); err != nil {
			return nil, err
		}
		req, err = buildReq()
		if err != nil {
			return nil, err
		}
		req.Header.Set("Referer", s.baseURL)
		return s.client.Do(req)
	}

	return resp, nil
}

func mustParseURL(raw string) *url.URL {
	u, err := url.Parse(raw)
	if err != nil {
		return &url.URL{}
	}
	return u
}
