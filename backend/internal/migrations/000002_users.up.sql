create table public.users
(
    id            text                                      not null primary key,
    email         text                                      not null,
    password_hash text                                      not null,
    display_name  text,
    role          "UserRole"   default 'viewer'::"UserRole" not null,
    is_active     boolean      default true                 not null,
    created_at    timestamp(3) default CURRENT_TIMESTAMP    not null,
    updated_at    timestamp(3)                              not null
);
alter table public.users owner to homestream;
create unique index users_email_key on public.users (email);
