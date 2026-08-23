-- Bibliothèque de documents convertis.
-- Le PDF n'est jamais transmis : seul le Markdown produit dans le navigateur
-- est enregistré ici, et uniquement lorsque l'utilisateur le demande.

create table if not exists public.documents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  markdown   text not null,
  doc_type   text,
  pages      integer,
  tokens     integer,
  created_at timestamptz not null default now()
);

comment on table public.documents is
  'Markdown produit côté navigateur. Aucun PDF n''est stocké.';

create index if not exists documents_user_created_idx
  on public.documents (user_id, created_at desc);

-- Sans RLS, la clé publiable exposerait toute la table : elle est indispensable.
alter table public.documents enable row level security;

drop policy if exists "lecture de ses propres documents"    on public.documents;
drop policy if exists "ajout pour soi-même"                 on public.documents;
drop policy if exists "modification de ses propres documents" on public.documents;
drop policy if exists "suppression de ses propres documents" on public.documents;

create policy "lecture de ses propres documents"
  on public.documents for select
  using (auth.uid() = user_id);

create policy "ajout pour soi-même"
  on public.documents for insert
  with check (auth.uid() = user_id);

create policy "modification de ses propres documents"
  on public.documents for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "suppression de ses propres documents"
  on public.documents for delete
  using (auth.uid() = user_id);
