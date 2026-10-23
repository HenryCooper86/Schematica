// What a draft does to the findings a Fix asked about, and what it deletes.
// Pure: the preview dialog renders it, tests pin it. A finding is the same
// finding before and after when its rule and affected ids match; its text may
// change (a card with two open pins that loses one is still reported).
const key = (f) => `${f.rule}|${[...(f.ids || [])].sort().join(',')}`;

export function fixOutcome({ targets = [], before = [], after = [], changes = [], board = null }) {
  const afterByKey = new Map(after.map((f) => [key(f), f]));
  const beforeKeys = new Set(before.map(key));
  const removed = changes.filter((c) => c.type === 'removed' && ['nodes', 'wires', 'zones', 'notes'].includes(c.collection));
  const gone = new Set(removed.map((c) => c.id));
  // An unlabelled wire is named by its ends on the board before the draft.
  const nameOf = (id) => board?.nodes?.find((n) => n.id === id)?.label || id;
  for (const c of removed) {
    if (c.collection === 'wires' && !c.before?.label && c.before?.from) c.label = `${nameOf(c.before.from.node)} → ${nameOf(c.before.to.node)}`;
  }
  return {
    targets: targets.map((finding) => {
      const still = afterByKey.get(key(finding));
      // A finding that vanished because its item was deleted is not fixed.
      const deleted = !still ? (finding.ids || []).filter((id) => gone.has(id)) : [];
      return { finding, resolved: !still && !deleted.length, deleted: deleted.map(nameOf), now: still || null };
    }),
    // Errors and warnings the draft adds; info notes (estimates) are not news.
    introduced: after.filter((f) => f.level !== 'info' && !beforeKeys.has(key(f))),
    removed,
  };
}
