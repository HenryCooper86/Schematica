# Native-browser and KiCad validation

## Reproduce

The application and Node tests still have no npm dependencies. Additional local
test tools are installed separately:

```sh
brew install --cask firefox kicad
brew install geckodriver
npm run e2e:firefox
npm run e2e:safari
```

Safari comes with macOS. Enable **Safari → Settings → Advanced → Show features
for web developers**, then **Developer → Allow remote automation**. macOS may
require the owner's authentication. No cross-origin restrictions or other browser
security protections need to be disabled. [Apple's setup instructions](https://developer.apple.com/documentation/safari-developer-tools/macos-enabling-webdriver).

The runner starts a loopback-only static server and an isolated browser automation
session. It writes reports, driver logs, and screenshots to `.acceptance/firefox`
or `.acceptance/safari`. `VALIDATION_OUTPUT` overrides this output folder.
`FIREFOX_PATH` and `GECKODRIVER_PATH` override executable discovery.

The tests reuse the engineering, exploration, presentation, and performance modules
from Chrome's suite. Native WebDriver key/pointer actions cover interaction while
DOM scripting sets up fixtures and reads assertions. This is a targeted native
browser suite; it does not imply all Chrome-only assistant, media recording,
clipboard-permission, and document-provider checks ran on the other browsers.

## KiCad file trials

Export representative schematic files and derive a reference topology:

```sh
python3 scripts/kicad-fixtures.py /path/to/project.kicad_sch
KICAD_MANIFEST=.acceptance/kicad/manifest.json npm run e2e:firefox
KICAD_MANIFEST=.acceptance/kicad/manifest.json npm run e2e:safari
```

The script invokes `kicad-cli sch export netlist --format kicadxml` and uses Python's
XML parser to independently collect component references and net endpoints. The
browser imports that XML, serializes/deserializes the board, compares every net's
pin membership against the reference, and checks rendering. The manifest records
source/XML SHA-256 hashes and the exporter version. Source projects remain local;
the script does not modify or publish them.

Official example files test genuine KiCad exports but do not represent a private
team's full workflow. Designs exceeding the prototype's 64-connected-pin limit
must be rejected explicitly. No inference of bus protocols, voltage domains, or
electrical compliance is made. [KiCad CLI documentation](https://docs.kicad.org/10.0/en/cli/cli.html).

## Evidence boundaries

A single Mac can exercise multiple browser engines and viewport sizes. It cannot
establish performance on other physical laptops or reproduce their GPU, memory,
and input-device behavior. Five actual engineer sessions also require identified
participants and an agreed contact channel. See the [study kit](engineer-study-kit.md).

## Results — 15 September 2026

Installed Firefox 155.0.1 and geckodriver 0.37.1. KiCad 10.0.6 is installed in
`/Users/admin/Applications/KiCad`; `kicad-cli` is linked in `/opt/homebrew/bin`.
Official demos are in `/Users/admin/Library/Application Support/kicad/demos`.
Homebrew's KiCad cask required an administrator-only system folder, so the verified
official disk image was installed under the current user instead. Safari's native
automation setting was enabled through its authenticated settings prompt.

- Chrome 153.0.8010.36: **216/216 checks passed**, including the four KiCad file trials; no console errors or exceptions.
- Firefox 155.0.1: **65/65 checks passed**.
- Safari 26.6.2: **65/65 checks passed**.
- Unit suite after the pin-preservation fix: **830/830 passed**.
- No captured page errors or unhandled rejections in either native-browser run.
- Editor screenshots were inspected for visible rendering and toolbar fit.

Both browsers passed exact component/net/pin membership comparison after
serialization and reload for these official KiCad examples:

| Project | Components | Nets | Connected pin memberships | Most pins on one component |
| --- | ---: | ---: | ---: | ---: |
| pic_programmer | 63 | 111 | 236 | 40 |
| complex_hierarchy | 68 | 52 | 164 | 8 |
| multichannel_mixer | 114 | 80 | 280 | 8 |
| RoyalBlue54L-Feather | 71 | 95 | 313 | 45 |

### Correctness fixes from the trials

The importer and subsystem code allowed 32 ports, but the common part normalizer
retained only 24. That mismatch could silently remove pins or boundary mappings.
All producers and subsystem serialization now use the shared 64-port limit;
regressions cover 40-port subsystems, 64-pin import, and explicit overflow rejection.
Long/unrepresentable pin names fail rather than silently changing connectivity.
Imported part/net grids account for actual card dimensions so tall packages and
long net labels do not overlap neighboring rows and columns.

The Safari run also exposed a test-harness timing issue: native drag/undo autosave
was still pending when the read-only exploration assertion took its baseline.
Flushing that prior edit before the baseline fixed the test; no application change
was needed for this timing difference.

[Machine-readable results and fixture hashes](native-validation-2026-09-15.json)
record the exact checks and per-browser benchmark samples. Benchmarks are local
observations, not controlled browser rankings: Safari's run overlapped Chrome's
regression suite, Firefox timer precision differs, and these are the same physical
Mac. Screenshots and full driver logs remain under `.acceptance`.

The KiCad importer remains one-way and bounded at 64 pins per component. These
four example designs establish tested compatibility, not universal KiCad support.
No participant interviews or separate physical-laptop trials have been conducted.
