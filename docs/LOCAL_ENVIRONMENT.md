# Environnement local (Docker)

Cet environnement est **totalement isole des environnements deployes**
(`development` et `production`). Il utilise son propre fichier Compose
(`docker-compose.local.yml`), son propre projet Compose (`hadoum-local`), ses
propres conteneurs, son propre reseau et son propre volume Postgres. Il ne
reference et ne peut techniquement pas toucher les ressources des autres
environnements.

Pour la vue d'ensemble des trois environnements (local / development /
production) et le flux de deploiement, voir `docs/deployment.md`.

| | Local | Development (deploye) | Production |
|---|---|---|---|
| Fichier Compose | `docker-compose.local.yml` | `docker-compose.development.yml` | `docker-compose.prod.yml` |
| Projet Compose | `hadoum-local` | `hadoum-development` | `hadoum-prod` |
| Conteneur DB | `hadoum-postgres-local` | `hadoum-postgres-development` | `hadoum-postgres-prod` |
| Conteneur API | `hadoum-api-local` | `hadoum-api-development` | `hadoum-api-prod` |
| Conteneur frontend | `hadoum-frontend-local` | `hadoum-frontend-development` | `hadoum-frontend-prod` |
| Reseau | `hadoum-network-local` | `hadoum-network-development` | `hadoum-network-prod` |
| Volume Postgres | `hadoum-postgres-local-data` (interne, jetable) | `hadoum-postgres-development-data` (interne, persistant) | `hadoum-postgres-prod-data` (externe, protege) |
| API | `nest start --watch` (hot reload) dans un conteneur `Dockerfile.dev` | build multi-stage optimise (meme image que prod) | build multi-stage optimise |
| Frontend | serveur de dev Vite (hot reload) sur `:5173` | build statique servi par Nginx | build statique servi par Nginx |
| Migrations Prisma | `prisma migrate dev` (manuel) | `prisma migrate deploy` automatique (CD) | `prisma migrate deploy` automatique (CD) |
| Seed | manuel, autorise | jamais automatique (peut etre lance manuellement) | jamais execute |
| Deploiement | aucun, poste local uniquement | automatique a chaque merge sur `develop` | automatique sur tag/release, avec approbation manuelle |
| `down -v` | **autorise** (detruit uniquement les donnees locales) | a proscrire hors reset volontaire | **interdit** en pratique (volume externe) |

## 1. Copier le fichier d'environnement

```bash
cp .env.local.example .env.local
```

Editez `.env.local` et remplacez les placeholders (`change_me_...`) par des
valeurs locales. Ces valeurs restent sur votre machine, ne sont jamais
commitees (`.env.local` est dans `.gitignore`) et doivent rester
**differentes** des valeurs de `development` et de production. Les variables
obligatoires (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`,
`DATABASE_URL`, `JWT_SECRET`) font echouer `docker compose` avec un message
clair si elles sont absentes (`variable is required in .env.local`).

## 2. Demarrer l'environnement local

```bash
./scripts/local/up.sh
```

Cela build les images (si necessaire) et demarre `postgres`, `api` et
`frontend` en arriere-plan, avec hot reload actif pour l'API (NestJS
`--watch`) et le frontend (Vite). Le code source est monte en bind mount ;
`node_modules` reste **dans le conteneur** (volume dedie), il n'est jamais
ecrase par votre `node_modules` local.

Acces :
- API : http://localhost:3001/api
- Frontend : http://localhost:5173

## 3. Consulter les logs

```bash
./scripts/local/logs.sh          # tous les services
./scripts/local/logs.sh api      # un seul service
./scripts/local/ps.sh            # etat des conteneurs
```

## 4. Appliquer les migrations Prisma

En local, les migrations ne s'appliquent **jamais automatiquement** au
demarrage du conteneur (contrairement aux environnements deployes). Vous les
lancez manuellement, a l'interieur du conteneur API pour utiliser la meme
`DATABASE_URL` (host reseau `postgres`) :

```bash
docker compose -p hadoum-local -f docker-compose.local.yml exec api npx prisma migrate dev
```

`prisma migrate dev` est **autorise en local uniquement**. Ne l'utilisez
jamais contre `development` ou la production.

Si vous preferez lancer Prisma depuis votre machine hote plutot que dans le
conteneur, utilisez une variable `DATABASE_URL` avec `localhost` a la place
de `postgres` (le port 5432 est expose sur l'hote par `docker-compose.local.yml`) :

```bash
DATABASE_URL=postgresql://hadoum_dev_user:<password>@localhost:5432/hadoum_dev_db \
  npx prisma migrate dev
```

## 5. Executer le seed

Le seed est reserve au local/test et ne doit jamais tourner contre la
production :

```bash
docker compose -p hadoum-local -f docker-compose.local.yml exec api npx prisma db seed
```

## 6. Sauvegarder la base locale

```bash
./scripts/local/backup.sh
```

Ecrit un dump SQL horodate dans `backups/local/` (dossier ignore par Git).
C'est une commande manuelle, a la demande. Pour les sauvegardes automatiques
(nightly, compressees, avec retention) des environnements deployes, voir
`docs/backups.md`.

## 7. Restaurer la base locale

```bash
./scripts/local/restore.sh backups/local/hadoum_local_20260716_120000.sql
```

Demande une confirmation explicite (`yes`) avant d'ecraser les donnees. Ne
touche que le conteneur `hadoum-postgres-local`.

## 8. Reinitialiser uniquement le local

```bash
./scripts/local/reset.sh
```

Equivalent a `docker compose -f docker-compose.local.yml down -v`, avec des
garde-fous :
- refuse de s'executer si le nom de projet ou une ressource contient `prod` ;
- cible exclusivement le projet `hadoum-local` (`-p hadoum-local`), jamais un
  projet ou un fichier deploye ;
- exige de retaper le nom exact du projet (`hadoum-local`) pour confirmer.

> **Encadre — regle absolue**
>
> `docker compose -f docker-compose.local.yml down -v` est **autorise
> uniquement en local**. La commande equivalente ne doit **jamais** etre
> executee avec `docker-compose.development.yml` ou `docker-compose.prod.yml` :
> le volume de production est declare `external: true`, ce qui limite le
> risque, mais la vigilance humaine reste la premiere ligne de defense.
> Verifiez toujours quel fichier Compose (`-f ...`) et quel projet (`-p ...`)
> vous ciblez avant de taper une commande avec `-v` ou `down`.

## 9. Verifier qu'un environnement deploye n'est jamais cible

Avant toute commande destructrice, verifiez explicitement le contexte :

```bash
# Quel fichier / projet est vise ?
docker compose -p hadoum-local -f docker-compose.local.yml config --services

# development/prod tournent-ils sous un nom distinct ?
docker ps --format '{{.Names}}' | grep -E 'prod|development' || echo "Aucun conteneur deploye visible depuis cette machine"
```

Les scripts `scripts/local/*.sh` :
- fixent en dur `PROJECT_NAME=hadoum-local` et `-f docker-compose.local.yml`
  (pas de dependance a un `.env` ambigu ou a un repertoire courant) ;
- refusent de s'executer si un nom de ressource contient `prod` ;
- ne referencent jamais `docker-compose.development.yml`,
  `docker-compose.prod.yml`, ni le volume externe `hadoum-postgres-prod-data`.

## 10. Differences cles entre les trois environnements (recap)

- **Migrations** : local = `prisma migrate dev` manuel ; development/prod =
  `prisma migrate deploy` automatique et strict, au demarrage du deploiement,
  avec echec bloquant (et rollback en prod) si la migration echoue.
- **Seed** : local = manuel, autorise ; development = manuel si besoin ;
  prod = jamais execute.
- **Volume DB** : local = volume Compose interne, jetable ; development =
  volume interne mais persistant (pas de bind mount code) ; prod = volume
  externe protege, jamais recree.
- **Secrets** : chaque environnement a ses propres valeurs, jamais partagees
  entre eux. Local = fichier `.env.local` sur le poste ; development/prod =
  GitHub Secrets, jamais commites (voir `docs/deployment.md` section
  secrets).
- **Build** : local = images avec hot reload, code monte en bind mount ;
  development/prod = memes images optimisees (multi-stage), code copie et
  fige au build, seule la configuration differe.
- **`down -v`** : local = autorise ; development = a proscrire hors reset
  volontaire documente ; prod = a proscrire (volume externe).
