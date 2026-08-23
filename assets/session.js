/* ═══════════════════════════════════════════════════════════════
   Session et accès aux données.
   Un seul client Supabase pour toutes les pages de l'application.
   ═══════════════════════════════════════════════════════════════ */

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

if (!window.supabase) {
  throw new Error('vendor/supabase/supabase.umd.js doit être chargé avant ce module');
}

export const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

/** Le monogramme, en ligne : les pages n'ont pas à le recopier. */
export const MARK = `<svg class="mark" viewBox="0 0 24 24" aria-hidden="true">
  <rect x="4.5" y="3" width="5" height="4.8" fill="var(--oxide)"/>
  <rect x="4.5" y="10.2" width="5.2" height="10.9" fill="currentColor"/>
  <path fill="currentColor" fill-rule="evenodd" d="M9.5 6H14.8a3.7 3.7 0 0 1 0 7.4H15.5a3.95 3.95 0 0 1 0 7.9H9.5Z M14.45 7.95a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5Z M15.15 15.35a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2Z"/>
</svg>`;

export async function currentUser() {
  const { data } = await db.auth.getSession();
  return data.session ? data.session.user : null;
}

/** À appeler en tête des pages protégées : renvoie l'utilisateur ou redirige. */
export async function requireUser() {
  const user = await currentUser();
  if (!user) {
    const back = encodeURIComponent(location.pathname.split('/').pop() || 'app.html');
    location.replace('login.html?suite=' + back);
    return null;
  }
  return user;
}

export async function signOut() {
  await db.auth.signOut();
  location.replace('index.html');
}

/* ── Documents ─────────────────────────────────────────────────── */

export async function listDocuments() {
  const { data, error } = await db
    .from('documents')
    .select('id,name,doc_type,pages,tokens,created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function loadMarkdown(ids) {
  const { data, error } = await db
    .from('documents')
    .select('id,name,markdown')
    .in('id', ids);
  if (error) throw error;
  return data;
}

export async function saveDocument(userId, r) {
  const { data, error } = await db.from('documents').insert({
    user_id: userId,
    name: r.name,
    markdown: r.markdown,
    doc_type: r.type,
    pages: r.limit,
    tokens: r.tokens
  }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function removeDocument(id) {
  const { error } = await db.from('documents').delete().eq('id', id);
  if (error) throw error;
}

/* ── Petits utilitaires d'affichage ────────────────────────────── */

export const nf = (n) => Number(n || 0).toLocaleString('fr-FR');

export function humanSize(n) {
  return n < 1024 * 1024
    ? (n / 1024).toFixed(1).replace('.', ',') + ' Ko'
    : (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' Mo';
}

export function humanDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR',
    { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Traduit les messages d'erreur Supabase les plus fréquents. */
export function humanError(e) {
  const m = (e && e.message ? e.message : String(e)).toLowerCase();
  if (m.includes('invalid login credentials')) return 'Adresse ou mot de passe incorrect.';
  if (m.includes('email not confirmed')) return 'Vérifiez votre boîte mail : le compte n’est pas encore confirmé.';
  if (m.includes('user already registered')) return 'Un compte existe déjà avec cette adresse.';
  if (m.includes('password should be at least')) return 'Le mot de passe doit faire au moins 6 caractères.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Trop de tentatives. Réessayez dans quelques minutes.';
  if (m.includes('failed to fetch')) return 'Serveur injoignable. Vérifiez votre connexion.';
  return e && e.message ? e.message : 'Une erreur est survenue.';
}
