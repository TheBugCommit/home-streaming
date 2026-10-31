create table public.api_keys
(
    id            text                                   not null primary key,
    owner_user_id text                                   not null
        references public.users on update cascade on delete cascade,
    name          text                                   not null,
    key_prefix    text                                   not null,
    key_hash      text                                   not null,
    scopes        jsonb        default '[]'::jsonb       not null,
    expires_at    timestamp(3),
    last_used_at  timestamp(3),
    revoked_at    timestamp(3),
    created_at    timestamp(3) default CURRENT_TIMESTAMP not null
);

alter table public.api_keys owner to homestream;
create index api_keys_owner_user_id_idx on public.api_keys (owner_user_id);
create unique index api_keys_key_prefix_key on public.api_keys (key_prefix);