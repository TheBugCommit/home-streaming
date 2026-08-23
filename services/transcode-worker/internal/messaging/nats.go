// Package messaging wires transcode-worker to NATS JetStream: consuming media.transcode_pending
// and publishing media.transcode_status_changed / media.transcoded, per shared/events/README.md.
package messaging

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"

	"home-streaming/transcode-worker/internal/domain"
	"home-streaming/transcode-worker/internal/ports"
)

const (
	streamName        = "HOMESTREAM_EVENTS"
	subjectPending    = "media.transcode_pending"
	subjectStatus     = "media.transcode_status_changed"
	subjectTranscoded = "media.transcoded"
	durableConsumer   = "transcode-worker"
	// AckWait must comfortably exceed the longest realistic CPU (no-GPU) transcode of a large
	// file; InProgress() heartbeats (see poller) reset this while actively polling so a job in
	// flight is never redelivered mid-work, only after a real crash/restart.
	ackWait = 2 * time.Hour
)

type Bus struct {
	nc     *nats.Conn
	js     jetstream.JetStream
	stream jetstream.Stream
}

func Connect(ctx context.Context, url string) (*Bus, error) {
	nc, err := nats.Connect(url, nats.Name("transcode-worker"))
	if err != nil {
		return nil, fmt.Errorf("connecting to nats: %w", err)
	}

	js, err := jetstream.New(nc)
	if err != nil {
		nc.Close()
		return nil, fmt.Errorf("creating jetstream context: %w", err)
	}

	stream, err := js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:     streamName,
		Subjects: []string{"torrent.>", "media.>"},
		Storage:  jetstream.FileStorage,
	})
	if err != nil {
		nc.Close()
		return nil, fmt.Errorf("ensuring stream %s: %w", streamName, err)
	}

	return &Bus{nc: nc, js: js, stream: stream}, nil
}

func (b *Bus) Close() {
	b.nc.Close()
}

// PendingHandler is invoked once per media.transcode_pending message. Implementations must call
// ack() only once the job has reached a terminal state (completed/failed/skipped) — see
// internal/correlation.Poller, which owns this lifecycle — and should call inProgress()
// periodically while still polling so JetStream doesn't redeliver a job that's simply slow.
type PendingHandler func(ctx context.Context, job domain.PendingJob, ack func(), inProgress func())

// ConsumePending sets up a durable pull consumer for media.transcode_pending and dispatches each
// message to handler. Because ack() is deferred to the handler until the job is done, a crash
// mid-transcode leaves the message unacked; JetStream redelivers it after ackWait, and the
// (idempotent) Tdarr correlation simply resumes — this is the restart-survival mechanism instead
// of a locally persisted state file.
func (b *Bus) ConsumePending(ctx context.Context, handler PendingHandler) error {
	cons, err := b.stream.CreateOrUpdateConsumer(ctx, jetstream.ConsumerConfig{
		Durable:       durableConsumer,
		FilterSubject: subjectPending,
		AckPolicy:     jetstream.AckExplicitPolicy,
		AckWait:       ackWait,
		MaxDeliver:    -1,
	})
	if err != nil {
		return fmt.Errorf("creating consumer for %s: %w", subjectPending, err)
	}

	_, err = cons.Consume(func(msg jetstream.Msg) {
		var job domain.PendingJob
		var wire struct {
			TranscodeJobID string `json:"transcodeJobId"`
			MediaItemID    string `json:"mediaItemId"`
			ContentType    string `json:"contentType"`
			SourcePath     string `json:"sourcePath"`
		}
		if err := json.Unmarshal(msg.Data(), &wire); err != nil {
			// Malformed payload: ack and drop rather than poison-pilling forever.
			_ = msg.Ack()
			return
		}
		job = domain.PendingJob{
			TranscodeJobID: wire.TranscodeJobID,
			MediaItemID:    wire.MediaItemID,
			ContentType:    wire.ContentType,
			SourcePath:     wire.SourcePath,
		}

		handler(ctx, job,
			func() { _ = msg.Ack() },
			func() { _ = msg.InProgress() },
		)
	})
	if err != nil {
		return fmt.Errorf("starting consume loop: %w", err)
	}
	return nil
}

// Publisher implements ports.EventPublisher over this Bus.
type Publisher struct {
	bus *Bus
}

func NewPublisher(bus *Bus) *Publisher {
	return &Publisher{bus: bus}
}

var _ ports.EventPublisher = (*Publisher)(nil)

func (p *Publisher) PublishTranscodeStatusChanged(ctx context.Context, evt ports.TranscodeStatusChangedEvent) error {
	return p.publish(ctx, subjectStatus, evt)
}

func (p *Publisher) PublishTranscoded(ctx context.Context, evt ports.TranscodedEvent) error {
	return p.publish(ctx, subjectTranscoded, evt)
}

func (p *Publisher) publish(ctx context.Context, subject string, evt any) error {
	payload, err := json.Marshal(evt)
	if err != nil {
		return fmt.Errorf("marshalling event for %s: %w", subject, err)
	}
	if _, err := p.bus.js.Publish(ctx, subject, payload); err != nil {
		return fmt.Errorf("publishing to %s: %w", subject, err)
	}
	return nil
}
