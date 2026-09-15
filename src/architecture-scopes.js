// Stable scope paths preserve repeated local IDs in reusable subsystem documents.
export function architectureScopes(doc) {
  const scopes = [];
  const walk = (doc, path, titles) => {
    scopes.push({ key: JSON.stringify(path), path, title: titles.join(' / '), doc });
    for (const node of doc.nodes)
      if (node.subsystem) walk(node.subsystem.doc, [...path, node.id], [...titles, node.label]);
  };
  walk(doc, [], [doc.title]);
  return scopes;
}
export const scopedId = (path, id) => JSON.stringify([...path, id]);
