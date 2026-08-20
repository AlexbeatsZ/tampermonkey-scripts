// ==UserScript==
// @name         AI Conversation Navigator
// @namespace    https://greasyfork.org
// @version      102.0.1
// @description  Floating dark overlay navigator. Hidden by default; click the side toggle to open. Includes stricter AI Studio user-turn filtering. Applied for ChatGPT, Gemini, Aistudio, NotebookLM, Google search, Grok, Claude, Mistral, Meta, Deepseek, Kimi, Z.ai, Chatglm, Ernie, Xiaomimimo, Perplexity, Poe, Deepai, Huggingface, Manus, Longcat, Chatboxai, arena, Quillbot, Canva, Genspark, Character, Spacefrontiers, Scienceos, Evidencehunt, Playground (allen), Paperfigureqa (allen), Liner, Scira, Scispace, Exa.ai, Consensus, Openevidence, Math-gpt.
// @homepageURL  https://github.com/AlexbeatsZ/tampermonkey-scripts
// @downloadURL  https://raw.githubusercontent.com/AlexbeatsZ/tampermonkey-scripts/main/scripts/ai-conversation-navigator.user.js
// @updateURL    https://raw.githubusercontent.com/AlexbeatsZ/tampermonkey-scripts/main/scripts/ai-conversation-navigator.user.js
// @match        https://chatgpt.com/*
// @match        https://gemini.google.com/*
// @match        https://aistudio.google.com/*
// @match        https://notebooklm.google.com/*
// @match        https://www.google.com/*
// @match        https://grok.com/*
// @match        https://claude.ai/*
// @match        https://www.kimi.com/*
// @match        https://chat.mistral.ai/*
// @match        https://www.perplexity.ai/*
// @match        https://www.meta.ai/*
// @match        https://poe.com/*
// @match        https://deepai.org/*
// @match        https://huggingface.co/chat/*
// @match        https://chat.deepseek.com/*
// @match        https://chat.qwen.ai/*
// @match        https://manus.im/*
// @match        https://chat.z.ai/*
// @match        https://longcat.chat/*
// @match        https://chatglm.cn/*
// @match        https://ernie.baidu.com/*
// @match        https://aistudio.xiaomimimo.com/*
// @match        https://web.chatboxai.app/*
// @match        https://arena.ai/*
// @match        https://quillbot.com/*
// @match        https://www.canva.com/*
// @match        https://www.genspark.ai/*
// @match        https://character.ai/*
// @match        https://spacefrontiers.org/*
// @match        https://app.scienceos.ai/*
// @match        https://evidencehunt.com/*
// @match        https://playground.allenai.org/*
// @match        https://paperfigureqa.allen.ai/*
// @match        https://app.liner.com/*
// @match        https://scira.ai/*
// @match        https://exa.ai/*
// @match        https://consensus.app/*
// @match        https://www.openevidence.com/*
// @match        https://math-gpt.org/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @license      MIT
// ==/UserScript==


(function () {
    'use strict';

    const NAV_WIDTH = 250;
    const NAV_RIGHT_GAP = 12;
    const NAV_VERTICAL_GAP = 12;
    const NAV_FLOATING = true;
    const DEBOUNCE_TIME = 500;
    const AISTUDIO_DEBOUNCE_TIME = 350;
    const BOOKMARK_TTL_MS = 5 * 24 * 60 * 60 * 1000;
    const BOOKMARK_PREFIX = 'acn_';
    const TOGGLE_BUTTON_ID = 'nav-panel-toggle';
    const DEBUG_KEY = 'acn_debug_enabled';
    const ARENA_DOMAIN = 'arena.ai';
    const ARENA_SCROLL_BYPASS_MS = 350;
    const PAGE_SCROLL_FACTOR = 0.9;

    let activeMessageIndex = -1;
    let lastUrl = window.location.href;
    let lastPromptsContent = "";
    let cachedPrompts = [];
    let urlCheckInterval = null;
    let injectedStyleId = 'nav-shift-styles';
    let bookmarkedMessages = new Set();
    let conversationObserver = null;
    // Default hidden: the navigator only opens after clicking the side toggle.
    let isPanelCollapsed = true;
    let debugEnabled = !!GM_getValue(DEBUG_KEY, false);
    let arenaChatScroller = null;
    let arenaScrollBypassUntil = 0;
    const nativeScrollIntoView = Element.prototype.scrollIntoView;
    window.navigatorUpdateTimeout = null;

    function debugLog(message, data) {
        if (!debugEnabled) return;
        if (typeof data === 'undefined') {
            console.log('[ACN]', message);
        } else {
            console.log('[ACN]', message, data);
        }
    }

    function setDebugEnabled(enabled) {
        debugEnabled = !!enabled;
        GM_setValue(DEBUG_KEY, debugEnabled);
        console.info('[ACN] Debug ' + (debugEnabled ? 'ON' : 'OFF'));

        const debugBtn = document.getElementById('nav-btn-debug');
        if (debugBtn) {
            debugBtn.textContent = debugEnabled ? 'DBG*' : 'DBG';
            debugBtn.title = debugEnabled ? 'Disable debug logs' : 'Enable debug logs';
        }
    }

    function getElementSnapshot(element) {
        if (!element || !element.getBoundingClientRect) return null;
        const rect = element.getBoundingClientRect();
        return {
            tag: element.tagName,
            id: element.id || '',
            className: (element.className || '').toString().slice(0, 120),
            top: Math.round(rect.top),
            left: Math.round(rect.left),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
        };
    }

    function isElementInViewport(element) {
        if (!element || !element.getBoundingClientRect) return false;
        const rect = element.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight;
    }

    function isArenaSite() {
        return window.location.hostname.includes(ARENA_DOMAIN);
    }

    function isEditableElement(element) {
        if (!element) return false;
        const tag = element.tagName ? element.tagName.toLowerCase() : '';
        return tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable;
    }

    function isScrollableElement(element) {
        if (!element || element === document.body || element === document.documentElement) return false;
        const style = getComputedStyle(element);
        const overflowY = style.overflowY;
        if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'overlay') return false;
        return element.scrollHeight > element.clientHeight + 20;
    }

    function findScrollableDescendant(root) {
        if (!root || !root.querySelectorAll) return null;
        const elements = root.querySelectorAll('*');
        let best = null;
        let bestScore = 0;

        elements.forEach(el => {
            if (!isScrollableElement(el)) return;
            const score = (el.scrollHeight - el.clientHeight) * Math.max(el.clientHeight, 1);
            if (score > bestScore) {
                best = el;
                bestScore = score;
            }
        });

        return best;
    }

    function findArenaChatScroller() {
        const chatArea = document.querySelector('#chat-area');
        if (chatArea) {
            if (isScrollableElement(chatArea)) return chatArea;
            const nested = findScrollableDescendant(chatArea);
            if (nested) return nested;
        }
        return findScrollableDescendant(document.body);
    }

    function updateArenaChatScroller() {
        if (!isArenaSite()) return null;
        const found = findArenaChatScroller();
        if (found) {
            arenaChatScroller = found;
        }
        return arenaChatScroller;
    }

    function allowArenaScrollBypass(ms = ARENA_SCROLL_BYPASS_MS) {
        arenaScrollBypassUntil = Date.now() + ms;
    }

    function installArenaAutoScrollGuard() {
        if (!isArenaSite()) return;
        if (Element.prototype.scrollIntoView.__acnArenaGuard) return;

        Element.prototype.scrollIntoView = function (...args) {
            const now = Date.now();
            const scroller = arenaChatScroller || updateArenaChatScroller();
            const insideChat = !!(scroller && (this === scroller || scroller.contains(this)));

            if (insideChat && now > arenaScrollBypassUntil) {
                debugLog('arena blocked auto scrollIntoView', getElementSnapshot(this));
                return;
            }

            return nativeScrollIntoView.apply(this, args);
        };

        Element.prototype.scrollIntoView.__acnArenaGuard = true;
        console.log('[ACN] arena auto-scroll guard enabled');
    }

    function scrollTargetWithBypass(targetElement) {
        if (!targetElement) return;

        if (isArenaSite()) {
            const scroller = arenaChatScroller || updateArenaChatScroller();
            if (scroller && scroller.contains(targetElement)) {
                const targetRect = targetElement.getBoundingClientRect();
                const scrollerRect = scroller.getBoundingClientRect();
                const delta = targetRect.top - scrollerRect.top - 8;
                scroller.scrollTop += delta;
                allowArenaScrollBypass();
                debugLog('arena manual scroll', {
                    delta: Math.round(delta),
                    scrollerTop: Math.round(scroller.scrollTop),
                    target: getElementSnapshot(targetElement)
                });
                return;
            }
            allowArenaScrollBypass();
        }

        try {
            targetElement.scrollIntoView({ behavior: 'instant', block: 'start' });
        } catch (e) {
            try {
                nativeScrollIntoView.call(targetElement, { block: 'start' });
            } catch (e2) {
                targetElement.scrollIntoView();
            }
        }
    }

    function handleArenaNavigationKeys(e) {
        if (!isArenaSite()) return;
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        if (!['End', 'Home', 'PageUp', 'PageDown'].includes(e.key)) return;
        if (isEditableElement(document.activeElement)) return;

        const scroller = arenaChatScroller || updateArenaChatScroller();
        if (!scroller) {
            debugLog('arena key ignored: scroller missing', { key: e.key });
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        const pageDelta = Math.round(scroller.clientHeight * PAGE_SCROLL_FACTOR);
        if (e.key === 'End') {
            scroller.scrollTop = scroller.scrollHeight;
        } else if (e.key === 'Home') {
            scroller.scrollTop = 0;
        } else if (e.key === 'PageDown') {
            scroller.scrollTop += pageDelta;
        } else if (e.key === 'PageUp') {
            scroller.scrollTop -= pageDelta;
        }

        allowArenaScrollBypass(150);
        debugLog('arena key scroll applied', {
            key: e.key,
            scrollTop: Math.round(scroller.scrollTop),
            scrollHeight: Math.round(scroller.scrollHeight),
            clientHeight: Math.round(scroller.clientHeight)
        });
    }

    function injectStyles() {
        GM_addStyle(`
            #message-nav {
                position: fixed;
                top: ${NAV_VERTICAL_GAP}px;
                right: ${NAV_RIGHT_GAP}px;
                bottom: ${NAV_VERTICAL_GAP}px;
                width: ${NAV_WIDTH}px;
                overflow-y: auto;
                z-index: 9999;
                box-sizing: border-box;
                font-family: Calibri, Arial, sans-serif;
                font-size: 16px;
                color: #f1f1f1;
                text-align: left;
                background: #212121;
                border: 1px solid #3a3a3a;
                border-radius: 12px;
                box-shadow: 0 12px 36px rgba(0, 0, 0, 0.38);
                scrollbar-width: thin;
                scrollbar-color: #5f6368 #212121;
            }
            #message-nav::-webkit-scrollbar { width: 8px; }
            #message-nav::-webkit-scrollbar-track { background: #212121; }
            #message-nav::-webkit-scrollbar-thumb { background: #5f6368; border-radius: 8px; }
            #message-nav button, #${TOGGLE_BUTTON_ID} {
                font-family: Arial, Helvetica, sans-serif !important;
                color: #f1f1f1;
            }
            #nav-header {
                display: flex; align-items: center; justify-content: center;
                position: sticky; top: 0; z-index: 10; padding: 12px 10px; background-color: #1b1b1b;
                border-bottom: 1px solid #3a3a3a;
                border-radius: 12px 12px 0 0;
            }
            #nav-buttons-group {
                display: flex; gap: 0; align-items: center;
            }
            .nav-control-btn {
                background: transparent; border: none; cursor: pointer; font-size: 18px; color: #f1f1f1; padding: 2px 6px;
                line-height: 1; border-radius: 5px;
            }
            .nav-control-btn:hover { background: #2f2f2f; }
            #nav-btn-close {
                position: absolute; top: 3px; right: 3px; background: transparent; border: none; cursor: pointer; font-size: 15px; color: #f1f1f1;
                display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 5px;
            }
            #nav-btn-close:hover { background: #333333; }
            #nav-btn-debug {
                margin-left: 6px; background: #2f2f2f; border: 1px solid #4a4a4a; border-radius: 5px;
                font-size: 11px; padding: 1px 5px; color: #e8eaed; cursor: pointer;
            }
            #nav-message-counter {
                padding: 0; min-width: 42px; text-align: center; font-size: 15px; font-weight: normal; user-select: none;
                color: #cfcfcf;
            }
            #message-nav-content {
                padding: 5px;
            }
            #nav-list {
                padding: 0; margin: 0; list-style: none;
            }
            .nav-list-item {
                cursor: pointer; padding: 6px 6px 6px 7px; font-weight: normal; transition: background-color 0.1s ease;
                border-radius: 7px; color: #eeeeee;
            }
            .nav-list-item:hover {
                background-color: #2d2d2d;
            }
            .nav-list-item.active {
                font-weight: bold !important; background-color: #3a3a3a;
            }
            @keyframes nav-blink-animation {
                0% { opacity: 1; } 50% { opacity: 0.1; } 100% { opacity: 1; }
            }
            .nav-blink-active {
                animation: nav-blink-animation 0.5s ease-in-out 3;
            }
            .nav-item-number {
                display: inline; cursor: pointer; user-select: none; color: #ffffff;
            }
            .nav-item-number.bookmarked {
                background-color: #f1f1f1 !important; color: #111111 !important; padding: 2px 4px; border-radius: 4px;
            }
            .nav-file-tag {
                display: inline-block;
                font-size: 12px;
                font-weight: 700;
                padding: 1px 4px;
                border-radius: 6px;
                margin: 0 3px 0 2px;
                vertical-align: middle;
                letter-spacing: 0.04em;
                opacity: 0.95;
                background-color: #333333;
                color: #f1f1f1;
                border: 1px solid #505050;
                line-height: 1.4;
            }
            .nav-version-controls {
                display: inline-flex; align-items: center; margin-left: 5px; gap: 2px; border-radius: 10px; padding: 2px;
                border: 1px solid #505050;
            }
            .nav-version-btn {
                background: transparent; border: none; cursor: pointer; font-size: 13px; padding: 1px 5px;
                border-radius: 4px; color: #f1f1f1; line-height: 1;
            }
            .nav-version-btn:hover {
                background-color: #333333;
            }
            .nav-version-btn:disabled {
                opacity: 0.3; cursor: not-allowed;
            }
            .nav-version-text {
                font-size: 12px; color: #cfcfcf; margin: 0 2px;
            }
            .nav-bookmarks-container {
                display: flex; align-items: center; gap: 5px; flex-wrap: wrap; padding: 5px 10px; background-color: #1f1f1f;
                border-bottom: 1px solid #3a3a3a;
                min-height: 34px; box-sizing: border-box; width: 100%; flex-shrink: 0; position: sticky; z-index: 9;
            }
            .nav-bookmark-item {
                background-color: #333333; color: #f1f1f1; padding: 3px 6px; border-radius: 5px;
                cursor: pointer; font-size: 15px; user-select: none; transition: background-color 0.2s;
                border: 1px solid #4a4a4a;
            }
            .nav-bookmark-item:hover {
                background-color: #444444;
            }
            .nav-bookmark-item.active {
                font-weight: bold; background-color: #f1f1f1; color: #111111;
            }
            #${TOGGLE_BUTTON_ID} {
                position: fixed;
                right: ${NAV_RIGHT_GAP}px;
                top: 50%;
                transform: translateY(-50%);
                width: 28px;
                height: 42px;
                border-radius: 8px;
                border: 1px solid #3a3a3a;
                background: #212121;
                color: #ffffff;
                font-size: 24px;
                font-weight: 400;
                line-height: 1;
                display: none;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                z-index: 10000;
                transition: right 0.25s ease, background-color 0.15s ease;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
            }
            #${TOGGLE_BUTTON_ID}:hover {
                background: #2f2f2f;
            }
            #${TOGGLE_BUTTON_ID}.expanded {
                right: ${NAV_WIDTH + NAV_RIGHT_GAP + 8}px;
            }
        `);

        const allUserSelectors = Object.values(SITE_CONFIGS)
            .map(config => config.userMessage?.container)
            .filter(selector => typeof selector === 'string' && selector.length > 0)
            .join(', ');

        if (allUserSelectors) {
            GM_addStyle(`${allUserSelectors} { scroll-margin-top: 10px !important; }`);
        }
    }

    function querySelectorAllSafe(selector, root = document) {
        try {
            return Array.from(root.querySelectorAll(selector));
        } catch (e) {
            debugLog('selector failed', { selector, error: e && e.message });
            return [];
        }
    }

    function normalizePromptPreviewText(text) {
        return (text || '')
            .replace(/\s+/g, ' ')
            .replace(/^(user prompt|prompt|用户提示|用户输入|用户)\s*[:：-]?\s*/i, '')
            .replace(/^\d{1,2}:\d{2}\s*/, '')
            .trim();
    }

    function getElementDocumentOrder(element) {
        if (!element || !element.ownerDocument) return Number.MAX_SAFE_INTEGER;
        const allTurns = Array.from(document.querySelectorAll('ms-chat-turn, [id^="turn-"]'));
        const turn = element.closest ? (element.closest('ms-chat-turn') || element.closest('[id^="turn-"]')) : null;
        const idx = turn ? allTurns.indexOf(turn) : -1;
        if (idx >= 0) return idx;

        const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : null;
        return rect ? Math.round(rect.top + window.scrollY) : Number.MAX_SAFE_INTEGER;
    }

    function getAIStudioTurnForScrollbarButton(btn) {
        if (!btn) return null;

        const controls = btn.getAttribute('aria-controls');
        if (controls) {
            const controlled = document.getElementById(controls);
            if (controlled) return controlled.closest('ms-chat-turn') || controlled;
        }

        const itemId = btn.getAttribute('data-test-item-id') || (btn.id || '').replace(/^scrollbar-item-/, '');
        if (itemId) {
            const byTurnId = document.getElementById('turn-' + itemId);
            if (byTurnId) return byTurnId.closest('ms-chat-turn') || byTurnId;
            const byChunkId = document.getElementById(itemId);
            if (byChunkId) return byChunkId.closest('ms-chat-turn') || byChunkId;
        }

        return null;
    }

    function isAIStudioUserTurnElement(element) {
        if (!element) return false;
        const turn = element.closest ? (element.closest('ms-chat-turn') || element.closest('.chat-turn-container') || element) : element;

        const modelMarkers = [
            '.model-prompt-container[data-turn-role="Model"]',
            '[data-turn-role="Model"]',
            '.chat-turn-container.model',
            'ms-thought-chunk'
        ];
        if (modelMarkers.some(selector => turn.matches?.(selector) || turn.querySelector?.(selector))) return false;

        const userMarkers = [
            '.user-prompt-container[data-turn-role="User"]',
            '[data-turn-role="User"]',
            '.chat-turn-container.user'
        ];
        return userMarkers.some(selector => turn.matches?.(selector) || turn.querySelector?.(selector));
    }

    function extractTextFromNodeWithoutChrome(node) {
        if (!node) return '';
        const clone = node.cloneNode(true);
        const removeSelectors = [
            'button',
            'svg',
            'mat-menu',
            '.actions-container',
            '.actions',
            '.author-label',
            '.timestamp',
            'ms-chat-turn-options',
            'ms-thought-chunk',
            'ms-image-chunk',
            'ms-file-chunk',
            '.image-container',
            '.bottom-right-image-controls',
            '[aria-label="Download"]',
            '[aria-label="View full image"]'
        ];
        removeSelectors.forEach(selector => {
            try { clone.querySelectorAll(selector).forEach(el => el.remove()); } catch (e) {}
        });
        return normalizePromptPreviewText(clone.textContent || '');
    }

    function extractAIStudioUserText(turnOrContainer) {
        if (!isAIStudioUserTurnElement(turnOrContainer)) return '';
        const turn = turnOrContainer.closest ? (turnOrContainer.closest('ms-chat-turn') || turnOrContainer) : turnOrContainer;
        const root = turn.querySelector?.('.user-prompt-container[data-turn-role="User"], [data-turn-role="User"]') || turn;

        const textNodes = [
            ...querySelectorAllSafe('ms-text-chunk .user-chunk', root),
            ...querySelectorAllSafe('ms-cmark-node.user-chunk', root),
            ...querySelectorAllSafe('ms-text-chunk', root),
            ...querySelectorAllSafe('.text-chunk', root)
        ];

        for (const node of textNodes) {
            const text = extractTextFromNodeWithoutChrome(node);
            if (text && text.length >= 2) return text;
        }

        const aria = turn.getAttribute?.('aria-label') || root.getAttribute?.('aria-label') || '';
        const ariaText = normalizePromptPreviewText(aria);
        if (ariaText && !/^(model|模型|thinking|思考|response|answer|回复)/i.test(ariaText)) return ariaText;

        // Intentionally do not fall back to image alt text or whole-turn textContent here.
        // In AI Studio, those paths commonly pull in attachment controls, thinking blocks, or model output.
        return '';
    }

    function addAIStudioPrompt(prompts, seen, element, rawText, options = {}) {
        if (!element) return;
        const text = normalizePromptPreviewText(rawText);
        if (!text || text.length < 2) return;
        if (/^(model|模型|thinking|思考|response|answer|回复)\b/i.test(text)) return;

        const key = options.key || text.slice(0, 180);
        const textKey = text.slice(0, 180);
        if (seen.has(key) || seen.has('text:' + textKey)) return;
        seen.add(key);
        seen.add('text:' + textKey);

        if (options.scrollOnly && element.setAttribute) {
            element.setAttribute('data-acn-scroll-only', 'true');
        }

        prompts.push({
            element,
            text,
            acnKey: key,
            acnTextKey: textKey,
            acnOrder: Number.isFinite(options.order) ? options.order : getElementDocumentOrder(element),
            acnSource: 'aistudio',
            acnComplete: !!options.complete
        });
    }

    function mergeAIStudioPartialPrompts(newPrompts) {
        if (newPrompts.acnComplete) return newPrompts;

        const merged = [];
        const byText = new Map();
        const byKey = new Map();
        const pushOrReplace = (prompt, preferNew = false) => {
            if (!prompt || prompt.acnSource !== 'aistudio') return;
            const textKey = prompt.acnTextKey || normalizePromptPreviewText(prompt.text).slice(0, 180);
            const key = prompt.acnKey || textKey;
            const existingIndex = byText.has(textKey) ? byText.get(textKey) : byKey.get(key);

            if (typeof existingIndex === 'number') {
                const existing = merged[existingIndex];
                const promptConnected = !!(prompt.element && prompt.element.isConnected);
                const existingConnected = !!(existing.element && existing.element.isConnected);
                if (preferNew || (promptConnected && !existingConnected)) merged[existingIndex] = prompt;
                return;
            }

            byText.set(textKey, merged.length);
            byKey.set(key, merged.length);
            merged.push(prompt);
        };

        cachedPrompts.forEach(prompt => pushOrReplace(prompt, false));
        newPrompts.forEach(prompt => pushOrReplace(prompt, true));
        merged.sort((a, b) => (a.acnOrder ?? Number.MAX_SAFE_INTEGER) - (b.acnOrder ?? Number.MAX_SAFE_INTEGER));
        return merged;
    }

    function getAIStudioData() {
        const prompts = [];
        const seen = new Set();

        // Preferred path: AI Studio's current conversation scrollbar.
        // Important: ms-items-scrollbar contains both user and model turns; use aria-controls/data-test-item-id
        // to resolve the real turn and keep only data-turn-role="User".
        const scrollbarButtons = querySelectorAllSafe([
            'ms-items-scrollbar button[id^="scrollbar-item-"]',
            'ms-items-scrollbar button[aria-controls^="turn-"]',
            'ms-prompt-scrollbar button[id^="scrollbar-item-"]',
            'ms-prompt-scrollbar button[aria-label]'
        ].join(','));

        scrollbarButtons.forEach((btn, index) => {
            const label = btn.getAttribute('aria-label') || btn.getAttribute('title') || '';
            const turn = getAIStudioTurnForScrollbarButton(btn);

            if (turn) {
                if (!isAIStudioUserTurnElement(turn)) return;
                addAIStudioPrompt(prompts, seen, btn, label || extractAIStudioUserText(turn), {
                    key: btn.getAttribute('data-test-item-id') || btn.getAttribute('aria-controls') || label.slice(0, 180),
                    order: index,
                    complete: true
                });
                return;
            }

            // Legacy AI Studio used .prompt-scrollbar-dot for user prompts. The newer .items-scrollbar-dot
            // is not sufficient by itself, so do not trust it without a resolved user turn.
            const legacyUserDot = !!btn.querySelector('.prompt-scrollbar-dot, [class*="prompt-scrollbar-dot"]');
            if (legacyUserDot) {
                addAIStudioPrompt(prompts, seen, btn, label, {
                    key: btn.id || label.slice(0, 180),
                    order: index,
                    complete: true
                });
            }
        });

        if (prompts.length > 0) {
            prompts.acnComplete = true;
            return prompts;
        }

        // Fallback path: scan rendered chat turns only, but keep it strictly limited to user turns.
        // This path may be partial because AI Studio virtualizes off-screen turns, so merge it with
        // the previous AI Studio cache to avoid sidebar flicker while scrolling.
        const userTurnSelectors = [
            'ms-chat-turn:has(.user-prompt-container[data-turn-role="User"])',
            '.chat-turn-container.user',
            '.user-prompt-container[data-turn-role="User"]',
            '[data-turn-role="User"].user-prompt-container',
            '[data-message-author-role="user"]',
            '[data-testid="user-message"]',
            '[data-testid*="user-message"]'
        ];

        querySelectorAllSafe(userTurnSelectors.join(',')).forEach((el, index) => {
            const turn = el.closest?.('ms-chat-turn') || el;
            if (!isAIStudioUserTurnElement(turn)) return;
            const text = extractAIStudioUserText(turn);
            addAIStudioPrompt(prompts, seen, turn, text, {
                key: turn.id || text.slice(0, 180),
                order: getElementDocumentOrder(turn) + index / 1000,
                scrollOnly: true,
                complete: false
            });
        });

        return mergeAIStudioPartialPrompts(prompts);
    }

    const SITE_CONFIGS = {
        chatgpt: {
            domain: 'chatgpt.com',
            userMessage: {
                container: 'div[data-message-author-role="user"]',
                file: '.p-2 .truncate.font-semibold',
                text: '.user-message-bubble-color',
                image: 'img'
            },
            shiftTarget: '.flex.h-svh.w-screen.flex-col',
            versionControl: {
                container: '.z-0.flex.justify-end',
                versionText: '.tabular-nums',
                prevButton: 'button[aria-label*="Previous response"]',
                nextButton: 'button[aria-label*="Next response"]'
            }
        },
        gemini: {
            domain: 'gemini.google.com',
            userMessage: {
                container: '.user-query-container .user-query-container .user-query-container',
                file: '.new-file-preview-container button[aria-label]',
                text: '.query-text p',
                image: '.preview-image'
            },
            shiftTarget: 'chat-app, .boqOnegoogleliteOgbOneGoogleBar, top-bar-actions',
        },
        aistudio: {
            domain: 'aistudio.google.com',
            customFinder: getAIStudioData,
            useClick: true,
            shiftTarget: '.layout-wrapper',
            fastUpdate: true,
            debounceTime: AISTUDIO_DEBOUNCE_TIME,
        },
        notebooklm: {
            domain: 'notebooklm.google.com',
            userMessage: { container: 'chat-message .from-user-container' },
            shiftTarget: 'notebook, .boqOnegoogleliteOgbOneGoogleBar',
        },
        googleSearch: {
            domain: 'www.google.com',
            userMessage: { container: '[aria-hidden="false"] [role="heading"][aria-level="2"][jsuid]' },
            shiftTarget: '[jsname="oEQ3x"], header[jsname="kNXmHc"], .eT9Cje',
        },
        grok: {
            domain: 'grok.com',
            userMessage: {
                container: '.relative.group.flex.flex-col.justify-center.items-end',
                file: '.flex.flex-row.flex-wrap.justify-end.gap-2.mt-2',
                text: '.message-bubble',
                image: 'img'
            },
            shiftTarget: 'main',
            versionControl: {
                container: '.relative.group.flex.flex-col.justify-center.items-end .action-buttons',
                versionText: '[class="px-0.5"]',
                prevButton: 'button[aria-label="Previous message"]',
                nextButton: 'button[aria-label="Next message"]'
            }
        },
        claude: {
            domain: 'claude.ai',
            userMessage: {
                container: '.mb-1.mt-6.group',
                file: '[data-testid="file-thumbnail"]',
                fileType: '.uppercase.truncate',
                fileName: 'p',
                image: '[data-testid*="."]',
                text: '[data-testid="user-message"]'
            },
            shiftTarget: '#main-content',
            versionControl: {
                container: '.mb-1.mt-6.group',
                versionText: '.self-center.select-none',
                prevButton: 'button[aria-label="Previous"]',
                nextButton: 'button[aria-label="Next"]'
            }
        },
        mistral: {
            domain: 'chat.mistral.ai',
            userMessage: {
                container: 'div[data-message-author-role="user"] div[dir="auto"]',
                file: '.max-w-2xs',
                image: 'img',
                text: '.select-none'
            },
            shiftTarget: 'main.bg-sidebar-subtle',
            versionControl: {
                container: 'div[data-message-author-role="user"]',
                versionText: '[class*="text-muted"][class*="dark:text-muted"]',
                prevButton: 'button[aria-label*="Previous version"]',
                nextButton: 'button[aria-label*="Next version"]'
            }
        },
        meta: {
            domain: 'meta.ai',
            userMessage: {
                container: '.xuk3077.x78zum5.xdt5ytf.x17zd0t2.x1r0jzty',
                file: 'a[download]',
                fileName: '.x1lliihq.x193iq5w.x6ikm8r.x10wlt62.xlyipyv.xuxw1ft',
                fileType: '.x1lgk290',
                text: '.xh8yej3 span',
                image: 'img'
            },
            shiftTarget: '.xph554m.x73z65k',
        },
        deepseek: {
            domain: 'chat.deepseek.com',
            userMessage: {
                container: '.d29f3d7d',
                file: '.f3a54b52',
                image: 'img',
                text: '._9663006 .fbb737a4'
            },
            shiftTarget: '._8f60047, ._189b4a0, ._2be88ba',
            versionControl: {
                container: '._9663006',
                versionText: '.dd7e4fda',
                prevButton: '.e7367035:first-of-type',
                nextButton: '.e7367035:last-of-type'
            }
        },
        kimi: {
            domain: 'www.kimi.com',
            userMessage: {
                container: '.segment.segment-user',
                file: '.attachment-list .file-card-info-name',
                image: '.image-wrapper.image-detail img',
                text: '.user-content'
            },
            shiftTarget: '.has-sidebar',
            versionControl: {
                container: '.segment-user-actions',
                versionText: '.assistant-page-info',
                prevButton: '.icon-button.assistant-page-item:first-of-type',
                nextButton: '.icon-button.assistant-page-item:last-of-type'
            }
        },
        glm: {
            domain: 'chat.z.ai',
            userMessage: {
                container: '.chat-user',
                file: '.mb-1.truncate',
                image: 'img.object-cover',
                text: '.flex.justify-end.pb-1'
            },
            shiftTarget: '#chat-container',
            versionControl: {
                container: '.chat-user .flex.justify-end.text-gray-600',
                versionText: '.self-center.text-sm.font-semibold.tracking-widest',
                prevButton: '.self-center.p-1.rounded-md.transition:first-of-type',
                nextButton: '.self-center.p-1.rounded-md.transition:last-of-type'
            }
        },
        qwen: {
            domain: 'chat.qwen.ai',
            userMessage: {
                container: '.chat-user-message-container',
                file: '.index-module__file-message___SeOoR',
                fileType: '.fileitem-file-name-ext',
                fileName: '.fileitem-file-name-text',
                image: 'img',
                text: '.chat-user-message'
            },
            shiftTarget: '.desktop-layout-content',
            versionControl: {
                container: '.user-message-footer.ant-flex',
                versionText: '.qwen-chat-ui-packages-siblings-text',
                prevButton: '.anticon.qwen-chat-ui-packages-siblings-active-icon:first-of-type',
                nextButton: '.anticon.qwen-chat-ui-packages-siblings-active-icon:last-of-type'
            }
        },
        chatglm: {
            domain: 'chatglm.cn',
            userMessage: { container: '.question-txt.dots' },
            shiftTarget: '.detail-container',
        },
        ernie: {
            domain: 'ernie.baidu.com',
            userMessage: {
                container: '.roleUser__TCPTqNDW',
                file: '.chat-file-item-card',
                fileType: '.metaDesc__zRkzT0lZ span:first-of-type',
                fileName: '.title__gkcd9NRs',
                image: '.singleImage__BG1t1bGa img',
                text: '#question_text_id'
            },
            shiftTarget: '#root',
            versionControl: {
                container: '.editControls__OdmgmAiJ',
                versionText: '.pageCount__SvI_mTsu',
                prevButton: '.turnIcon__oN1i9Cks:first-of-type',
                nextButton: '.turnIcon__oN1i9Cks:last-of-type'
            },
            reverse: true,
        },
        xiaomimimo: {
            domain: 'aistudio.xiaomimimo.com',
            userMessage: { container: '.relative.inline-block.whitespace-pre-wrap' },
            shiftTarget: '.overflow-hidden.bg-gray-50',
        },
        perplexity: {
            domain: 'perplexity.ai',
            userMessage: { container: 'div.group\\/title' },
            shiftTarget: '#root',
        },
        poe: {
            domain: 'poe.com',
            userMessage: { container: '[class*="ChatMessagesView_tupleGroupContainer"] > div > div:first-child' },
            shiftTarget: '[class*="CanvasSidebarLayout_chat-column"]'
        },
        deepai: {
            domain: 'deepai.org',
            userMessage: { container: '.chatbox' },
            shiftTarget: '.chat-layout-container, .new-chat-button-container, .persistent-compose-area, .nav-items'
        },
        huggingface: {
            domain: 'huggingface.co',
            userMessage: { container: '.disabled.w-full.appearance-none' },
            shiftTarget: '.relative.min-h-0.min-w-0'
        },
        manus: {
            domain: 'manus.im',
            userMessage: { container: '.flex.relative.flex-col.gap-2.items-end' },
            shiftTarget: '.simplebar-content'
        },
        longcat: {
            domain: 'longcat.chat',
            userMessage: { container: '.user-message' },
            shiftTarget: '.content',
        },
        chatboxai: {
            domain: 'web.chatboxai.app',
            userMessage: { container: '.user-msg' },
            shiftTarget: '.h-full.w-full.MuiBox-root'
        },
        arena: {
            domain: 'arena.ai',
            userMessage: { container: '.justify-end.gap-2' },
            shiftTarget: '#chat-area',
            reverse: true
        },
        quillbot: {
            domain: 'quillbot.com',
            userMessage: { container: 'div.MuiGrid-root.MuiGrid-container > div.MuiGrid-root > p.MuiTypography-root.MuiTypography-bodyMedium.MuiTypography-paragraph' },
            shiftTarget: '#root-client'
        },
        canva: {
            domain: 'www.canva.com',
            userMessage: { container: '#_r_1_ .uV9Uzw .Ka9auQ p' },
            shiftTarget: '#root'
        },
        genspark: {
            domain: 'www.genspark.ai',
            userMessage: { container: '.conversation-item-desc.user' },
            shiftTarget: '.n-config-provider'
        },
        character: {
            domain: 'character.ai',
            userMessage: { container: '.w-full .bg-surface-elevation-3.opacity-90' },
            shiftTarget: '#__next, #chat-header-background',
            reverse: true
        },
        spacefrontiers: {
            domain: 'spacefrontiers.org',
            userMessage: { container: '.inline.whitespace-pre-line' },
            shiftTarget: '#app'
        },
        scienceos: {
            domain: 'app.scienceos.ai',
            userMessage: { container: 'div[data-prompt]' },
            shiftTarget: 'div[data-strategy]',
            versionControl: {
                container: 'div:has(> button[aria-label*="thread"])',
                versionText: 'div[style*="tabular-nums"]',
                prevButton: 'button[aria-label="Previous thread"]',
                nextButton: 'button[aria-label="Next thread"]'
            },
        },
        evidencehunt: {
            domain: 'evidencehunt.com',
            userMessage: { container: '.chat__message:has(.message__user-image) .message__content p' },
            shiftTarget: '.v-main, .v-app-bar, .chat-tab-bar'
        },
        playground: {
            domain: 'playground.allenai.org',
            userMessage: { container: 'div[class*="chat-message"]:nth-of-type(even)' },
            shiftTarget: '.MuiPaper-outlined'
        },
        paperfigure: {
            domain: 'paperfigureqa.allen.ai',
            userMessage: { container: '#chat-scroll-container > div > div:nth-of-type(odd) .MuiPaper-root' },
            shiftTarget: '#root'
        },
        liner: {
            domain: 'app.liner.com',
            userMessage: { container: '#userQuestion' },
            shiftTarget: '.flex.min-h-0.w-full.flex-1'
        },
        scira: {
            domain: 'scira.ai',
            userMessage: { container: '.max-w-full .relative' },
            shiftTarget: '.sm\\:max-w-2xl'
        },
        exa: {
            domain: 'exa.ai',
            userMessage: { container: 'div[data-test-id="UserMessage"]' },
            shiftTarget: 'div[data-test-id="ChatPresentation"]'
        },
        consensus: {
            domain: 'consensus.app',
            userMessage: { container: '.flex.flex-col.pt-6.w-full.max-w-page h2' },
            shiftTarget: '#__next'
        },
        openevidence: {
            domain: 'openevidence.com',
            userMessage: { container: '.brandable--query-bar--container form' },
            shiftTarget: '#__next, .brandable--query-bar--container.hide-on-print.follow-up'
        },
        mathgpt: {
            domain: 'math-gpt.org',
            userMessage: { container: '.w-full.flex.items-end.flex-col.pb-8.relative' },
            shiftTarget: '.overflow-x-hidden, .px-2.flex.flex-col.gap-1'
        },
    };


    function getCurrentConfig() {
        const hostname = window.location.hostname;
        for (const key in SITE_CONFIGS) {
            if (hostname.includes(SITE_CONFIGS[key].domain)) return SITE_CONFIGS[key];
        }
        return null;
    }

    const CURRENT_SITE = getCurrentConfig();
    if (!CURRENT_SITE) return;

    function hasUserMessages() {
        if (CURRENT_SITE.customFinder) {
            const prompts = CURRENT_SITE.customFinder();
            return prompts && prompts.length > 0;
        }
        if (!CURRENT_SITE.userMessage || !CURRENT_SITE.userMessage.container) return false;
        return document.querySelectorAll(CURRENT_SITE.userMessage.container).length > 0;
    }

    const getShiftStyle = (width, selector = '') => {
        if (!selector) return '';
        const selectors = selector.split(',');
        const prefixedSelector = selectors.map(s => `body.navigator-expanded ${s.trim()}`).join(', ');
        return `
            ${selector} {
                transition: margin-right 0.3s ease, max-width 0.3s ease, margin-left 0.3s ease;
            }
            ${prefixedSelector} {
                margin-left: 0 !important; margin-right: ${width}px !important; max-width: calc(100% - ${width}px) !important;
            }
        `;
    };

    function updateShiftStyles(shouldInject) {
        const existingStyle = document.getElementById(injectedStyleId);
        if (NAV_FLOATING) {
            if (existingStyle) existingStyle.remove();
            return;
        }

        if (shouldInject && !existingStyle) {
            const currentWidth = CURRENT_SITE.width || NAV_WIDTH;
            let cssContent = '';
            if (CURRENT_SITE.shiftTarget) cssContent += getShiftStyle(currentWidth, CURRENT_SITE.shiftTarget);
            if (cssContent) {
                const styleElement = document.createElement('style');
                styleElement.id = injectedStyleId;
                styleElement.textContent = cssContent;
                document.head.appendChild(styleElement);
            }
        } else if (!shouldInject && existingStyle) {
            existingStyle.remove();
        }
    }

    function updateBodyClassForLayout() {
        if (NAV_FLOATING) {
            document.body.classList.remove('navigator-expanded');
            return;
        }

        const container = document.getElementById('message-nav');
        if (!container || container.style.display === 'none') {
            document.body.classList.remove('navigator-expanded');
            return;
        }
        document.body.classList.add('navigator-expanded');
    }

    function createToggleButton() {
        let toggleBtn = document.getElementById(TOGGLE_BUTTON_ID);
        if (toggleBtn) return toggleBtn;

        toggleBtn = document.createElement('button');
        toggleBtn.id = TOGGLE_BUTTON_ID;
        toggleBtn.type = 'button';
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setPanelCollapsed(!isPanelCollapsed);
        });

        document.body.appendChild(toggleBtn);
        return toggleBtn;
    }

    function syncToggleButton(shouldShow = true) {
        const toggleBtn = createToggleButton();
        if (!shouldShow) {
            toggleBtn.style.display = 'none';
            return;
        }

        toggleBtn.style.display = 'flex';
        toggleBtn.textContent = isPanelCollapsed ? '‹' : '›';
        toggleBtn.title = isPanelCollapsed ? 'Expand navigator' : 'Collapse navigator';
        toggleBtn.classList.toggle('expanded', !isPanelCollapsed);
    }

    function setPanelCollapsed(collapsed) {
        isPanelCollapsed = collapsed;

        const container = document.getElementById('message-nav');
        if (container) {
            container.style.display = collapsed ? 'none' : 'block';
        }

        syncToggleButton(hasUserMessages());
        updateShiftStyles(hasUserMessages() && !collapsed);
        updateBodyClassForLayout();
    }

    function getStorageKey() {
        return BOOKMARK_PREFIX + window.location.hostname + window.location.pathname;
    }

    function saveBookmarks() {
        const key = getStorageKey();
        const data = Array.from(bookmarkedMessages);
        if (data.length === 0) {
            GM_deleteValue(key);
            return;
        }
        const value = Date.now() + '|' + data.sort((a, b) => a - b).join(',');
        GM_setValue(key, value);
    }

    function loadBookmarks() {
        const key = getStorageKey();
        const raw = GM_getValue(key, '');
        if (!raw) {
            bookmarkedMessages = new Set();
            return;
        }
        const sep = raw.indexOf('|');
        if (sep === -1) {
            GM_deleteValue(key);
            bookmarkedMessages = new Set();
            return;
        }
        const savedAt = parseInt(raw.slice(0, sep));
        const age = Date.now() - savedAt;
        if (age > BOOKMARK_TTL_MS) {
            GM_deleteValue(key);
            bookmarkedMessages = new Set();
            return;
        }
        const indices = raw.slice(sep + 1);
        bookmarkedMessages = new Set(
            indices.split(',').map(Number).filter(n => !isNaN(n) && n > 0)
        );
    }

    function cleanupExpiredBookmarks() {
        try {
            GM_listValues().forEach(key => {
                if (!key.startsWith(BOOKMARK_PREFIX)) return;
                const raw = GM_getValue(key, '');
                if (!raw) { GM_deleteValue(key); return; }
                const sep = raw.indexOf('|');
                if (sep === -1) { GM_deleteValue(key); return; }
                const age = Date.now() - parseInt(raw.slice(0, sep));
                if (age > BOOKMARK_TTL_MS) GM_deleteValue(key);
            });
        } catch (e) {}
    }

    function toggleBookmark(index) {
        if (bookmarkedMessages.has(index)) {
            bookmarkedMessages.delete(index);
        } else {
            bookmarkedMessages.add(index);
        }
        saveBookmarks();
        updateBookmarkVisuals();
        updateBookmarksHeader();
    }

    function updateBookmarkVisuals() {
        const content = document.getElementById('message-nav-content');
        if (!content) return;
        const list = content.querySelector('#nav-list');
        if (!list) return;
        list.querySelectorAll('.nav-list-item').forEach((item, idx) => {
            const numberContainer = item.querySelector('.nav-item-number');
            if (numberContainer) {
                const index = idx + 1;
                if (bookmarkedMessages.has(index)) {
                    numberContainer.textContent = `${index}`;
                    numberContainer.classList.add('bookmarked');
                } else {
                    numberContainer.textContent = `${index}.`;
                    numberContainer.classList.remove('bookmarked');
                }
            }
        });
    }

    function updateBookmarksHeader() {
        let bookmarksContainer = document.getElementById('nav-bookmarks-header');
        const header = document.getElementById('nav-header');
        if (!header) return;

        if (bookmarkedMessages.size === 0 || cachedPrompts.length < 6) {
            if (bookmarksContainer) bookmarksContainer.remove();
            return;
        }

        if (!bookmarksContainer) {
            bookmarksContainer = document.createElement('div');
            bookmarksContainer.id = 'nav-bookmarks-header';
            bookmarksContainer.className = 'nav-bookmarks-container';
            bookmarksContainer.style.top = header.offsetHeight + 'px';
            header.parentNode.insertBefore(bookmarksContainer, header.nextSibling);
        }

        while (bookmarksContainer.firstChild) bookmarksContainer.removeChild(bookmarksContainer.firstChild);

        Array.from(bookmarkedMessages).sort((a, b) => a - b).forEach(index => {
            const bookmarkItem = document.createElement('span');
            bookmarkItem.className = 'nav-bookmark-item';
            bookmarkItem.textContent = index;
            if (index === activeMessageIndex) bookmarkItem.classList.add('active');
            bookmarkItem.addEventListener('click', () => navigateToMessage(index));
            bookmarksContainer.appendChild(bookmarkItem);
        });
    }

    function updateMessageCounter() {
        const counterSpan = document.getElementById('nav-message-counter');
        if (counterSpan) {
            const current = activeMessageIndex > 0 ? activeMessageIndex : (cachedPrompts.length > 0 ? 1 : 0);
            counterSpan.textContent = `${current}/${cachedPrompts.length}`;
        }
    }

    function navigateToMessage(messageIndex) {
        navigateToMessageByElement(messageIndex, null, 'index-nav');
    }

    function navigateToMessageByElement(messageIndex, preferredElement, source) {
        const connectedPreferred = preferredElement && preferredElement.isConnected ? preferredElement : null;
        const cachedElement = cachedPrompts[messageIndex - 1] ? cachedPrompts[messageIndex - 1].element : null;
        const connectedCached = cachedElement && cachedElement.isConnected ? cachedElement : null;
        const targetElement = connectedPreferred || connectedCached || findPromptElementByIndex(messageIndex - 1);

        if (!targetElement) {
            debugLog('navigate target missing', { messageIndex, source, cachedLength: cachedPrompts.length });
            return;
        }

        const shouldUseClick = !!CURRENT_SITE.useClick && targetElement.getAttribute('data-acn-scroll-only') !== 'true';

        debugLog('navigate start', {
            messageIndex,
            source,
            useClick: shouldUseClick,
            target: getElementSnapshot(targetElement)
        });

        const list = document.getElementById('nav-list');
        if (list) {
            list.querySelectorAll('.nav-list-item').forEach(li => li.classList.remove('active'));
            const targetItem = list.children[messageIndex - 1];
            if (targetItem) {
                targetItem.classList.add('active');
                targetItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }

        activeMessageIndex = messageIndex;
        updateMessageCounter();
        updateBookmarksHeader();

        if (shouldUseClick) {
            if (isArenaSite()) allowArenaScrollBypass();
            targetElement.click();
        } else {
            scrollTargetWithBypass(targetElement);
        }

        setTimeout(() => {
            debugLog('navigate result', {
                messageIndex,
                source,
                inViewport: isElementInViewport(targetElement),
                target: getElementSnapshot(targetElement)
            });
        }, 120);

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    targetElement.classList.add('nav-blink-active');
                    setTimeout(() => targetElement.classList.remove('nav-blink-active'), 2000);
                    observer.unobserve(targetElement);
                }
            });
        }, { threshold: 0.5 });
        observer.observe(targetElement);
    }

    function createContainer() {
        let container = document.getElementById('message-nav');
        if (!container) {
            container = document.createElement('div');
            container.id = 'message-nav';

            const header = document.createElement('div');
            header.id = 'nav-header';

            const navButtonsContainer = document.createElement('div');
            navButtonsContainer.id = 'nav-buttons-group';

            const firstBtn = document.createElement('button');
            firstBtn.id = 'nav-btn-first';
            firstBtn.className = 'nav-control-btn';
            firstBtn.textContent = '|‹';
            firstBtn.addEventListener('click', (e) => { e.stopPropagation(); if (cachedPrompts.length > 0) navigateToMessage(1); });

            const prevBtn = document.createElement('button');
            prevBtn.id = 'nav-btn-prev';
            prevBtn.className = 'nav-control-btn';
            prevBtn.textContent = '‹';
            prevBtn.addEventListener('click', (e) => { e.stopPropagation(); if (cachedPrompts.length > 0 && activeMessageIndex > 1) navigateToMessage(activeMessageIndex - 1); });

            const messageCounter = document.createElement('span');
            messageCounter.id = 'nav-message-counter';

            const nextBtn = document.createElement('button');
            nextBtn.id = 'nav-btn-next';
            nextBtn.className = 'nav-control-btn';
            nextBtn.textContent = '›';
            nextBtn.addEventListener('click', (e) => { e.stopPropagation(); if (cachedPrompts.length > 0 && activeMessageIndex < cachedPrompts.length) navigateToMessage(activeMessageIndex + 1); });

            const lastBtn = document.createElement('button');
            lastBtn.id = 'nav-btn-last';
            lastBtn.className = 'nav-control-btn';
            lastBtn.textContent = '›|';
            lastBtn.addEventListener('click', (e) => { e.stopPropagation(); if (cachedPrompts.length > 0) navigateToMessage(cachedPrompts.length); });

            navButtonsContainer.appendChild(firstBtn);
            navButtonsContainer.appendChild(prevBtn);
            navButtonsContainer.appendChild(messageCounter);
            navButtonsContainer.appendChild(nextBtn);
            navButtonsContainer.appendChild(lastBtn);

            const closeBtn = document.createElement('button');
            closeBtn.id = 'nav-btn-close';
            closeBtn.textContent = '✕';
            closeBtn.title = 'Collapse navigator';

            const debugBtn = document.createElement('button');
            debugBtn.id = 'nav-btn-debug';
            debugBtn.textContent = debugEnabled ? 'DBG*' : 'DBG';
            debugBtn.title = debugEnabled ? 'Disable debug logs' : 'Enable debug logs';
            debugBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                setDebugEnabled(!debugEnabled);
            });

            header.appendChild(navButtonsContainer);
            header.appendChild(debugBtn);
            header.appendChild(closeBtn);

            const content = document.createElement('div');
            content.id = 'message-nav-content';

            container.appendChild(header);
            container.appendChild(content);
            document.body.appendChild(container);

            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                setPanelCollapsed(true);
            });

            updateBodyClassForLayout();
        }
        return container;
    }

    function getVersionInfo(container, vc) {
        if (!container || !vc) return null;
        const versionText = container.querySelector(vc.versionText);
        if (!versionText) return null;
        const text = versionText.textContent.trim();
        let match = text.match(/(\d+)\D+(\d+)/);
        let currentVersion, totalVersions;
        if (match) {
            currentVersion = parseInt(match[1]);
            totalVersions = parseInt(match[2]);
        } else if (text.length >= 2 && /^\d+$/.test(text)) {
            currentVersion = parseInt(text[0]);
            totalVersions = parseInt(text.slice(1));
        } else {
            return null;
        }
        const prevButton = container.querySelector(vc.prevButton);
        const nextButton = container.querySelector(vc.nextButton);
        return { currentVersion, totalVersions, prevButton, nextButton, hasMultipleVersions: totalVersions > 1 };
    }

    function findUserPrompts() {
        if (CURRENT_SITE.customFinder) return CURRENT_SITE.customFinder();

        let prompts = [];
        if (!CURRENT_SITE.userMessage || !CURRENT_SITE.userMessage.container) return prompts;

        const userElements = Array.from(document.querySelectorAll(CURRENT_SITE.userMessage.container));
        let containerElements = [];

        if (CURRENT_SITE.versionControl && CURRENT_SITE.versionControl.container) {
            containerElements = Array.from(document.querySelectorAll(CURRENT_SITE.versionControl.container));
        }

        if (CURRENT_SITE.reverse) {
            userElements.reverse();
            containerElements.reverse();
        }

        userElements.forEach((container, index) => {
            let text = "";
            const msgConfig = CURRENT_SITE.userMessage;
            const hasChildSelectors = msgConfig.file || msgConfig.text || msgConfig.image;

            if (hasChildSelectors) {
                const fileEl = msgConfig.file ? container.querySelector(msgConfig.file) : null;
                const msgEl = msgConfig.text ? container.querySelector(msgConfig.text) : null;
                const imageEl = msgConfig.image ? container.querySelector(msgConfig.image) : null;

                let fileTypeEl = null;
                let fileNameEl = null;
                let fileText = "";

                if (fileEl) {
                    const ariaLabel = fileEl.getAttribute('aria-label');
                    if (ariaLabel) {
                        fileText = ariaLabel.trim();
                    } else {
                        if (msgConfig.fileType) fileTypeEl = fileEl.querySelector(msgConfig.fileType);
                        if (msgConfig.fileName) fileNameEl = fileEl.querySelector(msgConfig.fileName);
                        fileText = fileNameEl ? fileNameEl.textContent.trim() : fileEl.textContent.trim();
                    }
                }

                const msgText = msgEl ? msgEl.textContent.trim() : "";
                let fileExt = "";
                if (fileTypeEl) {
                    fileExt = fileTypeEl.textContent.trim().toLowerCase();
                } else if (fileText) {
                    const m = fileText.match(/\.([a-z0-9]+)[^a-z0-9]*$/i);
                    fileExt = m ? m[1].toLowerCase() : "";
                }

                const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];
                const isImageFile = imageExtensions.some(ext => fileText.toLowerCase().endsWith(ext)) ||
                                    imageExtensions.some(ext => ext.slice(1) === fileExt);
                const hasRealImage = !!imageEl || isImageFile;
                const hasDocument = (fileText && !isImageFile) || (fileExt && !isImageFile);
                const fileTag = fileExt ? `[${fileExt}]` : "[file]";
                const combinedTag = fileExt ? `[${fileExt}+img]` : "[file+img]";

                if (msgText) {
                    if (hasRealImage && !hasDocument)      text = `[img] ${msgText}`;
                    else if (hasDocument && !hasRealImage) text = `${fileTag} ${msgText}`;
                    else if (hasRealImage && hasDocument)  text = `${combinedTag} ${msgText}`;
                    else                                   text = msgText;
                } else {
                    if (hasRealImage && !hasDocument)      text = `[img] ${fileText || ""}`.trim() || "[img]";
                    else if (hasDocument && !hasRealImage) text = `${fileTag} ${fileText}`;
                    else if (hasRealImage && hasDocument)  text = `${combinedTag} ${fileText}`;
                    else                                   text = "[file]";
                }
            } else {
                text = container.textContent.trim();
                if (!text && (container.querySelector('img') || container.querySelector('canvas') || container.querySelector('svg'))) {
                    text = "[img]";
                }
            }

            if (text) {
                const promptData = { element: container, text };
                if (CURRENT_SITE.versionControl && containerElements[index]) {
                    const versionInfo = getVersionInfo(containerElements[index], CURRENT_SITE.versionControl);
                    if (versionInfo) promptData.versionInfo = versionInfo;
                }
                prompts.push(promptData);
            }
        });

        return prompts;
    }

    function findPromptElementByIndex(targetIndex) {
        if (CURRENT_SITE.customFinder) {
            const prompts = CURRENT_SITE.customFinder();
            return prompts[targetIndex] ? prompts[targetIndex].element : null;
        }
        const cachedElement = cachedPrompts[targetIndex] && cachedPrompts[targetIndex].element;
        if (cachedElement && cachedElement.isConnected) return cachedElement;
        if (!CURRENT_SITE.userMessage || !CURRENT_SITE.userMessage.container) return null;
        const elements = Array.from(document.querySelectorAll(CURRENT_SITE.userMessage.container));
        if (CURRENT_SITE.reverse) elements.reverse();
        return elements[targetIndex] || null;
    }

    // Parse a "[tag] text" or "[tag+tag] text" style string into { tag, text }
    function parseFileTag(rawText) {
        const match = rawText.match(/^\[([^\]]+)\]\s*/);
        if (!match) return { tag: null, text: rawText };
        return {
            tag: match[1],
            text: rawText.slice(match[0].length)
        };
    }

    function createListItem(prompt, index) {
        const listItem = document.createElement('li');
        listItem.className = 'nav-list-item';
        if (index === activeMessageIndex) listItem.classList.add('active');

        const preview = prompt.text.length > 80 ? prompt.text.slice(0, 80) + '...' : prompt.text;

        const numberContainer = document.createElement('span');
        numberContainer.className = 'nav-item-number';
        if (bookmarkedMessages.has(index)) {
            numberContainer.textContent = `${index}`;
            numberContainer.classList.add('bookmarked');
        } else {
            numberContainer.textContent = `${index}.`;
        }
        numberContainer.addEventListener('click', (e) => { e.stopPropagation(); toggleBookmark(index); });

        listItem.appendChild(numberContainer);

        const { tag, text: displayText } = parseFileTag(preview);
        if (tag) {
            const tagEl = document.createElement('span');
            tagEl.className = 'nav-file-tag';
            tagEl.textContent = tag;
            listItem.appendChild(tagEl);
        }

        const textSpan = document.createElement('span');
        const normalizedText = (displayText || '').trim() || (tag ? 'Attachment' : '');
        textSpan.textContent = tag ? normalizedText : ` ${normalizedText}`;
        listItem.appendChild(textSpan);

        if (prompt.versionInfo && prompt.versionInfo.hasMultipleVersions) {
            const versionControls = document.createElement('span');
            versionControls.className = 'nav-version-controls';

            const prevVersionBtn = document.createElement('button');
            prevVersionBtn.className = 'nav-version-btn';
            prevVersionBtn.textContent = '‹';
            prevVersionBtn.disabled = !prompt.versionInfo.prevButton || prompt.versionInfo.prevButton.disabled;
            prevVersionBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (prompt.versionInfo.prevButton && !prompt.versionInfo.prevButton.disabled) {
                    prompt.versionInfo.prevButton.click();
                    setTimeout(() => updateMessageList(true), 300);
                }
            });

            const versionText = document.createElement('span');
            versionText.className = 'nav-version-text';
            versionText.textContent = `${prompt.versionInfo.currentVersion}/${prompt.versionInfo.totalVersions}`;

            const nextVersionBtn = document.createElement('button');
            nextVersionBtn.className = 'nav-version-btn';
            nextVersionBtn.textContent = '›';
            nextVersionBtn.disabled = !prompt.versionInfo.nextButton || prompt.versionInfo.nextButton.disabled;
            nextVersionBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (prompt.versionInfo.nextButton && !prompt.versionInfo.nextButton.disabled) {
                    prompt.versionInfo.nextButton.click();
                    setTimeout(() => updateMessageList(true), 300);
                }
            });

            versionControls.appendChild(prevVersionBtn);
            versionControls.appendChild(versionText);
            versionControls.appendChild(nextVersionBtn);
            listItem.appendChild(versionControls);
        }

        listItem.addEventListener('click', () => navigateToMessageByElement(index, prompt.element, 'list-item'));
        return listItem;
    }

    function updateMessageList(forceUpdate = false) {
        const currentUrl = window.location.href;
        let container = document.getElementById('message-nav');

        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            lastPromptsContent = "";
            activeMessageIndex = -1;
            cachedPrompts = [];
            bookmarkedMessages.clear();
            loadBookmarks();
            isPanelCollapsed = true;
            forceUpdate = true;
        }

        const shouldShow = hasUserMessages();
        updateShiftStyles(shouldShow && !isPanelCollapsed);
        syncToggleButton(shouldShow);

        if (!shouldShow) {
            if (container) container.style.display = 'none';
            document.body.classList.remove('navigator-expanded');
            updateBodyClassForLayout();
            return;
        }

        const activeContainer = createContainer();
        activeContainer.style.display = isPanelCollapsed ? 'none' : 'block';
        updateBodyClassForLayout();

        const content = document.getElementById('message-nav-content');
        if (!content) return;
        let list = document.getElementById('nav-list');
        if (!list) {
            list = document.createElement('ul');
            list.id = 'nav-list';
            content.appendChild(list);
        }

        const prompts = findUserPrompts();
        const currentPromptsContent = prompts.map(p => p.text).join('|');
        debugLog('update list snapshot', {
            url: currentUrl,
            promptsCount: prompts.length,
            panelCollapsed: isPanelCollapsed,
            shouldShow
        });
        if (!forceUpdate && currentPromptsContent === lastPromptsContent) return;

        lastPromptsContent = currentPromptsContent;
        cachedPrompts = prompts;

        while (list.firstChild) list.removeChild(list.firstChild);
        prompts.forEach((prompt, index) => list.appendChild(createListItem(prompt, index + 1)));

        updateMessageCounter();
        updateBookmarksHeader();
    }

    function startUrlWatcher() {
        if (!CURRENT_SITE.fastUpdate) return;
        if (urlCheckInterval) clearInterval(urlCheckInterval);
        urlCheckInterval = setInterval(() => {
            if (window.location.href !== lastUrl) updateMessageList(true);
        }, 300);
    }

    function observeConversation() {
        if (conversationObserver) conversationObserver.disconnect();
        const debounceTime = CURRENT_SITE.debounceTime || DEBOUNCE_TIME;
        conversationObserver = new MutationObserver(() => {
            clearTimeout(window.navigatorUpdateTimeout);
            window.navigatorUpdateTimeout = setTimeout(() => updateMessageList(), debounceTime);
        });
        conversationObserver.observe(document.body, { childList: true, subtree: true });

        window.addEventListener('popstate', () => {
            lastPromptsContent = ""; cachedPrompts = []; updateMessageList(true);
        });

        const originalPushState = history.pushState;
        history.pushState = function () {
            originalPushState.apply(this, arguments);
            lastPromptsContent = ""; cachedPrompts = [];
            setTimeout(() => updateMessageList(true), 100);
        };

        window.addEventListener('keydown', (e) => {
            handleArenaNavigationKeys(e);
            if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'd') {
                setDebugEnabled(!debugEnabled);
            }
        }, true);
    }

    injectStyles();
    installArenaAutoScrollGuard();
    setTimeout(() => {
        cleanupExpiredBookmarks();
        loadBookmarks();
        updateMessageList(true);
        if (isArenaSite()) {
            updateArenaChatScroller();
            setInterval(updateArenaChatScroller, 1000);
        }
        startUrlWatcher();
    }, 1000);
    observeConversation();
})();
