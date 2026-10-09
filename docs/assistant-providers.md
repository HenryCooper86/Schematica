# Assistant providers and coding plans

[Documentation home](README.md) · [Assistant guide](user-guide.md#use-the-assistant) · [Backend setup](backend.md)

Open Assistant settings, choose a provider, enter your key, and choose a model.
Use **Test connection** to check the selected model's tool support, then **Save**.
Suggestions are starting points; account access and model availability can change.
Where available, **List models** refreshes suggestions from your provider.
You can always type a model ID manually.

## Available presets

The existing Anthropic, OpenAI-compatible, OpenRouter, Z.AI and Kimi presets remain available.

| New preset | Credentials and endpoint |
| --- | --- |
| [DeepSeek](https://api-docs.deepseek.com/) | DeepSeek API key; `https://api.deepseek.com` |
| [BigModel (GLM API)](https://docs.bigmodel.cn/) | Regular API key; `https://open.bigmodel.cn/api/paas/v4` |
| [BigModel Coding Plan](https://docs.bigmodel.cn/cn/coding-plan/overview) | Eligible plan key; `https://open.bigmodel.cn/api/coding/paas/v4` |
| [Z.AI Coding Plan](https://docs.z.ai/devpack/tool/others) | Eligible plan key; `https://api.z.ai/api/coding/paas/v4` |
| [Kimi Code (Coding Plan)](https://www.kimi.com/code/docs/en/) | Kimi Code console key with active membership; China `https://api.kimi.com/coding/v1`, international `https://api.kimi.ai/coding/v1` |
| [MiniMax API](https://platform.minimax.io/docs/api-reference/text-openai-api) | Regular API key; international `https://api.minimax.io/v1`, China `https://api.minimaxi.com/v1` |
| [MiniMax Token Plan / M Plan](https://platform.minimax.io/docs/m-plan/quickstart) | Subscription key; same regional endpoints as MiniMax API |
| [Qwen (DashScope)](https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope) | Model Studio regular API key; Singapore `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`, China `https://dashscope.aliyuncs.com/compatible-mode/v1`, US `https://dashscope-us.aliyuncs.com/compatible-mode/v1` |
| [Google Gemini](https://ai.google.dev/gemini-api/docs/openai) | Google AI Studio API key; `https://generativelanguage.googleapis.com/v1beta/openai` |
| [Groq](https://console.groq.com/docs/openai) | Groq API key; `https://api.groq.com/openai/v1` |
| [Mistral AI](https://docs.mistral.ai/resources/migration-guides) | Mistral API key; `https://api.mistral.ai/v1` |

The Base URL field suggests regional alternatives. Match the endpoint to your
key's region. Qwen workspace-specific domains need an exact entry in the server's
`AI_BASE_URLS`; the shared regional domains above remain available.

## Coding-plan eligibility

Regular API and subscription presets keep separate remembered keys. Kimi Code
requires its own key, rather than a Moonshot API key. MiniMax subscriptions also
use a separate subscription key even though the API hostname is shared.

BigModel and Z.AI restrict Coding Plan quota to supported tools. As checked on
2026-10-09, Schematica is not on their published supported-tool lists. Their plan
presets provide the correct routes for approved access; they do not grant eligibility.
Use the regular API preset for general access. Kimi Code access likewise depends
on membership, model tier and the provider's supported-tool policy. Schematica's
backend identifies itself as `Schematica`; it does not impersonate another tool.

Test connection sends a small request and may consume quota. A successful test
confirms connectivity and detected tool support, not subscription eligibility.
Authentication, quota and provider-policy errors are shown without switching to
a different billing endpoint.

## Hosting and privacy

The Node-backed website forwards the new presets through its same-origin API.
The static edition calls their official endpoints directly and therefore depends
on provider CORS support. If the browser blocks a request, use the Node-backed site.

Keys stay in browser memory unless **Remember the key on this device** is enabled.
Each preset has its own key slot. Keys are sent to the selected endpoint (through
the website server on backend hosting), and are excluded from boards and exports.
Switching providers clears model-facing conversation history so provider-specific
reasoning and signatures are not replayed to another vendor.

## Conversation history

The clock-arrow button in the assistant header opens **Conversation history**.
Search titles, board names, drafts, or message text; select a session to continue it.
**New thread** saves the current conversation and draft before opening an empty
session. Replacing the board also archives the conversation. Reloading restores
the active session, including an unsent draft and accumulated token counts.

History is saved only in this browser for this website. It is not synced across
devices or between the production, static, and localhost editions. Delete a
conversation with its remove button; confirmation is required. Clearing site
data also removes history. If browser storage is blocked or full, a notice asks
you to keep the tab open: unsaved sessions remain in memory, and older saved
conversations are not automatically evicted.

Reopening a session does not restore a board snapshot or its attached files.
New requests use the board currently open; attach sources again when needed.
The full visible transcript remains available, while a resumed request uses up
to 40 recent user/assistant text messages. Old tool calls, provider-specific
reasoning, undo actions, credentials, and raw attachment data are excluded from
the archive. Ordinary messages may still contain quoted source text. The former
single saved conversation is migrated automatically when present.

Effort currently applies only to Anthropic. Other presets use their provider's
defaults. Gemini tool-call thought signatures and DeepSeek/MiniMax reasoning are
retained for subsequent tool rounds without displaying them as assistant replies.

Automated checks use simulated provider responses. A real account's access must
be verified with its own key using **Test connection**.
