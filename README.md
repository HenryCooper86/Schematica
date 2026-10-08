# Schematica

Draw, review and share embedded-system architecture in your browser. Place
controllers, sensors, power supplies and other parts, connect their ports, then
record interface requirements and export a design review.

**[Open Schematica](https://bionicloud.net/)** · **[Static edition](https://henrycooper86.github.io/Schematica/)** · **[Getting started](docs/getting-started.md)** · **[User guide](docs/user-guide.md)**

Choose **How to use** in the editor toolbar to open the website's user guide.
It covers your first board, drawing tools, layout, reviews, saving, exports and
shortcuts, and follows your English/Chinese and appearance preferences.

No account is needed to draw, save or export a board. Your working board is saved
in this browser; download a `.schematica.json` file to keep a portable copy.
The assistant needs a separately configured model provider. Shared team reviews
need an operator-configured server.

## Start here

1. Open Schematica and choose **First project** in the left palette.
2. Choose **Start UART review walkthrough** to learn how to find and repair an
   interface mismatch, or **Load sensor starter** to explore a larger board.
3. Follow the guide, then use **Save** to download your editable board and
   **Engineering → Review package** to produce a review for a colleague.

The [first-use tutorial](docs/getting-started.md) explains every step, including
what you should see and how to recover your previous board.

## What you can do

| Task | Where to learn it |
| --- | --- |
| Draw parts, connect ports and organize a board | [Build and edit](docs/user-guide.md#build-and-edit-a-board) |
| Check interface declarations and record requirements | [Review the design](docs/user-guide.md#review-the-design) |
| Save work, restore a revision and choose an export | [Save and recover](docs/user-guide.md#save-and-recover), [share and export](docs/user-guide.md#share-and-export) |
| Compare changes or import a KiCad netlist | [Compare and import](docs/user-guide.md#compare-and-import) |
| Present a guided tour of the architecture | [Present your board](docs/user-guide.md#present-your-board) |
| Use the assistant with your own provider | [Assistant guide](docs/user-guide.md#use-the-assistant) |
| Review a shared snapshot with a team | [Team reviews](docs/user-guide.md#review-with-a-team) |

The interface supports English and Simplified Chinese. **中文 / EN** changes the
interface language; it does not translate your own board text.

Checks compare the declarations you enter. They do not simulate a circuit or
certify hardware. Teaching examples label their assumptions explicitly.

## Run locally

You need Node.js 22 or newer. From a terminal:

```sh
git clone https://github.com/HenryCooper86/Schematica.git
cd Schematica
npm start
```

Open [localhost:3000](http://localhost:3000). There is no build step or package
installation required for the application. Use **Ctrl+C** in the terminal to stop
it. If you already have the repository, run `npm start` from its directory.

For static hosting, serve the same directory with a static web server. The
[setup guide](docs/development.md#run-the-application) explains the differences.

## Documentation

- [Documentation home](docs/README.md): choose a guide by task or role.
- [Getting started](docs/getting-started.md): complete your first review.
- [User guide](docs/user-guide.md): common tasks, from drawing to handoff.
- [Editor reference](docs/editor-reference.md): detailed controls and behavior.
- [Troubleshooting](docs/troubleshooting.md): saving, imports, checks and connection issues.
- [Development](docs/development.md): source layout, checks and test commands.
- [Server setup](docs/backend.md), [Lightsail deployment](docs/lightsail-deployment.md) and [team-review configuration](docs/team-reviews.md).

For measured results and known gaps, see the [October implementation report](docs/category-release-2026-10-07.md).

## Licence

Schematica is released under the [MIT licence](LICENSE). The device and threat
icons of the Network, Security & Edge, and Threats parts come from
[Lucide](https://lucide.dev) under the ISC licence; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Acknowledgements

Schematica started as a hardware-focused take on the ideas in
[net_draw](https://mr-r3b00t.github.io/net_draw/) and has since grown its own
model: typed ports and buses, design rules, the bill of materials, vendor
presets, and content-sized cards.
