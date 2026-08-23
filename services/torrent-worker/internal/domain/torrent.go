package domain

import "time"

// Category is the qBittorrent category label, which doubles as the on-disk save-path segment
// under /data/library/<category>.
type Category string

const (
	CategoryMovies Category = "movies"
	CategoryTV     Category = "tv"
	CategoryMusic  Category = "music"
)

// ContentType is the value used on the event bus (torrent.enqueue / media.downloaded), distinct
// from Category only in that "tv" content maps 1:1 but is named separately for readability at the
// event-contract boundary (see shared/events/schemas).
type ContentType string

const (
	ContentTypeMovie ContentType = "movie"
	ContentTypeTV    ContentType = "tv"
	ContentTypeMusic ContentType = "music"
)

func CategoryForContentType(ct ContentType) (Category, bool) {
	switch ct {
	case ContentTypeMovie:
		return CategoryMovies, true
	case ContentTypeTV:
		return CategoryTV, true
	case ContentTypeMusic:
		return CategoryMusic, true
	default:
		return "", false
	}
}

func ContentTypeForCategory(c Category) (ContentType, bool) {
	switch c {
	case CategoryMovies:
		return ContentTypeMovie, true
	case CategoryTV:
		return ContentTypeTV, true
	case CategoryMusic:
		return ContentTypeMusic, true
	default:
		return "", false
	}
}

func SavePathForCategory(c Category) string {
	return "/data/library/" + string(c)
}

// FileInfo describes a single file belonging to a completed torrent, as reported by qBittorrent's
// torrents/files endpoint.
type FileInfo struct {
	RelativePath  string
	AbsolutePath  string
	SizeBytes     int64
	FileExtension string
}

// TorrentInfo is a snapshot of a torrent's state as tracked by qBittorrent.
type TorrentInfo struct {
	Hash     string
	Name     string
	Category Category
	Progress float64
	State    string
}

// CompletionEvent is the payload torrent-worker's own HTTP hook receives from qBittorrent's
// "run external program on completion" trigger.
type CompletionEvent struct {
	Hash      string
	Category  Category
	SavePath  string
	Name      string
	Occurred  time.Time
	RequestID string // best-effort correlation; empty when unknown
}
