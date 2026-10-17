# MadaPrice

Ny vidin'ny entana manerana an'i Madagasikara — application React (malgache par défaut, français en option) pour comparer les prix réels des marchés, trouver les commerces proches, suivre les saisons et simuler des bénéfices.

## Démarrage

```bash
npm install
cp .env.example .env    # puis renseigner VITE_HAPI_APP_IDENTIFIER (voir ci-dessous)
npm run dev             # http://localhost:5173
```

Autres commandes :

| Commande | Rôle |
|---|---|
| `npm test` | Tests unitaires (simulateur, normalisation, statistiques, synchronisation, alertes, i18n) |
| `npm run build` | Build de production dans `dist/` (PWA hors ligne incluse) |
| `npm run preview` | Sert le build, avec le proxy `/hapi-proxy` |
| `CHROMIUM=/chemin/chromium npm run e2e` | Parcours complet dans un vrai navigateur (réseau externe simulé pour le test) |

## Données réelles utilisées

| Source | Contenu | Accès |
|---|---|---|
| **WFP via HDX HAPI** (OCHA) | Prix de marché relevés par le Programme alimentaire mondial à Madagascar : marché, région, district, coordonnées GPS, produit, unité, prix de détail / gros, en ariary, période de référence | `https://hapi.humdata.org/api/v2/food-security-nutrition-poverty/food-prices-market-monitor?location_code=MDG` |
| **OpenStreetMap — Overpass** | Commerces et marchés réels (nom, type, horaires, téléphone, adresse) autour d'un point | À la demande |
| **OSRM** | Itinéraires routiers, distances et durées | À la demande (serveur de démonstration public) |
| **Nominatim** | Recherche de localités (fokontany, communes…) | À la demande |
| **FEWS NET / FAO GIEWS** | Calendrier agricole simplifié (plantation, récolte, soudure, cyclones) | Intégré, sources citées dans l'app |

### Sources complémentaires (page « Angona fanampiny », `/fanampiny`)

Stockées dans des tables séparées : elles enrichissent les écrans sans jamais être mélangées aux relevés WFP.

| Source | Contenu | Mise à jour | Statut affiché |
|---|---|---|---|
| **Taux de change BFM** via [Frankfurter](https://frankfurter.dev/providers/bfm/) (`/v2/providers/bfm/rate/{devise}/MGA`, repli sur le cours agrégé) | EUR, USD, CNY, ZAR, MUR en ariary + courbe 12 mois | Automatique, au plus toutes les 6 h quand l'app est ouverte | Source et date du cours |
| **Prix officiels** (OMH carburants, Observatoire du Riz, prix plancher vanille) | Prix, zone, date d'effet, source et lien | Saisie par l'administration (rôle Admin) | « Ofisialy » ou « Gazety » ; « Tranainy » après 45 j (carburant, riz) ou 365 j (vanille) |
| **Banque mondiale – Real-Time Food Prices** ([catalogue 8240](https://microdata.worldbank.org/catalog/8240)) | Estimations mensuelles par marché (jusqu'à 470 marchés), fourchette basse/haute, indice de confiance | Import du fichier CSV `MDG_RTFP_mkt_*.csv` par l'administration | Toujours « Tombana » (estimation), jamais présenté comme un relevé |

Valeurs initiales des prix officiels : relevées dans la presse et datées (carburants mars 2026, L'Express ; vanille verte 2026-2027, Capmad). Elles passent automatiquement en « Ancien » ; l'administrateur saisit les nouvelles valeurs, l'historique est conservé.

Ces compléments apparaissent aussi dans l'accueil (taux de change), le comparateur et la fiche produit (prix officiel lié, estimations Banque mondiale pour le même produit / marché).

Aucune donnée fictive n'est livrée dans l'application. Sans relevé pour un lieu, l'app le dit au lieu d'inventer un prix.

### Identifiant HDX HAPI (obligatoire pour les prix)

HDX HAPI exige un `app_identifier` = base64 de `NomApplication:email`. Deux façons de le fournir :

1. dans `.env` : `VITE_HAPI_APP_IDENTIFIER=...` (générateur : https://hapi.humdata.org/docs, section *Generate App Identifier*) ;
2. dans l'app : **Mombamomba → Tabilaon'ny mpitantana (Admin) → Loharano angona**, champ « Identifiant HDX HAPI » ou bouton « Mamorona avy amin'ny anarana sy mailaka ».

## « Temps réel » : ce que fait l'application

- Au premier lancement : téléchargement de l'historique (4 ans par défaut, réglable), par pages de 10 000 lignes.
- Ensuite : vérification automatique **toutes les 30 min** tant que l'app est ouverte (réglable), au retour du réseau et au retour sur l'onglet, plus le bouton « Havaozina izao ». Seuls les 3 derniers mois sont redemandés, ce qui capte aussi les corrections faites par la source.
- Les nouveaux prix s'affichent **sans recharger la page** (IndexedDB + requêtes en direct), y compris dans les autres onglets ouverts.
- Chaque prix garde sa **période d'origine** (`reference_period_start/end`), sa date de première réception et sa dernière vérification. Si la source corrige un prix, l'ancienne valeur est conservée dans « Révisions ».
- Chaque synchronisation est journalisée (durée, lignes reçues / nouvelles / révisées / suspectes, tentatives, erreur). Les erreurs temporaires sont retentées 4 fois (2 s, 4 s, 8 s). Après 3 échecs consécutifs, une notification d'administration est créée.
- Contrôles : rejet des autres pays et devises, des prix nuls ou invalides et des doublons ; valeurs à plus de ×3 ou ÷3 de la médiane de la série marquées « suspectes » et exclues des calculs.
- Statuts affichés : **Voamarina** (relevé WFP récent), **Tranainy** (au-delà de 60 jours, réglable), **Voalaza** (déclaré par un utilisateur ou un commerçant), **Miandry fanamarinana** (en attente de modération), **Tombana** (estimation, par exemple une distance à vol d'oiseau).

**Important :** le WFP publie en général des prix **mensuels**. L'application vérifie la source en continu, mais un prix ne sera jamais plus récent que la dernière publication du WFP. Elle n'actualise rien quand elle est fermée : il n'y a pas de serveur pour lancer une tâche quotidienne.

## CORS et proxy

L'app appelle d'abord HDX HAPI directement. Si le navigateur bloque l'appel (CORS), elle passe par le proxy de même origine `/hapi-proxy`, déjà configuré pour :
- `npm run dev` et `npm run preview` (`vite.config.ts`) ;
- **Netlify** (`netlify.toml`) et **Vercel** (`vercel.json`).

### Cloudflare

Cloudflare ne sait pas relayer vers un autre site avec une simple règle de redirection : le relais est une petite fonction, déjà incluse.

- **Cloudflare Pages** (projet relié au dépôt GitHub) : commande de build `npm run build`, dossier de sortie `dist`. Le dossier `functions/` est détecté automatiquement et crée `/hapi-proxy/*`. Ajouter `VITE_HAPI_APP_IDENTIFIER` dans *Settings → Variables and Secrets*, puis redéployer (la variable est intégrée au moment du build).
- **Cloudflare Workers** : `npm run build` puis `npx wrangler deploy` (configuration dans `wrangler.jsonc`, code dans `cloudflare/worker.ts`).

Le relais n'accepte que des lectures `GET` sur `/api/...` de HDX HAPI.

Pour un autre hébergeur, ajouter une réécriture `/hapi-proxy/*` vers `https://hapi.humdata.org/*`. Le mode peut être forcé dans Admin (direct / proxy).

## Déploiement

Netlify ou Vercel : connecter le dépôt. Commande de build : `npm run build`, dossier publié : `dist`. Définir `VITE_HAPI_APP_IDENTIFIER` dans les variables d'environnement du site. L'app s'installe sur téléphone (PWA) et fonctionne hors ligne avec les données en cache, en affichant leur date.

## Architecture

```
src/
  i18n/index.ts        dictionnaire mg/fr (une colonne par langue, extensible)
  lib/hapi.ts          client HDX HAPI, normalisation, détection d'anomalies
  lib/sync.ts          synchronisation, journal, retentatives, alertes, notifications
  lib/db.ts            IndexedDB (Dexie) : observations, marchés, sync_runs, favoris, alertes, simulations, commerces, prix déclarés
  lib/stats.ts         séries, variations, min / médiane / max comparables, indice saisonnier, fraîcheur
  lib/simulator.ts     formules du simulateur (testées)
  lib/geo.ts           Overpass, OSRM, Nominatim, horaires OSM
  lib/seasons.ts       calendrier agricole documenté
  pages/               les écrans
```

## Base partagée (série 2 — Supabase)

Projet Supabase : `aetwjbobrnrudmulvnjp` (URL et clé publique dans `src/lib/supabase.ts`, remplaçables par `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`). La clé publique est faite pour le navigateur : l'accès est contrôlé par les règles RLS.

| Élément | Où |
|---|---|
| Schéma, rôles, règles d'accès, audit | `supabase/migrations/` |
| Tests des règles d'accès (20 cas) | `supabase/tests/rls_test.sql` |
| Synchronisation WFP serveur | `supabase/functions/sync-wfp` (fonction serveur) + tâche planifiée `sync-wfp-daily` (03:10 UTC = 06:10 Madagascar) |

- **Comptes** : e-mail + mot de passe (`/kaonty`), mot de passe oublié, nouveau mot de passe. Le compte `nantymada@gmail.com` devient administrateur à l'inscription ; les rôles se changent ensuite dans Admin → « Utilisateurs et rôles ».
- **Prix WFP** : l'app lit la base partagée (aucun identifiant HDX ni relais sur l'appareil), de façon incrémentale, et reçoit les nouveaux relevés en direct. L'ancien mode direct HDX reste disponible (Admin → Source des prix WFP).
- **Prix envoyés** : partagés, modérés par un modérateur/admin, réputation +1/−1, limite de 10 envois par heure, visibles par tous une fois validés.
- **Commerces** : revendication d'une fiche OpenStreetMap, fiche, prix et stock partagés, badge « Vérifié » donné par un admin, demandes de devis et réponses, vues des 30 derniers jours.
- **Prix officiels partagés**, **listes de courses** sur le compte (`/lisitra`), **mes demandes de devis** (`/devis`).

### À configurer dans le tableau de bord Supabase
1. **Edge Functions → Secrets** : ajouter `HAPI_APP_IDENTIFIER` (identifiant HDX). Sans lui, la synchronisation serveur s'arrête avec le message « Secret HAPI_APP_IDENTIFIER manquant ».
2. **Authentication → URL Configuration** : mettre l'adresse du site Cloudflare dans *Site URL* et ajouter `https://<votre-site>/kaonty` dans *Redirect URLs* (liens de confirmation et de mot de passe oublié).
3. Facultatif : un serveur d'e-mails (SMTP) pour dépasser la limite d'envoi intégrée, et la protection contre les mots de passe compromis (Authentication → Policies).

## Limites actuelles

Sans compte, l'app fonctionne comme avant (données sur l'appareil). Restent à faire :
- notifications push quand l'app est fermée, e-mail et SMS ;
- connexion par SMS (fournisseur SMS à configurer) ;
- historique, simulations, alertes et favoris restent sur l'appareil (non liés au compte).

Autres limites :
- la couverture dépend des marchés suivis par le WFP ; les matériaux de construction et la plupart des produits de commerce n'ont pas de prix publics, d'où la recherche de commerces OSM et les prix déclarés ;
- le serveur OSRM public sert à la démonstration : pour un usage intensif, prévoir son propre serveur ;
- la recherche vocale dépend du navigateur (Chrome / Android). Le malgache n'étant pas reconnu par la plupart des moteurs, l'app bascule sur le français.
