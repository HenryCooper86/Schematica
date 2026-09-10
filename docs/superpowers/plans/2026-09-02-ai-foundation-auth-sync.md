# Schematica AI Foundation, Authentication, and Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Schematica into an authenticated Next.js application while preserving the existing editor and adding administrator-approved registration plus conflict-safe cross-device project synchronization.

**Architecture:** Keep the existing pure diagram modules and place the current imperative UI behind a mountable client adapter. Next.js Server Components load approved-user and project data, client components host the interactive editor, and Supabase Auth/PostgreSQL provide sessions, RLS, immutable revisions, and optimistic concurrency.

**Tech Stack:** Node.js 22, Next.js 16, React 19, TypeScript, Supabase Auth/PostgreSQL/Storage, Zod 4, Vitest 4, Playwright, existing ES modules/SVG editor.

**Spec:** `docs/superpowers/specs/2026-09-02-ai-design-assistant-design.md`

## Global Constraints

- Registration is open, but every new account starts `pending` and cannot access projects until an administrator approves it.
- Authorization uses a fresh database approval check on every protected server request and RLS as defense in depth.
- Authorization decisions never use user-editable authentication metadata.
- Public resource identifiers are random UUIDs.
- State-changing Route Handlers require an authenticated session plus a validated same-origin request; Server Actions retain Next.js origin checks and Supabase cookies use `HttpOnly`, `Secure` in production, and `SameSite=Lax`.
- Project writes use immutable revisions and optimistic concurrency; a stale save never silently overwrites newer work.
- Existing editor behavior, schema-1 files, local autosave, undo/redo, and the current `npm test` suite remain supported throughout migration.
- Default to the Node.js runtime. Do not opt into the Edge runtime.
- Keep browser-only code inside Client Components; Server Component props must be serializable.
- Secrets and the Supabase service-role key never enter client bundles or logs.
- GitHub remains the source repository. Vercel replaces GitHub Pages only after production verification succeeds.

---

### Task 1: Establish the Next.js and TypeScript application shell

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `package-lock.json`
- Create: `tsconfig.json`
- Create: `next-env.d.ts`
- Create: `next.config.ts`
- Create: `vitest.config.ts`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `app/globals.css`
- Create: `app/error.tsx`
- Create: `app/global-error.tsx`
- Create: `lib/app-meta.ts`
- Test: `tests/unit/app-meta.test.ts`

**Interfaces:**
- Consumes: existing `css/style.css` and browser editor assets.
- Produces: `APP_NAME`, `APP_DESCRIPTION`, `APP_ROUTES`, a working Next.js root layout, and standard `dev`, `build`, `typecheck`, `test`, and `test:e2e` commands.

- [ ] **Step 1: Install the pinned major-version toolchain**

Run:

```bash
npm install next@16 react@19 react-dom@19 @supabase/ssr@0.12 @supabase/supabase-js@2 zod@4
npm install --save-dev typescript@7 @types/node@22 @types/react@19 @types/react-dom@19 vitest@4 @vitejs/plugin-react @testing-library/react@16 @testing-library/jest-dom jsdom @playwright/test@1 supabase@2
```

Replace the `scripts` object in `package.json` with:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "typecheck": "tsc --noEmit",
  "test": "npm run test:legacy && npm run test:unit",
  "test:legacy": "node --test tests/*.test.js",
  "test:unit": "vitest run",
  "test:e2e": "playwright test"
}
```

- [ ] **Step 2: Write the failing application-metadata test**

```ts
// tests/unit/app-meta.test.ts
import { describe, expect, it } from 'vitest'
import { APP_DESCRIPTION, APP_NAME, APP_ROUTES } from '../../lib/app-meta'

describe('application metadata', () => {
  it('publishes stable routes for auth and projects', () => {
    expect(APP_NAME).toBe('Schematica')
    expect(APP_DESCRIPTION).toContain('hardware')
    expect(APP_ROUTES).toEqual({
      home: '/',
      signIn: '/sign-in',
      register: '/register',
      pending: '/pending',
      projects: '/projects',
      adminRegistrations: '/admin/registrations',
    })
  })
})
```

- [ ] **Step 3: Run the test and confirm the missing module failure**

Run: `npm run test:unit -- tests/unit/app-meta.test.ts`
Expected: FAIL because `lib/app-meta.ts` does not exist.

- [ ] **Step 4: Add the minimal metadata and application shell**

```ts
// lib/app-meta.ts
export const APP_NAME = 'Schematica'
export const APP_DESCRIPTION = 'AI-assisted hardware architecture diagrams'
export const APP_ROUTES = {
  home: '/',
  signIn: '/sign-in',
  register: '/register',
  pending: '/pending',
  projects: '/projects',
  adminRegistrations: '/admin/registrations',
} as const
```

```tsx
// app/layout.tsx
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { APP_DESCRIPTION, APP_NAME } from '@/lib/app-meta'
import './globals.css'

export const metadata: Metadata = { title: APP_NAME, description: APP_DESCRIPTION }

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}
```

```tsx
// app/page.tsx
import Link from 'next/link'
import { APP_ROUTES } from '@/lib/app-meta'

export default function HomePage() {
  return (
    <main className="landing">
      <h1>Schematica</h1>
      <p>Design, review, and document embedded hardware systems.</p>
      <Link href={APP_ROUTES.signIn}>Sign in</Link>
    </main>
  )
}
```

Set `compilerOptions.paths` to `{ "@/*": ["./*"] }`, import `../css/style.css` from `app/globals.css`, and create client error boundaries whose retry buttons call `reset()`.

- [ ] **Step 5: Verify the shell**

Run:

```bash
npm run test
npm run typecheck
npm run build
```

Expected: legacy tests and the metadata test pass; typecheck and production build exit 0.

- [ ] **Step 6: Commit the shell**

```bash
git add package.json package-lock.json .gitignore tsconfig.json next-env.d.ts next.config.ts vitest.config.ts app lib/app-meta.ts tests/unit/app-meta.test.ts
git commit -m "build: add Next.js application shell"
```

---

### Task 2: Make the existing diagram editor mountable

**Files:**
- Modify: `index.html`
- Modify: `src/main.js`
- Modify: `src/tools.js`
- Create: `src/standalone.js`
- Create: `public/editor-shell.html`
- Create: `components/editor/editor-client.tsx`
- Create: `types/editor.ts`
- Test: `tests/unit/editor-contract.test.ts`
- Test: `tests/unit/editor-mount.test.ts`

**Interfaces:**
- Consumes: `Store`, `deserialize`, and all current editor modules.
- Produces: `mountEditor(options): EditorController`, where `EditorController` exposes `getDocument()`, `replaceDocument(doc)`, `subscribe(listener)`, and `destroy()`.

- [ ] **Step 1: Write the controller-contract tests**

```ts
// tests/unit/editor-contract.test.ts
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { EditorController, SchematicaDocument } from '../../types/editor'

describe('EditorController', () => {
  it('defines the synchronization boundary used by React', () => {
    const doc = { schema: 1, title: 'Board', nodes: [], wires: [], zones: [], notes: [], journey: [] } satisfies SchematicaDocument
    const controller = null as unknown as EditorController
    expectTypeOf(controller.getDocument()).toEqualTypeOf<SchematicaDocument>()
    expectTypeOf(controller.replaceDocument).parameter(0).toEqualTypeOf<SchematicaDocument>()
    expect(doc.schema).toBe(1)
  })
})
```

- [ ] **Step 2: Run the contract test and confirm it fails**

Run: `npm run test:unit -- tests/unit/editor-contract.test.ts`
Expected: FAIL because `types/editor.ts` does not exist.

- [ ] **Step 3: Define the serializable document and controller types**

```ts
// types/editor.ts
export type SchematicaDocument = {
  schema: number
  title: string
  nodes: Array<Record<string, unknown> & { id: string }>
  wires: Array<Record<string, unknown> & { id: string }>
  zones: Array<Record<string, unknown> & { id: string }>
  notes: Array<Record<string, unknown> & { id: string }>
  journey: Array<Record<string, unknown> & { id: string }>
}

export type EditorController = {
  getDocument(): SchematicaDocument
  replaceDocument(document: SchematicaDocument): void
  subscribe(listener: (document: SchematicaDocument) => void): () => void
  destroy(): void
}
```

- [ ] **Step 4: Extract the static shell and editor lifecycle**

Move the existing `#app`, file input, and dialog markup from `index.html` into `public/editor-shell.html` without changing element IDs. Keep `index.html` as the static fallback by inserting that same markup and loading `src/standalone.js`.

Refactor `src/main.js` so no DOM access happens at module import time. Replace global element lookups with `root.querySelector`, collect every existing Store subscription in `cleanup`, and treat `replaceDocument` as a remote replacement that notifies subscribers without invoking the local `onCommit` save callback:

```js
export function mountEditor({ root = document, initialDocument = null, onCommit = () => {} } = {}) {
  const abort = new AbortController();
  const store = new Store(initialDocument || loadAutosave() || newDoc());
  const subscribers = new Set();
  const cleanup = [];
  let suppressNextCommit = false;
  const publish = () => {
    const snapshot = structuredClone(store.doc);
    if (!suppressNextCommit) onCommit(snapshot);
    suppressNextCommit = false;
    for (const listener of subscribers) listener(snapshot);
  };

  // Existing renderer, tools, controls, dialogs, and subscriptions are
  // initialized here through root.querySelector. Register DOM listeners with
  // { signal: abort.signal } and push every Store unsubscribe into cleanup.
  cleanup.push(store.subscribe(publish));

  return {
    getDocument: () => structuredClone(store.doc),
    replaceDocument(document) {
      suppressNextCommit = true;
      store.replaceDoc(structuredClone(document));
    },
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    destroy() {
      abort.abort();
      for (const dispose of cleanup.splice(0)) dispose();
      subscribers.clear();
    },
  };
}
```

Keep the browser bootstrap in a separate entry point so importing `src/main.js` remains side-effect free:

```js
// src/standalone.js
import { mountEditor } from './main.js';

mountEditor();
```

Add an optional `signal` argument to `createTools`. Supply that signal to every SVG/window listener, combining it with `{ passive: false }` for the wheel listener. Return `destroy()` from `createTools` for any timer or non-listener cleanup.

- [ ] **Step 5: Mount the editor from React after its static shell loads**

```tsx
// components/editor/editor-client.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import type { EditorController, SchematicaDocument } from '@/types/editor'

export function EditorClient({
  initialDocument,
  onCommit,
}: {
  initialDocument: SchematicaDocument
  onCommit(document: SchematicaDocument): void
}) {
  const host = useRef<HTMLDivElement>(null)
  const [markup, setMarkup] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/editor-shell.html').then((response) => response.text()).then((html) => {
      if (!cancelled) setMarkup(html)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!markup || !host.current) return
    let controller: EditorController | undefined
    let disposed = false
    void import('@/src/main.js').then(({ mountEditor }) => {
      const mounted = mountEditor({ root: host.current!, initialDocument, onCommit })
      if (disposed) mounted.destroy()
      else controller = mounted
    })
    return () => {
      disposed = true
      controller?.destroy()
    }
  }, [initialDocument, markup, onCommit])

  return <div ref={host} dangerouslySetInnerHTML={{ __html: markup }} />
}
```

`editor-shell.html` is trusted compile-time application markup; no user or model content may be interpolated into it.
`SyncedEditor` passes a memoized `onCommit` callback so ordinary React renders do not remount the editor.

- [ ] **Step 6: Verify legacy behavior and lifecycle cleanup**

Configure `tests/unit/editor-mount.test.ts` for the JSDOM environment. The test injects `editor-shell.html`, mounts and destroys the first controller, mounts a second controller, dispatches one toolbar click, and asserts exactly one commit. This catches leaked listeners without requiring DOM globals in the legacy Node test suite. Run:

```bash
npm run test
npm run typecheck
npm run build
```

Expected: all legacy and new tests pass; Next builds the client-only editor import without server-side DOM access.

- [ ] **Step 7: Commit the editor adapter**

```bash
git add index.html public/editor-shell.html components/editor src/main.js src/standalone.js src/tools.js types/editor.ts tests/unit/editor-contract.test.ts tests/unit/editor-mount.test.ts
git commit -m "refactor: expose a mountable diagram editor"
```

---

### Task 3: Add the Supabase schema, RLS, and typed clients

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/202609020001_foundation.sql`
- Create: `supabase/seed.sql`
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/admin.ts`
- Create: `lib/supabase/database.types.ts`
- Create: `.env.example`
- Test: `tests/integration/foundation-rls.test.ts`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY`.
- Produces: `createBrowserClient()`, `createServerClient()`, `createAdminClient()`, `is_approved()`, `is_admin()`, and RLS-protected profile/project/revision/audit tables.

- [ ] **Step 1: Initialize local Supabase and write the failing RLS test**

Run: `npx supabase init`

Create an integration test that provisions two approved users and asserts user A cannot select user B's project:

```ts
// tests/integration/foundation-rls.test.ts
import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

describe('foundation RLS', () => {
  it('prevents cross-account project reads', async () => {
    const owner = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_USER_A_KEY!)
    const stranger = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_USER_B_KEY!)
    const { data: project, error } = await owner.from('projects').insert({ title: 'Private board' }).select().single()
    expect(error).toBeNull()
    const result = await stranger.from('projects').select('id').eq('id', project!.id)
    expect(result.data).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test and confirm the missing-table failure**

Run: `npx supabase start && npm run test:unit -- tests/integration/foundation-rls.test.ts`
Expected: FAIL because `public.projects` does not exist.

- [ ] **Step 3: Create the foundation migration**

The migration must define these exact enums and tables:

```sql
create type public.user_role as enum ('user', 'admin');
create type public.approval_status as enum ('pending', 'approved', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role public.user_role not null default 'user',
  approval_status public.approval_status not null default 'pending',
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  current_revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  revision integer not null check (revision > 0),
  document jsonb not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (project_id, revision)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  subject_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

Add a trigger on `auth.users` that creates a pending profile. Add `security definer set search_path = ''` functions `public.is_approved()` and `public.is_admin()`. Enable RLS on all four tables. Profiles are self-readable; admins can list/update profiles; approved owners can CRUD their projects and read their revisions; revisions are insert-only through the save RPC; audit events are admin-readable and server-inserted. Revoke direct access to service-only functions from `anon` and `authenticated`.

- [ ] **Step 4: Add typed Supabase clients**

```ts
// lib/supabase/admin.ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
```

Use `@supabase/ssr` and awaited `cookies()` in `server.ts`. Generate `database.types.ts` with:

```bash
npx supabase gen types typescript --local > lib/supabase/database.types.ts
```

- [ ] **Step 5: Reset the database and verify RLS**

Run:

```bash
npx supabase db reset
npm run test:unit -- tests/integration/foundation-rls.test.ts
npm run typecheck
```

Expected: the owner sees the inserted project, the second user receives an empty result, and typecheck exits 0.

- [ ] **Step 6: Commit the database foundation**

```bash
git add supabase lib/supabase .env.example tests/integration/foundation-rls.test.ts
git commit -m "feat: add approved-user project database"
```

---

### Task 4: Implement registration, approval guards, and admin approval UI

**Files:**
- Create: `proxy.ts`
- Create: `lib/auth/types.ts`
- Create: `lib/auth/guards.ts`
- Create: `lib/auth/policy.ts`
- Create: `lib/security/origin.ts`
- Create: `app/(auth)/sign-in/page.tsx`
- Create: `app/(auth)/register/page.tsx`
- Create: `app/(auth)/actions.ts`
- Create: `app/pending/page.tsx`
- Create: `app/(app)/layout.tsx`
- Create: `app/admin/registrations/page.tsx`
- Create: `app/admin/registrations/actions.ts`
- Create: `scripts/bootstrap-admin.mjs`
- Test: `tests/unit/auth-policy.test.ts`
- Test: `tests/unit/request-origin.test.ts`
- Test: `tests/integration/approval-flow.test.ts`

**Interfaces:**
- Consumes: typed Supabase clients and `profiles`.
- Produces: `getAccessDecision(profile)`, `requireApprovedUser()`, `requireAdmin()`, `requireSameOrigin(request)`, `signIn`, `signUp`, `signOut`, `setApprovalStatus`, `setUserRole`, and a one-time administrator bootstrap command.

- [ ] **Step 1: Write the failing authorization-policy tests**

```ts
// tests/unit/auth-policy.test.ts
import { describe, expect, it } from 'vitest'
import { getAccessDecision } from '../../lib/auth/policy'

describe('getAccessDecision', () => {
  it.each([
    [null, 'sign-in'],
    [{ role: 'user', approvalStatus: 'pending' }, 'pending'],
    [{ role: 'user', approvalStatus: 'rejected' }, 'rejected'],
    [{ role: 'user', approvalStatus: 'approved' }, 'allow'],
    [{ role: 'admin', approvalStatus: 'approved' }, 'allow'],
  ] as const)('maps %j to %s', (profile, expected) => {
    expect(getAccessDecision(profile)).toBe(expected)
  })
})
```

- [ ] **Step 2: Run the test and confirm the missing-policy failure**

Run: `npm run test:unit -- tests/unit/auth-policy.test.ts`
Expected: FAIL because `lib/auth/policy.ts` does not exist.

- [ ] **Step 3: Implement the pure policy and server guards**

```ts
// lib/auth/policy.ts
export type AccessProfile = {
  role: 'user' | 'admin'
  approvalStatus: 'pending' | 'approved' | 'rejected'
}

export function getAccessDecision(profile: AccessProfile | null) {
  if (!profile) return 'sign-in' as const
  if (profile.approvalStatus === 'pending') return 'pending' as const
  if (profile.approvalStatus === 'rejected') return 'rejected' as const
  return 'allow' as const
}
```

`requireApprovedUser()` must call `auth.getUser()`, query the current `profiles` row, and redirect outside its error-catching block. `requireAdmin()` calls it and then checks `role === 'admin'`. Do not authorize from a stale JWT claim alone.

- [ ] **Step 4: Add cookie refresh and authentication pages**

Use Next.js 16 `proxy.ts` with an exported `proxy()` function to refresh the Supabase session cookie. Build email/password registration and sign-in Server Actions with Zod validation. Registration requires email verification; an unverified account receives no approved application session even if its profile is changed accidentally. After registration redirect to `/pending`; after approved sign-in redirect to `/projects`; rejected users remain on `/pending` with the rejected message.

`requireSameOrigin(request)` compares the parsed `Origin` header to the configured application origin (or trusted forwarded host in local tests), rejects missing/malformed/cross-origin values for unsafe methods, and is the required first guard for every state-changing Route Handler added in later phases.

- [ ] **Step 5: Add audited admin approval actions**

```ts
// app/admin/registrations/actions.ts
'use server'

export async function setApprovalStatus(input: {
  userId: string
  status: 'approved' | 'rejected'
}) {
  const admin = await requireAdmin()
  const parsed = approvalInput.parse(input)
  await updateApprovalAndAudit({
    actorId: admin.id,
    userId: parsed.userId,
    status: parsed.status,
  })
}
```

Perform the profile update and `account.approved` or `account.rejected` audit insert in one database RPC. Add `setUserRole(userId, role)` for existing admins; its RPC writes `account.role_changed`, refuses an unapproved administrator, and prevents demoting the last approved admin. The registration page lists pending users, while the adjacent user-management table exposes role changes to admins and never displays authentication tokens.

- [ ] **Step 6: Add the one-time administrator bootstrap**

`scripts/bootstrap-admin.mjs` reads `SCHEMATICA_BOOTSTRAP_ADMIN_EMAIL`, finds exactly one verified Auth user through the service-role client, sets that profile to `admin` and `approved`, writes `admin.bootstrapped`, and exits nonzero if the email is missing, unverified, or ambiguous.

Run:

```bash
SCHEMATICA_BOOTSTRAP_ADMIN_EMAIL=owner@example.test node scripts/bootstrap-admin.mjs
```

- [ ] **Step 7: Verify and commit authentication**

Run:

```bash
npm run test:unit -- tests/unit/auth-policy.test.ts tests/unit/request-origin.test.ts tests/integration/approval-flow.test.ts
npm run typecheck
npm run build
```

Expected: pending and unverified users are blocked, approved users pass, cross-origin mutations fail, non-admin users cannot approve accounts or change roles, the last approved admin cannot be demoted, and the build exits 0.

```bash
git add proxy.ts lib/auth lib/security/origin.ts app scripts/bootstrap-admin.mjs tests/unit/auth-policy.test.ts tests/unit/request-origin.test.ts tests/integration/approval-flow.test.ts supabase/migrations
git commit -m "feat: require administrator-approved registration"
```

---

### Task 5: Add immutable project revisions and cross-device synchronization

**Files:**
- Create: `supabase/migrations/202609020002_project_save_rpc.sql`
- Create: `lib/projects/types.ts`
- Create: `lib/projects/repository.ts`
- Create: `lib/projects/conflicts.ts`
- Create: `app/(app)/projects/page.tsx`
- Create: `app/(app)/projects/actions.ts`
- Create: `app/(app)/projects/[projectId]/page.tsx`
- Create: `components/editor/synced-editor.tsx`
- Create: `components/editor/use-project-sync.ts`
- Test: `tests/unit/project-conflicts.test.ts`
- Test: `tests/integration/project-save.test.ts`

**Interfaces:**
- Consumes: `EditorClient`, `SchematicaDocument`, approved-user guard.
- Produces: `createProject(title)`, `getOwnedProject(id)`, `saveProjectRevision(input)`, `SaveResult`, and `useProjectSync()`.

- [ ] **Step 1: Write failing conflict-policy tests**

```ts
// tests/unit/project-conflicts.test.ts
import { describe, expect, it } from 'vitest'
import { classifySaveResult } from '../../lib/projects/conflicts'

describe('classifySaveResult', () => {
  it('distinguishes saved and stale revisions', () => {
    expect(classifySaveResult({ savedRevision: 4, currentRevision: 4 })).toEqual({ kind: 'saved', revision: 4 })
    expect(classifySaveResult({ savedRevision: null, currentRevision: 5 })).toEqual({ kind: 'conflict', currentRevision: 5 })
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test:unit -- tests/unit/project-conflicts.test.ts`
Expected: FAIL because the conflicts module does not exist.

- [ ] **Step 3: Add an atomic save RPC**

Create `public.save_project_revision(p_project_id uuid, p_base_revision integer, p_document jsonb)` as a `security definer` function that:

1. Locks the owned `projects` row with `for update`.
2. Rejects unapproved or non-owning callers.
3. Returns a conflict when `current_revision <> p_base_revision`.
4. Inserts revision `current_revision + 1`.
5. Updates the project title/current revision/timestamp.
6. Returns `{ saved_revision, current_revision }`.

Revoke execute from `anon`; grant it to `authenticated`. Validate the document is an object containing array-valued `nodes`, `wires`, `zones`, `notes`, and `journey` before inserting.

- [ ] **Step 4: Implement the typed project repository**

```ts
// lib/projects/types.ts
import type { SchematicaDocument } from '@/types/editor'

export type SaveProjectInput = {
  projectId: string
  baseRevision: number
  document: SchematicaDocument
}

export type SaveResult =
  | { kind: 'saved'; revision: number }
  | { kind: 'conflict'; currentRevision: number }
```

The repository loads only owner-visible rows, returns ISO timestamp strings to Client Components, and calls the RPC for writes.

- [ ] **Step 5: Add debounced local recovery and server synchronization**

`useProjectSync()` writes each committed document to `localStorage` key `schematica.project.${projectId}.recovery`, debounces server saves by 800 ms, sends the last confirmed revision, and exposes:

```ts
type ProjectSyncState =
  | { status: 'idle'; revision: number }
  | { status: 'saving'; revision: number }
  | { status: 'saved'; revision: number }
  | { status: 'offline'; revision: number }
  | { status: 'conflict'; revision: number; remoteRevision: number }
  | { status: 'error'; revision: number; message: string }
```

On conflict, retain the local recovery document and present explicit `Load remote` and `Download local copy` actions. Never auto-merge or overwrite.

- [ ] **Step 6: Build the project list and editor route**

The project page lists only owned projects, creates a project from `newDoc(title)`, and links to `/projects/[projectId]`. The dynamic page awaits `params`, calls `requireApprovedUser()`, loads the current immutable revision, serializes dates to strings, and passes data to `SyncedEditor`.

- [ ] **Step 7: Verify and commit synchronization**

Run:

```bash
npm run test
npm run typecheck
npm run build
```

Expected: atomic saves increment once, stale writes return conflict, local recovery remains after conflict, and all existing editor tests still pass.

```bash
git add supabase/migrations lib/projects app/'(app)'/projects components/editor tests/unit/project-conflicts.test.ts tests/integration/project-save.test.ts
git commit -m "feat: synchronize versioned projects across devices"
```

---

### Task 6: Verify the foundation end to end and prepare deployment

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/auth-and-sync.spec.ts`
- Create: `tests/e2e/global-setup.ts`
- Modify: `README.md`
- Modify: `.env.example`

**Interfaces:**
- Consumes: complete authenticated project workflow.
- Produces: repeatable browser verification and deployment documentation.

- [ ] **Step 1: Configure isolated end-to-end identities**

`tests/e2e/global-setup.ts` uses the local service-role key to create one admin, one approved user, and one pending user with `@example.test` addresses, and deletes identities bearing the test prefix before and after the suite.

- [ ] **Step 2: Write the complete browser journey**

```ts
// tests/e2e/auth-and-sync.spec.ts
import { expect, test } from '@playwright/test'

test('pending approval and cross-device project sync', async ({ browser, page }) => {
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill('pending@example.test')
  await page.getByLabel('Password').fill('Schematica-Test-Only-1!')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/pending/)

  const approved = await browser.newContext()
  const first = await approved.newPage()
  await signIn(first, 'approved@example.test')
  await first.getByRole('button', { name: 'New project' }).click()
  await first.getByLabel('Project title').fill('Synced board')
  await first.getByRole('button', { name: 'Create' }).click()
  await expect(first.getByText('Saved')).toBeVisible()

  const second = await approved.newPage()
  await second.goto(first.url())
  await expect(second.getByDisplayValue('Synced board')).toBeVisible()
  await approved.close()
})
```

Define `signIn` in the same test file with explicit label and button interactions.

- [ ] **Step 3: Run the complete local verification**

Run:

```bash
npx supabase start
npm run test
npm run typecheck
npm run build
npm run test:e2e
```

Expected: all commands exit 0 and Playwright verifies pending-user blocking plus a project visible in a second browser session.

- [ ] **Step 4: Document environment and deployment boundaries**

Update `README.md` with Node 22, Supabase CLI/Docker setup, `.env.local` variables, bootstrap-admin command, test commands, and Vercel deployment. State that GitHub Pages remains the current production deployment until the new Vercel URL passes the E2E smoke flow.

- [ ] **Step 5: Commit the verified foundation**

```bash
git add playwright.config.ts tests/e2e README.md .env.example
git commit -m "test: verify approved-user project synchronization"
```

## Foundation completion gate

- Existing 121+ editor tests still pass.
- Next.js typecheck and production build pass.
- Pending and rejected users cannot access project data.
- An approved user can create, edit, reload, and open a project in a second session.
- A stale revision produces an explicit conflict and preserves the local copy.
- Cross-account RLS tests return no foreign data.
- Only after these checks pass may execution proceed to `2026-09-02-ai-provider-connections.md`.
