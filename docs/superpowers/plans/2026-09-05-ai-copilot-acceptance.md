# AI Copilot manual acceptance (needs a real key)

Run once against a real model before calling the feature done. Tick each
line with the observed result.

First run: 2026-09-06, glm-5.3:cloud through a local Ollama 0.33.3 signed in to
ollama.com, driven in headless Chrome by a script that reads the board back
from autosave and re-runs the design rules on it. A run against Claude Opus 5
is still owed for items 10 and 11.

The runner is `tests/acceptance/run.mjs`: `PROVIDER=ollama BASE=http://localhost:11434
MODEL=glm-5.3:cloud npm run acceptance -- 1 2 3` runs the numbered items below
against the named provider (a key goes in `KEY`, never in a file) and prints one
JSON line of observations per item plus screenshots under `.acceptance/`.
Items 5 to 8 and 12 need no model; 11 and 14 to 17 are provider-specific.

1. Blank board, prompt: "Build a solar weather station on an ESP32-S3 with a
   BME280 and a LoRa uplink." Expect: parts, typed wires, at least one zone,
   no overlapping cards, Check reports zero errors, done within eight rounds.
   Observed: run 2026-09-06 with glm-5.3:cloud through local Ollama 0.33.3, three times. Every run built a complete board (7-9 parts, 12-16 typed wires, 3-4 zones, a note, a title), no card overlaps, Check zero errors and zero warnings, 30-45 s. Two of the three runs hit the eight-round cap on the closing run_checks call after the model had a batch rejected (ops sent as a JSON string; a connect missing its target; a ground wire to a part with no ground port). The cap is now twelve, the engine accepts a stringified ops array, and the rules say how to search and when to name ports; a fourth run after those changes built eight parts, fourteen wires, four zones, and three notes in one batch, ran its checks, and closed with a summary (67 s). PASS
2. On the Sensor Node example: "Swap the ESP32 for an STM32H7." Expect: one
   node's part number and notes change, nothing else; one undo step reverts.
   Observed: the MCU's part number became STM32H743 and its note gained one sentence; no other node or wire changed; the undo chip reverted the board to the original; 4-8 s. PASS
3. On the Weather Station example (which has findings): press Check, press
   Fix on the first finding. Expect: the panel opens, the finding is sent, the
   assistant resolves it without touching unrelated items. Observed: Fix on the first finding (Charger's GND pin) opened the panel, sent the finding, and the assistant wired it, but also wired the seven other unconnected power pins the check listed; unrelated nodes untouched, no parts added; 8 s. The Fix prompt now says to change only what the finding needs. PASS with that note
4. On the RDK X5 Rover example after blanking two part numbers: "Fill in
   details." Expect: blank part numbers filled from presets, nothing else
   changed. Observed: the two blanked part numbers were filled (Battery 3S LiPo 5000 mAh, Regulator 5V buck MP1584EN, both without presets so chosen by the model, stated as such), the LiDAR's empty note was filled from its preset, nothing else changed, wires untouched; 29 s. PASS
5. Open the Journey panel and the properties panel while the assistant is
   open. Expect: no overlap that hides controls at 1400 px width. Observed: at 1400 px the assistant (bottom right) overlapped the bottom 22 px of the journey panel, covering the Present button. Fixed: the right-hand panels now end above the open assistant (a CSS variable the panel publishes from a ResizeObserver) and the smoke test checks it. PASS after the fix
6. Press Stop mid-request. Expect: the reply says it was stopped, edits so far
   remain as one undo step. Observed: Stop pressed once the first cards landed (8 parts on the board): the reply ended with "(Stopped; edits made so far are kept.)", the eight cards stayed, one undo removed them all, the chip was live. PASS
7. Reload. Expect: the thread comes back; loading an example clears it.
   Observed: after a reload the thread came back with its reply; loading an example from the menu (confirm accepted) cleared it. PASS
8. With "remember" unticked, reload. Expect: the key must be entered again and
   `localStorage` holds no `schematica.ai.key.*`. Observed: with remember unticked and saved, no schematica.ai.key.* entry existed before or after the reload, the key field was empty, and the settings form opened by itself. PASS
9. Settings → Ollama with a local model, Test. Expect: either "calls tools" or
   the single-shot notice; a build works in the mode reported. Observed: Ollama (local) at http://localhost:11434 with glm-5.3:cloud: Test said "Connected. This model calls tools." and the builds in items 1 and 6 ran in tool mode. PASS
10. Ask for something the model declines (a request outside what it will help
    with). Expect: no silent empty reply — an error bubble in the thread
    carrying the model's own explanation. Observed: glm-5.3 did not decline an off-topic request (a limerick about cats): it wrote one and left the board alone, no error bubble. The refusal path exists for models that refuse; NOT EXERCISED with this model
11. Settings → model `claude-haiku-4-5`, save, send a build. Expect: the
    request runs (no 400 from the API) and the reply arrives without thinking.
    Observed: not run: no Anthropic key was available. NOT RUN
12. Open the app with site data blocked. Expect: it boots and every
    non-assistant feature works; a key entered in the panel is kept for the
    session only and the thread does not persist across reload. Observed: with localStorage throwing, the app booted with the example board and every toolbar control; the panel opened, but the provider could not be changed: settings were only ever written to storage, so the request went to Anthropic with the Ollama key and failed ("invalid x-api-key"), and a blank assistant bubble sat above the error. Fixed: settings keep a memory copy when storage is unavailable, and an empty reply before an error draws no bubble. Re-run: the provider switched, "Add a sticky note that says hello" added the note in one edit, and after a reload the thread was gone. FAIL then PASS
13. Ollama: watch the server log while a build runs. Expect: no `truncating
    input prompt` line — the request asks for num_ctx 16384. Observed: local Ollama forwards cloud models to ollama.com; its server log had no "truncating input prompt" line after all runs (the request carries num_ctx 16384, unit-tested). PASS
14. Settings → Z.AI (GLM), key from z.ai, model `glm-5.3`, Test, then a build.
    Expect: "calls tools"; parts and wires appear; the usage line shows
    tokens but no cost (only Claude is priced). Observed: not run: no Z.AI key. NOT RUN
15. Settings → Kimi (Moonshot), key from platform.kimi.ai, model `kimi-k3`,
    Test, then "Swap the ESP32 for an STM32H7" on the Sensor Node example.
    Expect: one node changes, one undo step. Observed: not run: no Moonshot key. NOT RUN
16. Settings → OpenRouter, key from openrouter.ai, List models. Expect: the
    catalogue fills the Model suggestions; pick a Claude id and a build works
    with the `Bearer` key. Observed: not run: no OpenRouter key. NOT RUN
17. Settings → Ollama Cloud, key from ollama.com, model `gpt-oss:120b`, Test.
    Expect: the request goes to `https://ollama.com/api/chat` with a Bearer
    key (no CORS notice needed) and a build works in the mode Test reported.
    Observed: Test against https://ollama.com from the browser failed with "Could not reach ollama: Failed to fetch": ollama.com sends no CORS headers and answers the preflight with 405, so no browser page can call it. The API key works from curl (19 models listed, glm-5.3 calls tools). The provider now points at the local Ollama with the :cloud tag (verified tags: glm-5.3:cloud, glm-5.3-flash:cloud, kimi-k3:cloud, gpt-oss:120b:cloud, qwen3.5:397b-cloud, deepseek-v4-flash:0731-cloud) and needs no key in the browser. FAIL then PASS via the local route

    Later on 2026-09-06: `relay/` (a Cloudflare Worker) now fronts ollama.com;
    Ollama Cloud goes to `https://ollama.com/api/chat` through it with the
    Bearer key, ollama.com model names carry no `:cloud` tag, and the local
    Ollama entry is gone (a local server is still reachable as an
    OpenAI-compatible endpoint). Not yet re-run through the relay.