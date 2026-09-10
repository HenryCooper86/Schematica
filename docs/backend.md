# Website with its own AI backend

Run the website and its AI API together. The browser sends same-origin
requests to `/api/ai`; the Node server connects directly to the official
provider URL and streams the response. Cloudflare is not involved.
The Base URL field remains the provider's URL, for example
`https://ollama.com/v1`.

## Local development

Use Node.js 22 or newer. There are no npm dependencies or build steps.

```sh
npm start
```

Open `http://localhost:3000`. In Assistant settings:

- Provider: **OpenAI-compatible**
- Base URL: **https://ollama.com/v1**
- API key: your Ollama key
- Click **List models**, choose a model, then **Test connection** and **Save**.

The server handles chat, tool calls, model discovery, and cancellation for
all built-in providers. A remembered default Cloudflare URL is migrated to
the corresponding official Ollama or Moonshot URL on the backend-hosted site.
Custom endpoints are preserved. A new hostname has separate browser storage:
export any board you want to move, import it on the new site, and enter your
key again. Shared board links can also be opened on the new hostname.

## Lightsail deployment

The prepared deployment uses Docker Compose with Caddy for HTTPS. Before
running it on an existing server, inspect its current services and ports to
avoid replacing another website. Use a Lightsail static IP, point a domain's
DNS A record at it, and allow inbound TCP 80 and 443 in the Lightsail firewall.
Keep SSH restricted to the operator's address. Do not publish the Node port.

With Docker Engine and the Compose plugin available, copy this repository
to the server and run from its root:

```sh
cp .env.example .env
# Edit SCHEMATICA_DOMAIN in .env to your actual hostname (no https://).
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

Open `https://YOUR_DOMAIN`. Caddy obtains the certificate automatically.
If you do not have a domain, set `SCHEMATICA_DOMAIN` to the public static IP
and `CADDY_CONFIG=./deploy/Caddyfile.ip` in `.env`. This uses Let's Encrypt's
short-lived IP certificates with automatic renewal; port 80 must remain
reachable for HTTP validation and port 443 for visitors. The IP configuration
requires Caddy 2.11 or newer (validated with 2.11.4).
Its default proxy handling flushes `text/event-stream` responses immediately,
so replies remain streamed. See [Caddy's proxy documentation](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#streaming).
The app container runs as an unprivileged user with a read-only filesystem.
Only Caddy publishes ports; its certificate state lives in persistent volumes.
Neither the app nor the supplied Caddy configuration logs request bodies or
provider keys. Do not add request-header/body logging at a reverse proxy.

```sh
curl -fsS https://YOUR_DOMAIN/healthz
docker compose logs --tail=50 app web
```

To update, copy the tested code and run `docker compose up -d --build` again.
To roll back, restore the previous code revision and rebuild. Existing streams
may be interrupted during restart. Keep the Caddy volumes when stopping the
deployment (`docker compose down` without `--volumes`).

GitHub Pages can remain available as the static edition, but it cannot run
this Node backend. Use the new website hostname for the backend edition.

## Configuration

For a non-Docker deployment, put a TLS reverse proxy in front of `npm start`
and keep its upstream Host header equal to the website hostname. Set:

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Node listen address; the container uses `0.0.0.0` on its private network. |
| `PORT` | `3000` | Node listen port. |
| `PUBLIC_ORIGIN` | Local mode | Exact website origin, such as `https://schematica.example.com`. Required for public hosting. |
| `AI_BASE_URLS` | Empty | Comma-separated additional trusted provider base URLs. |

The built-in allowlist contains Ollama, Moonshot, OpenAI, OpenRouter, Z.AI,
and Anthropic. Additional entries grant server-side network access, so only
the operator can configure them. Only `/models` GET and `/chat/completions`
or `/messages` POST below an enabled base are forwarded. Redirects are
rejected. Arbitrary URLs, credentials in URLs, query strings, and browser
requests from other sites are rejected.

For self-hosted Ollama, enable its base URL in `AI_BASE_URLS` and enter the
same URL in assistant settings with the placeholder key `ollama`. Here,
`localhost` means the backend's machine (or container), not the visitor's
computer. No `OLLAMA_ORIGINS` adjustment is needed for server-to-server calls.

## Limits and credentials

Users supply their own provider keys; the backend has no shared provider key
and does not persist keys, conversations, or boards. Keys are forwarded only
to enabled endpoints over the configured connection. Browser storage remains
opt-in through **Remember**. The backend is not an account/login service.

Requests are limited to 8 MiB and 16 concurrent provider calls. A call has
120 seconds to deliver its body and receive the provider's response headers;
once the reply is streaming, only 120 seconds of silence between chunks ends
it, so a long reply that keeps arriving is never cut off mid-stream.
Invalid input and provider failures return readable errors; an
interrupted stream remains an error instead of being treated as a complete
assistant reply. No automatic fallback sends a failed backend request
directly from the browser or through Cloudflare.

## Verification

`npm test` includes backend HTTP tests for asset boundaries, endpoint and
origin restrictions, headers, streaming, cancellation, errors, and limits.
Authenticated connection verification additionally needs a valid provider
key and a model available to that account.
