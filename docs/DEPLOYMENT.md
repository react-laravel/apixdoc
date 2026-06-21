# Deployment: GitHub Actions self-hosted runner

Pushing `main` deploys the app on the self-hosted runner with Deployer.

## Production layout

```text
/var/www/apixdoc/
├── current -> releases/<id>
├── releases/
├── shared/prisma/        # SQLite database lives here
├── logs/                 # PM2 logs
└── .env.production       # server-local runtime env
```

## Runtime env

The server keeps runtime config in `/var/www/apixdoc/.env.production` and Deployer copies it into each release.

Required values:

```env
NODE_ENV=production
DATABASE_URL=file:/var/www/apixdoc/shared/prisma/prod.db
AUTH_SECRET=<random secret>
NEXTAUTH_SECRET=<random secret>
NEXTAUTH_URL=https://apixdoc.dogeow.com
ADMIN_EMAIL=<initial admin email>
ADMIN_PASSWORD=<initial password used only when seeding a missing admin>
```

## Deployment flow

1. GitHub Actions checks out the repository on the self-hosted runner.
2. `deploy.php` rsyncs the workspace to a new release.
3. `npm ci`, `prisma generate`, `prisma migrate deploy`, seed, and `next build` run in the release.
4. `current` is switched only after those steps pass.
5. PM2 runs `apixdoc-nextjs` on `127.0.0.1:3002`.
6. nginx proxies `https://apixdoc.dogeow.com` to that local port.

Manual deploy from a checkout:

```bash
php "$HOME/.deployer/dep.phar" deploy production -v
```
