# Schematica documentation

[Project home](../README.md) · [Open Schematica](https://bionicloud.net/) · [Static edition](https://henrycooper86.github.io/Schematica/)

Schematica helps you draw an architecture, review its declared interfaces and
share the result. Start with the tutorial, then use the guides below for a
specific task. The application supports English and Simplified Chinese; these
guides use the English control names.

The website also includes a [How to use guide](../guide.html), available from
the editor toolbar. It provides a quick start and common tasks in English and
Simplified Chinese while keeping your board open in its original tab.

## New to Schematica

| Start here | You will learn |
| --- | --- |
| [Getting started](getting-started.md) | Load a teaching example, find a mismatch, repair it and export a review |
| [User guide](user-guide.md) | Draw, check, save, share, import, present and review with a team |
| [Troubleshooting](troubleshooting.md) | Recover work and understand common messages |
| [Editor reference](editor-reference.md) | Look up controls, shortcuts, storage behavior and detailed limits |

## Follow a workflow

| I want to… | Read |
| --- | --- |
| Make my first diagram | [Build and edit a board](user-guide.md#build-and-edit-a-board) |
| Understand Checked, Failed and Unassessed | [Review the design](user-guide.md#review-the-design) |
| Set numeric interface limits or record requirement evidence | [Engineering workflows](engineering-workflows.md) |
| Keep a backup or recover an earlier board | [Save and recover](user-guide.md#save-and-recover) |
| Choose between JSON, HTML, images and review packages | [Share and export](user-guide.md#share-and-export) |
| Import a KiCad netlist or compare a change | [Compare and import](user-guide.md#compare-and-import) |
| Ask the assistant to help with a design | [Assistant basics](user-guide.md#use-the-assistant), [providers and coding plans](assistant-providers.md), [skills and Blueprints](assistant-skills.md) |
| Create a guided tour | [Present your board](user-guide.md#present-your-board), [presentation reference](presentation-stories.md) |
| Discuss and approve a shared snapshot | [Team-review workflow](user-guide.md#review-with-a-team) |
| Understand RDK example assumptions | [RDK architecture references](editor-reference.md#rdk-architecture-references) |

## Develop or operate a deployment

- [Development guide](development.md): run locally, understand the source layout and run checks.
- [Backend setup](backend.md): provider requests, supported endpoints and server configuration.
- [Lightsail deployment](lightsail-deployment.md): the existing release pipeline, health checks and rollback.
- [Team-review operator guide](team-reviews.md): private storage, credentials, membership and recovery.
- [Native-browser and KiCad validation](local-validation.md): environment setup and fixture verification.

The static edition supports local drawing, checks and exports. Public URL reading
and shared-review storage require the Node server; shared reviews also require
explicit operator configuration. Running the server alone does not create team
accounts or enable that service.

## Evidence and project history

These documents explain measured behavior and past implementation decisions.
They are dated records, not the primary usage instructions.

- [October implementation and validation report](category-release-2026-10-07.md)
- [Category-readiness assessment and remaining gaps](category-readiness-2026-10-07.md)
- [Performance measurements](performance.md)
- [Validation tools and evidence requirements](validation/README.md)
- [Engineer study kit](engineer-study-kit.md)
- [Earlier engineering release notes](architecture-release-2026-09-15.md)
- [Review and rendering improvements](enhancements-2026-10-06.md)

Passing software checks does not certify hardware or independently verify a
source document. The guides distinguish a completed drawing, declared review
readiness and evidence from actual tests.
