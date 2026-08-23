package httpserver

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/rs/zerolog"

	"homestream/torrent-worker/internal/domain"
	"homestream/torrent-worker/internal/service"
)

type completionHookBody struct {
	Hash     string `json:"hash"`
	Category string `json:"category"`
	SavePath string `json:"savePath"`
	Name     string `json:"name"`
}

func healthzHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}
}

func completionHookHandler(svc *service.CompletionService, log zerolog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body completionHookBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			log.Warn().Err(err).Msg("malformed completion hook body")
			http.Error(w, "malformed body", http.StatusBadRequest)
			return
		}

		evt := domain.CompletionEvent{
			Hash:     body.Hash,
			Category: domain.Category(body.Category),
			SavePath: body.SavePath,
			Name:     body.Name,
			Occurred: time.Now().UTC(),
		}

		if err := svc.HandleCompletion(r.Context(), evt); err != nil {
			http.Error(w, "failed to process completion", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusAccepted)
	}
}
