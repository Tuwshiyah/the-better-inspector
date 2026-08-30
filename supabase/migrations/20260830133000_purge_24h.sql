-- Purge automatique : un document ne survit pas au-delà de 24 heures.
-- Le Markdown produit est un objet de passage, pas une archive. Le
-- conserver sans terme ferait porter au service une responsabilité que
-- son propos refuse : il n'a jamais promis de garder quoi que ce soit.

create extension if not exists pg_cron;

create or replace function public.purge_documents()
returns integer
language plpgsql
-- security definer : sans cela la fonction se heurterait à la RLS et ne
-- verrait aucune ligne, puisqu'elle s'exécute sans utilisateur connecté
security definer
set search_path = public
as $$
declare
  supprimes integer;
begin
  delete from public.documents
   where created_at < now() - interval '24 hours';
  get diagnostics supprimes = row_count;
  return supprimes;
end;
$$;

comment on function public.purge_documents is
  'Supprime les documents de plus de 24 heures. Appelée chaque heure par pg_cron.';

-- traversant la RLS, elle ne doit être appelable par personne d'autre
-- que la tâche planifiée
revoke all on function public.purge_documents() from public;
revoke all on function public.purge_documents() from anon, authenticated;

-- rejouer la migration ne doit pas empiler deux fois la même tâche
select cron.unschedule('purge-documents-24h')
 where exists (select 1 from cron.job where jobname = 'purge-documents-24h');

-- l'heure ronde suffit : la minute ne changerait rien pour l'utilisateur
-- et multiplierait les réveils par soixante
select cron.schedule(
  'purge-documents-24h',
  '0 * * * *',
  $$select public.purge_documents()$$
);
