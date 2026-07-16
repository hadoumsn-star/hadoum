# Environnement de developpement (Docker)

Cet environnement est **totalement isole de la production**. Il utilise son
propre fichier Compose (`docker-compose.dev.yml`), son propre projet Compose
(`hadoum-dev`), ses propres conteneurs, son propre reseau et son propre
volume Postgres. Il ne reference et ne peut techniquement pas toucher les
ressources de production (`hadoum-prod`).

| | Dev | Prod |
|---|---|---|
| Fichier Compose | `docker-compose.dev.yml` | `docker-compose.prod.yml` |
| Projet Compose | `hadoum-dev` | `hadoum-prod` |
| Conteneur DB | `hadoum-postgres-dev` | `hadoum-postgres-prod` |
| Conteneur API | `hadoum-api-dev` | `hadoum-api-prod` |
| Conteneur frontend | `hadoum-frontend-dev` | `hadoum-frontend-prod` |
| Reseau | `hadoum-network-dev` | `hadoum-network-prod` |
| Volume Postgres | `hadoum-postgres-dev-data` (interne, non externe) | `hadoum-postgres-prod-data` (externe) |
| Utilisateur/DB Postgres | `hadoum_dev_user` / `hadoum_dev_db` | utilisateur/DB prod (distincts) |
| API | `nest start --watch` (hot reload) dans un conteneur `Dockerfile.dev` | build multi-stage optimise |
| Frontend | serveur de dev Vite (hot reload) sur `:5173` | build statique servi par Nginx |
| Migrations Prisma | `prisma migrate dev` (manuel) | `prisma migrate deploy` uniquement, au demarrage |
| Seed | manuel, reserve dev/test | jamais execute automatiquement |
| `down -v` | **autorise** (detruit uniquement les donnees dev) | **interdit** en pratique (volume externe protege) |

## 1. Copier le fichier d'environnement

```bash
cp .env.dev.example .env.dev
```

Editez `.env.dev` et remplacez les placeholders (`change_me_...`) par des
valeurs de dev. Ces valeurs sont locales a votre machine, ne sont jamais
commitees (`.env.dev` est dans `.gitignore`) et doivent rester **differentes**
des valeurs de production. Les variables obligatoires (`POSTGRES_USER`,
`POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `JWT_SECRET`) font
echouer `docker compose` avec un message clair si elles sont absentes
(`variable is required in .env.dev`).

## 2. Demarrer l'environnement de dev

```bash
./scripts/dev/up.sh
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
./scripts/dev/logs.sh          # tous les services
./scripts/dev/logs.sh api      # un seul service
./scripts/dev/ps.sh            # etat des conteneurs
```

## 4. Appliquer les migrations Prisma

En dev, les migrations ne s'appliquent **jamais automatiquement** au
demarrage du conteneur (contrairement a la prod). Vous les lancez
manuellement, a l'interieur du conteneur API pour utiliser la meme
`DATABASE_URL` (host reseau `postgres`) :

```bash
docker compose -p hadoum-dev -f docker-compose.dev.yml exec api npx prisma migrate dev
```

`prisma migrate dev` est **autorise en dev uniquement**. Ne l'utilisez
jamais contre la production.

Si vous preferez lancer Prisma depuis votre machine hote plutot que dans le
conteneur, utilisez une variable `DATABASE_URL` avec `localhost` a la place
de `postgres` (le port 5432 est expose sur l'hote par `docker-compose.dev.yml`) :

```bash
DATABASE_URL=postgresql://hadoum_dev_user:<password>@localhost:5432/hadoum_dev_db \
  npx prisma migrate dev
```

## 5. Executer le seed

Le seed est reserve a la dev/test et ne doit jamais tourner contre la
production :

```bash
docker compose -p hadoum-dev -f docker-compose.dev.yml exec api npx prisma db seed
```

## 6. Sauvegarder la base dev

```bash
./scripts/dev/backup.sh
```

Ecrit un dump SQL horodate dans `backups/dev/` (dossier ignore par Git).
C'est une commande manuelle, a la demande — aucun cron n'est configure a ce
stade (hors perimetre de cette phase).

## 7. Restaurer la base dev

```bash
./scripts/dev/restore.sh backups/dev/hadoum_dev_20260716_120000.sql
```

Demande une confirmation explicite (`yes`) avant d'ecraser les donnees. Ne
touche que le conteneur `hadoum-postgres-dev`.

## 8. Reinitialiser uniquement la dev

```bash
./scripts/dev/reset.sh
```

Equivalent a `docker compose -f docker-compose.dev.yml down -v`, avec des
garde-fous :
- refuse de s'executer si le nom de projet ou une ressource contient `prod` ;
- cible exclusivement le projet `hadoum-dev` (`-p hadoum-dev`), jamais le
  projet ou le fichier de production ;
- exige de retaper le nom exact du projet (`hadoum-dev`) pour confirmer.

> **Encadre — regle absolue**
>
> `docker compose -f docker-compose.dev.yml down -v` est **autorise
> uniquement pour la dev**. La commande equivalente ne doit **jamais** etre
> executee avec `docker-compose.prod.yml` : le volume de production est
> declare `external: true`, ce qui limite le risque, mais la vigilance
> humaine reste la premiere ligne de defense. Verifiez toujours quel fichier
> Compose (`-f ...`) et quel projet (`-p ...`) vous ciblez avant de taper
> une commande avec `-v` ou `down`.

## 9. Verifier que la prod n'est jamais ciblee

Avant toute commande destructrice, verifiez explicitement le contexte :

```bash
# Quel fichier / projet est vise ?
docker compose -p hadoum-dev -f docker-compose.dev.yml config --services

# La prod tourne-t-elle sous un nom distinct ?
docker ps --format '{{.Names}}' | grep prod || echo "Aucun conteneur prod visible depuis cette machine"
```

Les scripts `scripts/dev/*.sh` :
- fixent en dur `PROJECT_NAME=hadoum-dev` et `-f docker-compose.dev.yml` (pas
  de dependance a un `.env` ambigu ou a un repertoire courant) ;
- refusent de s'executer si un nom de ressource contient `prod` ;
- ne referencent jamais `docker-compose.prod.yml`, ni le volume externe
  `hadoum-postgres-prod-data`.

## 10. Differences cles dev / prod (recap)

- **Migrations** : dev = `prisma migrate dev` manuel ; prod = `prisma migrate
  deploy` automatique et strict, au demarrage, avec echec bloquant si la
  migration echoue.
- **Seed** : dev = manuel, autorise ; prod = jamais execute.
- **Volume DB** : dev = volume Compose interne, jetable ; prod = volume
  externe protege, jamais recree.
- **Secrets** : dev = valeurs locales dediees, jamais partagees avec la
  prod ; prod = secrets geres separement (hors de ce depot).
- **Build** : dev = images avec hot reload, code monte en bind mount ; prod
  = images optimisees, code copie et fige au build.
- **`down -v`** : dev = autorise ; prod = a proscrire (volume externe).
