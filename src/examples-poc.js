// Three small educational proof-of-concept examples, one per language, for
// the source-only Security workflow: retained C, C++ and Python source,
// findings authored by static reading (no model call, no CVE record,
// nothing compiled or executed), and a rich mechanism illustration built
// through the shared native renderer. Each analysis keeps its full source
// text with a fixed precomputed SHA-256 hash over exactly that text, so
// the example stays a synchronous module with no crypto dependency; the
// hash matches what the source reader would record for the same bytes.
import { securityExample } from './examples-security-board.js';

const GENERATED_AT = '2026-10-22T00:00:00.000Z';

const SOURCE_C = `/* sensor_gateway.c — teaching example, not production code.
 *
 * A gateway reads one framed sensor reading from a serial link and logs
 * it. The frame header carries its own payload length; parse_frame
 * trusts that length when copying the payload into a fixed stack buffer.
 */
#include <string.h>

#define FRAME_MAX 32

struct frame_header {
    unsigned char type;
    unsigned char length;   /* payload size claimed by the sender */
};

extern void log_payload(const char *payload, unsigned char length);

int parse_frame(const unsigned char *input, unsigned int input_len)
{
    struct frame_header header;
    char payload[FRAME_MAX];
    unsigned int i;

    if (input_len < sizeof(header))
        return -1;

    memcpy(&header, input, sizeof(header));

    /* The claimed length is never compared with FRAME_MAX. */
    for (i = 0; i < header.length; i++)
        payload[i] = input[sizeof(header) + i];

    log_payload(payload, header.length);
    return 0;
}
`;

const SOURCE_CPP = `// config_cache.cpp — teaching example, not production code.
//
// A small configuration cache hands out references into a std::vector's
// storage. Adding an entry can reallocate that storage, so a reference
// kept across an add() can end up dangling.

#include <string>
#include <vector>

struct Entry {
    std::string key;
    int value;
};

class ConfigCache {
    std::vector<Entry> entries_;

public:
    // Returns a reference into the vector's current storage.
    const Entry &find(const std::string &key) const
    {
        for (const Entry &e : entries_)
            if (e.key == key)
                return e;
        return entries_.back();  // no entry: back() on an empty vector
    }

    void add(std::string key, int value)
    {
        entries_.push_back({std::move(key), value});
    }
};

const Entry &cached(ConfigCache &cache)
{
    const Entry &ref = cache.find("threshold");
    cache.add("timeout", 30);   // may reallocate entries_
    return ref;                 // dangling if the storage moved
}
`;

const SOURCE_PY = `"""queue_gateway.py — teaching example, not production code.

A gateway between a public report API and an internal job queue. The
request's own fields pick the task type and ride into the queue message
unvalidated; dispatch() later rebuilds and routes on them.
"""
import base64
import json

QUEUE_LIMIT = 4096


def accept_request(request):
    """Wrap an untrusted API request into an internal queue message."""
    task_type = request["type"]         # the caller picks the dispatch key
    body = json.dumps(request["data"])  # any JSON the caller likes

    message = {
        "type": task_type,
        "payload": base64.b64encode(body.encode()).decode(),
        "requested_by": request["user"],
    }
    return json.dumps(message)


def dispatch(message_text, handlers):
    """Rebuild the message and select a handler by its type field."""
    message = json.loads(message_text)

    # The payload is decoded with whatever size and shape it arrived with.
    data = json.loads(base64.b64decode(message["payload"]))

    if len(message_text) > QUEUE_LIMIT:
        raise ValueError("queue message too large")

    handler = handlers.get(message["type"])
    if handler is None:
        raise ValueError("unknown task type")
    return handler(data)
`;

// One retained source per analysis; SHA-256 is over the exact text above.
const source = (id, name, hash, text) => ({
  id, name, url: '', retrievedAt: GENERATED_AT, hash, text, startLine: 1,
  totalLines: text.split('\n').length, partial: false, warnings: [],
});

const C_ANALYSIS = {
  version: 1,
  id: 'poc-c-stack-copy',
  title: 'Sensor gateway stack copy — C teaching source',
  cveId: '',
  status: 'not-provided',
  summary: 'Educational record authored by statically reading sensor_gateway.c: parse_frame copies a sender-claimed number of payload bytes into a fixed 32-byte stack array. The claimed length is never compared with the buffer size, so a claim above 32 writes outside the array; which stack neighbours sit there is not established by this file and stays unassessed. No CVE record is needed for this workflow. Nothing was compiled or executed, and no model validated these findings.',
  generatedAt: GENERATED_AT,
  sources: [source('src-sensor-gateway', 'sensor_gateway.c',
    'ad772ad1d79da8edb1aa6d41381ad89ed784bf4e0ee7a4f863394ba91f961637', SOURCE_C)],
  findings: [
    {
      id: 'c-entry', kind: 'component', view: 'architecture', basis: 'source',
      title: 'parse_frame takes the raw frame bytes and its length from the caller',
      detail: 'The entry point receives input and input_len; after the two-byte header copy the payload follows in the same buffer.',
      evidence: [
        { sourceId: 'src-sensor-gateway', startLine: 18, endLine: 18 },
        { sourceId: 'src-sensor-gateway', startLine: 27, endLine: 27 },
      ], targets: [],
    },
    {
      id: 'c-buffer', kind: 'affected', view: 'architecture', basis: 'source',
      title: 'payload is a fixed 32-byte stack array',
      detail: 'FRAME_MAX is 32 and payload[FRAME_MAX] is a local array of parse_frame, so the destination size is fixed at compile time.',
      evidence: [
        { sourceId: 'src-sensor-gateway', startLine: 9, endLine: 9 },
        { sourceId: 'src-sensor-gateway', startLine: 21, endLine: 21 },
      ], targets: [],
    },
    {
      id: 'c-length', kind: 'root_cause', view: 'exploit', basis: 'source',
      title: 'header.length comes from the sender and is never checked against FRAME_MAX',
      detail: 'The only guard compares input_len with the two-byte header size; the sender-claimed length byte then bounds the copy loop on its own.',
      evidence: [
        { sourceId: 'src-sensor-gateway', startLine: 13, endLine: 13 },
        { sourceId: 'src-sensor-gateway', startLine: 24, endLine: 25 },
        { sourceId: 'src-sensor-gateway', startLine: 30, endLine: 30 },
      ], targets: [],
    },
    {
      id: 'c-copy', kind: 'step', view: 'exploit', basis: 'source',
      title: 'The loop writes one byte per claimed length into payload',
      detail: 'For every i below header.length the statement payload[i] = input[sizeof(header) + i] stores a sender-supplied byte.',
      evidence: [
        { sourceId: 'src-sensor-gateway', startLine: 30, endLine: 31 },
      ], targets: [],
    },
    {
      id: 'c-oob', kind: 'impact', view: 'exploit', basis: 'source',
      title: 'A claimed length above 32 writes outside the array',
      detail: 'header.length is an unsigned char, so up to 255 bytes can be claimed; C indexing is unchecked, and payload[32] and beyond lie outside the 32-byte object. What such a write hits is a property of the compilation, not of this source.',
      evidence: [
        { sourceId: 'src-sensor-gateway', startLine: 9, endLine: 9 },
        { sourceId: 'src-sensor-gateway', startLine: 30, endLine: 31 },
      ], targets: [],
    },
    {
      id: 'c-layout', kind: 'unknown', view: 'none', basis: 'unknown',
      title: 'Which stack neighbours sit past payload is not established',
      detail: 'The file states no ABI, compiler options or frame layout, so no claim is made about what a write past the array would reach; this stays unassessed.',
      evidence: [], targets: [],
    },
  ],
  relationships: [
    {
      id: 'c-rel-length-copy', from: 'c-length', to: 'c-copy', label: 'bounds the loop', basis: 'source', view: 'exploit',
      evidence: [{ sourceId: 'src-sensor-gateway', startLine: 30, endLine: 31 }],
    },
    {
      id: 'c-rel-copy-oob', from: 'c-copy', to: 'c-oob', label: 'writes past the array once the claim exceeds 32', basis: 'source', view: 'exploit',
      evidence: [{ sourceId: 'src-sensor-gateway', startLine: 30, endLine: 31 }],
    },
    {
      id: 'c-rel-buffer-copy', from: 'c-buffer', to: 'c-copy', label: 'is the copy destination', basis: 'source', view: 'architecture',
      evidence: [
        { sourceId: 'src-sensor-gateway', startLine: 21, endLine: 21 },
        { sourceId: 'src-sensor-gateway', startLine: 31, endLine: 31 },
      ],
    },
  ],
  warnings: [],
  explanations: [
    {
      id: 'c-scene-frame',
      title: 'Stack copy of a caller-framed payload',
      kind: 'memory',
      detail: 'Schematic reading of parse_frame: the incoming frame is a sender-controlled byte sequence; the stack frame holds the header copy, a 32-cell payload array and the loop counter. Cell order follows the source reading, not an ABI or byte-accurate layout. The loop copies one byte per claimed length, so any write past the 32nd cell is drawn as invalid, and what lies beyond stays an explicit unknown.',
      panels: [
        {
          id: 'c-panel-input', title: 'Incoming frame (sender-controlled)',
          items: [
            { id: 'c-in-type', label: 'type byte', value: 'header.type', role: 'input', findingIds: ['c-entry'] },
            { id: 'c-in-len', label: 'claimed length', value: 'header.length, 0-255', role: 'input', findingIds: ['c-length'] },
            { id: 'c-in-bytes', label: 'payload bytes', value: 'input[2 …]', role: 'input', findingIds: ['c-entry'] },
          ],
        },
        {
          id: 'c-panel-stack', title: 'parse_frame stack frame (schematic)',
          items: [
            { id: 'c-st-header', label: 'header copy', value: 'memcpy of the first two bytes', role: 'storage', findingIds: ['c-entry'] },
            { id: 'c-st-buffer', label: 'payload[32]', value: 'FRAME_MAX = 32 cells', role: 'storage', findingIds: ['c-buffer'] },
            { id: 'c-st-i', label: 'i', value: 'loop counter', role: 'operation', findingIds: ['c-copy'] },
            { id: 'c-st-copy', label: 'copy loop', value: 'payload[i] = input[2 + i]', role: 'operation', findingIds: ['c-copy'] },
          ],
        },
        {
          id: 'c-panel-out', title: 'When the claimed length exceeds 32',
          items: [
            { id: 'c-out-past', label: 'cells past payload[31]', value: 'written for every i of 32 and above', role: 'invalid', findingIds: ['c-oob'] },
            { id: 'c-out-unknown', label: 'what sits there', value: 'not stated by this source', role: 'neutral', findingIds: ['c-layout'] },
            { id: 'c-out-log', label: 'log_payload', value: 'receives payload and the claimed length', role: 'result', findingIds: ['c-entry'] },
          ],
        },
      ],
      links: [
        { from: 'c-in-len', to: 'c-st-copy', label: 'bounds', findingIds: ['c-length', 'c-copy'] },
        { from: 'c-in-bytes', to: 'c-st-copy', label: 'bytes copied', findingIds: ['c-copy'] },
        { from: 'c-st-copy', to: 'c-out-past', label: 'writes past cell 31', findingIds: ['c-oob'] },
        { from: 'c-out-past', to: 'c-out-unknown', label: 'target unknown', findingIds: ['c-layout'] },
        { from: 'c-st-copy', to: 'c-out-log', label: 'after the loop', findingIds: ['c-entry'] },
      ],
    },
  ],
};

const CPP_ANALYSIS = {
  version: 1,
  id: 'poc-cpp-dangling-ref',
  title: 'Config cache dangling reference — C++ teaching source',
  cveId: '',
  status: 'not-provided',
  summary: 'Educational record authored by statically reading config_cache.cpp: find() returns a reference into the std::vector storage, cached() keeps that reference across an add(), and push_back can reallocate the storage. Whether a given call reallocates depends on run-time capacity, so reallocation and the resulting undefined behaviour are marked as inference, and the file itself states neither. No CVE record is needed. Nothing was compiled or executed, and no model validated these findings.',
  generatedAt: GENERATED_AT,
  sources: [source('src-config-cache', 'config_cache.cpp',
    'c7cfdf48c99f66f61d52c308cb0a4106b1f9ca72ba75af257195ff7cb9428a62', SOURCE_CPP)],
  findings: [
    {
      id: 'cpp-store', kind: 'component', view: 'architecture', basis: 'source',
      title: 'entries_ is the cache vector storage',
      detail: 'All cached Entry objects live in one private std::vector member of ConfigCache.',
      evidence: [{ sourceId: 'src-config-cache', startLine: 16, endLine: 16 }], targets: [],
    },
    {
      id: 'cpp-ref', kind: 'affected', view: 'architecture', basis: 'source',
      title: 'find() returns a reference into that storage',
      detail: 'The return type is const Entry &, bound either to an element found while scanning or to entries_.back().',
      evidence: [
        { sourceId: 'src-config-cache', startLine: 20, endLine: 20 },
        { sourceId: 'src-config-cache', startLine: 22, endLine: 24 },
      ], targets: [],
    },
    {
      id: 'cpp-push', kind: 'root_cause', view: 'exploit', basis: 'inference',
      title: 'push_back can reallocate entries_ and release the old block',
      detail: 'std::vector grows its capacity when an append does not fit; whether this particular call reallocates depends on capacity at run time, which this file neither states nor controls.',
      evidence: [{ sourceId: 'src-config-cache', startLine: 30, endLine: 30 }], targets: [],
    },
    {
      id: 'cpp-use', kind: 'step', view: 'exploit', basis: 'source',
      title: 'cached() keeps the reference across add() and returns it',
      detail: 'ref is bound, then add() runs, then ref is returned to the caller without re-reading the container.',
      evidence: [{ sourceId: 'src-config-cache', startLine: 36, endLine: 38 }], targets: [],
    },
    {
      id: 'cpp-empty', kind: 'root_cause', view: 'architecture', basis: 'inference',
      title: 'find() on an empty cache calls back() on an empty vector',
      detail: 'When no key matches, the fallback returns entries_.back(); calling back() on an empty vector is undefined by the library, another way the reference can be invalid.',
      evidence: [{ sourceId: 'src-config-cache', startLine: 25, endLine: 25 }], targets: [],
    },
    {
      id: 'cpp-lifetime', kind: 'impact', view: 'exploit', basis: 'inference',
      title: 'Reading the reference after a reallocation is undefined behaviour',
      detail: 'If push_back reallocated, the reference no longer denotes a live object; the file does not show the caller reading it, so the consequence is stated as inference, not as an observed fault.',
      evidence: [{ sourceId: 'src-config-cache', startLine: 36, endLine: 38 }], targets: [],
    },
  ],
  relationships: [
    {
      id: 'cpp-rel-ref-push', from: 'cpp-ref', to: 'cpp-push', label: 'storage can move under the reference', basis: 'inference', view: 'exploit',
      evidence: [{ sourceId: 'src-config-cache', startLine: 30, endLine: 30 }],
    },
    {
      id: 'cpp-rel-use-lifetime', from: 'cpp-use', to: 'cpp-lifetime', label: 'returns the possibly dangling reference', basis: 'inference', view: 'exploit',
      evidence: [{ sourceId: 'src-config-cache', startLine: 38, endLine: 38 }],
    },
    {
      id: 'cpp-rel-store-ref', from: 'cpp-store', to: 'cpp-ref', label: 'backs the returned reference', basis: 'source', view: 'architecture',
      evidence: [
        { sourceId: 'src-config-cache', startLine: 16, endLine: 16 },
        { sourceId: 'src-config-cache', startLine: 24, endLine: 24 },
      ],
    },
  ],
  warnings: [],
  explanations: [
    {
      id: 'cpp-scene-lifetime',
      title: 'Entry reference across an add() call',
      kind: 'state',
      detail: 'Three schematic states of one reference. First it binds into the live vector storage; then add() appends and may grow the capacity; after the call the old block may be released while the reference is still handed back. Reallocation is a property of std::vector growth, so those cells carry an inference basis; the panel order is reading order, not an observed run.',
      panels: [
        {
          id: 'cpp-panel-bind', title: 'State 1 — reference binds',
          items: [
            { id: 'cpp-s1-store', label: 'entries_ storage', value: 'block owned by the vector', role: 'storage', findingIds: ['cpp-store'] },
            { id: 'cpp-s1-find', label: 'find("threshold")', value: 'scans the entries', role: 'operation', findingIds: ['cpp-ref'] },
            { id: 'cpp-s1-ref', label: 'ref', value: 'const Entry & into the block', role: 'pointer', findingIds: ['cpp-ref'] },
          ],
        },
        {
          id: 'cpp-panel-add', title: 'State 2 — add() runs',
          items: [
            { id: 'cpp-s2-add', label: 'add("timeout", 30)', value: 'push_back appends an Entry', role: 'operation', findingIds: ['cpp-push'] },
            { id: 'cpp-s2-guard', label: 'capacity check', value: 'inside push_back, not in this file', role: 'guard', findingIds: ['cpp-push'] },
            { id: 'cpp-s2-new', label: 'new storage', value: 'fresh block when capacity grows', role: 'storage', findingIds: ['cpp-push'] },
          ],
        },
        {
          id: 'cpp-panel-after', title: 'State 3 — after the call',
          items: [
            { id: 'cpp-s3-old', label: 'old block', value: 'released after the move [inference]', role: 'invalid', findingIds: ['cpp-push'] },
            { id: 'cpp-s3-ref', label: 'ref', value: 'dangling if storage moved', role: 'invalid', findingIds: ['cpp-lifetime'] },
            { id: 'cpp-s3-ret', label: 'return ref', value: 'caller receives the reference', role: 'result', findingIds: ['cpp-use'] },
          ],
        },
      ],
      links: [
        { from: 'cpp-s1-ref', to: 'cpp-s1-store', label: 'points into', findingIds: ['cpp-ref'] },
        { from: 'cpp-s1-ref', to: 'cpp-s2-add', label: 'kept across', findingIds: ['cpp-use'] },
        { from: 'cpp-s2-guard', to: 'cpp-s2-new', label: 'growth triggers reallocation', findingIds: ['cpp-push'] },
        { from: 'cpp-s2-new', to: 'cpp-s3-old', label: 'old block released', findingIds: ['cpp-push'] },
        { from: 'cpp-s3-old', to: 'cpp-s3-ref', label: 'reference outlives', findingIds: ['cpp-lifetime'] },
      ],
    },
  ],
};

const PY_ANALYSIS = {
  version: 1,
  id: 'poc-py-queue-gateway',
  title: 'Queue gateway message structure — Python teaching source',
  cveId: '',
  status: 'not-provided',
  summary: 'Educational record authored by statically reading queue_gateway.py: accept_request wraps caller-controlled request fields into an internal queue message without validation, and dispatch() decodes the payload before its size guard and routes on the message\'s own type field. The reachable handler set depends on the registry each caller passes, so routing consequences are inference. No CVE record is needed. Nothing was executed, and no model validated these findings.',
  generatedAt: GENERATED_AT,
  sources: [source('src-queue-gateway', 'queue_gateway.py',
    '34d8f309ddb5ea896add92b70ebcdf39e80ffcf6d9b0fa84a961d443f25e2efe', SOURCE_PY)],
  findings: [
    {
      id: 'py-boundary', kind: 'boundary', view: 'architecture', basis: 'source',
      title: 'accept_request moves caller fields across the API/queue boundary',
      detail: 'The request\'s type, data and user fields are read directly and written into the internal queue message, so the caller decides what crosses the boundary.',
      evidence: [
        { sourceId: 'src-queue-gateway', startLine: 15, endLine: 16 },
        { sourceId: 'src-queue-gateway', startLine: 18, endLine: 22 },
      ], targets: [],
    },
    {
      id: 'py-type', kind: 'root_cause', view: 'exploit', basis: 'source',
      title: 'The request\'s type field becomes the dispatch key',
      detail: 'request["type"] is copied verbatim into message["type"], and dispatch() later selects the handler with handlers.get(message["type"]); no allow-list stands between the caller and the registry lookup.',
      evidence: [
        { sourceId: 'src-queue-gateway', startLine: 15, endLine: 15 },
        { sourceId: 'src-queue-gateway', startLine: 19, endLine: 19 },
        { sourceId: 'src-queue-gateway', startLine: 36, endLine: 36 },
      ], targets: [],
    },
    {
      id: 'py-payload', kind: 'step', view: 'exploit', basis: 'source',
      title: 'data is JSON-serialized and base64-wrapped without shape checks',
      detail: 'Whatever JSON the caller sends is dumped, encoded and stored as payload; neither size nor schema is checked while wrapping.',
      evidence: [
        { sourceId: 'src-queue-gateway', startLine: 16, endLine: 16 },
        { sourceId: 'src-queue-gateway', startLine: 20, endLine: 20 },
      ], targets: [],
    },
    {
      id: 'py-guard', kind: 'mitigation', view: 'mitigation', basis: 'source',
      title: 'The QUEUE_LIMIT check runs after the payload has been decoded',
      detail: 'dispatch() rebuilds and decodes the payload first; only afterwards does it compare len(message_text) with QUEUE_LIMIT, so the guard bounds the message text, not the work already done while decoding.',
      evidence: [
        { sourceId: 'src-queue-gateway', startLine: 31, endLine: 31 },
        { sourceId: 'src-queue-gateway', startLine: 33, endLine: 34 },
      ], targets: [],
    },
    {
      id: 'py-handlers', kind: 'prerequisite', view: 'exploit', basis: 'inference',
      title: 'The reachable handler set depends on each caller\'s registry',
      detail: 'handlers arrives as an argument and this file never shows what it contains, so what routing on a caller-chosen type reaches stays an inference from the call shape.',
      evidence: [
        { sourceId: 'src-queue-gateway', startLine: 26, endLine: 26 },
        { sourceId: 'src-queue-gateway', startLine: 36, endLine: 39 },
      ], targets: [],
    },
  ],
  relationships: [
    {
      id: 'py-rel-boundary-type', from: 'py-boundary', to: 'py-type', label: 'carries the dispatch key inward', basis: 'source', view: 'exploit',
      evidence: [
        { sourceId: 'src-queue-gateway', startLine: 15, endLine: 15 },
        { sourceId: 'src-queue-gateway', startLine: 19, endLine: 19 },
      ],
    },
    {
      id: 'py-rel-payload-guard', from: 'py-payload', to: 'py-guard', label: 'decoded before the size check', basis: 'source', view: 'mitigation',
      evidence: [
        { sourceId: 'src-queue-gateway', startLine: 31, endLine: 31 },
        { sourceId: 'src-queue-gateway', startLine: 33, endLine: 33 },
      ],
    },
    {
      id: 'py-rel-type-handlers', from: 'py-type', to: 'py-handlers', label: 'selects from the supplied registry', basis: 'inference', view: 'exploit',
      evidence: [{ sourceId: 'src-queue-gateway', startLine: 36, endLine: 36 }],
    },
  ],
  warnings: [],
  explanations: [
    {
      id: 'py-scene-structure',
      title: 'Queue message across the trust boundary',
      kind: 'structure',
      detail: 'Schematic structure, not a running service: caller-side request fields on the left become the internal queue message\'s type, payload and requested_by without validation; dispatch() then decodes the payload before its size guard and routes on the message\'s own type field. Segments follow the source reading order; nothing here observes a live request.',
      panels: [
        {
          id: 'py-panel-request', title: 'Caller side — request fields',
          items: [
            { id: 'py-req-type', label: 'type', value: 'request["type"]', role: 'input', findingIds: ['py-type'] },
            { id: 'py-req-data', label: 'data', value: 'request["data"], any JSON', role: 'input', findingIds: ['py-payload'] },
            { id: 'py-req-user', label: 'user', value: 'request["user"]', role: 'input', findingIds: ['py-boundary'] },
          ],
        },
        {
          id: 'py-panel-message', title: 'Gateway side — queue message',
          items: [
            { id: 'py-msg-type', label: 'message["type"]', value: 'copied from the request', role: 'storage', findingIds: ['py-type'] },
            { id: 'py-msg-payload', label: 'payload', value: 'base64(json(data))', role: 'storage', findingIds: ['py-payload'] },
            { id: 'py-msg-by', label: 'requested_by', value: 'caller-supplied name', role: 'storage', findingIds: ['py-boundary'] },
          ],
        },
        {
          id: 'py-panel-dispatch', title: 'dispatch() — checks and routing',
          items: [
            { id: 'py-dis-decode', label: 'decode payload', value: 'json.loads(b64decode(...))', role: 'operation', findingIds: ['py-payload'] },
            { id: 'py-dis-size', label: 'size guard', value: 'len(message_text) > 4096, after decoding', role: 'guard', findingIds: ['py-guard'] },
            { id: 'py-dis-route', label: 'handler lookup', value: 'handlers.get(message["type"])', role: 'guard', findingIds: ['py-handlers'] },
            { id: 'py-dis-call', label: 'handler(data)', value: 'whatever the registry holds', role: 'result', findingIds: ['py-handlers'] },
          ],
        },
      ],
      links: [
        { from: 'py-req-type', to: 'py-msg-type', label: 'copied verbatim', findingIds: ['py-type'] },
        { from: 'py-req-data', to: 'py-msg-payload', label: 'serialized and encoded', findingIds: ['py-payload'] },
        { from: 'py-msg-type', to: 'py-dis-route', label: 'picks the handler', findingIds: ['py-type'] },
        { from: 'py-msg-payload', to: 'py-dis-decode', label: 'decoded as-is', findingIds: ['py-payload'] },
        { from: 'py-dis-decode', to: 'py-dis-size', label: 'checked only afterwards', findingIds: ['py-guard'] },
        { from: 'py-dis-route', to: 'py-dis-call', label: 'invokes', findingIds: ['py-handlers'] },
      ],
    },
  ],
};

export const POC_EXAMPLES = [
  securityExample(
    'poc-c-stack-copy', 'C Stack Copy (memory layout)', 'Sensor Gateway Stack Copy', C_ANALYSIS,
    [
      {
        id: 'j1', label: 'The scene', view: { cx: 0, cy: 0, zoom: 1 },
        caption: 'Schematic cells for the incoming frame, the parse_frame stack copy and the writes past the 32-byte buffer. Every cell cites retained source lines; nothing was compiled or executed.',
      },
      {
        id: 'j2', label: 'Links and evidence', view: { cx: 0, cy: 0, zoom: 1 },
        caption: 'The labelled links show what feeds what: the claimed length bounds the loop, the loop writes past payload[31], and what sits beyond stays an explicit unknown.',
      },
    ],
  ),
  securityExample(
    'poc-cpp-dangling-ref', 'C++ Dangling Reference (lifetime states)', 'Config Cache Dangling Reference', CPP_ANALYSIS,
    [
      {
        id: 'j1', label: 'Lifetime states', view: { cx: 0, cy: 0, zoom: 1 },
        caption: 'Three states of one reference: bound into the vector storage, carried across add(), dangling after a reallocation. Growth is an inference from std::vector semantics and is marked as such.',
      },
      {
        id: 'j2', label: 'Links and evidence', view: { cx: 0, cy: 0, zoom: 1 },
        caption: 'Follow the links: the reference points into the block, is kept across the push_back, and can outlive storage that may have been released. Reading it afterwards is undefined behaviour [inference].',
      },
    ],
  ),
  securityExample(
    'poc-py-queue-gateway', 'Python Queue Gateway (payload structure)', 'Queue Gateway Payload Structure', PY_ANALYSIS,
    [
      {
        id: 'j1', label: 'Across the boundary', view: { cx: 0, cy: 0, zoom: 1 },
        caption: 'Caller-side request fields become the internal queue message\'s type, payload and requester without validation. The schematic shows structure, not a running service.',
      },
      {
        id: 'j2', label: 'Checks and routing', view: { cx: 0, cy: 0, zoom: 1 },
        caption: 'dispatch() decodes the payload before the size guard and routes on the message\'s own type field. Each cell cites the retained teaching source.',
      },
    ],
  ),
];
