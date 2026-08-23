package ports

import "context"

// EventPublisher abstracts the event bus (NATS JetStream today) so services/messaging is the only
// package that knows about NATS specifics.
type EventPublisher interface {
	Publish(ctx context.Context, subject string, payload []byte) error
}

// EventSubscriber abstracts durable, at-least-once subscription to a subject.
type EventSubscriber interface {
	// Subscribe registers a durable JetStream consumer on subject and invokes handler for each
	// message. handler returning nil acks the message; a non-nil error leaves it for redelivery.
	Subscribe(ctx context.Context, subject, durableName string, handler func(ctx context.Context, data []byte) error) error
}
