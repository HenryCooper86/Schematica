# Current Lightsail deployment

- Website: https://bionicloud.net
- Static IP: `18.226.225.37`
- SSH user: `ubuntu`
- OS: Ubuntu 24.04 LTS, 2 GB RAM
- Active release: `/opt/schematica/current`
- Release directory: `/opt/schematica/releases/20260910-0214`
- Docker Compose project: `schematica`
- Deployed: 2026-09-10

The release was uploaded from the tested local workspace, including the new
backend. It is not a Git checkout and does not automatically deploy GitHub
commits. The SSH private key remains on the operator's computer.

The deployment's `.env` sets `SCHEMATICA_DOMAIN=bionicloud.net` and
`CADDY_CONFIG=./deploy/Caddyfile`. DNS points to the Lightsail static IP above.
Caddy manages the domain's trusted HTTPS certificate and automatic renewal.
Keep inbound TCP 80 and 443 enabled and the static IP attached to this instance.
The previous IP-based configuration is saved on the server in
`.env.before-domain-20260910` for rollback.

The provider Base URL for Ollama remains `https://ollama.com/v1`;
no Cloudflare Worker is involved.

## Operations

After connecting over SSH:

```sh
cd /opt/schematica/current
sudo docker compose -p schematica ps
sudo docker compose -p schematica logs --tail=50 app web
```

Public health check:

```sh
curl -fsS https://bionicloud.net/healthz
```

Do not remove the Caddy data volume: it holds the ACME account and renewable
certificate state. See [backend.md](backend.md) for deployment and update
instructions. Export/import boards when moving from the GitHub Pages site or
the former IP address; browser storage is separate for the new domain.

Deployment verification covered public HTTPS, the app health check, browser
loading, and live Ollama model listing through the backend. A real chat still
requires the user's provider key, entered in the website's assistant settings.
