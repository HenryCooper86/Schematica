// Two authored educational Security boards demonstrating the attack and
// parallel mechanism compositions with Schematica's own assets. Both are
// built through the real buildSecurityIllustration(view "mechanism") like
// the live workflow: each keeps its retained synthetic scenario source with
// a precomputed SHA-256 over exactly that text, findings authored by static
// reading (no model call, no CVE record, nothing compiled, executed or
// contacted), and a figure scene whose asset hints are grounded finding by
// finding. The scenarios are original teaching material: the PHP script and
// the parallel scenario text were written for these examples, product names
// appear only as labels the scenario itself disclaims, and every outcome is
// conditional — neither board is a PHP2Shell or CVE applicability
// assessment, and no branded artwork or external image is involved.
import { securityExample } from './examples-security-board.js';

const GENERATED_AT = '2026-10-22T00:00:00.000Z';

const SOURCE_PHP = `<?php
/* debug_export.php — synthetic teaching scenario, not a real application.
 *
 * A hypothetical maintenance endpoint: it snapshots the running
 * interpreter's global state and returns the snapshot as the response
 * body. No real application or product is described as vulnerable.
 */

ini_set('memory_limit', '24M');

$CONFIG = array(
    'dsn' => 'pgsql://report:report@127.0.0.1/report',
    'token_secret' => getenv('APP_TOKEN_SECRET'),
);

function export_dump($request)
{
    $module = $request['module'];
    $scope = $GLOBALS;
    $dump = print_r($scope, true);
    return $dump;
}

function respond($body)
{
    header('Content-Type: text/plain');
    echo $body;
}

$out = export_dump($_GET);
respond($out);`;

const SOURCE_SCENARIO = `Parallel target scenario — synthetic teaching material, not a
vulnerability report. No CMS or framework is claimed affected and no
real target was contacted. Each row below stipulates a hypothetical
application sharing one shape: a request reaches an application inside
one PHP process; that process holds resident memory under a memory
limit; a conditional outcome follows only if the row's preconditions
hold.

Shared actor. One hypothetical unauthenticated caller sends one
crafted request per row; the requests differ only in the endpoint
path each row names. The scenario fixes no network, no deployment
and no real product instance.

Row 0 — generic PHP application. One PHP script receives the
request, serializes process memory into the response, and runs under
memory_limit. Conditional outcome: the request aborts with a fatal
memory error if the serialized snapshot grows past the limit.

Row 1 — WordPress-named hypothetical application. WordPress appears
only as a familiar label for a hypothetical PHP application; the
scenario does not assert that WordPress, any plugin or any version
has the stipulated shape. Conditional outcome: code execution only
if a real application combined these stipulated preconditions with
a flaw that this synthetic material does not describe.

Row 2 — Drupal-named hypothetical application. The same stipulated
shape under a Drupal label; no Drupal version or module is
referenced. Conditional outcome: resident memory is disclosed in the
response only if the stipulated serialization path exists.

Row 3 — Joomla-named hypothetical application. The same stipulated
shape under a Joomla label; no Joomla version or extension is
referenced. Conditional outcome: the request aborts if the snapshot
grows past the limit, exactly as row 0.`;

// One retained source per analysis; SHA-256 is over the exact text above.
const source = (id, name, hash, text) => ({
  id, name, url: '', retrievedAt: GENERATED_AT, hash, text, startLine: 1,
  totalLines: text.split('\n').length, partial: false, warnings: [],
});

const ATTACK_ANALYSIS = {
  version: 1,
  id: 'sf-analysis-php-memory-snapshot',
  title: 'Hypothetical PHP memory snapshot — synthetic teaching scenario',
  cveId: '',
  status: 'not-provided',
  summary: 'Educational record authored for a synthetic scenario file, debug_export.php, written for this example — not a real application and not an artifact of any project. The scenario script snapshots its own global state with print_r and returns the snapshot as the response body while running under a 24M memory_limit, so the composition shows an unauthenticated request reaching a PHP process whose resident memory includes a configured DSN and an environment secret. Every outcome is conditional on the scenario\'s own stipulations. Nothing was compiled, executed or contacted, no model validated these findings, and this is not a PHP2Shell or CVE applicability assessment for PHP or any product.',
  generatedAt: GENERATED_AT,
  sources: [source('src-debug-export', 'debug_export.php',
    '2ab08568498f9dd07600cb176702a1e319da8251df4443de69a9b824340e3201', SOURCE_PHP)],
  findings: [
    {
      id: 'sf-caller', kind: 'prerequisite', view: 'architecture', basis: 'source',
      assetKind: 'attacker',
      title: 'Any party able to deliver a request becomes the caller of this endpoint',
      detail: 'The script takes its whole input from $_GET and contains no authentication, session or token check, so the caller in this scenario is simply whoever can reach the endpoint — a hypothetical remote party, not an identified attacker.',
      evidence: [
        { sourceId: 'src-debug-export', startLine: 16, endLine: 16 },
        { sourceId: 'src-debug-export', startLine: 30, endLine: 30 },
      ], targets: [],
    },
    {
      id: 'sf-request', kind: 'step', view: 'architecture', basis: 'source',
      assetKind: 'httprequest',
      title: 'The request is the caller-chosen query string carried in $_GET',
      detail: 'export_dump($_GET) hands the full request parameters to the export function, so request content — including the module key — is entirely caller-chosen in this synthetic scenario.',
      evidence: [
        { sourceId: 'src-debug-export', startLine: 18, endLine: 18 },
        { sourceId: 'src-debug-export', startLine: 30, endLine: 30 },
      ], targets: [],
    },
    {
      id: 'sf-payload', kind: 'step', view: 'exploit', basis: 'source',
      assetKind: 'payload',
      title: 'The module key is read from the request and then ignored',
      detail: 'The caller-chosen module value is copied into a local variable and never validated or used again; it stands for request-borne content that crosses into the script unchecked.',
      evidence: [
        { sourceId: 'src-debug-export', startLine: 18, endLine: 18 },
      ], targets: [],
    },
    {
      id: 'sf-app', kind: 'component', view: 'architecture', basis: 'source',
      assetKind: 'phpapp',
      title: 'One PHP script serves the whole synthetic endpoint',
      detail: 'debug_export.php is a single PHP script that sets its own memory limit at load, defines the export and respond functions, and then handles the request end to end in one process.',
      evidence: [
        { sourceId: 'src-debug-export', startLine: 9, endLine: 9 },
        { sourceId: 'src-debug-export', startLine: 30, endLine: 31 },
      ], targets: [],
    },
    {
      id: 'sf-memory', kind: 'affected', view: 'architecture', basis: 'source',
      assetKind: 'servermemory',
      title: 'print_r serializes the live interpreter memory into a string',
      detail: 'The script copies the global symbol table into $scope and serializes it with print_r, so the response body is built from process memory resident at request time.',
      evidence: [
        { sourceId: 'src-debug-export', startLine: 19, endLine: 20 },
      ], targets: [],
    },
    {
      id: 'sf-secrets', kind: 'impact', view: 'exploit', basis: 'source',
      assetKind: 'secretstore',
      title: 'A DSN with credentials and an environment secret sit in that memory',
      detail: 'The $CONFIG global holds a database DSN and the APP_TOKEN_SECRET value read from the environment; as globals they are inside $GLOBALS and therefore inside whatever print_r captures — in this synthetic scenario only.',
      evidence: [
        { sourceId: 'src-debug-export', startLine: 11, endLine: 13 },
        { sourceId: 'src-debug-export', startLine: 19, endLine: 19 },
      ], targets: [],
    },
    {
      id: 'sf-pressure', kind: 'affected', view: 'architecture', basis: 'source',
      assetKind: 'memorylimit',
      title: 'A 24M memory_limit bounds the whole snapshot operation',
      detail: 'ini_set raises the per-request limit to 24M; the serialized snapshot is materialized in addition to the live state it copies, so the export runs against one hard ceiling whose headroom the file does not measure.',
      evidence: [
        { sourceId: 'src-debug-export', startLine: 9, endLine: 9 },
        { sourceId: 'src-debug-export', startLine: 19, endLine: 20 },
      ], targets: [],
    },
    {
      id: 'sf-return-path', kind: 'step', view: 'architecture', basis: 'source',
      title: 'The endpoint returns the snapshot to the requesting caller',
      detail: 'The file\'s own header describes the endpoint\'s shape — input arrives from $_GET and the snapshot is returned as the response body — so the dump travels back to the party that sent the request; no request was actually issued or observed.',
      evidence: [
        { sourceId: 'src-debug-export', startLine: 4, endLine: 6 },
        { sourceId: 'src-debug-export', startLine: 30, endLine: 31 },
      ], targets: [],
    },
    {
      id: 'sf-return', kind: 'step', view: 'exploit', basis: 'source',
      assetKind: 'memorydump',
      title: 'The snapshot leaves the process verbatim as the response body',
      detail: 'respond prints the dump under a text/plain header, so whatever print_r captured — resident globals included — is returned to the caller unfiltered.',
      evidence: [
        { sourceId: 'src-debug-export', startLine: 26, endLine: 27 },
        { sourceId: 'src-debug-export', startLine: 31, endLine: 31 },
      ], targets: [],
    },
    {
      id: 'sf-outcome-secrets', kind: 'impact', view: 'exploit', basis: 'source',
      assetKind: 'secretstore',
      title: 'Conditional outcome: secrets leave only when resident in the dumped request',
      detail: 'Disclosure happens only in a request where the DSN and token secret globals are actually set — the secret may be absent when the environment provides none — so this is a conditional reading of the code path, not an observed leak.',
      evidence: [
        { sourceId: 'src-debug-export', startLine: 12, endLine: 13 },
        { sourceId: 'src-debug-export', startLine: 20, endLine: 20 },
        { sourceId: 'src-debug-export', startLine: 27, endLine: 27 },
      ], targets: [],
    },
    {
      id: 'sf-outcome-crash', kind: 'impact', view: 'exploit', basis: 'inference',
      assetKind: 'processcrash',
      title: 'Conditional outcome: a snapshot past the limit would abort the request',
      detail: 'PHP terminates a request that exceeds its memory_limit with a fatal error; the scenario file sets the 24M ceiling and builds the snapshot in memory but neither triggers nor prevents exhaustion for any particular input, so the abort stays a conditional inference.',
      evidence: [
        { sourceId: 'src-debug-export', startLine: 9, endLine: 9 },
        { sourceId: 'src-debug-export', startLine: 20, endLine: 20 },
      ], targets: [],
    },
  ],
  relationships: [],
  warnings: [],
  explanations: [
    {
      id: 'sf-scene-snapshot',
      title: 'Hypothetical request and returned memory snapshot',
      kind: 'attack',
      detail: 'Synthetic teaching composition in the reference drawing style: a hypothetical unauthenticated caller on the left, the caller-chosen request and the returned snapshot as capsules in the middle — with an explicit source-cited arrow closing the loop back to the caller — and the scenario PHP host on the right with its single application, resident interpreter memory, the secrets it holds and the 24M memory limit. Every arrow is a cited data flow of the teaching file alone; placements are composition hints, not network or containment claims. No real target was contacted, no product is named vulnerable, and this is not a PHP2Shell or CVE applicability assessment.',
      panels: [
        {
          id: 'sf-panel-actor', title: 'Caller (hypothetical)', placement: 'actor',
          items: [
            { id: 'sf-actor', label: 'Unauthenticated remote caller', value: 'any party that can send the request', role: 'input', assetKind: 'attacker', findingIds: ['sf-caller'] },
          ],
        },
        {
          id: 'sf-panel-exchange', title: 'Crafted request and returned snapshot', placement: 'exchange',
          items: [
            { id: 'sf-http-request', label: 'HTTP request', value: 'GET /debug_export.php?module=…', role: 'input', assetKind: 'httprequest', findingIds: ['sf-request'] },
            { id: 'sf-request-payload', label: 'Caller-chosen payload', value: 'module key, read but never checked', role: 'input', assetKind: 'payload', findingIds: ['sf-payload'] },
            { id: 'sf-response', label: 'Returned response body', value: 'print_r snapshot, text/plain', role: 'result', assetKind: 'memorydump', findingIds: ['sf-return'] },
          ],
        },
        {
          id: 'sf-panel-target', title: 'Hypothetical PHP host', placement: 'target',
          items: [
            { id: 'sf-php-app', label: 'PHP application', value: 'debug_export.php, one script', role: 'operation', assetKind: 'phpapp', findingIds: ['sf-app'] },
            { id: 'sf-memory-secrets', label: 'Secrets in memory', value: 'dsn + APP_TOKEN_SECRET', role: 'storage', assetKind: 'secretstore', findingIds: ['sf-secrets'] },
            { id: 'sf-process-memory', label: 'Interpreter memory', value: '$GLOBALS serialized by print_r', role: 'storage', assetKind: 'servermemory', findingIds: ['sf-memory'] },
            { id: 'sf-memory-limit', label: 'Memory limit', value: 'memory_limit = 24M', role: 'guard', assetKind: 'memorylimit', findingIds: ['sf-pressure'] },
          ],
        },
        {
          id: 'sf-panel-outcome', title: 'Conditional outcomes', placement: 'outcome',
          items: [
            { id: 'sf-out-secrets', label: 'Secrets leave the process', value: 'only if resident when dumped', role: 'invalid', assetKind: 'secretstore', findingIds: ['sf-outcome-secrets'] },
            { id: 'sf-out-crash', label: 'Request aborted', value: 'only if the snapshot passes 24M', role: 'invalid', assetKind: 'processcrash', findingIds: ['sf-outcome-crash'] },
          ],
        },
      ],
      links: [
        { from: 'sf-actor', to: 'sf-http-request', label: 'sends', findingIds: ['sf-caller'] },
        { from: 'sf-http-request', to: 'sf-request-payload', label: 'carries', findingIds: ['sf-payload'] },
        { from: 'sf-http-request', to: 'sf-php-app', label: 'reaches the endpoint', findingIds: ['sf-request'] },
        { from: 'sf-php-app', to: 'sf-process-memory', label: 'serializes $GLOBALS', findingIds: ['sf-memory'] },
        { from: 'sf-memory-secrets', to: 'sf-process-memory', label: 'resident within', findingIds: ['sf-secrets'] },
        { from: 'sf-memory-limit', to: 'sf-process-memory', label: 'bounds the snapshot', findingIds: ['sf-pressure'] },
        { from: 'sf-process-memory', to: 'sf-response', label: 'returned as the body', findingIds: ['sf-return'] },
        { from: 'sf-response', to: 'sf-actor', label: 'returned to the caller', findingIds: ['sf-return-path'] },
        { from: 'sf-memory-secrets', to: 'sf-out-secrets', label: 'leave if resident in the dump', findingIds: ['sf-outcome-secrets'] },
        { from: 'sf-memory-limit', to: 'sf-out-crash', label: 'aborts if exceeded', findingIds: ['sf-outcome-crash'] },
      ],
    },
  ],
};

const PARALLEL_ANALYSIS = {
  version: 1,
  id: 'sf-analysis-parallel-outcomes',
  title: 'Hypothetical parallel application outcomes — synthetic scenario',
  cveId: '',
  status: 'not-provided',
  summary: 'Educational record authored for a synthetic scenario text written for this example. Four stipulated rows share one shape — a crafted request reaches an application inside one PHP process holding resident memory under a memory limit — and each row names a conditional outcome only. The row labels include WordPress, Drupal and Joomla purely as familiar names for hypothetical applications; the scenario itself states that no CMS, plugin, version or real instance is asserted to have this shape, and the generic PHP row carries no product name at all. Nothing was executed or contacted, no model validated these findings, and this is not a PHP2Shell or CVE applicability assessment for any product.',
  generatedAt: GENERATED_AT,
  sources: [source('src-parallel-scenario', 'parallel-scenario.txt',
    '17fbbfe160d3af2e9807ef62ca6b2a249c34119fac0be0fc9623acc338ebb340', SOURCE_SCENARIO)],
  findings: [
    {
      id: 'pf-actor', kind: 'prerequisite', view: 'architecture', basis: 'source',
      assetKind: 'attacker',
      title: 'One hypothetical unauthenticated caller sends every row request',
      detail: 'The scenario draws a single caller that sends one crafted request per row; the requests differ only in the endpoint path each row names, and the scenario fixes no network, no deployment and no real product instance.',
      evidence: [
        { sourceId: 'src-parallel-scenario', startLine: 9, endLine: 12 },
      ], targets: [],
    },
    {
      id: 'pf-php-request', kind: 'step', view: 'architecture', basis: 'source',
      assetKind: 'httprequest',
      title: 'Row 0 request: a crafted request reaches one PHP script',
      detail: 'The generic row stipulates a request reaching a single PHP script that serializes process memory into the response.',
      evidence: [
        { sourceId: 'src-parallel-scenario', startLine: 9, endLine: 11 },
        { sourceId: 'src-parallel-scenario', startLine: 14, endLine: 15 },
      ], targets: [],
    },
    {
      id: 'pf-php-app', kind: 'component', view: 'architecture', basis: 'source',
      assetKind: 'phpapp',
      title: 'Row 0 target: a generic PHP application, no product named',
      detail: 'The row targets one PHP script under a purely generic label; no application, version or deployment is identified.',
      evidence: [
        { sourceId: 'src-parallel-scenario', startLine: 14, endLine: 15 },
      ], targets: [],
    },
    {
      id: 'pf-php-memory', kind: 'affected', view: 'architecture', basis: 'source',
      assetKind: 'servermemory',
      title: 'Row 0 memory: resident state under memory_limit',
      detail: 'The stipulated process holds resident memory and runs under a memory limit while it serializes that state into the response.',
      evidence: [
        { sourceId: 'src-parallel-scenario', startLine: 4, endLine: 6 },
        { sourceId: 'src-parallel-scenario', startLine: 15, endLine: 16 },
      ], targets: [],
    },
    {
      id: 'pf-php-outcome', kind: 'impact', view: 'exploit', basis: 'source',
      assetKind: 'processcrash',
      title: 'Row 0 outcome: conditional fatal memory abort',
      detail: 'The abort with a fatal memory error is stipulated only as a condition on the snapshot growing past the limit; the scenario records the condition, not an occurrence.',
      evidence: [
        { sourceId: 'src-parallel-scenario', startLine: 16, endLine: 17 },
      ], targets: [],
    },
    {
      id: 'pf-wp-request', kind: 'step', view: 'architecture', basis: 'source',
      assetKind: 'httprequest',
      title: 'Row 1 request: the same crafted request under a WordPress label',
      detail: 'The row reuses the shared caller and request shape; only the endpoint path named by the row differs.',
      evidence: [
        { sourceId: 'src-parallel-scenario', startLine: 9, endLine: 11 },
        { sourceId: 'src-parallel-scenario', startLine: 19, endLine: 19 },
      ], targets: [],
    },
    {
      id: 'pf-wp-app', kind: 'component', view: 'architecture', basis: 'source',
      assetKind: 'wordpressapp',
      title: 'Row 1 target: a WordPress-named hypothetical application',
      detail: 'WordPress appears only as a familiar label for a hypothetical PHP application; the scenario states it does not assert that WordPress, any plugin or any version has the stipulated shape.',
      evidence: [
        { sourceId: 'src-parallel-scenario', startLine: 19, endLine: 22 },
      ], targets: [],
    },
    {
      id: 'pf-wp-memory', kind: 'affected', view: 'architecture', basis: 'source',
      assetKind: 'servermemory',
      title: 'Row 1 memory: the shared resident-state stipulation',
      detail: 'The row inherits the shared shape: one PHP process with resident memory under a memory limit.',
      evidence: [
        { sourceId: 'src-parallel-scenario', startLine: 4, endLine: 6 },
        { sourceId: 'src-parallel-scenario', startLine: 19, endLine: 20 },
      ], targets: [],
    },
    {
      id: 'pf-wp-outcome', kind: 'impact', view: 'exploit', basis: 'source',
      assetKind: 'codeexec',
      title: 'Row 1 outcome: conditional code execution, not an established fact',
      detail: 'The scenario states this outcome only as a condition: it would require a real application combining the stipulated preconditions with a flaw that this synthetic material does not describe. No exploitability of WordPress is claimed or assessed.',
      evidence: [
        { sourceId: 'src-parallel-scenario', startLine: 22, endLine: 24 },
      ], targets: [],
    },
    {
      id: 'pf-dr-request', kind: 'step', view: 'architecture', basis: 'source',
      assetKind: 'httprequest',
      title: 'Row 2 request: the same crafted request under a Drupal label',
      detail: 'The row again reuses the shared caller and request shape with only the endpoint path differing.',
      evidence: [
        { sourceId: 'src-parallel-scenario', startLine: 9, endLine: 11 },
        { sourceId: 'src-parallel-scenario', startLine: 26, endLine: 26 },
      ], targets: [],
    },
    {
      id: 'pf-dr-app', kind: 'component', view: 'architecture', basis: 'source',
      assetKind: 'drupalapp',
      title: 'Row 2 target: a Drupal-named hypothetical application',
      detail: 'The row applies the shared stipulated shape under a Drupal label and references no Drupal version or module.',
      evidence: [
        { sourceId: 'src-parallel-scenario', startLine: 26, endLine: 28 },
      ], targets: [],
    },
    {
      id: 'pf-dr-memory', kind: 'affected', view: 'architecture', basis: 'source',
      assetKind: 'servermemory',
      title: 'Row 2 memory: the shared resident-state stipulation',
      detail: 'One stipulated PHP process holds the resident memory under its limit for this row as for the others.',
      evidence: [
        { sourceId: 'src-parallel-scenario', startLine: 4, endLine: 6 },
        { sourceId: 'src-parallel-scenario', startLine: 26, endLine: 27 },
      ], targets: [],
    },
    {
      id: 'pf-dr-outcome', kind: 'impact', view: 'exploit', basis: 'source',
      assetKind: 'memorydump',
      title: 'Row 2 outcome: conditional memory disclosure in the response',
      detail: 'Resident memory is disclosed only if the stipulated serialization path exists; the scenario records the condition, not an observed disclosure.',
      evidence: [
        { sourceId: 'src-parallel-scenario', startLine: 28, endLine: 29 },
      ], targets: [],
    },
    {
      id: 'pf-jo-request', kind: 'step', view: 'architecture', basis: 'source',
      assetKind: 'httprequest',
      title: 'Row 3 request: the same crafted request under a Joomla label',
      detail: 'The row reuses the shared caller and request shape with only the endpoint path differing.',
      evidence: [
        { sourceId: 'src-parallel-scenario', startLine: 9, endLine: 11 },
        { sourceId: 'src-parallel-scenario', startLine: 31, endLine: 31 },
      ], targets: [],
    },
    {
      id: 'pf-jo-app', kind: 'component', view: 'architecture', basis: 'source',
      assetKind: 'joomlaapp',
      title: 'Row 3 target: a Joomla-named hypothetical application',
      detail: 'The row applies the shared stipulated shape under a Joomla label and references no Joomla version or extension.',
      evidence: [
        { sourceId: 'src-parallel-scenario', startLine: 31, endLine: 33 },
      ], targets: [],
    },
    {
      id: 'pf-jo-memory', kind: 'affected', view: 'architecture', basis: 'source',
      assetKind: 'servermemory',
      title: 'Row 3 memory: the shared resident-state stipulation',
      detail: 'One stipulated PHP process holds the resident memory under its limit for this row as well.',
      evidence: [
        { sourceId: 'src-parallel-scenario', startLine: 4, endLine: 6 },
        { sourceId: 'src-parallel-scenario', startLine: 31, endLine: 32 },
      ], targets: [],
    },
    {
      id: 'pf-jo-outcome', kind: 'impact', view: 'exploit', basis: 'source',
      assetKind: 'processcrash',
      title: 'Row 3 outcome: conditional abort, exactly as row 0',
      detail: 'The request aborts only if the snapshot grows past the limit; the row repeats row 0\'s condition and adds nothing.',
      evidence: [
        { sourceId: 'src-parallel-scenario', startLine: 33, endLine: 34 },
      ], targets: [],
    },
  ],
  relationships: [],
  warnings: [],
  explanations: [
    {
      id: 'pf-scene-rows',
      title: 'Hypothetical parallel application rows',
      kind: 'parallel',
      detail: 'Synthetic teaching composition in the reference drawing style: one shared hypothetical caller beside four stipulated rows. Each row aligns a crafted request, its named hypothetical application, the process memory the scenario stipulates, and that row\'s conditional outcome. Rows name WordPress, Drupal and Joomla purely as labels for hypothetical applications — the scenario text itself disclaims any assertion about those products — and the generic PHP row names none. Placements and rows are composition hints, not network or containment claims; arrows are the cited stipulations only. Nothing was executed or contacted, and this is not a PHP2Shell or CVE applicability assessment.',
      panels: [
        {
          id: 'pf-panel-actor', title: 'Shared caller (hypothetical)', placement: 'actor',
          items: [
            { id: 'pf-actor', label: 'Unauthenticated caller', value: 'one caller for every row request', role: 'input', assetKind: 'attacker', findingIds: ['pf-actor'] },
          ],
        },
        {
          id: 'pf-panel-exchange', title: 'Crafted requests', placement: 'exchange',
          items: [
            { id: 'pf-req-0', label: 'Crafted request', value: 'row 0 endpoint, generic PHP', role: 'input', assetKind: 'httprequest', row: 0, findingIds: ['pf-php-request'] },
            { id: 'pf-req-1', label: 'Crafted request', value: 'row 1 endpoint, WordPress label', role: 'input', assetKind: 'httprequest', row: 1, findingIds: ['pf-wp-request'] },
            { id: 'pf-req-2', label: 'Crafted request', value: 'row 2 endpoint, Drupal label', role: 'input', assetKind: 'httprequest', row: 2, findingIds: ['pf-dr-request'] },
            { id: 'pf-req-3', label: 'Crafted request', value: 'row 3 endpoint, Joomla label', role: 'input', assetKind: 'httprequest', row: 3, findingIds: ['pf-jo-request'] },
          ],
        },
        {
          id: 'pf-panel-target', title: 'Hypothetical application rows', placement: 'target',
          items: [
            { id: 'pf-app-0', label: 'Target application', value: 'generic PHP script (row 0)', role: 'operation', assetKind: 'phpapp', row: 0, findingIds: ['pf-php-app'] },
            { id: 'pf-mem-0', label: 'Process memory', value: 'resident state under limit (row 0)', role: 'storage', assetKind: 'servermemory', row: 0, findingIds: ['pf-php-memory'] },
            { id: 'pf-app-1', label: 'Target application', value: 'WordPress-labelled hypothetical (row 1)', role: 'operation', assetKind: 'wordpressapp', row: 1, findingIds: ['pf-wp-app'] },
            { id: 'pf-mem-1', label: 'Process memory', value: 'resident state under limit (row 1)', role: 'storage', assetKind: 'servermemory', row: 1, findingIds: ['pf-wp-memory'] },
            { id: 'pf-app-2', label: 'Target application', value: 'Drupal-labelled hypothetical (row 2)', role: 'operation', assetKind: 'drupalapp', row: 2, findingIds: ['pf-dr-app'] },
            { id: 'pf-mem-2', label: 'Process memory', value: 'resident state under limit (row 2)', role: 'storage', assetKind: 'servermemory', row: 2, findingIds: ['pf-dr-memory'] },
            { id: 'pf-app-3', label: 'Target application', value: 'Joomla-labelled hypothetical (row 3)', role: 'operation', assetKind: 'joomlaapp', row: 3, findingIds: ['pf-jo-app'] },
            { id: 'pf-mem-3', label: 'Process memory', value: 'resident state under limit (row 3)', role: 'storage', assetKind: 'servermemory', row: 3, findingIds: ['pf-jo-memory'] },
          ],
        },
        {
          id: 'pf-panel-outcome', title: 'Conditional outcomes', placement: 'outcome',
          items: [
            { id: 'pf-out-0', label: 'Conditional outcome', value: 'fatal memory error, if past the limit (row 0)', role: 'invalid', assetKind: 'processcrash', row: 0, findingIds: ['pf-php-outcome'] },
            { id: 'pf-out-1', label: 'Conditional outcome', value: 'code execution, only if a real flaw combined (row 1)', role: 'invalid', assetKind: 'codeexec', row: 1, findingIds: ['pf-wp-outcome'] },
            { id: 'pf-out-2', label: 'Conditional outcome', value: 'memory disclosed, if the path exists (row 2)', role: 'invalid', assetKind: 'memorydump', row: 2, findingIds: ['pf-dr-outcome'] },
            { id: 'pf-out-3', label: 'Conditional outcome', value: 'fatal memory error, as row 0 (row 3)', role: 'invalid', assetKind: 'processcrash', row: 3, findingIds: ['pf-jo-outcome'] },
          ],
        },
      ],
      links: [
        { from: 'pf-actor', to: 'pf-req-0', label: 'sends', findingIds: ['pf-php-request'] },
        { from: 'pf-actor', to: 'pf-req-1', label: 'sends', findingIds: ['pf-wp-request'] },
        { from: 'pf-actor', to: 'pf-req-2', label: 'sends', findingIds: ['pf-dr-request'] },
        { from: 'pf-actor', to: 'pf-req-3', label: 'sends', findingIds: ['pf-jo-request'] },
        { from: 'pf-req-0', to: 'pf-app-0', label: 'reaches', findingIds: ['pf-php-request'] },
        { from: 'pf-req-1', to: 'pf-app-1', label: 'reaches', findingIds: ['pf-wp-request'] },
        { from: 'pf-req-2', to: 'pf-app-2', label: 'reaches', findingIds: ['pf-dr-request'] },
        { from: 'pf-req-3', to: 'pf-app-3', label: 'reaches', findingIds: ['pf-jo-request'] },
        { from: 'pf-app-0', to: 'pf-mem-0', label: 'shares the process memory', findingIds: ['pf-php-memory'] },
        { from: 'pf-app-1', to: 'pf-mem-1', label: 'shares the process memory', findingIds: ['pf-wp-memory'] },
        { from: 'pf-app-2', to: 'pf-mem-2', label: 'shares the process memory', findingIds: ['pf-dr-memory'] },
        { from: 'pf-app-3', to: 'pf-mem-3', label: 'shares the process memory', findingIds: ['pf-jo-memory'] },
        { from: 'pf-mem-0', to: 'pf-out-0', label: 'conditional outcome', findingIds: ['pf-php-outcome'] },
        { from: 'pf-mem-1', to: 'pf-out-1', label: 'conditional outcome', findingIds: ['pf-wp-outcome'] },
        { from: 'pf-mem-2', to: 'pf-out-2', label: 'conditional outcome', findingIds: ['pf-dr-outcome'] },
        { from: 'pf-mem-3', to: 'pf-out-3', label: 'conditional outcome', findingIds: ['pf-jo-outcome'] },
      ],
    },
  ],
};

export const SECURITY_FIGURES_EXAMPLES = [
  securityExample(
    'sf-php-memory-snapshot', 'PHP Memory Snapshot (attack composition)', 'Hypothetical PHP Memory Snapshot', ATTACK_ANALYSIS,
    [
      {
        id: 'j1', label: 'The composition', view: { cx: 0, cy: 0, zoom: 1 },
        caption: 'A synthetic teaching scenario in the reference drawing style: an unauthenticated caller, the crafted request and returned snapshot capsules, and the hypothetical PHP host with its application, resident memory, secrets and the 24M limit. Every element is a native editable card citing retained scenario lines.',
      },
      {
        id: 'j2', label: 'Conditional outcomes', view: { cx: 0, cy: 0, zoom: 1 },
        caption: 'The outcome column is conditional, not observed: secrets leave only when resident in the dumped request, and the fatal abort is an inference from PHP memory semantics. This is not a PHP2Shell or CVE applicability assessment.',
      },
    ],
  ),
  securityExample(
    'sf-parallel-app-outcomes', 'Parallel Application Outcomes (scenario rows)', 'Hypothetical Parallel Application Outcomes', PARALLEL_ANALYSIS,
    [
      {
        id: 'j1', label: 'Four stipulated rows', view: { cx: 0, cy: 0, zoom: 1 },
        caption: 'One shared hypothetical caller beside four aligned rows: request, application, process memory and a conditional outcome. WordPress, Drupal and Joomla appear only as labels the scenario text itself disclaims; no product is claimed affected.',
      },
      {
        id: 'j2', label: 'Labels are not claims', view: { cx: 0, cy: 0, zoom: 1 },
        caption: 'Each outcome cites the scenario line that stipulates its condition — including the code-execution row, which requires a real flaw this synthetic material does not describe. Nothing was executed or contacted; this is not a PHP2Shell or CVE applicability assessment.',
      },
    ],
  ),
];
