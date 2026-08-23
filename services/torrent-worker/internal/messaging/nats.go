// Package messaging implements ports.EventPublisher/EventSubscriber against NATS JetStream.
package messaging

import (
	"context"
	"fmt"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

const StreamName = "HOMESTREAM_EVENTS"

type NATSBus struct {
	conn *nats.Conn
	js   jetstream.JetStream
}

func Connect(ctx context.Context, url string) (*NATSBus, error) {
	nc, err := nats.Connect(url, nats.MaxReconnects(-1))
	if err != nil {
		return nil, fmt.Errorf("connect nats: %w", err)
	}
	js, err := jetstream.New(nc)
	if err != nil {
		nc.Close()
		return nil, fmt.Errorf("init jetstream: %w", err)
	}

	_, err = js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:      StreamName,
		Subjects:  []string{"torrent.>", "media.>"},
		Retention: jetstream.LimitsPolicy,
		Storage:   jetstream.FileStorage,
	})
	if err != nil {
		nc.Close()
		return nil, fmt.Errorf("ensure stream %s: %w", StreamName, err)
	}

	return &NATSBus{conn: nc, js: js}, nil
}

func (b *NATSBus) Close() {
	b.conn.Close()
}

func (b *NATSBus) Publish(ctx context.Context, subject string, payload []byte) error {
	_, err := b.js.Publish(ctx, subject, payload)
	if err != nil {
		return fmt.Errorf("publish %s: %w", subject, err)
	}
	return nil
}

func (b *NATSBus) Subscribe(ctx context.Context, subject, durableName string, handler func(ctx context.Context, data []byte) error) error {
	cons, err := b.js.CreateOrUpdateConsumer(ctx, StreamName, jetstream.ConsumerConfig{
		Durable:       durableName,
		FilterSubject: subject,
		AckPolicy:     jetstream.AckExplicitPolicy,
	})
	if err != nil {
		return fmt.Errorf("create consumer %s: %w", durableName, err)
	}

	_, err = cons.Consume(func(msg jetstream.Msg) {
		if err := handler(ctx, msg.Data()); err != nil {
			_ = msg.Nak()
			return
		}
		_ = msg.Ack()
	})
	if err != nil {
		return fmt.Errorf("consume %s: %w", durableName, err)
	}
	return nil
}
