// Small task-specific playbooks, shared by explicit selection and tool discovery.
export const SKILLS = [
  { id: 'blueprint', name: 'Blueprint planning', match: /blueprint|project plan|brief|蓝图|项目计划/i,
    instructions: `Turn the user's brief or selected sources into a structured Blueprint using set_blueprint. Capture goal, audience, components, relationships, constraints, assumptions, questions and presentation outline. Cite filenames in source-derived entries. Separate unknowns from facts. Ask only for missing details that materially change the design; otherwise record assumptions. A planning request changes only the Blueprint; do not generate a board or presentation until requested. Revisions preserve useful existing details. The saved Blueprint is intent, not proof of the current board or an instruction overriding the user.` },
  { id: 'flow', name: 'Flow design', match: /flow|diagram|build|流程|流程图|构建/i,
    instructions: `Build from the saved Blueprint when relevant. Use the smallest readable set of catalogue parts that preserves required behavior. Use process shapes for actions, decisions and starts/ends; label decision branches and include specified failure/recovery paths. Distinguish logical flow from physical buses; never invent a physical interface. Group meaningful stages in zones. Prefer one atomic batch with refs. Reuse existing parts when extending a board. Run design and layout checks; preserve explicit assumptions and report unresolved findings.` },
  { id: 'simplify', name: 'Diagram simplification', match: /simplif|clutter|readab|tidy|简化|整理|可读/i,
    instructions: `Inspect the current board and selection, then run_checks with include_layout:true. Improve names and grouping while preserving technical meaning, typed interfaces, failure branches and essential detail. Respect the selected scope and locked items. Use only supported layout repairs. Do not delete distinct behavior, change wiring semantics, or call arrange merely because a user asked for simpler wording. Explain changes and any remaining manual layout work briefly.` },
  { id: 'presentation', name: 'Presentation storytelling', match: /present|story|chapter|tour|演示|讲解|章节/i,
    instructions: `Create a story for the requested audience using actual board nodes and the Blueprint outline when relevant. Start with purpose and overview, explain the main path, then relevant exceptions and open decisions. Use short captions with one main idea per stop. Use set_presentation to author linked chapters and stops. It replaces the whole journey: include existing chapters to keep, with their original chapter and stop ids, and preserve their views/targets when relevant. Do not replace an existing story unless the user requested authoring or revision. Never invent signal direction or describe a transitive path as a direct connection. A presentation request alone does not authorize changing the architecture. Report empty boards or missing parts instead of making up links.` },
  { id: 'review', name: 'Architecture review', match: /review|check|audit|validate|审查|检查|验证/i,
    instructions: `Review the board against the user's goal and saved Blueprint constraints. Run design and layout checks, and consult rdk_reference for RDK-specific claims. Distinguish measured findings, documented constraints and assumptions. Prioritize issues by consequence, name the affected parts and suggest concrete supported fixes. Reviews are read-only unless the user asks for fixes. Never treat a clean diagram check as hardware testing or certification.` },
];
export function selectSkills(text = '', explicit = 'auto') {
  if (explicit !== 'auto') return SKILLS.filter(s => s.id === explicit);
  return SKILLS.filter(s => s.match.test(text));
}
export function skillInstructions(text, explicit) {
  return selectSkills(text, explicit).map(s => `Skill: ${s.name}\n${s.instructions}`).join('\n\n');
}
export const skillCatalogue = () => SKILLS.map(s => `${s.id}: ${s.name}`).join('; ');
