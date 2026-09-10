# Schematica relay

A 100-line Cloudflare Worker that lets the assistant use model APIs that
refuse browser requests. ollama.com answers a CORS preflight with 405 and
api.moonshot.ai (Kimi) sends no allow-origin header, so a page served from
GitHub Pages cannot call them directly, however the key is supplied. The
relay forwards the request as-is, adds the CORS headers, and streams the
reply back. Your API key travels through your own worker and is never
stored or logged.

```
https://<your-worker>/ollama.com/v1/chat/completions →  https://ollama.com/v1/chat/completions
https://<your-worker>/api.moonshot.ai/v1/models         →  https://api.moonshot.ai/v1/models
```

## Deploy (free tier, two commands)

```sh
cd relay
npx wrangler login      # once; opens a browser to your Cloudflare account
npx wrangler deploy     # prints https://schematica-relay.<account>.workers.dev
```

Then in Schematica's assistant settings pick **OpenAI-compatible** for
Ollama Cloud (or **Kimi**),
paste the key from <https://ollama.com/settings/keys> (or platform.kimi.ai),
and set the Base URL to your worker followed by the upstream host and `/v1`.
For Ollama Cloud,
set Model to `glm-5.3` or choose one with **List models**:

| Provider | Base URL |
| --- | --- |
| OpenAI-compatible (Ollama Cloud) | `https://schematica-relay.<account>.workers.dev/ollama.com/v1` |
| Kimi (Moonshot) | `https://schematica-relay.<account>.workers.dev/api.moonshot.ai/v1` |

To make your worker the default for everyone using your deployment, set
`RELAY` in `src/ai/settings.js` to its URL.

## Connection failures

The default relay is deployed at
`https://schematica-relay.henrycooper86.workers.dev`. Ollama Cloud with
`glm-5.3` using OpenAI-compatible chat completions passed an authenticated
connection and tool round trip test on 2026-09-06.
If you deploy your own relay, use the URL printed by Wrangler and the
provider-specific path in the table above. An `ENOTFOUND` error means the
hostname is not resolving; changing an API key cannot fix it.

To check a deployed relay without sending a key, open its root URL. It
should return JSON identifying the Schematica relay and its upstreams.
Then use **List models** and **Test connection** in the assistant settings.
The connection test checks the selected model, endpoint, key, and effort;
save that draft to use the tested configuration.

## Settings

Plain-text variables in `wrangler.jsonc`:

- `UPSTREAMS` — comma-separated hosts the relay may forward to
  (default `ollama.com,api.moonshot.ai`). Anything else is answered 404.
- `ORIGINS` — sites allowed to call it from a browser: `*` (default) or a
  comma-separated list such as `https://henrycooper86.github.io`.

## Test locally

`npx wrangler dev` serves the worker at <http://localhost:8787>; then

```sh
curl http://localhost:8787/ollama.com/v1/models
```

lists ollama.com's catalogue through the relay (that endpoint needs no key).
The unit tests in `tests/relay.test.js` cover the routing, CORS, and header
handling without touching the network.
