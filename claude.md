# Verarta Project

## Deployment

**CRITICAL**: The production app runs from `/opt/verarta/app/` on the server, NOT from
`/home/ubuntu/dev/verarta.com/`. PM2 serves the frontend from `/opt/verarta/app/frontend`.
Building or pulling code in `/home/ubuntu/dev/verarta.com/` has NO effect on the live site.

Always use the redeploy script from the local project root to deploy:

```bash
bash deployment/redeploy.sh            # deploy everything
bash deployment/redeploy.sh frontend   # frontend only
bash deployment/redeploy.sh backend    # backend only
```

The script rsyncs source to `/opt/verarta/app/`, builds on the server, and restarts PM2.

The frontend **must** be built on the server because `NEXT_PUBLIC_*` env vars are baked
into the JS bundle at build time. Building locally embeds `http://localhost:4321` instead
of `https://verarta.com`, which breaks OAuth buttons and other API calls.

## Production Architecture

- **Server**: `ssh ubuntu@verarta.com`
- **Frontend**: Next.js on port 3000, managed by PM2 (`verarta-frontend`), served from `/opt/verarta/app/frontend`
- **Backend**: Astro SSR on port 4321, managed by PM2 (`verarta-backend`), served from `/home/ubuntu/dev/verarta.com/backend`
- **Nginx**: proxies `verarta.com` → port 3000 (frontend) and `/api/*` → port 4321 (backend)
- **PM2 commands**: `pm2 list`, `pm2 restart verarta-frontend`, `pm2 logs verarta-frontend`
