// A different part must not inherit the previous part's declarations. Callers
// may supply fresh values in the same edit; ordinary edits clear the old values.
export function partChangePatch(node, changes) {
  if (!Object.hasOwn(changes, 'sublabel') || changes.sublabel === node.sublabel) return changes;
  return { budget: undefined, interfacePorts: undefined, fields: undefined, ...changes };
}
