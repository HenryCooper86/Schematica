# Assistant skills and Blueprints

Open **Assistant → Blueprint** to write or edit the project's goal, audience,
components, relationships, constraints, assumptions, open questions, and
presentation outline. Lists use one entry per line. Saving is local and undoable;
it does not send a request to an AI provider.

Use **Plan a Blueprint** to draft one from a brief or selected source documents.
Review and apply that plan, then use **Build a flow** or **Create a presentation**.
The assistant can also simplify a diagram or review its architecture. Quick
starts fill the composer so the audience and task can be adjusted before Send.

The **Skill** selector offers Automatic and five explicit choices:

- Blueprint planning: structure project intent and distinguish assumptions.
- Flow design: turn the plan into meaningful parts, branches, and connections.
- Diagram simplification: improve clarity without losing technical meaning.
- Presentation storytelling: author chapters and ordered stops linked to parts.
- Architecture review: compare the board with intent and report check findings.

Automatic routing recognizes English and Chinese task terms. Tool-capable models
can also request a playbook using the read-only `read_skill` tool. Explicit
selection supplies that playbook directly. These skills are built into Schematica;
no Codex plugin or separate skill installation is required.

Blueprints travel with the board through save/open, autosave, revisions and share
links. Selected source documents retain their existing privacy rules; authored
Blueprint summaries become ordinary saved board content. Blueprints describe
intent and do not automatically synchronize with later board changes.

`apply_edits` supports `set_blueprint` and `set_presentation`, including the
single-shot provider fallback. Edits use the existing isolated preview and one
undo step. The preview displays readable Blueprint fields and story captions.
The existing Preview edits toggle still controls whether AI changes need review.

Presentation authoring replaces the whole journey. To revise it, retain chapters
and stops with their existing IDs so moment links survive. New stops must resolve
to actual nodes, including earlier refs in the same atomic batch. New chapters
need linked parts or wires. Chapters can be edited further in Journey and played,
recorded or exported using existing presentation features. The assistant does not
create PowerPoint files through this feature.

Limits: 50 entries per Blueprint list, 2,000 characters per entry and 32,000
characters for the normalized Blueprint; 50 generated chapters, 100 stops per
chapter, and 4,000 characters per presentation text field. Invalid operations
reject the entire batch. Invalid imported Blueprints produce an import warning;
older boards without a Blueprint still load normally.

Run `npm test`, `SKILLS_E2E_ONLY=1 npm run e2e`, and
`PRESENTATION_E2E_ONLY=1 npm run e2e`. Skill browser checks use a scripted provider:
they verify plumbing, preview, playback and undo, not live-model output quality.

On the Node-backed site, these skills can use public URL sources through
`read_url`. Paste the link in your request; source text remains untrusted
reference material. See [source access and limits](backend.md#reading-public-url-sources).
