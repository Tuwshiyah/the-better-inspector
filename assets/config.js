/* Configuration Supabase.
   Ces deux valeurs sont publiques par conception : la clé « publiable »
   est faite pour vivre dans le code du navigateur. C'est le Row Level
   Security, côté base, qui protège les données — jamais le secret de
   cette clé. Voir supabase/migrations/ pour les politiques.

   Le mot de passe de la base de données n'a rien à faire ici, ni nulle
   part dans ce dépôt. */

export const SUPABASE_URL = 'https://uqhjkhmgfdworjplujay.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_65ahOXnNfrH5jEmDBPcEnQ_mTseAgOm';
