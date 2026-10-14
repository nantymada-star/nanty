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

## Limites actuelles (choix « sans serveur »)

Sans backend partagé (le projet Supabase n'a pas pu être créé), ces fonctions restent **locales à l'appareil** :
- profil, rôles (utilisateur / commerçant / admin) : pas d'authentification en ligne ;
- prix soumis par les utilisateurs et prix des commerçants : stockés sur l'appareil et modérés localement, donc non partagés avec les autres utilisateurs ;
- notifications : seulement dans l'app et via les notifications du navigateur, pas d'e-mail ni de SMS ;
- pas de synchronisation quand l'app est fermée.

Pour rendre ces fonctions multi-utilisateurs, il faudra ajouter une base partagée (par exemple Supabase/PostgreSQL : tables `user_submissions`, `businesses`, `business_prices`, `audit_logs`, authentification avec rôles, tâche planifiée quotidienne côté serveur qui appelle la même logique que `lib/sync.ts`).

Autres limites :
- la couverture dépend des marchés suivis par le WFP ; les matériaux de construction et la plupart des produits de commerce n'ont pas de prix publics, d'où la recherche de commerces OSM et les prix déclarés ;
- le serveur OSRM public sert à la démonstration : pour un usage intensif, prévoir son propre serveur ;
- la recherche vocale dépend du navigateur (Chrome / Android). Le malgache n'étant pas reconnu par la plupart des moteurs, l'app bascule sur le français.
