# The Better Inspector

Convertit un PDF en Markdown structuré, **entièrement dans le navigateur**.
Aucune installation, aucun serveur, aucun envoi : le fichier est lu en mémoire,
converti, puis oublié quand vous quittez la page.

*Turns a PDF into structured Markdown, **entirely in the browser**. Nothing to
install, no server, no upload.*

---

## Pourquoi

Un assistant qui reçoit un PDF le rend page par page en image, ou en tire un
texte brut où les colonnes s'entrelacent et les en-têtes se répètent. Vous payez
des jetons pour de la mise en forme, et le modèle lit un document qu'il comprend
mal. Convertir d'abord règle les deux problèmes.

La démo affiche l'estimation en jetons de votre propre document, sur la base de
l'approximation usuelle d'environ quatre caractères par jeton.

## Ce qu'il reconstruit

| Fonction | Rôle |
|---|---|
| `clusterRows()` | Regroupe les fragments par ligne de base, avec une tolérance dérivée de la taille de corps médiane |
| `findGutter()` | Trouve l'abscisse centrale que le moins de rangées traversent, si elle court sur au moins 45 % de la hauteur |
| `orderLines()` | Scinde chaque rangée à la gouttière, ordonne colonne gauche puis droite, bande par bande |
| `sizeLevels()` | Classe les tailles présentes sur la page plutôt que d'appliquer des seuils absolus |
| `segments()` | Détecte les tableaux par alignement des segments sur deux rangées consécutives |
| `classify()` | Texte natif, scanné, image ou mixte, d'après la densité de texte et les opérateurs d'image |

Le texte pivoté (tampons arXiv, filigranes de marge) est écarté avant tout
traitement, et les mots coupés en fin de ligne sont recollés.

## Limites

- **Pas d'OCR.** Un PDF scanné est détecté et signalé, mais pas converti.
- **Ni formules ni figures.** Seule la légende ressort, si elle est en texte.
- **Des heuristiques, pas un modèle.** Une mise en page très inhabituelle peut
  être mal découpée.
- **40 pages** au maximum par document (`MAX_PAGES`), **25 Mo** (`MAX_BYTES`).

## Lancer en local

Le site est un fichier statique. Il faut le servir en HTTP plutôt que de l'ouvrir
en `file://`, car `navigator.clipboard` exige un contexte sécurisé.

```bash
python3 -m http.server 8000
# puis http://localhost:8000/
```

Aucune étape de construction, aucune dépendance à installer. `pdf.js` et les
polices sont servis depuis `vendor/`, donc la conversion fonctionne hors ligne.

## Structure

```
index.html          tout le site : balisage, styles, convertisseur
LICENSE             MIT
vendor/pdfjs/       pdf.js et sa licence Apache-2.0
vendor/fonts/       Archivo et IBM Plex Mono (SIL OFL)
```

Le convertisseur tient dans le `<script type="module">` de `index.html`. Aucune
minification, aucun paquet : le code que vous lisez est celui qui tourne.

## E-mails d'authentification

Les gabarits vivent dans `supabase/templates/` : confirmation d'inscription,
lien de connexion, réinitialisation de mot de passe. Ils sont en HTML tabulaire
avec styles en ligne, sans police web, pour tenir dans les clients de messagerie
les plus rétifs.

Le logo est chargé depuis `{{ .SiteURL }}/assets/logo-email.png`, donc il suit
automatiquement le domaine configuré dans Supabase. C'est un PNG et non le SVG
du site : la plupart des clients de messagerie n'affichent pas le SVG.

**Installation sur le projet hébergé.**

```bash
supabase config push
```

`config.toml` a été aligné sur l'état distant du projet, de sorte que cette
commande ne modifie que les gabarits. Avant de la relancer un jour, vérifier le
diff qu'elle affiche : elle pousse *toute* la configuration d'authentification,
et une valeur locale qui aurait divergé écraserait celle du tableau de bord.

Deux prérequis côté Supabase : un **SMTP personnalisé** doit être configuré —
sur l'offre gratuite, les gabarits restent verrouillés tant que le service
d'e-mail par défaut est utilisé — et la **Site URL** doit pointer sur le domaine
réel, faute de quoi le logo des e-mails ne se charge pas.

Ces e-mails sont en français uniquement. Supabase ne sélectionne pas de gabarit
selon la langue du destinataire.

## Traductions

Le français est la source, écrite dans le HTML. L'anglais vit dans le bloc
`<script type="application/json" id="i18n">` en fin de fichier. Ajouter une
langue revient à ajouter un second bloc et un bouton.

## Licence

MIT, © 2026 Tuwshiyah.

La lecture du format PDF s'appuie sur [pdf.js](https://github.com/mozilla/pdf.js)
(Mozilla), sous licence Apache-2.0 : voir `vendor/pdfjs/LICENSE`. Les polices
Archivo et IBM Plex Mono sont sous SIL Open Font License.
