// Package events defines the Go structs for the event payloads this service publishes/consumes,
// mirroring shared/events/schemas/*.json field-for-field. Keep in sync with that directory.
package events

import "time"

const (
	SubjectTorrentEnqueue  = "torrent.enqueue"
	SubjectMediaDownloaded = "media.downloaded"
)

// TorrentEnqueue mirrors shared/events/schemas/torrent.enqueue.v1.json.
type TorrentEnqueue struct {
	RequestID         string `json:"requestId"`
	ContentType       string `json:"contentType"`
	Category          string `json:"category"`
	TorrentFileBase64 string `json:"torrentFileBase64"`
	SubmittedByUserID string `json:"submittedByUserId"`
	SubmittedAt       string `json:"submittedAt"`
}

// MediaDownloadedFile mirrors the "files" item schema in media.downloaded.v1.json.
type MediaDownloadedFile struct {
	RelativePath  string `json:"relativePath"`
	AbsolutePath  string `json:"absolutePath"`
	SizeBytes     int64  `json:"sizeBytes"`
	FileExtension string `json:"fileExtension"`
}

// MediaDownloaded mirrors shared/events/schemas/media.downloaded.v1.json.
type MediaDownloaded struct {
	TorrentHash string                `json:"torrentHash"`
	RequestID   string                `json:"requestId,omitempty"`
	ContentType string                `json:"contentType"`
	Category    string                `json:"category"`
	CompletedAt string                `json:"completedAt"`
	Files       []MediaDownloadedFile `json:"files"`
}

func NowRFC3339() string {
	return time.Now().UTC().Format(time.RFC3339)
}
