from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="", case_sensitive=True)

    NATS_URL: str = "nats://nats:4222"
    CORE_API_INTERNAL_URL: str = "http://core-api:3000"
    INTERNAL_API_KEY: str = ""
    TMDB_API_KEY: str = ""
    MUSICBRAINZ_CONTACT: str = "example@example.com"

    # Root of the writable TV output mount (see docker-compose.yml metadata-service volumes).
    TV_STREAMABLE_ROOT: str = "/data/streamable/tv"

    NATS_STREAM_NAME: str = "HOMESTREAM_EVENTS"
    NATS_CONSUMER_NAME: str = "metadata-service"
    NATS_SUBJECT_TRANSCODED: str = "media.transcoded"
    NATS_SUBJECT_ENRICHED: str = "media.metadata_enriched"


settings = Settings()
