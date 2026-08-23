// Kept in their own file (no dependents importing each other) to avoid a circular-import cycle
// between nats-client.module.ts and the publisher/subscribers that need these tokens — a cycle
// there left @Inject() tokens undefined at class-decoration time.
export const NATS_CONNECTION = Symbol('NATS_CONNECTION');
export const JETSTREAM_CLIENT = Symbol('JETSTREAM_CLIENT');
export const JSON_CODEC = Symbol('JSON_CODEC');

export const STREAM_NAME = 'HOMESTREAM_EVENTS';
export const STREAM_SUBJECTS = ['torrent.>', 'media.>'];
