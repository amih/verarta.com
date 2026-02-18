# Verarta Project

## Deployment

Always use the redeploy script from the project root — never build the frontend locally:

```bash
bash deployment/redeploy.sh            # deploy everything
bash deployment/redeploy.sh frontend   # frontend only
bash deployment/redeploy.sh backend    # backend only
```

The frontend **must** be built on the server because `NEXT_PUBLIC_*` env vars are baked
into the JS bundle at build time. Building locally embeds `http://localhost:4321` instead
of `https://verarta.com`, which breaks OAuth buttons and other API calls.
