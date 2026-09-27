# ChatGPT Copy Fix

## Output contract

- Copy replies, tables and non-editable message selections as Markdown in `text/plain`.
- Inline math uses `$...$`; display math uses compact single-line `$$...$$`. Preserve TeX `\\` row separators.
- Keep one blank line around headings, horizontal rules, blockquotes, code and tables. Keep only necessary line breaks around lists and display math. Collapse prose soft breaks using the user's existing Obsidian policy.
- Code content and nested-list indentation survive whitespace normalization. DOM text is already entity-decoded; do not parse serialized Markdown as HTML.
- Leave code-copy buttons, editable selections and unrelated copy controls to their native handlers.

## Renderer compatibility

Verified against the user's Chrome ChatGPT page on 2026-09-27:

- The current renderer has no `.markdown`, `[data-message-author-role]` or `copy-turn-action-button` test ID.
- Assistant prose is `[data-markdown-text-style="assistant-message"]`.
- Turn boundaries are `[data-content-search-turn-key]` and `[data-turn-key]`.
- The reply copy button has an accessible `复制` label inside `.turn-action-controls`. Require both the toolbar and assistant content before intercepting a generic copy label.
- Formula wrappers supply `data-math-source` and `data-math-display`. KaTeX annotations remain another supported source. Selection endpoints inside glyphs expand to the outer source wrapper.
- Retain the older message-role, `.markdown` and test-ID routes for other rollout variants.

Capture the click before React's native turn handler, stop propagation only when a nonempty Markdown result exists, and write once. Pointerdown/mousedown plus delayed retries can overwrite another copy initiated shortly afterwards. Restore focus and selection if a hidden textarea is needed as clipboard fallback.

## Verification boundary

`npm run test:copy` covers both renderers, selection events, math, table escaping, code, nested lists, native-handler exclusions, fallback focus and consecutive-copy races.

`node tools/copy-fix-browser-fixture.cjs` serves a synthetic fixture at `http://127.0.0.1:18367`. The optional `--live <temporary DOM file>` replays a captured turn locally. Read the actual Chrome clipboard after reply/table button clicks and real Ctrl+C; a programmatic `execCommand('copy')` can return without changing the clipboard when the page is not focused.

Do not publish a captured conversation or clipboard contents. A DOM replay proves conversion and browser clipboard behavior, but installation and the userscript manager's execution context still require refreshing ChatGPT after updating the installed script.
