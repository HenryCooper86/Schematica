# Schematica BYOK Provider Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every approved user securely synchronize, test, select, replace, and delete their own hosted or local AI provider connections with verified model capability warnings.

**Architecture:** Provider metadata lives in RLS-protected PostgreSQL while secrets live behind a server-only `SecretStore`. A Schematica provider registry normalizes native, Ollama-native, and OpenAI-compatible transports; hosted custom URLs pass SSRF controls, while local Ollama stays entirely in the browser.

**Tech Stack:** Next.js 16, TypeScript, Supabase PostgreSQL/Vault, Vercel AI SDK 7, official AI SDK provider adapters, `@ai-sdk/openai-compatible` 3, `ollama-ai-provider-v2` 4, Zod 4, Node.js DNS/network APIs, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-02-ai-design-assistant-design.md`

## Global Constraints

- Requires the completion gate in `docs/superpowers/plans/2026-09-02-ai-foundation-auth-sync.md`.
- Every provider connection is owned by one approved user and synchronizes across that user's devices.
- Hosted credentials are write-only in the UI, encrypted separately from ordinary metadata, decrypted only for a request, and excluded from logs/errors/analytics.
- The backend is trusted to decrypt hosted credentials; the settings UI states that this is not zero-knowledge storage.
- Native and compatible adapters share one provider contract; adding a provider does not change review-domain types.
- Model capabilities are tested, timestamped, and shown to the user rather than inferred from a provider name.
- Models without tools or structured output remain usable with reduced capabilities and a persistent warning.
- No provider fallback or endpoint substitution happens without explicit user approval.
- Hosted custom endpoints require HTTPS and cannot resolve to private, loopback, link-local, or cloud-metadata addresses.
- Local Ollama uses a direct browser connection and never sends inference or local credentials through Schematica's server.

---

### Task 1: Add provider metadata and capability persistence

**Files:**
- Create: `supabase/migrations/202609020003_provider_connections.sql`
- Create: `lib/providers/types.ts`
- Create: `lib/providers/schemas.ts`
- Create: `lib/providers/repository.ts`
- Test: `tests/unit/provider-schemas.test.ts`
- Test: `tests/integration/provider-rls.test.ts`

**Interfaces:**
- Consumes: approved-user guard and typed Supabase clients.
- Produces: `ProviderConnection`, `ModelCapabilityProfile`, `ProviderConnectionInputSchema`, `listProviderConnections(userId)`, and server-only metadata CRUD.

- [ ] **Step 1: Write the failing provider-schema tests**

```ts
import { describe, expect, it } from 'vitest'
import { ProviderConnectionInputSchema } from '../../lib/providers/schemas'

describe('ProviderConnectionInputSchema', () => {
  it('accepts hosted OpenRouter and rejects a local secret', () => {
    expect(ProviderConnectionInputSchema.parse({
      kind: 'openrouter', displayName: 'My OpenRouter', transport: 'hosted',
      baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'secret-value',
    }).kind).toBe('openrouter')
    expect(() => ProviderConnectionInputSchema.parse({
      kind: 'ollama-local', displayName: 'Laptop', transport: 'local',
      baseUrl: 'http://localhost:11434/api', apiKey: 'must-not-upload',
    })).toThrow()
  })
})
```

- [ ] **Step 2: Run the test and confirm the missing-schema failure**

Run: `npm run test:unit -- tests/unit/provider-schemas.test.ts`
Expected: FAIL because `lib/providers/schemas.ts` does not exist.

- [ ] **Step 3: Define extensible provider types and validation**

```ts
export type ProviderKind =
  | 'openai' | 'anthropic' | 'google' | 'mistral' | 'xai'
  | 'groq' | 'deepseek' | 'together' | 'fireworks' | 'cerebras' | 'cohere'
  | 'openrouter' | 'ollama-local' | 'ollama-cloud' | 'zai' | 'kimi'
  | 'openai-compatible'

export type ModelCapabilityProfile = {
  modelId: string
  available: boolean
  streaming: boolean
  vision: boolean | 'unknown'
  tools: boolean | 'unknown'
  structuredOutput: boolean | 'unknown'
  fileInput: boolean | 'unknown'
  contextWindow: number | null
  pricing: {
    inputPerMillion: number | null
    outputPerMillion: number | null
    currency: string
    source: string
    retrievedAt: string
  } | null
  testedAt: string
  warning: string | null
}
```

Use a discriminated Zod union: hosted records require an HTTPS `baseUrl` plus nonempty `apiKey`; `ollama-local` requires `transport: 'local'`, permits localhost/loopback HTTP, and rejects `apiKey`.

- [ ] **Step 4: Create provider tables and column-level protection**

```sql
create table public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null,
  display_name text not null check (char_length(display_name) between 1 and 80),
  transport text not null check (transport in ('hosted', 'local')),
  base_url text not null,
  preferred_model text,
  credential_hint text,
  secret_ref uuid,
  status text not null default 'untested' check (status in ('untested', 'ready', 'limited', 'error')),
  last_tested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((transport = 'local' and secret_ref is null) or transport = 'hosted')
);

create table public.model_capabilities (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.provider_connections(id) on delete cascade,
  model_id text not null,
  profile jsonb not null,
  tested_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  unique (connection_id, model_id)
);
```

Enable RLS. Owners may select only their own rows while approved. Revoke table-wide `select` from `authenticated`, then grant select only on metadata columns excluding `secret_ref`. `credential_hint` stores at most the final four key characters prefixed by `••••`; it is computed server-side and cannot be supplied directly by the client. All writes go through server actions after a fresh approval check.

- [ ] **Step 5: Verify isolation and commit**

```bash
npx supabase db reset
npm run test:unit -- tests/unit/provider-schemas.test.ts tests/integration/provider-rls.test.ts
npm run typecheck
git add supabase/migrations/202609020003_provider_connections.sql lib/providers tests/unit/provider-schemas.test.ts tests/integration/provider-rls.test.ts
git commit -m "feat: add private provider connection metadata"
```

Expected: user A cannot see user B's metadata, neither user can select `secret_ref`, and local secrets are rejected.

---

### Task 2: Implement the encrypted secret-store boundary

**Files:**
- Create: `supabase/migrations/202609020004_provider_secrets.sql`
- Create: `lib/secrets/types.ts`
- Create: `lib/secrets/supabase-vault.ts`
- Create: `lib/secrets/in-memory.ts`
- Create: `lib/secrets/index.ts`
- Create: `docs/operations/provider-secret-store.md`
- Test: `tests/unit/secret-store.test.ts`
- Test: `tests/integration/vault-secret-store.test.ts`

**Interfaces:**
- Consumes: server-only Supabase admin client.
- Produces: `SecretStore.put(ownerId, value)`, `SecretStore.get(ownerId, ref)`, `SecretStore.delete(ownerId, ref)`, and `getSecretStore()`.

- [ ] **Step 1: Write the shared contract test**

```ts
import { describe, expect, it } from 'vitest'
import { InMemorySecretStore } from '../../lib/secrets/in-memory'

describe('SecretStore contract', () => {
  it('isolates and deletes secrets without listing plaintext', async () => {
    const store = new InMemorySecretStore()
    const ref = await store.put('user-a', 'key-a')
    await expect(store.get('user-a', ref)).resolves.toBe('key-a')
    await expect(store.get('user-b', ref)).rejects.toThrow('Secret not found')
    await store.delete('user-a', ref)
    await expect(store.get('user-a', ref)).rejects.toThrow('Secret not found')
    expect(JSON.stringify(store)).not.toContain('key-a')
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test:unit -- tests/unit/secret-store.test.ts`
Expected: FAIL because the secret-store modules do not exist.

- [ ] **Step 3: Define the server-only interface and memory adapter**

```ts
export interface SecretStore {
  put(ownerId: string, value: string): Promise<string>
  get(ownerId: string, ref: string): Promise<string>
  delete(ownerId: string, ref: string): Promise<void>
}
```

The memory adapter stores `{ ownerId, value }` in a private `Map`, returns `crypto.randomUUID()`, gives the same error for wrong-owner and missing refs, and implements a redacted `toJSON()`.

- [ ] **Step 4: Add service-role-only Vault functions**

Create a service-role-only `private.secret_ownership(secret_id uuid primary key, owner_id uuid, created_at timestamptz)` table plus SQL functions `secret_store_put(owner_id uuid, plaintext text) returns uuid`, `secret_store_get(owner_id uuid, secret_id uuid) returns text`, and `secret_store_delete(owner_id uuid, secret_id uuid) returns void`. Each function is `security definer set search_path = ''` and is revoked from `public`, `anon`, and `authenticated`; only `service_role` receives execute permission. `secret_store_put` calls `vault.create_secret` and records ownership in the same transaction, so a secret can safely exist before its provider metadata row. `secret_store_get` joins the ownership record to `vault.decrypted_secrets`; deletion clears any provider/research connection reference, the ownership row, and the Vault row in one transaction.

- [ ] **Step 5: Implement and verify the Vault adapter**

```ts
import 'server-only'
import type { SecretStore } from './types'
import { createAdminClient } from '@/lib/supabase/admin'

export class SupabaseVaultSecretStore implements SecretStore {
  async put(ownerId: string, value: string) {
    const { data, error } = await createAdminClient().rpc('secret_store_put', { owner_id: ownerId, plaintext: value })
    if (error || !data) throw new Error('Credential storage failed')
    return data
  }
  async get(ownerId: string, ref: string) {
    const { data, error } = await createAdminClient().rpc('secret_store_get', { owner_id: ownerId, secret_id: ref })
    if (error || !data) throw new Error('Credential unavailable')
    return data
  }
  async delete(ownerId: string, ref: string) {
    const { error } = await createAdminClient().rpc('secret_store_delete', { owner_id: ownerId, secret_id: ref })
    if (error) throw new Error('Credential deletion failed')
  }
}
```

Integration tests assert plaintext is absent from provider metadata, user queries, audit rows, thrown errors, and captured logs.

- [ ] **Step 6: Record and enforce the production launch gate**

`docs/operations/provider-secret-store.md` requires a Vault maturity review, least-privilege verification, backup/restore exercise, key-portability check, and credential-rotation drill. Define the fallback as the same `SecretStore` interface backed by per-secret AES-256-GCM data keys wrapped by managed KMS; do not launch credential sync until one implementation passes the gate.

- [ ] **Step 7: Verify and commit the secret boundary**

```bash
npm run test:unit -- tests/unit/secret-store.test.ts tests/integration/vault-secret-store.test.ts
git add supabase/migrations/202609020004_provider_secrets.sql lib/secrets docs/operations/provider-secret-store.md tests/unit/secret-store.test.ts tests/integration/vault-secret-store.test.ts
git commit -m "feat: encrypt synchronized provider credentials"
```

---

### Task 3: Block unsafe hosted provider endpoints

**Files:**
- Create: `lib/network/ip-policy.ts`
- Create: `lib/network/safe-endpoint.ts`
- Create: `lib/network/safe-request.ts`
- Test: `tests/unit/safe-endpoint.test.ts`
- Test: `tests/integration/safe-request.test.ts`

**Interfaces:**
- Consumes: a URL and injectable DNS resolver.
- Produces: `resolveSafeEndpoint(url, resolve): Promise<ResolvedEndpoint>` and `safeProviderRequest(input)` with pinned DNS, redirect, timeout, and size policies.

- [ ] **Step 1: Write the failing endpoint-policy tests**

```ts
import { describe, expect, it } from 'vitest'
import { resolveSafeEndpoint } from '../../lib/network/safe-endpoint'

const resolve = async (hostname: string) => [{
  address: hostname === 'provider.example' ? '93.184.216.34' : '127.0.0.1', family: 4 as const,
}]

describe('resolveSafeEndpoint', () => {
  it('accepts public HTTPS and rejects local/private destinations', async () => {
    await expect(resolveSafeEndpoint('https://provider.example/v1', resolve)).resolves.toMatchObject({ hostname: 'provider.example' })
    await expect(resolveSafeEndpoint('http://provider.example/v1', resolve)).rejects.toThrow('HTTPS')
    await expect(resolveSafeEndpoint('https://localhost/v1', resolve)).rejects.toThrow('private')
    await expect(resolveSafeEndpoint('https://169.254.169.254/latest', resolve)).rejects.toThrow('private')
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test:unit -- tests/unit/safe-endpoint.test.ts`
Expected: FAIL because the endpoint policy does not exist.

- [ ] **Step 3: Implement public-address classification**

Reject IPv4 loopback, RFC1918, link-local, multicast, unspecified, carrier-grade NAT, and metadata addresses. Reject IPv6 loopback, unique-local, link-local, multicast, IPv4-mapped private addresses, and unspecified addresses. Resolve all A/AAAA results and reject the entire endpoint if any result is non-public.

```ts
export type ResolvedEndpoint = {
  url: URL
  hostname: string
  addresses: Array<{ address: string; family: 4 | 6 }>
}
```

- [ ] **Step 4: Pin resolution during the request**

Use an Undici `Agent` with a custom `lookup` function that returns only an already-approved address while preserving the original hostname for TLS SNI and certificate validation. Use manual redirects; validate each new target; allow at most three redirects; cap bodies at 2 MiB; and abort after 15 seconds. Reject, rather than follow, any redirect that would send `Authorization` to another host.

- [ ] **Step 5: Test rebinding, verify, and commit**

The integration resolver returns a public IP first and loopback second; assert the request uses the pinned result. Add a cross-host redirect and assert no credential is forwarded.

```bash
npm run test:unit -- tests/unit/safe-endpoint.test.ts tests/integration/safe-request.test.ts
git add lib/network tests/unit/safe-endpoint.test.ts tests/integration/safe-request.test.ts
git commit -m "security: restrict custom provider endpoints"
```

---

### Task 4: Build the capability-aware provider registry

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `lib/providers/presets.ts`
- Create: `lib/providers/adapter.ts`
- Create: `lib/providers/openai-compatible.ts`
- Create: `lib/providers/ollama.ts`
- Create: `lib/providers/registry.ts`
- Create: `lib/providers/errors.ts`
- Test: `tests/unit/provider-registry.test.ts`

**Interfaces:**
- Consumes: provider metadata and a decrypted hosted credential.
- Produces: `PROVIDER_PRESETS`, `ProviderAdapter`, `createProviderAdapter(connection, secret)`, `listModels()`, `chatModel(modelId)`, and normalized `ProviderError`.

- [ ] **Step 1: Install provider runtime packages**

Run:

```bash
npm install ai@7 @ai-sdk/openai@4 @ai-sdk/anthropic@4 @ai-sdk/google@4 @ai-sdk/mistral@4 @ai-sdk/xai@4 @ai-sdk/groq@4 @ai-sdk/deepseek@3 @ai-sdk/togetherai@3 @ai-sdk/fireworks@3 @ai-sdk/cerebras@3 @ai-sdk/cohere@4 @ai-sdk/openai-compatible@3 ollama-ai-provider-v2@4 undici
```

- [ ] **Step 2: Write the failing registry test**

```ts
import { describe, expect, it } from 'vitest'
import { PROVIDER_PRESETS } from '../../lib/providers/presets'

describe('provider presets', () => {
  it('defines verified initial endpoints without model assumptions', () => {
    expect(PROVIDER_PRESETS.openrouter.baseUrl).toBe('https://openrouter.ai/api/v1')
    expect(PROVIDER_PRESETS.zai.baseUrl).toBe('https://api.z.ai/api/paas/v4')
    expect(PROVIDER_PRESETS.kimi.baseUrl).toBe('https://api.moonshot.ai/v1')
    expect(PROVIDER_PRESETS['ollama-cloud'].baseUrl).toBe('https://ollama.com/api')
    expect(PROVIDER_PRESETS['ollama-local'].baseUrl).toBe('http://localhost:11434/api')
    expect(Object.keys(PROVIDER_PRESETS)).toEqual(expect.arrayContaining([
      'openai', 'anthropic', 'google', 'mistral', 'xai', 'groq', 'deepseek',
      'together', 'fireworks', 'cerebras', 'cohere',
    ]))
    expect(Object.values(PROVIDER_PRESETS).every((preset) => !('modelId' in preset))).toBe(true)
  })
})
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npm run test:unit -- tests/unit/provider-registry.test.ts`
Expected: FAIL because `lib/providers/presets.ts` does not exist.

- [ ] **Step 4: Implement presets and adapter contracts**

```ts
import type { LanguageModel } from 'ai'

export interface ProviderAdapter {
  listModels(): Promise<Array<{ id: string; name: string }>>
  chatModel(modelId: string): LanguageModel
  testText(modelId: string): Promise<void>
  testStructured(modelId: string): Promise<boolean>
  testTools(modelId: string): Promise<boolean>
}
```

OpenAI, Anthropic, Google Gemini, Mistral, xAI, Groq, DeepSeek, Together AI, Fireworks, Cerebras, and Cohere use their maintained AI SDK adapters. OpenRouter, Z.AI, and Kimi/Moonshot use `createOpenAICompatible({ name, baseURL, apiKey, fetch: safeProviderFetch })`. Generic compatible connections use the validated user URL. Ollama local/cloud use `createOllama({ baseURL, headers, fetch })` from `ollama-ai-provider-v2`, which implements the AI SDK 7 model contract against Ollama's native `/api` endpoints. Inject ordinary browser `fetch` for local Ollama and `safeProviderFetch` for Ollama Cloud. `safeProviderFetch` is the AI SDK-compatible wrapper around `safeProviderRequest`, so every custom hosted generation, model-list, probe, and redirect uses the same pinned-DNS policy. If a compatible endpoint does not implement model listing, `listModels()` returns an empty list and the settings form accepts an explicit model ID; it never guesses or substitutes a model.

Normalize failures into stable codes `invalid-credential`, `unsupported-capability`, `rate-limit`, `quota`, `model-unavailable`, `timeout`, `local-ollama-unreachable`, and `malformed-response` without retaining response bodies that may echo secrets.

- [ ] **Step 5: Verify and commit the provider registry**

Use mocked fetch/Ollama transports; unit tests never call paid APIs.

```bash
npm run test:unit -- tests/unit/provider-registry.test.ts
npm run typecheck
npm run build
git add package.json package-lock.json lib/providers tests/unit/provider-registry.test.ts
git commit -m "feat: add extensible AI provider registry"
```

---

### Task 5: Probe capabilities and connect local Ollama

**Files:**
- Create: `lib/providers/capability-probe.ts`
- Create: `lib/providers/warnings.ts`
- Create: `lib/providers/local-ollama.ts`
- Create: `app/api/local-ollama/config/route.ts`
- Test: `tests/unit/capability-probe.test.ts`
- Test: `tests/unit/provider-warnings.test.ts`

**Interfaces:**
- Consumes: `ProviderAdapter`, selected model, and an explicit user test request.
- Produces: `probeCapabilities(adapter, modelId)`, `getCapabilityWarning(profile)`, and browser-only `testLocalOllama(baseUrl)`.

- [ ] **Step 1: Write the failing reduced-capability test**

```ts
import { describe, expect, it } from 'vitest'
import { getCapabilityWarning } from '../../lib/providers/warnings'

describe('capability warnings', () => {
  it('disables validated actions without structured output', () => {
    const warning = getCapabilityWarning({
      available: true, tools: false, structuredOutput: false,
      vision: false, contextWindow: 8_192,
    })
    expect(warning.disabledFeatures).toContain('diagram-actions')
    expect(warning.message).toContain('must be applied manually')
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test:unit -- tests/unit/provider-warnings.test.ts`
Expected: FAIL because `lib/providers/warnings.ts` does not exist.

- [ ] **Step 3: Implement bounded capability probes**

The full probe performs one minimal text generation, one strict-object response, and one no-side-effect function call with `maxOutputTokens: 32`. The UI discloses that this may incur a small provider charge. Vision, file, and context capabilities remain `unknown` unless provider metadata or a user-approved probe verifies them. Pricing is stored only when returned by provider model metadata or explicitly entered by the user, with currency/source/retrieval time; otherwise estimates display `Unavailable`. Store probe time, expiry time, raw model ID, normalized results, and warning; never store prompts containing credentials. Profiles expire after 30 days and immediately after a capability-related provider failure. Expiry shows `Retest required`; Schematica reruns the paid probe only when the user confirms the next request or clicks `Retest`, so periodic validation cannot create surprise charges.

- [ ] **Step 4: Implement the local Ollama browser client**

```ts
export async function testLocalOllama(baseUrl = 'http://localhost:11434/api') {
  const root = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const response = await fetch(new URL('tags', root), { signal: AbortSignal.timeout(5_000) })
  if (!response.ok) throw new Error(`Local Ollama returned ${response.status}`)
  const body = await response.json() as { models?: Array<{ name: string }> }
  return (body.models ?? []).map((model) => model.name)
}
```

Show Ollama allowed-origin guidance when the browser reports CORS/private-network failure. `app/api/local-ollama/config/route.ts` returns only public setup text and never proxies traffic.

- [ ] **Step 5: Verify and commit capability detection**

```bash
npm run test:unit -- tests/unit/capability-probe.test.ts tests/unit/provider-warnings.test.ts
npm run typecheck
git add lib/providers app/api/local-ollama tests/unit/capability-probe.test.ts tests/unit/provider-warnings.test.ts
git commit -m "feat: detect provider model capabilities"
```

---

### Task 6: Build provider settings and verify them end to end

**Files:**
- Create: `app/(app)/settings/providers/page.tsx`
- Create: `app/(app)/settings/providers/actions.ts`
- Create: `components/providers/provider-form.tsx`
- Create: `components/providers/provider-card.tsx`
- Create: `components/providers/capability-badge.tsx`
- Create: `tests/e2e/helpers/auth.ts`
- Create: `tests/e2e/providers.spec.ts`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes: provider repository, secret store, safe endpoint policy, registry, and capability probe.
- Produces: approved-user connection management with masked credentials and capability warnings.

- [ ] **Step 1: Implement atomic secret lifecycle actions**

`createProviderConnection` validates approval and input, validates hosted URLs, stores the secret, inserts metadata, performs the disclosed probe, and deletes the secret if metadata creation fails. `replaceProviderCredential` writes a new secret before atomically swapping refs and deleting the old secret. `deleteProviderConnection` removes metadata and its secret and writes an audit event. No response contains plaintext credentials.

- [ ] **Step 2: Build the settings interface**

Offer native presets for OpenAI, Anthropic, Google Gemini, Mistral, xAI, Groq, DeepSeek, Together AI, Fireworks, Cerebras, and Cohere; compatible presets for OpenRouter, Z.AI, and Kimi/Moonshot; Ollama Local and Ollama Cloud; plus a generic OpenAI-compatible endpoint. Hosted forms use unfilled password inputs. Cards show masked suffix, base URL, selected model, last test, and `Full`, `Reduced`, or `Unavailable`. The local card states that calls stay in the browser; the hosted form discloses server-side decryption.

- [ ] **Step 3: Write the browser security and warning journey**

```ts
import { expect, test } from '@playwright/test'
import { signInApprovedUser } from './helpers/auth'

test('stores a hosted key without revealing it and shows limited mode', async ({ page }) => {
  await signInApprovedUser(page)
  await page.goto('/settings/providers')
  await page.getByLabel('Provider').selectOption('openai-compatible')
  await page.getByLabel('Base URL').fill('https://mock-provider.example/v1')
  await page.getByLabel('API key').fill('test-secret-never-render')
  await page.getByRole('button', { name: 'Save and test' }).click()
  await expect(page.getByText('Reduced')).toBeVisible()
  await expect(page.getByText(/must be applied manually/i)).toBeVisible()
  await expect(page.locator('body')).not.toContainText('test-secret-never-render')
})
```

`tests/e2e/helpers/auth.ts` exports `signInApprovedUser(page)`, which signs in the approved fixture account created by the foundation global setup using explicit Email, Password, and Sign in controls.

- [ ] **Step 4: Run complete provider verification**

```bash
npm run test
npm run typecheck
npm run build
npm run test:e2e -- tests/e2e/providers.spec.ts
```

Expected: credentials never render after submission, local Ollama bypasses server routes, unsafe endpoints fail, and limited models show the approved warning.

- [ ] **Step 5: Commit provider management**

```bash
git add app/'(app)'/settings components/providers tests/e2e/helpers/auth.ts tests/e2e/providers.spec.ts .env.example README.md
git commit -m "feat: add synchronized BYOK provider settings"
```

## Provider completion gate

- Hosted credentials survive sign-in on a second device but cannot be revealed in either UI.
- No normal database query, audit event, exception, or captured log includes plaintext keys.
- Native major-provider, OpenRouter, Ollama local/cloud, Z.AI, Kimi/Moonshot, and generic compatible presets create the correct adapters.
- Unsafe custom endpoints and cross-host credential redirects are blocked.
- Local Ollama inference goes directly from browser to localhost.
- Capability probes persist accurate `Full`, `Reduced`, or `Unavailable` status.
- Only after these checks pass may execution proceed to `2026-09-02-ai-review-research-chat.md`.
