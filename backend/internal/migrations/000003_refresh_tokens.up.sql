create table public.refresh_tokens
(
    id         text                                   not null primary key,
    user_id    text                                   not null
        references public.users on update cascade on delete cascade,
    token_hash text                                   not null,
    expires_at timestamp(3)                           not null,
    revoked_at timestamp(3),
    created_at timestamp(3) default CURRENT_TIMESTAMP not null
);

alter table public.refresh_tokens owner to homestream;
create index refresh_tokens_user_id_idx on public.refresh_tokens (user_id);

