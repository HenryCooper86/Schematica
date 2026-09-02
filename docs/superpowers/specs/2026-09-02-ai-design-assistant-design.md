# Schematica AI Design Assistant — Design Spec

**Date:** 2026-09-02
**Status:** Approved section-by-section in chat; pending consolidated review
**Target:** Full-stack evolution of the existing Schematica application

## Summary

Schematica will evolve from a static, local-first diagram editor into an
authenticated, cross-device engineering workspace with a floating AI design
assistant. The assistant will review complete projects or selected diagram
objects, research standards and official technical sources, explain design
tradeoffs, propose reversible diagram changes, help plan implementation, and
produce reviewable engineering reports.

Each approved user brings their own AI provider credentials. Schematica will
support native providers, OpenAI-compatible endpoints, custom adapters,
OpenRouter, Ollama local and cloud, Z.AI, Kimi, and additional providers added
over time. Models with limited capabilities remain usable, but the product must
detect and clearly communicate their limitations.

AI output is decision support, not professional engineering, compliance,
safety, or certification signoff. Safety-critical findings must expose
uncertainty and require human verification.

## Goals

- Provide a floating, project-aware AI assistant without obscuring the diagram.
- Give evidence-backed feedback using standards, official protocol
  specifications, component datasheets, and user-provided requirements.
- Assess whether technologies such as BLE fit a project's actual constraints.
- Help users plan and build projects from hobby through professional scope.
- Synchronize projects, conversations, reviews, reports, and provider settings
  across a user's devices.
- Require administrator approval for every newly registered account.
- Securely synchronize user-supplied provider credentials.
- Support many AI providers through a capability-aware abstraction.
- Let users preview and selectively apply validated AI-proposed diagram edits.
- Export reviews as PDF, Markdown, DOCX, HTML, JSON, and CSV.
- Support opt-in automation without silently applying changes or changing
  providers.

## Non-goals

- AI-generated engineering or compliance signoff.
- Fully autonomous diagram modification.
- Silent provider failover.
- Executing arbitrary model-generated code.
- Bypassing paywalls, standards licensing, robots policies, or access controls.
- Real-time multi-user collaboration in the first release.
- Provider billing, credit resale, or a Schematica-managed model subscription in
  the first release.

## Chosen architecture

The application will migrate to a TypeScript full-stack architecture:

- **Next.js** supplies the application shell, client components, authenticated
  server routes, and streamed AI responses.
- **Vercel** hosts the application and server-side workloads, triggered from the
  existing GitHub repository.
- **Supabase Auth** manages identity and verified sign-in.
- **Supabase PostgreSQL** stores user, project, review, and audit data with Row
  Level Security (RLS).
- **Supabase Storage** holds private report artifacts and uploaded reference
  documents.
- A **secret-store abstraction** holds provider credentials. Supabase Vault is
  the initial candidate; managed-KMS envelope encryption is the production
  fallback if Vault does not meet the launch security gate.
- **Vercel AI SDK** provides native and OpenAI-compatible model adapters behind
  a Schematica-owned provider registry.
- A Schematica-owned **research and citation service** retrieves, normalizes,
  and records evidence independently from model-native web-search features.
- A **durable job runner** executes long research, review, and report workflows.

The existing editor remains the product foundation. Its document model,
renderer, tools, serialization, and undo/redo logic will be migrated into the
new shell rather than replaced without cause.

```text
Next.js application
├── Diagram editor
├── Floating AI assistant
├── Review and report workspace
├── Provider settings
└── Admin approval dashboard
          │ authenticated HTTPS
          ▼
Server application
├── Session and approval guard
├── Project sync service
├── AI orchestrator and provider registry
├── Research and citation service
├── Diagram-action validator
├── Report generator
└── Background job coordinator
          │
          ├── PostgreSQL and RLS
          ├── Private object storage
          ├── Encrypted credential store
          └── Hosted AI providers

Browser ───────────────────────────► Local Ollama
        direct, explicit local route
```

### Alternatives considered

1. **Keep GitHub Pages and add a separate API.** This minimizes frontend
   migration but introduces split deployment, cross-origin authentication,
   CORS, and streaming complexity.
2. **Client-heavy/local-first AI.** This works well for local Ollama but is a
   poor fit for secure synchronized hosted-provider credentials, admin
   approval, durable reports, and background research.

The cohesive full-stack option was selected because the approved identity,
security, synchronization, and workflow requirements already require a trusted
backend.

## Identity, roles, and approval

Roles are `user` and `admin`. Account state is `pending`, `approved`, or
`rejected`.

1. A visitor registers and verifies their email.
2. A profile is created as `pending`.
3. A pending user can see only their account status and sign out.
4. An administrator approves or rejects the account.
5. Every protected server request verifies both the authenticated session and
   the current database approval state.
6. Every approval and role change is audited.

The first administrator is assigned through a controlled deployment bootstrap.
After bootstrap, only an existing administrator may grant administrative
access.

Authorization decisions must not use user-editable authentication metadata.
RLS is enabled on all exposed user-data tables. The service-role credential is
server-only and never bundled into browser JavaScript.

## Data model

All public resource identifiers are random UUIDs.

| Entity | Purpose |
|---|---|
| `profiles` | Role, approval state, display settings, approver, timestamps |
| `projects` | Owner, title, current revision, lifecycle metadata |
| `project_revisions` | Immutable serialized diagram snapshots and revision number |
| `conversations` | Project-scoped assistant threads and selected provider |
| `messages` | User, assistant, system-status, and tool-result messages |
| `provider_connections` | Non-secret provider configuration and secret reference |
| `model_capabilities` | Tested model features, limits, status, and test timestamp |
| `review_jobs` | Durable review state, snapshot, provider, usage, and errors |
| `review_findings` | Severity, category, confidence, objects, and recommendation |
| `research_sources` | URL, publisher, retrieval time, fingerprint, and storage ref |
| `finding_sources` | Validated many-to-many finding/citation relationship |
| `proposed_actions` | Restricted diagram operations and preconditions |
| `report_artifacts` | Format, storage path, revision, content hash, and status |
| `automation_rules` | User-owned opt-in triggers, limits, and enabled state |
| `audit_events` | Security- and workflow-relevant events without secret content |

### Cross-device project synchronization

Project edits retain local autosave for fast interaction and recovery. Server
saves use optimistic concurrency with a revision number. A save based on a
stale revision cannot silently overwrite newer work; the client must reload,
retain a recoverable local copy, and offer an explicit conflict-resolution
path.

Reviews and reports always reference an immutable `project_revision`, not the
mutable current project. AI actions also carry the originating revision and
object precondition hashes.

## Provider credentials

Ordinary provider records contain only provider type, display name, public base
URL, preferred model, capability results, masked key suffix or fingerprint,
last test time, status, and a reference to the encrypted secret.

Credential lifecycle:

1. The approved user submits a key to an authenticated server route over HTTPS.
2. The server validates it and immediately writes it to the secret store.
3. The response returns only a masked identifier.
4. For inference, the server rechecks approval and ownership, decrypts the key
   just in time, and holds it only in process memory.
5. Logs, errors, analytics, messages, and reports must redact credentials.
6. Stored keys cannot be revealed through the UI; they can only be tested,
   replaced, or deleted.
7. Deleting a connection deletes the stored secret and reminds the user that
   provider-side revocation may still be required.

This is encrypted server-side storage, not zero-knowledge encryption: the
trusted Schematica backend must briefly decrypt a hosted-provider key to use it.
The UI must disclose this boundary.

Platform credentials use non-readable sensitive environment variables. The
credential-store implementation must be replaceable. Supabase Vault may be used
for the first implementation, but production launch requires validating its
current maturity, access controls, backup portability, and incident-recovery
story. If that gate fails, use per-secret authenticated encryption with data
encryption keys wrapped by a managed KMS key.

### Custom endpoint protection

Hosted custom endpoints must use HTTPS. Server-side networking blocks loopback,
private, link-local, and cloud-metadata addresses; rechecks resolved addresses;
limits time, redirects, and response size; and never forwards credentials to a
redirected host.

Local Ollama is an explicit exception and follows a separate direct browser to
localhost path. Cloud Ollama uses the hosted-provider path. Local endpoint and
model preferences may sync, but local inference traffic and credentials do not
pass through Schematica's cloud backend.

## Provider registry and capability model

Providers use three integration paths:

- Native AI SDK adapters when available.
- OpenAI-compatible adapters with configurable base URLs.
- Custom adapters implementing the Schematica provider contract.

Initial presets include OpenRouter, Ollama local, Ollama Cloud, Z.AI, Kimi, and
a generic OpenAI-compatible endpoint. The architecture must allow additional
providers without changing the review domain model.

When a connection or model is added, Schematica tests and records streaming,
vision, tool calling, structured output, file input, context limit, and model
availability. Capabilities are tested rather than assumed from provider names.
They expire and are retested periodically or after relevant failures.

Capability degradation is explicit:

- Without tool calling, Schematica gathers evidence before model inference.
- Without structured output, chat and report drafts remain available, but
  applicable diagram actions are disabled.
- Without vision, image-only inputs are omitted with a warning.
- With limited context, the project is reviewed in sections and labeled partial.
- When citation binding cannot be validated, affected claims are unverified.

The UI shows a persistent limited-mode warning. Schematica never silently sends
project data to a fallback provider.

## Floating assistant experience

A floating lower-right button opens a resizable side panel on desktop and a
full-screen view on small screens. The diagram remains visible during desktop
review.

The header displays the project and revision, selected provider and model,
capability level, research state, and privacy scope. Quick actions are:

- Ask about selection
- Review selection
- Review entire project
- Check standard compatibility
- Plan next steps
- Generate report

Users may attach datasheets, requirements, standards excerpts, and supporting
documents. Conversations are project-scoped and synchronize across devices.

## Review and research workflow

```text
User request
  → immutable project snapshot
  → requirements and missing-information check
  → standards/specification/datasheet research
  → normalized evidence package
  → selected model
  → response and citation validation
  → findings and proposed actions
  → preview and user approval
  → new project revision and report artifacts
```

Schematica, rather than the selected model, controls orchestration. Research is
application-level so results remain consistent across providers. The service
prioritizes primary standards bodies, official protocol documentation, and
manufacturer datasheets; records URL, title, publisher, retrieval time, and
content fingerprint; and assigns internal source IDs. Findings may cite only
retrieved source IDs. Unsupported, inaccessible, paywalled, stale, or
conflicting evidence remains visible and is never fabricated.

Web pages and uploaded documents are untrusted input. Active content is removed,
file type and size are limited, retrieved instructions cannot override system
policy, and stored/rendered content is sanitized.

### Finding contract

Every validated finding contains:

- Severity and category
- Title and explanation
- Affected diagram object IDs
- Assumptions and missing information
- Recommendation and alternatives
- Confidence level
- Human-verification requirement
- Supporting source IDs

Standards-fit answers, including BLE suitability, compare project requirements
for range, environment, data rate, payload, latency, power, topology, security,
component availability, certification, cost, and development complexity. The
outcome is `Suitable`, `Suitable with conditions`, `Insufficient information`,
or `Not recommended`, supported by evidence and required tests rather than a
misleading single score.

## Safe diagram actions

Models cannot mutate projects directly or execute arbitrary code. They may
propose only allowlisted operations such as adding or replacing a component,
adding or removing a connection, changing a property, adding an annotation,
creating a requirement, or marking an unresolved issue.

Every operation is schema-validated, authorization-checked, and bound to the
originating revision and object precondition. The UI shows a visual diff and
allows accepting individual changes, accepting all, or rejecting all. Accepted
operations create a new project revision and integrate with undo/redo.
Automation never approves these operations.

## Reports

Reports are generated from immutable project revisions and stored as private
artifacts. Supported outputs are PDF, Markdown, DOCX, HTML, JSON, and CSV.

Templates include quick review, full engineering review, standards
compatibility, component/datasheet review, security/risk review,
implementation plan, and design-decision record.

A full report contains scope, requirements, assumptions, diagram snapshot,
executive summary, findings by severity, compatibility decisions, proposed
changes, unresolved questions, citations, revision/provider/model metadata, and
the engineering disclaimer.

The in-app report view lets users comment and mark findings `accepted`,
`resolved`, `deferred`, or `dismissed`. Reports are private by default. Any
future external sharing uses revocable, expiring, read-only links.

## Automation and usage controls

Automation is opt-in. Supported triggers may include manual request,
significant project revision, pre-export check, scheduled interval, component
replacement, and project milestone.

Automation may research, analyze, generate findings, suggest changes, produce
reports, and notify users. It may not apply diagram changes, switch providers,
expand data scope, purchase anything, or claim certification/signoff.

Before sending a request, the user can inspect provider/model, included project
scope, attachment and web-research scope, capability limitations, estimated
request size, and approximate cost where pricing data is available. Users may
set default provider, output/token limits, usage warnings, automation frequency,
and retention. Provider billing remains external; usage and cost displays are
explicitly estimates unless reported directly by the provider.

Long jobs expose progress, survive page navigation, and notify the user in-app
or optionally by email. Completed research should be reused after downstream
failure to avoid needless repeat requests.

## Reliability and error handling

Review jobs use the state machine:

```text
queued → researching → analyzing → validating → reporting → completed
```

Terminal alternatives are `failed` and `cancelled`. Stage transitions and
retries are idempotent. Stored output supports reconnecting clients.

Provider-specific failures are normalized into invalid credential, unsupported
capability, rate limit, quota/billing, unavailable model, local Ollama
unreachable, inaccessible source, invalid structured response, revision
conflict, or report failure.

A malformed structured response receives one bounded repair attempt. If it
still fails, the result becomes text-only and diagram actions are disabled. A
failed report preserves its completed review. A failed AI request never mutates
the diagram.

Operational logs record job IDs, timings, status, provider type, and usage while
excluding keys and user document content by default. Audited events include
authentication/approval changes, connection tests, review transitions, report
creation, action approvals, and administrative changes.

## Testing and evaluation

### Unit tests

- Provider capability detection and normalization
- Structured finding and diagram-action validation
- Citation/source binding
- Revision and precondition conflict handling
- Permission decisions
- Usage and cost estimation
- Report data transformation

### Integration tests

- Registration, verification, approval, and rejection
- RLS and cross-account isolation
- Credential creation, use, replacement, deletion, and log redaction
- Mocked native, compatible, custom, and failing providers
- Research retrieval, sanitization, and source persistence
- Background retry and idempotency
- Cross-device revision synchronization and conflicts
- Every report format

### End-to-end tests

1. Register and remain blocked while pending.
2. Receive approval and access the application.
3. Create and synchronize a project across two sessions.
4. Add and test a hosted provider.
5. Run a cited full-project review.
6. Use a limited model and receive the correct warning.
7. Preview, selectively apply, and undo diagram actions.
8. Export every supported report format.
9. Reconnect to a running review from another session.
10. Use local Ollama without routing inference through the cloud backend.

Security-focused tests cover cross-account access, object-level authorization,
credential leakage, malicious custom endpoints, DNS rebinding, prompt
injection, unsafe Markdown/HTML, hostile uploads, CSRF, XSS, and rate-limit
abuse.

### AI evaluation suite

Versioned fixtures cover representative electronics designs and BLE suitability
cases with expert-reviewed expected outcomes. Release metrics include citation
validity, unsupported-claim rate, critical false-positive rate, important-issue
detection, diagram-action validity, report consistency, capability-warning
accuracy, and provider-to-provider variance.

## Launch gates

- No known critical authentication, authorization, or credential-handling flaw.
- No cross-account project, conversation, secret, or report access.
- Secret storage passes the production-readiness review and recovery exercise.
- All accepted diagram operations pass authorization, schema, revision, and
  precondition validation.
- Capability warnings match tested behavior.
- Every report format opens and preserves citations and project revision data.
- AI evaluation thresholds are defined and met on the versioned fixture set.
- Rollback and recovery procedures are exercised before production migration.

## Success criteria

An approved user can sign in from multiple devices, synchronize a Schematica
project, add their preferred hosted or local AI provider, receive an
evidence-backed engineering review with capability-appropriate warnings,
preview and approve safe diagram improvements, track findings, and export a
reproducible report without exposing another user's data or silently granting
the model control over the project.

## Primary references

- [Vercel AI SDK provider management](https://ai-sdk.dev/docs/ai-sdk-core/provider-management)
- [Vercel AI SDK OpenAI-compatible providers](https://ai-sdk.dev/providers/openai-compatible-providers)
- [Vercel AI SDK provider catalog](https://ai-sdk.dev/providers/ai-sdk-providers)
- [Ollama AI SDK provider](https://ai-sdk.dev/providers/community-providers/ollama)
- [OpenRouter models](https://openrouter.ai/docs/guides/overview/models)
- [Z.AI OpenAI SDK integration](https://docs.z.ai/guides/develop/openai/python)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Vault](https://supabase.com/docs/guides/database/vault)
- [Vercel sensitive environment variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables)
