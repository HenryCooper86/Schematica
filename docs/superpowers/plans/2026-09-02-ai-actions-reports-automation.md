# Schematica AI Actions, Reports, and Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn validated AI reviews into user-approved reversible diagram changes, multi-format review artifacts, finding workflows, and opt-in automated reviews with cost, privacy, and notification controls.

**Architecture:** Pure action validators transform an immutable project revision into a preview document but never mutate live state. User-approved actions create a normal versioned save. Report renderers consume one normalized report model and write private artifacts to Supabase Storage. One authenticated Vercel cron dispatcher starts due durable workflows; completion creates in-app notifications and optional idempotent email.

**Tech Stack:** Existing Schematica Store/renderer, TypeScript, Zod 4, Noble Hashes 2, Supabase PostgreSQL/Storage, Vercel Workflow 4, Vercel Cron, PDF-Lib, Resvg, DOCX 9, Resend, React Email, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-02-ai-design-assistant-design.md`

## Global Constraints

- Requires the completion gate in `docs/superpowers/plans/2026-09-02-ai-review-research-chat.md`.
- Models may propose only allowlisted operations; arbitrary code and free-form object mutation are forbidden.
- Every proposal is bound to an immutable revision and object precondition hashes.
- No diagram action applies until the user previews and explicitly approves it.
- Accepted actions create an ordinary project revision and remain undoable.
- Automation can research, review, report, and notify, but never apply actions, change providers, expand scope, purchase anything, or claim signoff.
- Reports remain reproducible: each artifact references one immutable project revision, review, sources, provider/model, and content hash.
- Reports are private by default; downloads use short-lived signed URLs.
- Cost displays are estimates unless explicitly reported by the provider.
- Scheduled routes authenticate `Authorization: Bearer ${CRON_SECRET}` and start idempotent durable jobs.
- Email is best-effort and idempotent; an email failure never rolls back a completed review or approval.

---

### Task 1: Add project requirements and a pure diagram-action engine

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/state.js`
- Modify: `src/serialize.js`
- Modify: `types/editor.ts`
- Modify: affected schema assertions and document fixtures under `tests/*.test.js`
- Create: `lib/actions/types.ts`
- Create: `lib/actions/schemas.ts`
- Create: `lib/actions/hash.ts`
- Create: `lib/actions/validate.ts`
- Create: `lib/actions/apply.ts`
- Create: `tests/helpers/diagram-fixtures.ts`
- Test: `tests/serialize.test.js`
- Test: `tests/state.test.js`
- Test: `tests/unit/diagram-actions.test.ts`

**Interfaces:**
- Consumes: schema-1/2 documents, palette parts, buses, and review proposal candidates.
- Produces: schema 2 with `requirements`, `DiagramActionSchema`, `prepareDiagramPatch(input)`, and `applyDiagramPatch(store, patch, actualRevision)`.

- [ ] **Step 1: Install the cross-runtime hashing dependency**

Run:

```bash
npm install @noble/hashes@2
```

Use `sha256` from `@noble/hashes/sha2.js` and `bytesToHex` from `@noble/hashes/utils.js`; this keeps precondition hashing synchronous and identical in Node.js and the browser.

- [ ] **Step 2: Write failing schema migration and action tests**

```ts
import { describe, expect, it } from 'vitest'
import { hashDiagramObject } from '../../lib/actions/hash'
import { prepareDiagramPatch } from '../../lib/actions/validate'
import { sampleDocument } from '../helpers/diagram-fixtures'

describe('prepareDiagramPatch', () => {
  it('creates a preview without mutating the source document', () => {
    const document = sampleDocument()
    const before = structuredClone(document)
    const patch = prepareDiagramPatch({
      document,
      revision: 4,
      actions: [{
        type: 'update-node', targetId: 'n-radio',
        preconditionHash: hashDiagramObject(document.nodes[0]),
        changes: { sublabel: 'nRF52840' },
      }],
    })
    expect(document).toEqual(before)
    expect(patch.preview.nodes[0].sublabel).toBe('nRF52840')
    expect(patch.baseRevision).toBe(4)
  })

  it('rejects stale object preconditions', () => {
    expect(() => prepareDiagramPatch({
      document: sampleDocument(), revision: 4,
      actions: [{ type: 'remove-item', targetId: 'n-radio', preconditionHash: 'stale' }],
    })).toThrow('precondition')
  })
})
```

Extend `tests/serialize.test.js` to load schema 1 and assert it becomes schema 2 with `requirements: []`.

`tests/helpers/diagram-fixtures.ts` exports `sampleDocument()`, `docAt({ x })`, `docWithBus(bus)`, and `docWithPart(part)`. Every helper returns a fresh schema-2 `SchematicaDocument` containing node `n-radio`, a second endpoint node, one wire, and `requirements: []`; only the named position, bus, or part field differs between comparison fixtures.

- [ ] **Step 3: Run tests and confirm they fail**

Run: `npm run test:unit -- tests/unit/diagram-actions.test.ts && node --test tests/serialize.test.js`
Expected: FAIL because action modules and schema-2 migration are absent.

- [ ] **Step 4: Add schema-2 requirements**

```ts
export type ProjectRequirement = {
  id: string
  text: string
  category: 'functional' | 'power' | 'interface' | 'environment' | 'security' | 'safety' | 'compliance' | 'other'
  priority: 'must' | 'should' | 'could'
  status: 'open' | 'verified' | 'rejected'
  source: 'user' | 'ai-proposed'
}
```

`newDoc()` returns `schema: 2` and `requirements: []`. `deserialize()` accepts schema 1, normalizes it to schema 2, and validates unique requirement IDs, enum values, and nonempty text. It continues to warn and best-effort load newer schemas. Search all legacy tests for `schema: 1`, `newDoc()`, and complete-document equality; update only expectations representing newly-created or deserialized documents while retaining explicit schema-1 compatibility fixtures.

- [ ] **Step 5: Define allowlisted action schemas**

Use a discriminated Zod union for `add-node`, `update-node`, `add-wire`, `remove-item`, `add-note`, `add-requirement`, and `update-requirement`. Update-node changes are limited to `label`, `sublabel`, `addr`, `rail`, `notes`, `status`, `flags`, and valid color; coordinates and dimensions are not model-editable. Wire endpoints must reference existing or same-patch temporary node IDs and valid ports/buses.

```ts
export type DiagramPatch = {
  baseRevision: number
  actions: DiagramAction[]
  preview: SchematicaDocument
  changes: Array<{ actionIndex: number; objectId: string; summary: string }>
}
```

- [ ] **Step 6: Implement preconditions, preview, and atomic application**

Canonicalize object keys recursively before SHA-256 hashing, preserve array order, and reject non-JSON values. `hashDiagramObject` encodes the canonical JSON with `TextEncoder`, hashes it with Noble Hashes, and returns lowercase hex. `prepareDiagramPatch` clones the source, verifies every target hash, applies to the clone, runs `deserialize(serialize(preview))`, and returns human-readable changes. `applyDiagramPatch` rechecks the revision and hashes, wraps all operations in one `store.apply`, and throws without mutation on any failure.

- [ ] **Step 7: Verify and commit the action engine**

```bash
npm run test
npm run test:unit -- tests/unit/diagram-actions.test.ts
npm run typecheck
git add package.json package-lock.json src/state.js src/serialize.js types/editor.ts lib/actions tests/*.test.js tests/helpers/diagram-fixtures.ts tests/unit/diagram-actions.test.ts
git commit -m "feat: validate reversible AI diagram actions"
```

---

### Task 2: Persist, preview, approve, and undo proposed changes

**Files:**
- Create: `supabase/migrations/202609020007_proposed_actions.sql`
- Create: `lib/actions/repository.ts`
- Create: `components/ai/action-preview.tsx`
- Create: `components/ai/action-list.tsx`
- Create: `components/ai/action-overlay.tsx`
- Create: `app/api/reviews/[reviewId]/actions/route.ts`
- Create: `app/api/reviews/[reviewId]/actions/apply/route.ts`
- Modify: `components/ai/assistant-panel.tsx`
- Modify: `components/editor/synced-editor.tsx`
- Create: `tests/helpers/action-fixtures.ts`
- Test: `tests/unit/action-preview.test.tsx`
- Test: `tests/integration/apply-actions.test.ts`

**Interfaces:**
- Consumes: review result candidates and pure action engine.
- Produces: stored action batches, visual diff, per-action selection, `applyApprovedActions(input)`, and a new synchronized revision.

- [ ] **Step 1: Write the failing approval UI test**

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActionPreview } from '../../components/ai/action-preview'
import { twoActions } from '../helpers/action-fixtures'

describe('ActionPreview', () => {
  it('applies only checked actions after explicit confirmation', async () => {
    const apply = vi.fn()
    render(<ActionPreview actions={twoActions()} onApply={apply} />)
    fireEvent.click(screen.getByLabelText('Replace radio part'))
    fireEvent.click(screen.getByRole('button', { name: 'Apply 1 selected change' }))
    expect(apply).toHaveBeenCalledWith([0])
  })
})
```

`tests/helpers/action-fixtures.ts` exports `twoActions()` as two fresh, schema-valid `ActionPreviewItem` records. The first is labeled `Replace radio part` and wraps an `update-node` action for `n-radio`; the second is labeled `Add decoupling note` and wraps an `add-note` action. Both reference the deterministic diagram fixture and valid precondition hashes.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test:unit -- tests/unit/action-preview.test.tsx`
Expected: FAIL because the preview component does not exist.

- [ ] **Step 3: Persist immutable proposals**

Create `proposed_actions` with owner, review job, project revision, ordered action JSON, validation status/error, user decision (`pending | accepted | rejected`), decision timestamp, and applied revision. RLS follows the linked project owner. The review workflow inserts only actions that pass schema validation; invalid candidates are recorded as non-applicable review notes, not executable proposals.

- [ ] **Step 4: Render a safe visual diff**

Clone the document and apply selected actions to a preview-only Store. Render changed/added objects with cyan outlines and removals with red ghost outlines. The action list shows before/after field values and source finding. Users may check individual actions, accept all, or reject all. No preview operation touches the live Store.

- [ ] **Step 5: Apply through the normal revision path**

The apply route verifies approval, project/review ownership, pending decision, current revision, action indexes, and preconditions. It calls the same atomic project-save RPC with the patched document and marks proposals accepted only after the revision commits. The client then replaces its document with the saved revision and registers one undo snapshot.

- [ ] **Step 6: Verify and commit the approval flow**

```bash
npx supabase db reset
npm run test:unit -- tests/unit/action-preview.test.tsx tests/integration/apply-actions.test.ts
npm run typecheck
npm run build
git add supabase/migrations/202609020007_proposed_actions.sql lib/actions/repository.ts components/ai components/editor/synced-editor.tsx app/api/reviews tests/helpers/action-fixtures.ts tests/unit/action-preview.test.tsx tests/integration/apply-actions.test.ts
git commit -m "feat: preview and approve AI diagram changes"
```

---

### Task 3: Generate reproducible reports in every approved format

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `supabase/migrations/202609020008_report_artifacts.sql`
- Create: `lib/reports/types.ts`
- Create: `lib/reports/model.ts`
- Create: `lib/reports/markdown.ts`
- Create: `lib/reports/html.ts`
- Create: `lib/reports/json.ts`
- Create: `lib/reports/csv.ts`
- Create: `lib/reports/pdf.ts`
- Create: `lib/reports/docx.ts`
- Create: `lib/reports/storage.ts`
- Create: `app/api/reviews/[reviewId]/reports/route.ts`
- Create: `app/api/reports/[artifactId]/download/route.ts`
- Modify: `workflows/review.ts`
- Modify: `workflows/review-steps.ts`
- Create: `components/reviews/report-template-picker.tsx`
- Create: `tests/helpers/report-fixtures.ts`
- Test: `tests/unit/report-renderers.test.ts`
- Test: `tests/integration/report-storage.test.ts`

**Interfaces:**
- Consumes: immutable project revision, completed review, findings, citations, proposed-action decisions, and diagram SVG.
- Produces: `ReportModel`, six format renderers, private artifacts, hashes, and short-lived download URLs.

- [ ] **Step 1: Install report dependencies**

Run:

```bash
npm install pdf-lib @resvg/resvg-js docx@9
```

- [ ] **Step 2: Write failing renderer contract tests**

```ts
import { describe, expect, it } from 'vitest'
import { renderCsv, renderHtml, renderJson, renderMarkdown } from '../../lib/reports'
import { sampleReportModel } from '../helpers/report-fixtures'

describe('report renderers', () => {
  it('preserves revision and citations in text formats', () => {
    const report = sampleReportModel()
    expect(renderMarkdown(report)).toContain('Project revision: 7')
    expect(renderMarkdown(report)).toContain('[SRC-1]')
    expect(renderHtml(report)).toContain('data-source-id="SRC-1"')
    expect(JSON.parse(renderJson(report)).project.revision).toBe(7)
    expect(renderCsv(report)).toContain('finding_id,severity,status,title,source_ids')
  })
})
```

`tests/helpers/report-fixtures.ts` exports a fresh `sampleReportModel()` with project revision 7, finding `F-1`, source `SRC-1`, one proposed change, and a minimal trusted diagram SVG.

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npm run test:unit -- tests/unit/report-renderers.test.ts`
Expected: FAIL because report modules do not exist.

- [ ] **Step 4: Define one normalized report model**

```ts
export type ReportTemplate =
  | 'quick-review'
  | 'full-engineering-review'
  | 'standards-compatibility'
  | 'component-datasheet-review'
  | 'security-risk-review'
  | 'implementation-plan'
  | 'design-decision-record'

export type ReportFinding = {
  id: string
  severity: 'info' | 'warning' | 'error' | 'critical'
  status: 'open' | 'accepted' | 'resolved' | 'deferred' | 'dismissed'
  title: string
  explanation: string
  recommendation: string
  confidence: number
  sourceIds: string[]
}

export type ReportModel = {
  generatedAt: string
  template: ReportTemplate
  project: { id: string; title: string; revision: number; diagramSvg: string }
  review: { id: string; scope: string; provider: string; model: string; disclaimer: string }
  executiveSummary: string
  assumptions: string[]
  findings: Array<ReportFinding>
  sources: Array<{ id: string; title: string; publisher: string | null; url: string; retrievedAt: string }>
  proposedChanges: Array<{ summary: string; decision: string }>
  unresolvedQuestions: string[]
}
```

Build this only from rows tied to the same owner, review, and project revision. Sanitize titles/text and never include provider secrets or hidden chain-of-thought.

- [ ] **Step 5: Implement six renderers and private storage**

The template picker offers quick review, full engineering review, standards compatibility, component/datasheet review, security/risk review, implementation plan, and design-decision record. Every template maps to a deterministic section policy; the full template includes requirements, scope, assumptions, diagram, executive summary, findings, compatibility decisions, proposals, unresolved questions, sources, revision/provider/model metadata, and disclaimer.

Markdown, HTML, JSON, and CSV are deterministic pure renderers. PDF uses Resvg to rasterize the trusted diagram SVG and PDF-Lib for paginated text, headings, tables, page numbers, and source URLs. DOCX uses `docx` with the same section order. Tests assert `%PDF-` magic, `PK` DOCX ZIP magic, correct MIME/extensions, content hashes, and citation IDs in extracted output.

The report route calls `requireSameOrigin`, validates template and requested formats, rechecks ownership, and transitions the durable job through `reporting` when report generation is part of the original review request. A report-rendering failure marks only its artifact failed and preserves the completed findings. Upload successful files to a private `reports` bucket at `${ownerId}/${reviewId}/${artifactId}.${extension}`. The download route rechecks ownership and returns a signed URL expiring in 300 seconds.

- [ ] **Step 6: Verify and commit reporting**

```bash
npx supabase db reset
npm run test:unit -- tests/unit/report-renderers.test.ts tests/integration/report-storage.test.ts
npm run typecheck
npm run build
git add package.json package-lock.json supabase/migrations/202609020008_report_artifacts.sql lib/reports app/api/reviews app/api/reports workflows/review.ts workflows/review-steps.ts components/reviews/report-template-picker.tsx tests/helpers/report-fixtures.ts tests/unit/report-renderers.test.ts tests/integration/report-storage.test.ts
git commit -m "feat: export reproducible AI review reports"
```

---

### Task 4: Add the in-app report review workspace

**Files:**
- Create: `supabase/migrations/202609020009_finding_review.sql`
- Create: `lib/findings/types.ts`
- Create: `lib/findings/repository.ts`
- Create: `app/(app)/projects/[projectId]/reviews/page.tsx`
- Create: `app/(app)/projects/[projectId]/reviews/[reviewId]/page.tsx`
- Create: `app/(app)/projects/[projectId]/reviews/[reviewId]/actions.ts`
- Create: `components/reviews/review-summary.tsx`
- Create: `components/reviews/finding-card.tsx`
- Create: `components/reviews/finding-status.tsx`
- Create: `components/reviews/report-downloads.tsx`
- Test: `tests/unit/finding-status.test.ts`
- Test: `tests/integration/finding-review.test.ts`

**Interfaces:**
- Consumes: completed review, report artifacts, citations, and current user.
- Produces: `setFindingStatus`, `addFindingComment`, private review pages, and artifact download controls.

- [ ] **Step 1: Write the failing status-transition tests**

```ts
import { describe, expect, it } from 'vitest'
import { canTransitionFinding } from '../../lib/findings/types'

describe('finding status transitions', () => {
  it('allows deliberate user review states', () => {
    expect(canTransitionFinding('open', 'accepted')).toBe(true)
    expect(canTransitionFinding('accepted', 'resolved')).toBe(true)
    expect(canTransitionFinding('resolved', 'open')).toBe(true)
    expect(canTransitionFinding('dismissed', 'resolved')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test:unit -- tests/unit/finding-status.test.ts`
Expected: FAIL because finding status logic does not exist.

- [ ] **Step 3: Add finding status and comments**

Add `status` (`open | accepted | resolved | deferred | dismissed`), `status_reason`, `updated_by`, and `updated_at` to `review_findings`. Create `finding_comments` with owner/finding/body/timestamps. RLS follows the review owner. A transactional RPC updates status and writes an audit event; dismissal requires a nonempty reason.

- [ ] **Step 4: Build project review pages**

The list page shows revision, completion date, provider/model, highest severity, and unresolved count. The detail page shows executive summary, scope, assumptions, grouped findings, inline source metadata, comments, action decisions, and available artifacts. Each finding exposes only valid transitions and makes critical human-verification requirements prominent.

- [ ] **Step 5: Verify private review access and commit**

```bash
npx supabase db reset
npm run test:unit -- tests/unit/finding-status.test.ts tests/integration/finding-review.test.ts
npm run typecheck
npm run build
git add supabase/migrations/202609020009_finding_review.sql lib/findings app/'(app)'/projects components/reviews tests/unit/finding-status.test.ts tests/integration/finding-review.test.ts
git commit -m "feat: add reviewable AI finding workspace"
```

---

### Task 5: Add opt-in automation and usage controls

**Files:**
- Create: `supabase/migrations/202609020010_automation_notifications.sql`
- Create: `lib/automation/types.ts`
- Create: `lib/automation/significant-change.ts`
- Create: `lib/automation/repository.ts`
- Create: `lib/automation/dispatch.ts`
- Create: `lib/automation/retention.ts`
- Create: `app/(app)/settings/automation/page.tsx`
- Create: `app/(app)/settings/automation/actions.ts`
- Create: `app/api/cron/automation/route.ts`
- Create: `vercel.json`
- Create: `components/ai/request-preview.tsx`
- Create: `components/ai/usage-summary.tsx`
- Modify: `components/editor/use-project-sync.ts`
- Modify: `app/api/reviews/route.ts`
- Test: `tests/unit/significant-change.test.ts`
- Test: `tests/integration/automation-dispatch.test.ts`
- Test: `tests/integration/retention.test.ts`

**Interfaces:**
- Consumes: project revisions, review starter, provider capabilities, and usage records.
- Produces: `AutomationRule`, `isSignificantChange(before, after)`, `dispatchDueAutomations(now)`, `purgeExpiredAiData(now)`, request preview, limits, and one daily cron route.

- [ ] **Step 1: Write the failing significant-change tests**

```ts
import { describe, expect, it } from 'vitest'
import { isSignificantChange } from '../../lib/automation/significant-change'
import { docAt, docWithBus, docWithPart } from '../helpers/diagram-fixtures'

describe('isSignificantChange', () => {
  it('ignores position-only edits and detects engineering changes', () => {
    expect(isSignificantChange(docAt({ x: 0 }), docAt({ x: 80 }))).toBe(false)
    expect(isSignificantChange(docWithBus('i2c'), docWithBus('spi'))).toBe(true)
    expect(isSignificantChange(docWithPart('wifi'), docWithPart('lora'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test:unit -- tests/unit/significant-change.test.ts`
Expected: FAIL because automation modules do not exist.

- [ ] **Step 3: Add explicit automation and usage records**

Create `automation_rules` with owner/project, trigger (`significant-revision | component-replacement | pre-export | daily | weekly | milestone`), provider connection/model, scope, max input/output tokens, enabled flag, next-run time, and last-run time. Create `notifications` for in-app events. Add user settings for default provider/model, daily/monthly warning thresholds, automatic-review frequency, nullable retention days, and email preference. RLS is owner-only. Retention defaults to indefinite; choosing a duration requires an explicit confirmation that identifies conversations, evidence, uploads, and report artifacts as affected while excluding projects/revisions, audit events, and provider credentials.

- [ ] **Step 4: Implement trigger policy and request preview**

`isSignificantChange` detects node/requirement add/remove, component kind/part-number/rail/status/flags changes, and wire endpoint/bus changes; it ignores coordinates, viewport, journey camera, and title-only edits. A component identity/part-number change also matches the explicit `component-replacement` trigger. Saving a significant revision schedules at most one job per rule/revision. Pre-export checks prompt the user but do not block downloads unless the user explicitly runs the check.

Before every request, `RequestPreview` shows provider/model, project revision and selected object count, attachments, web-research state, tested limitations, max token limits, and approximate cost. The user must approve any provider change.

- [ ] **Step 5: Add one authenticated daily dispatcher**

```json
{
  "crons": [
    { "path": "/api/cron/automation", "schedule": "15 2 * * *" }
  ]
}
```

```ts
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const result = await dispatchDueAutomations(new Date())
  return Response.json(result)
}
```

The dispatcher claims due rules with row locks, uses a unique `(rule_id, scheduled_for)` idempotency key, starts the existing review workflow, computes the next UTC run, and returns promptly. Workflow jobs, not the cron route, perform research and inference. The same once-daily invocation calls `purgeExpiredAiData(now)`: for users with an explicit retention duration, it deletes expired private storage objects first, deletes their linked AI rows transactionally, and writes aggregate deletion counts to the audit log without content or filenames. Retry-safe tombstones prevent a database row from claiming a missing object was successfully retained.

- [ ] **Step 6: Verify and commit automation**

```bash
npx supabase db reset
npm run test:unit -- tests/unit/significant-change.test.ts tests/integration/automation-dispatch.test.ts tests/integration/retention.test.ts
npm run typecheck
npm run build
git add supabase/migrations/202609020010_automation_notifications.sql lib/automation app/'(app)'/settings/automation app/api/cron components/ai components/editor/use-project-sync.ts app/api/reviews/route.ts vercel.json tests/unit/significant-change.test.ts tests/integration/automation-dispatch.test.ts tests/integration/retention.test.ts
git commit -m "feat: add opt-in AI review automation"
```

---

### Task 6: Add notifications and run the production launch gate

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `lib/email/client.ts`
- Create: `lib/email/send-notification.ts`
- Create: `emails/account-approved.tsx`
- Create: `emails/report-ready.tsx`
- Create: `components/notifications/notification-menu.tsx`
- Modify: `app/admin/registrations/actions.ts`
- Modify: `workflows/review-steps.ts`
- Create: `tests/unit/email-notifications.test.tsx`
- Create: `tests/security/ai-platform-security.test.ts`
- Create: `tests/e2e/ai-platform.spec.ts`
- Create: `docs/operations/ai-platform-runbook.md`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes: approval events, completed reviews/reports, notification preferences, and audit logging.
- Produces: in-app notifications, idempotent optional emails, redacted operational diagnostics, full product verification, and deployment runbook.

- [ ] **Step 1: Install notification packages**

Run:

```bash
npm install resend@6 react-email@5 @react-email/components@1
```

- [ ] **Step 2: Write failing idempotency tests**

```tsx
import { describe, expect, it, vi } from 'vitest'
import { sendNotificationEmail } from '../../lib/email/send-notification'

describe('sendNotificationEmail', () => {
  it('uses a stable idempotency key and honors opt-out', async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null })
    await sendNotificationEmail({
      send, user: { email: 'user@example.test', emailNotifications: true },
      event: { type: 'report-ready', id: 'review-7', projectTitle: 'Sensor' },
    })
    expect(send).toHaveBeenCalledWith(expect.anything(), {
      headers: { 'Idempotency-Key': 'report-ready-review-7' },
    })
    await sendNotificationEmail({
      send, user: { email: 'user@example.test', emailNotifications: false },
      event: { type: 'report-ready', id: 'review-8', projectTitle: 'Sensor' },
    })
    expect(send).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 3: Implement in-app and email completion events**

Approval and report completion always insert an in-app notification. When email is enabled and `RESEND_API_KEY` plus `SCHEMATICA_EMAIL_FROM` are configured, send a React Email template with no project document or finding content—only account/project name and an authenticated link. Use deterministic idempotency keys. Store delivery ID/status, not rendered email bodies. Email failures are audited and do not change the successful domain transaction.

- [ ] **Step 4: Add adversarial security verification**

`tests/security/ai-platform-security.test.ts` must assert cross-account project/conversation/report/action requests return 404 or 403; custom URLs cannot hit loopback/private/metadata; provider keys never appear in JSON, HTML, logs, errors, reports, or email; malicious source instructions do not change the system prompt; raw HTML in model Markdown does not execute; hostile uploads fail type/size checks; stale actions fail without mutation; and cron requests without the exact bearer secret return 401.

- [ ] **Step 5: Run the complete launch gate**

```bash
npx supabase db reset
npm run test
npx vitest --config vitest.integration.config.ts
npm run typecheck
npm run build
npm run test:e2e -- tests/e2e/ai-platform.spec.ts
```

Manually open one generated PDF and DOCX, verify the diagram and citations, connect one real hosted BYOK provider, connect local Ollama, run both BLE fixtures, apply/undo one approved change, and reconnect to a running review from a second browser session.

- [ ] **Step 6: Document operations and deploy the verified build**

The runbook records environment variables, Supabase migration/rollback commands, admin bootstrap, secret-store recovery, key rotation, workflow inspection/cancellation, cron authentication, report bucket policy, Resend domain setup, incident redaction, and rollback to the previous Vercel deployment.

After configuring Vercel Sensitive Environment Variables and passing the preview smoke test, run:

```bash
vercel deploy --prod
```

Keep GitHub Pages available until the Vercel production URL passes sign-in, project sync, provider test, full review, action preview, and report download checks.

- [ ] **Step 7: Commit the launch-ready platform**

```bash
git add package.json package-lock.json lib/email emails components/notifications app/admin/registrations/actions.ts workflows/review-steps.ts tests/unit/email-notifications.test.tsx tests/security tests/e2e/ai-platform.spec.ts docs/operations/ai-platform-runbook.md .env.example README.md
git commit -m "feat: complete the AI-assisted engineering workflow"
```

## Final completion gate

- All legacy, unit, integration, workflow, security, and E2E suites pass.
- No cross-account resource access or plaintext credential exposure is found.
- Every accepted action passes authorization, schema, revision, and precondition checks and remains undoable.
- PDF, Markdown, DOCX, HTML, JSON, and CSV artifacts open and preserve revision/citation metadata.
- Scheduled and significant-change reviews are opt-in, idempotent, provider-bound, and never apply actions.
- Capability warnings match tested model behavior.
- BLE evaluation fixtures meet citation, unsupported-claim, compatibility, and action-validity thresholds.
- Secret storage passes its production-readiness and recovery gate.
- The Vercel production deployment passes the complete smoke journey before GitHub Pages is retired.
