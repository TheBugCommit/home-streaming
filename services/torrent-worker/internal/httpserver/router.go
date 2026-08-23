package httpserver

import (
	"net/http"

	"github.com/rs/zerolog"

	"homestream/torrent-worker/internal/service"
)

func NewRouter(completionSvc *service.CompletionService, log zerolog.Logger) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", healthzHandler())
	mux.HandleFunc("POST /hooks/qbittorrent/completed", completionHookHandler(completionSvc, log))
	return mux
}
