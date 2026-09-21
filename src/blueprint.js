// Portable project intent. Text is reference data, never executable instructions.
export const BLUEPRINT_FIELDS = {
  goal: 'Goal', audience: 'Audience', components: 'Components', relationships: 'Relationships',
  constraints: 'Constraints', assumptions: 'Assumptions', questions: 'Open questions', outline: 'Presentation outline',
};
export const BLUEPRINT_LISTS = Object.keys(BLUEPRINT_FIELDS).filter(k => !['goal', 'audience'].includes(k));
export const BLUEPRINT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: Object.fromEntries(Object.keys(BLUEPRINT_FIELDS).map(k => [k, BLUEPRINT_LISTS.includes(k)
    ? { type: 'array', maxItems: 50, items: { type: 'string', maxLength: 2000 } }
    : { type: 'string', maxLength: 2000 }])), required: ['goal'],
};
export function validateBlueprint(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Blueprint must be an object.');
  if (Object.keys(value).some(k => !Object.hasOwn(BLUEPRINT_FIELDS, k))) throw new Error('Unknown Blueprint field.');
  const text = v => {
    if (typeof v !== 'string' || v.length > 2000) throw new Error('Blueprint text must be at most 2000 characters per entry.');
    return v.trim();
  };
  const result = { goal: text(value.goal), audience: text(value.audience ?? '') };
  if (!result.goal) throw new Error('A Blueprint needs a goal.');
  for (const k of BLUEPRINT_LISTS) {
    const rows = value[k] ?? [];
    if (!Array.isArray(rows) || rows.length > 50) throw new Error('Blueprint lists support at most 50 entries.');
    result[k] = rows.map(text).filter(Boolean);
  }
  if (JSON.stringify(result).length > 32000) throw new Error('Blueprint must be at most 32000 characters in total.');
  return result;
}
