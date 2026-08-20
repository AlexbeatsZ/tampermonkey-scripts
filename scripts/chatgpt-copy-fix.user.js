// ==UserScript==
// @name         ChatGPT Copy Fix
// @namespace    local.cgpt.mdlatex.copy
// @version      3.4.8-local
// @description  Copy ChatGPT replies/tables as Markdown with compact $$ LaTeX and user-defined Obsidian spacing.
// @author       local
// @homepageURL  https://github.com/AlexbeatsZ/tampermonkey-scripts
// @downloadURL  https://raw.githubusercontent.com/AlexbeatsZ/tampermonkey-scripts/main/scripts/chatgpt-copy-fix.user.js
// @updateURL    https://raw.githubusercontent.com/AlexbeatsZ/tampermonkey-scripts/main/scripts/chatgpt-copy-fix.user.js
// @match        *://chatgpt.com/*
// @match        *://*.chatgpt.com/*
// @match        *://chat.openai.com/*
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    if (window.__CGPTMdLatexCopyV347) return;
    window.__CGPTMdLatexCopyV347 = true;

    const INLINE_MATH_LEFT = '$';
    const INLINE_MATH_RIGHT = '$';
    const DISPLAY_MATH_LEFT = '$$';
    const DISPLAY_MATH_RIGHT = '$$';

    /**
     * Obsidian 换行策略：
     * - 展示公式统一压成单行：$$...$$。
     * - 标题、分割线、引用块、代码块、表格：前后保留一个空行。
     * - 列表、展示公式：只保留必要断行，不额外空行。
     * - 普通正文：连续换行最多压成一个换行；单个软换行删除。
     */
    const OBSIDIAN_SHRINK_NEWLINES = true;
    const OBSIDIAN_PRESERVE_MARKDOWN_STRUCTURE = true;

    /**
     * 选区复制时只写入 text/plain。
     * 原先同时写入 text/html，Obsidian 会优先读取 HTML，并把 <br> 转成 Markdown 硬换行，
     * 表现为每一行末尾多出两个空格，进而破坏表格。
     */
    const SELECTION_COPY_WRITE_HTML = false;

    const STRUCTURE_BLANK_AROUND_KINDS = new Set(['heading', 'hr', 'quote', 'code', 'table']);
    const STRUCTURE_LINE_AROUND_KINDS = new Set(['math', 'list', 'indent']);

    const COPY_BUTTON_SELECTOR = '[data-testid="copy-turn-action-button"]';
    const MESSAGE_SELECTOR = '[data-message-author-role]';
    const TURN_SELECTOR = '[data-testid^="conversation-turn-"], [data-turn]';

    const RAW_DISPLAY_RE = /\\\[([\s\S]*?)\\\]/g;
    const RAW_INLINE_RE = /\\\(([\s\S]*?)\\\)/g;

    function isEditable(node) {
        if (!node) return false;
        for (let n = node; n; n = n.parentNode) {
            if (
                n.nodeType === Node.ELEMENT_NODE &&
                n.matches('input, textarea, [contenteditable="true"], [contenteditable]')
            ) {
                return true;
            }
        }
        return false;
    }

    function asElement(node) {
        if (!node) return null;
        return node instanceof Element ? node : node.parentElement;
    }

    function decodeHTMLEntities(text) {
        const parser = new DOMParser();
        return parser.parseFromString(String(text), 'text/html').documentElement.textContent || '';
    }

    function escapeMarkdownText(text) {
        // 保持 ChatGPT 文本尽量原样，只做极少量处理。
        return String(text).replace(/\u00A0/g, ' ');
    }

    function escapeInlineCode(text) {
        const s = String(text);
        const maxRun = Math.max(0, ...Array.from(s.matchAll(/`+/g), m => m[0].length));
        const fence = '`'.repeat(maxRun + 1 || 1);
        return `${fence}${s}${fence}`;
    }

    function normalizeUrl(url) {
        if (!url) return '';
        try {
            return new URL(url, location.href).href;
        } catch (_) {
            return url;
        }
    }

    function wrapInlineMath(tex) {
        return `${INLINE_MATH_LEFT}${String(tex).trim()}${INLINE_MATH_RIGHT}`;
    }

    function compactDisplayTex(tex) {
        // Obsidian 在引用块等嵌套结构中，对单行 $$...$$ 的兼容性更好。
        // TeX 中普通换行通常等价于空格；矩阵/换行请保留源码里的 \\。
        return String(tex)
            .replace(/\r\n?/g, '\n')
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .join(' ')
            .trim();
    }

    function wrapDisplayMath(tex) {
        const body = compactDisplayTex(tex);
        return body ? `\n${DISPLAY_MATH_LEFT}${body}${DISPLAY_MATH_RIGHT}\n` : '';
    }

    function convertRawTexDelimiters(text) {
        return String(text)
            .replace(RAW_DISPLAY_RE, (_, body) => wrapDisplayMath(body))
            .replace(RAW_INLINE_RE, (_, body) => wrapInlineMath(body));
    }

    function getTexAnnotation(root) {
        if (!root || !root.querySelector) return '';

        const ann = root.querySelector(
            'annotation[encoding="application/x-tex"], annotation[encoding="LaTeX"], annotation'
        );

        return ann?.textContent?.trim() || '';
    }

    function isDisplayMathElement(el) {
        if (!el || !(el instanceof Element)) return false;
        return Boolean(
            el.classList.contains('katex-display') ||
            el.closest('.katex-display') ||
            el.getAttribute('display') === 'block' ||
            el.getAttribute('display') === 'true'
        );
    }

    function mathToMarkdown(el) {
        const tex = getTexAnnotation(el);
        if (!tex) return '';

        return isDisplayMathElement(el)
            ? wrapDisplayMath(tex)
            : wrapInlineMath(tex);
    }

    function closestMathElement(node) {
        const el = asElement(node);
        if (!el) return null;

        return el.closest(
            '.katex-display, .katex, mjx-container, math'
        );
    }

    function isHiddenOrNoise(el) {
        if (!(el instanceof Element)) return false;

        if (el.matches('script, style, noscript, svg, button, textarea, input')) return true;

        // ChatGPT UI 噪声
        if (el.matches(
            [
                '.sr-only',
                '[role="tooltip"]',
                '[data-testid="copy-turn-action-button"]',
                '[data-testid="good-response-turn-action-button"]',
                '[data-testid="bad-response-turn-action-button"]',
                '[aria-label="复制"]',
                '[aria-label="复制回复"]',
                '[aria-label="喜欢"]',
                '[aria-label="不喜欢"]',
                '[aria-label="分享"]',
                '[aria-label="更多操作"]',
                '[aria-label="切换模型"]',
                '[data-state="closed"] [data-testid="webpage-citation-pill"]',
            ].join(',')
        )) return true;

        // KaTeX/MathJax 的可见/隐藏层由 mathToMarkdown 单独处理；
        // 如果递归走到内部层，直接跳过，避免 L + L -> LL。
        if (el.matches('.katex-mathml, .katex-html, mjx-assistive-mathml, .MathJax_MathML')) return true;

        return false;
    }

    function getCodeText(codeEl) {
        // innerText 在 Chrome 上能保留 <br> 换行；没有时用手写递归兜底。
        if (typeof codeEl.innerText === 'string' && codeEl.innerText.length > 0) {
            return codeEl.innerText.replace(/\u00A0/g, ' ').replace(/\n+$/g, '');
        }

        function walk(node) {
            if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
            if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return '';

            if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName === 'BR') return '\n';
                if (node.matches('script, style, button, svg')) return '';
            }

            return Array.from(node.childNodes).map(walk).join('');
        }

        return walk(codeEl).replace(/\u00A0/g, ' ').replace(/\n+$/g, '');
    }

    function getLanguageFromPre(pre) {
        const lang =
            pre.getAttribute('data-language') ||
            pre.querySelector('[class*="language-"]')?.className?.match(/language-([a-zA-Z0-9_-]+)/)?.[1] ||
            pre.querySelector('[class*="cm-"]')?.getAttribute('data-language') ||
            '';

        if (!lang) return '';

        const normalized = String(lang).trim().toLowerCase();
        if (['plaintext', 'text', 'txt'].includes(normalized)) return '';
        return normalized;
    }

    function cleanInline(text) {
        return String(text)
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n[ \t]+/g, '\n')
            .replace(/[ \t]{2,}/g, ' ');
    }

    function cleanBlock(text) {
        return String(text)
            .replace(/\u00A0/g, ' ')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n[ \t]+/g, '\n')
            .replace(/\n{4,}/g, '\n\n\n')
            .trim();
    }

    function makeProtectedToken(index, type = 'BLOCK') {
        return `\uE000CGPT_COPY_PROTECT_${type}_${index}\uE000`;
    }

    function getProtectedTokenType(line) {
        const m = String(line).trim().match(/^\uE000CGPT_COPY_PROTECT_([A-Z]+)_\d+\uE000$/);
        return m ? m[1].toLowerCase() : '';
    }

    function protectMarkdownBlocks(text, transform) {
        const blocks = [];
        const protectedText = String(text).replace(/(```[\s\S]*?```|\$\$[\s\S]*?\$\$)/g, block => {
            const type = block.startsWith('```') ? 'CODE' : 'MATH';
            const token = makeProtectedToken(blocks.length, type);
            blocks.push({ token, block, type });
            return token;
        });

        let out = transform(protectedText);

        blocks.forEach(({ token, block }) => {
            // 不能用 replaceAll(token, block)：replacement 里的 $$ 会被当成替换语法压成 $。
            out = out.split(token).join(block);
        });

        return out;
    }

    function protectCodeBlocksOnly(text, transform) {
        const blocks = [];
        const protectedText = String(text).replace(/```[\s\S]*?```/g, block => {
            const token = makeProtectedToken(blocks.length, 'CODEONLY');
            blocks.push({ token, block });
            return token;
        });

        let out = transform(protectedText);

        blocks.forEach(({ token, block }) => {
            out = out.split(token).join(block);
        });

        return out;
    }

    function compactDisplayMathBlocks(text) {
        return protectCodeBlocksOnly(String(text), value => {
            return value.replace(/\$\$([\s\S]*?)\$\$/g, (_, body) => {
                const compact = compactDisplayTex(body);
                return compact ? `${DISPLAY_MATH_LEFT}${compact}${DISPLAY_MATH_RIGHT}` : '';
            });
        });
    }

    function isProtectedTokenLine(line) {
        return Boolean(getProtectedTokenType(line));
    }

    function markdownLineKind(line) {
        const s = String(line || '');
        const t = s.trim();

        if (!t) return 'blank';

        const tokenType = getProtectedTokenType(t);
        if (tokenType === 'code' || tokenType === 'codeonly') return 'code';
        if (tokenType === 'math') return 'math';

        if (/^#{1,6}\s+/.test(t)) return 'heading';
        if (/^>\s?/.test(t)) return 'quote';
        if (/^([-*+]\s+|\d+[.)]\s+)/.test(t)) return 'list';
        if (/^\s{2,}\S/.test(s)) return 'indent';
        if (/^\|.*\|$/.test(t)) return 'table';
        if (/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(t)) return 'table';
        if (/^-{3,}$/.test(t)) return 'hr';

        return 'plain';
    }

    function isMarkdownStructuralLine(line) {
        return markdownLineKind(line) !== 'blank' && markdownLineKind(line) !== 'plain';
    }

    function newlineCountBetween(prevLine, nextLine, originalCount) {
        const prevKind = markdownLineKind(prevLine);
        const nextKind = markdownLineKind(nextLine);

        if (prevKind === 'blank' || nextKind === 'blank') return 0;

        // 引用块内部必须保持逐行引用，不能在每一行 quote 之间塞空行。
        if (prevKind === 'quote' && nextKind === 'quote') return 1;

        // 表格内部必须逐行相邻，不能在每一行之间塞空行；只在表格整体前后加空行。
        if (prevKind === 'table' && nextKind === 'table') return 1;

        // 标题、分割线、引用块、代码块、表格：前后一个空行，即两个 \n。
        if (
            STRUCTURE_BLANK_AROUND_KINDS.has(prevKind) ||
            STRUCTURE_BLANK_AROUND_KINDS.has(nextKind)
        ) {
            return 2;
        }

        // 列表、表格、展示公式等：只保留必要断行，不额外空行。
        if (
            STRUCTURE_LINE_AROUND_KINDS.has(prevKind) ||
            STRUCTURE_LINE_AROUND_KINDS.has(nextKind)
        ) {
            return 1;
        }

        // 普通正文：删除单个软换行；多个换行最多压成一个换行。
        // 这样不会自动制造段落空行，也不会把两个 DOM 段落完全粘死。
        return Math.min(1, Math.max(0, originalCount - 1));
    }

    function shrinkPlainTextNewlineRuns(segment) {
        if (!OBSIDIAN_SHRINK_NEWLINES) return String(segment);

        const parts = String(segment).split(/(\n+)/g);

        for (let i = 1; i < parts.length; i += 2) {
            const run = parts[i];
            const prevLine = parts[i - 1].split('\n').pop() || '';
            const nextLine = (parts[i + 1] || '').split('\n')[0] || '';

            const nextCount = OBSIDIAN_PRESERVE_MARKDOWN_STRUCTURE
                ? newlineCountBetween(prevLine, nextLine, run.length)
                : Math.min(1, Math.max(0, run.length - 1));

            parts[i] = '\n'.repeat(nextCount);
        }

        return parts.join('');
    }

    function collapseExtraBlankLinesFinal(text) {
        const out = protectMarkdownBlocks(
            String(text)
                .replace(/[ \t]+\n/g, '\n')
                .replace(/\n[ \t]+/g, '\n')
                .replace(/[ \t]+$/gm, ''),
            shrinkPlainTextNewlineRuns
        );

        return compactDisplayMathBlocks(out).trim();
    }

    function serializeChildren(el, ctx) {
        return Array.from(el.childNodes)
            .map(child => serializeNode(child, ctx))
            .join('');
    }

    function normalizeTableCell(text) {
        return cleanInline(text)
            .trim()
            .replace(/\n+/g, '<br>')
            .replace(/\|/g, '\\|');
    }

    function serializeTable(table, ctx) {
        const rows = Array.from(table.querySelectorAll('tr'));
        if (!rows.length) return '';

        const matrix = rows.map(row =>
            Array.from(row.children)
                .filter(cell => ['TH', 'TD'].includes(cell.tagName))
                .map(cell => normalizeTableCell(serializeChildren(cell, { ...ctx, inTable: true })))
        ).filter(row => row.length);

        if (!matrix.length) return '';

        const colCount = Math.max(...matrix.map(r => r.length));
        const normalized = matrix.map(row => {
            const r = row.slice();
            while (r.length < colCount) r.push('');
            return r;
        });

        const hasHeader = rows[0].querySelector('th') || table.querySelector('thead');
        const header = hasHeader ? normalized[0] : normalized[0].map((_, i) => `Column ${i + 1}`);
        const body = hasHeader ? normalized.slice(1) : normalized;

        const lines = [];
        lines.push(`| ${header.join(' | ')} |`);
        lines.push(`| ${header.map(() => '---').join(' | ')} |`);
        for (const row of body) {
            lines.push(`| ${row.join(' | ')} |`);
        }

        return `\n${lines.join('\n')}\n`;
    }

    function serializeList(listEl, ctx, ordered) {
        const items = Array.from(listEl.children).filter(ch => ch.tagName === 'LI');
        const start = ordered ? Number(listEl.getAttribute('start') || '1') : 0;

        const lines = [];

        items.forEach((li, index) => {
            const marker = ordered ? `${start + index}. ` : '- ';
            let body = serializeChildren(li, { ...ctx, listDepth: (ctx.listDepth || 0) + 1 }).trim();

            // 清理 li 内部段落带来的过多空行
            body = body.replace(/\n{3,}/g, '\n\n');

            const bodyLines = body.split('\n');
            const first = bodyLines.shift() || '';
            const indent = ' '.repeat(marker.length);

            lines.push(`${marker}${first}`);
            for (const line of bodyLines) {
                if (line.trim() === '') {
                    lines.push('');
                } else {
                    lines.push(`${indent}${line}`);
                }
            }
        });

        return `\n${lines.join('\n')}\n`;
    }

    function serializeNode(node, ctx = {}) {
        if (!node) return '';

        if (node.nodeType === Node.TEXT_NODE) {
            const text = escapeMarkdownText(node.nodeValue || '');
            return ctx.inCode ? text : convertRawTexDelimiters(text);
        }

        if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
            return Array.from(node.childNodes).map(child => serializeNode(child, ctx)).join('');
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return '';

        const el = node;

        if (isHiddenOrNoise(el)) return '';

        // 整个公式节点直接转 TeX，不递归进入 MathML/HTML 双层结构。
        if (el.matches('.katex-display, .katex, mjx-container, math')) {
            const md = mathToMarkdown(el);
            if (md) return md;
        }

        const tag = el.tagName;

        if (tag === 'BR') return '\n';

        if (/^H[1-6]$/.test(tag)) {
            const level = Number(tag.slice(1));
            const body = cleanInline(serializeChildren(el, ctx)).trim();
            if (!body) return '';
            return `\n${'#'.repeat(level)} ${body}\n`;
        }

        if (tag === 'P') {
            const body = cleanInline(serializeChildren(el, ctx)).trim();
            return body ? `\n${body}\n` : '';
        }

        if (tag === 'STRONG' || tag === 'B') {
            const body = serializeChildren(el, ctx).trim();
            return body ? `**${body}**` : '';
        }

        if (tag === 'EM' || tag === 'I') {
            const body = serializeChildren(el, ctx).trim();
            return body ? `*${body}*` : '';
        }

        if (tag === 'S' || tag === 'DEL') {
            const body = serializeChildren(el, ctx).trim();
            return body ? `~~${body}~~` : '';
        }

        if (tag === 'CODE') {
            // pre code 由 PRE 处理。
            if (el.closest('pre')) {
                return getCodeText(el);
            }

            return escapeInlineCode(getCodeText(el));
        }

        if (tag === 'PRE') {
            const codeEl = el.querySelector('code') || el;
            const code = getCodeText(codeEl);
            const lang = getLanguageFromPre(el);
            return `\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
        }

        if (tag === 'A') {
            const text = cleanInline(serializeChildren(el, ctx)).trim();
            const href = normalizeUrl(el.getAttribute('href') || '');
            if (!text) return '';
            if (!href || href.startsWith('javascript:')) return text;
            return `[${text}](${href})`;
        }

        if (tag === 'UL') return serializeList(el, ctx, false);
        if (tag === 'OL') return serializeList(el, ctx, true);

        if (tag === 'BLOCKQUOTE') {
            const body = cleanBlock(serializeChildren(el, ctx));
            if (!body) return '';
            return `\n${body.split('\n').map(line => line ? `> ${line}` : '>').join('\n')}\n`;
        }

        if (tag === 'TABLE') return serializeTable(el, ctx);

        if (tag === 'THEAD' || tag === 'TBODY' || tag === 'TFOOT' || tag === 'TR' || tag === 'TD' || tag === 'TH') {
            return serializeChildren(el, ctx);
        }

        if (tag === 'HR') return '\n---\n';

        if (tag === 'IMG') {
            const alt = el.getAttribute('alt') || '';
            const src = normalizeUrl(el.getAttribute('src') || '');
            return src ? `![${alt}](${src})` : alt;
        }

        // ChatGPT 常见容器：div/section/main/span 等。
        const body = serializeChildren(el, ctx);

        if (['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER'].includes(tag)) {
            return `\n${body.trim()}\n`;
        }

        return body;
    }

    function markdownFromRoot(root) {
        const raw = serializeNode(root, {});
        return collapseExtraBlankLinesFinal(cleanBlock(decodeHTMLEntities(raw)));
    }

    function htmlFromPlainText(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/\n/g, '<br>');
    }

    function isInsideChatMessage(node) {
        return Boolean(asElement(node)?.closest(MESSAGE_SELECTOR));
    }

    function cloneExpandedSelection(selection) {
        const container = document.createElement('div');

        for (let i = 0; i < selection.rangeCount; i++) {
            const range = selection.getRangeAt(i).cloneRange();

            // 如果只选中公式的一部分，扩展到整个公式节点，避免只拿到可见 HTML 层。
            const startMath = closestMathElement(range.startContainer);
            if (startMath) {
                try { range.setStartBefore(startMath); } catch (_) {}
            }

            const endMath = closestMathElement(range.endContainer);
            if (endMath) {
                try { range.setEndAfter(endMath); } catch (_) {}
            }

            container.appendChild(range.cloneContents());
        }

        return container;
    }

    function selectionLooksRelevant(selection) {
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;
        if (isEditable(selection.anchorNode) || isEditable(selection.focusNode)) return false;

        const a = asElement(selection.anchorNode);
        const f = asElement(selection.focusNode);

        return Boolean(
            a?.closest(MESSAGE_SELECTOR) ||
            f?.closest(MESSAGE_SELECTOR) ||
            asElement(selection.getRangeAt(0).commonAncestorContainer)?.closest(MESSAGE_SELECTOR)
        );
    }

    function onCopy(event) {
        const selection = window.getSelection();
        if (!selectionLooksRelevant(selection)) return;
        if (!event.clipboardData) return;

        const fragmentRoot = cloneExpandedSelection(selection);
        const text = markdownFromRoot(fragmentRoot);

        if (!text) return;

        event.clipboardData.setData('text/plain', text);
        if (SELECTION_COPY_WRITE_HTML) {
            event.clipboardData.setData('text/html', htmlFromPlainText(text));
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
    }

    async function writeTextToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (_) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.left = '-999999px';
            textarea.style.top = '-999999px';

            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();

            let ok = false;
            try {
                ok = document.execCommand('copy');
            } catch (_) {
                ok = false;
            }

            textarea.remove();
            return ok;
        }
    }

    function findTurnRootFromCopyButton(button) {
        return button.closest(TURN_SELECTOR);
    }

    function getMarkdownRootsFromTurn(turn) {
        if (!turn) return [];

        /**
         * v3 + one v3.4 fix:
         * 同一个 assistant turn 里可能出现“先回复—思考—再回复”的多个
         * data-message-author-role="assistant" 消息块。这里收集同一 turn 里的所有
         * assistant markdown 块，避免只复制第一段回复。
         */
        const assistantMessages = Array.from(
            turn.querySelectorAll(`${MESSAGE_SELECTOR}[data-message-author-role="assistant"]`)
        );

        let roots = [];
        for (const msg of assistantMessages) {
            const markdowns = Array.from(msg.querySelectorAll('.markdown'));
            if (markdowns.length) {
                roots.push(...markdowns);
            } else {
                roots.push(msg);
            }
        }

        // 用户消息或 DOM 结构变化时的兜底。
        if (!roots.length) {
            roots = Array.from(turn.querySelectorAll(MESSAGE_SELECTOR)).map(msg => {
                return msg.querySelector('.markdown') || msg;
            });
        }

        return Array.from(new Set(roots)).filter(root => {
            if (!root || !root.isConnected) return false;
            if (root.closest('pre')) return false;
            return true;
        });
    }

    function getNativeCopyTextFromButton(button) {
        const turn = findTurnRootFromCopyButton(button);
        const markdownRoots = getMarkdownRootsFromTurn(turn);
        if (!markdownRoots.length) return '';

        const parts = markdownRoots
            .map(root => markdownFromRoot(root))
            .map(s => s.trim())
            .filter(Boolean);

        return collapseExtraBlankLinesFinal(cleanBlock(parts.join('\n\n')));
    }

    function findTableFromTableCopyButton(button) {
        if (!button) return null;

        // 当前 ChatGPT 表格结构通常是：
        // .TyagGW_tableWrapper > table + sticky copy-button container。
        // 不依赖哈希类名前缀，优先找最近的 table wrapper/container，再取其中的 table。
        const wrapper = button.closest(
            '.TyagGW_tableWrapper, .TyagGW_tableContainer, [class*="tableWrapper"], [class*="tableContainer"]'
        );
        if (wrapper) {
            const table = wrapper.querySelector('table');
            if (table) return table;
        }

        // 兜底：向上找若干层父节点，寻找同一容器里的 table。
        for (let n = button.parentElement, depth = 0; n && depth < 8; n = n.parentElement, depth++) {
            const table = n.querySelector?.('table');
            if (table) return table;
        }

        return null;
    }

    function isTableCopyButtonEvent(event) {
        const target = asElement(event.target);
        if (!target) return null;

        const button = target.closest('button');
        if (!button) return null;
        if (button.closest('pre')) return null;

        const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`
            .trim()
            .toLowerCase();

        const looksLikeTableCopyButton =
            (label.includes('复制') && label.includes('表格')) ||
            (label.includes('copy') && label.includes('table'));

        if (!looksLikeTableCopyButton) return null;

        const table = findTableFromTableCopyButton(button);
        if (!table) return null;

        return { button, table };
    }

    function getTableCopyTextFromButton(button) {
        const table = findTableFromTableCopyButton(button);
        if (!table) return '';

        const text = serializeTable(table, {});
        return collapseExtraBlankLinesFinal(cleanBlock(decodeHTMLEntities(text)));
    }

    function copyFromTableButtonEvent(event) {
        const info = isTableCopyButtonEvent(event);
        if (!info) return;

        const text = getTableCopyTextFromButton(info.button);
        if (!text) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        void writeTextToClipboard(text);
        queueMicrotask(() => { void writeTextToClipboard(text); });
        setTimeout(() => { void writeTextToClipboard(text); }, 0);
        setTimeout(() => { void writeTextToClipboard(text); }, 60);
        setTimeout(() => { void writeTextToClipboard(text); }, 180);
    }

    function isTurnCopyButtonEvent(event) {
        const target = asElement(event.target);
        if (!target) return null;

        const button = target.closest(COPY_BUTTON_SELECTOR);
        if (!button) return null;

        // 避免误伤代码块自己的复制按钮。
        if (button.closest('pre')) return null;

        return button;
    }

    function copyFromNativeButtonEvent(event) {
        const button = isTurnCopyButtonEvent(event);
        if (!button) return;

        const text = getNativeCopyTextFromButton(button);
        if (!text) return;

        // 关键：即使 ChatGPT 原生 click 处理先运行或后运行，也用多次写入覆盖它。
        // 这比单纯 preventDefault 更稳，因为 React 事件注册顺序可能早于 userscript。
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        void writeTextToClipboard(text);
        queueMicrotask(() => { void writeTextToClipboard(text); });
        setTimeout(() => { void writeTextToClipboard(text); }, 0);
        setTimeout(() => { void writeTextToClipboard(text); }, 60);
        setTimeout(() => { void writeTextToClipboard(text); }, 180);
    }

    function installListeners(root) {
        // Ctrl/Cmd+C 或右键复制。
        root.addEventListener('copy', onCopy, true);

        // ChatGPT 表格自己的“复制表格”按钮。
        // 它不是 turn copy button，需要单独接管，否则公式会走原生表格复制路径。
        root.addEventListener('pointerdown', copyFromTableButtonEvent, true);
        root.addEventListener('mousedown', copyFromTableButtonEvent, true);
        root.addEventListener('click', copyFromTableButtonEvent, true);

        // ChatGPT 原生“复制回复”按钮。
        // pointerdown 提前拿到用户激活；click 再覆盖原生复制结果。
        root.addEventListener('pointerdown', copyFromNativeButtonEvent, true);
        root.addEventListener('mousedown', copyFromNativeButtonEvent, true);
        root.addEventListener('click', copyFromNativeButtonEvent, true);
    }

    // 清理旧脚本残留的浮动按钮。
    document.querySelectorAll('.latex-copy-btn, #__latexCopyStyle').forEach(el => el.remove());

    installListeners(document);

    // 兼容可能存在的 open Shadow DOM。
    const originalAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init = {}) {
        const shadowRoot = originalAttachShadow.call(this, { ...init, mode: 'open' });
        installListeners(shadowRoot);
        return shadowRoot;
    };

    document.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot) installListeners(el.shadowRoot);
    });
})();
