(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.DarkModelSyncCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SCHEMA_VERSION = 1;
    const CRYPTO_VERSION = 1;
    const CRYPTO_ALGORITHM = 'AES-GCM';
    const CRYPTO_KDF = 'PBKDF2-SHA-256';
    const CRYPTO_ITERATIONS = 100000;
    const ALLOWED_MODES = new Set(['darkreader', 'filter', 'off']);
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    function clone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function normalizeMode(value, fallback = 'darkreader') {
        return ALLOWED_MODES.has(value) ? value : fallback;
    }

    function normalizeEntry(entry, allowNull = false) {
        if (!entry || typeof entry !== 'object') return null;
        const value = allowNull && entry.value == null
            ? null
            : normalizeMode(entry.value, 'darkreader');
        return {
            value,
            updatedAt: Number.isFinite(Number(entry.updatedAt)) ? Number(entry.updatedAt) : 0,
            deviceId: String(entry.deviceId || ''),
        };
    }

    function normalizeDocument(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const defaultMode = normalizeEntry(source.defaultMode) || {
            value: 'darkreader',
            updatedAt: 0,
            deviceId: '',
        };
        const rules = {};
        if (source.rules && typeof source.rules === 'object' && !Array.isArray(source.rules)) {
            for (const [pattern, value] of Object.entries(source.rules)) {
                const key = String(pattern || '').trim();
                const entry = normalizeEntry(value, true);
                if (key && entry) rules[key] = entry;
            }
        }
        return { schema: SCHEMA_VERSION, defaultMode, rules };
    }

    function createDocument(config, updatedAt, deviceId) {
        const normalizedConfig = config && typeof config === 'object' ? config : {};
        const timestamp = Number.isFinite(Number(updatedAt)) ? Number(updatedAt) : 0;
        const id = String(deviceId || '');
        const rules = {};
        if (normalizedConfig.rules && typeof normalizedConfig.rules === 'object') {
            for (const [pattern, mode] of Object.entries(normalizedConfig.rules)) {
                const key = String(pattern || '').trim();
                if (key && ALLOWED_MODES.has(mode)) {
                    rules[key] = { value: mode, updatedAt: timestamp, deviceId: id };
                }
            }
        }
        return {
            schema: SCHEMA_VERSION,
            defaultMode: {
                value: normalizeMode(normalizedConfig.defaultMode),
                updatedAt: timestamp,
                deviceId: id,
            },
            rules,
        };
    }

    function entryWins(candidate, current) {
        if (!current) return true;
        if (candidate.updatedAt !== current.updatedAt) return candidate.updatedAt > current.updatedAt;
        if (candidate.deviceId !== current.deviceId) return candidate.deviceId > current.deviceId;
        return JSON.stringify(candidate.value) > JSON.stringify(current.value);
    }

    function mergeDocuments(left, right) {
        const a = normalizeDocument(left);
        const b = normalizeDocument(right);
        const result = clone(a);
        if (entryWins(b.defaultMode, result.defaultMode)) result.defaultMode = clone(b.defaultMode);
        for (const [pattern, entry] of Object.entries(b.rules)) {
            if (entryWins(entry, result.rules[pattern])) result.rules[pattern] = clone(entry);
        }
        return normalizeDocument(result);
    }

    function recordConfigChange(document, previousConfig, nextConfig, updatedAt, deviceId) {
        const result = normalizeDocument(document);
        const previous = previousConfig && typeof previousConfig === 'object' ? previousConfig : {};
        const next = nextConfig && typeof nextConfig === 'object' ? nextConfig : {};
        const timestamp = Number(updatedAt);
        const id = String(deviceId || '');
        const previousDefault = normalizeMode(previous.defaultMode);
        const nextDefault = normalizeMode(next.defaultMode);
        if (previousDefault !== nextDefault) {
            result.defaultMode = { value: nextDefault, updatedAt: timestamp, deviceId: id };
        }

        const previousRules = previous.rules && typeof previous.rules === 'object' ? previous.rules : {};
        const nextRules = next.rules && typeof next.rules === 'object' ? next.rules : {};
        const patterns = new Set([...Object.keys(previousRules), ...Object.keys(nextRules)]);
        for (const pattern of patterns) {
            const before = ALLOWED_MODES.has(previousRules[pattern]) ? previousRules[pattern] : null;
            const after = ALLOWED_MODES.has(nextRules[pattern]) ? nextRules[pattern] : null;
            if (before !== after) {
                result.rules[pattern] = { value: after, updatedAt: timestamp, deviceId: id };
            }
        }
        return normalizeDocument(result);
    }

    function materializeConfig(document) {
        const normalized = normalizeDocument(document);
        const rules = {};
        for (const [pattern, entry] of Object.entries(normalized.rules)) {
            if (entry.value != null) rules[pattern] = entry.value;
        }
        return {
            version: 1,
            defaultMode: normalizeMode(normalized.defaultMode.value),
            rules,
        };
    }

    function documentUpdatedAt(document) {
        const normalized = normalizeDocument(document);
        return Math.max(
            normalized.defaultMode.updatedAt,
            ...Object.values(normalized.rules).map((entry) => entry.updatedAt),
            0
        );
    }

    function base64ToBytes(value) {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return bytes;
    }

    function bytesToBase64(bytes) {
        let binary = '';
        for (const value of bytes) binary += String.fromCharCode(value);
        return btoa(binary);
    }

    async function deriveKey(passphrase, salt) {
        if (String(passphrase || '').length < 6) throw new Error('同步加密口令至少需要 6 个字符');
        const material = await crypto.subtle.importKey(
            'raw',
            encoder.encode(passphrase),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: CRYPTO_ITERATIONS, hash: 'SHA-256' },
            material,
            { name: CRYPTO_ALGORITHM, length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function encryptDocument(document, passphrase) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveKey(passphrase, salt);
        const ciphertext = await crypto.subtle.encrypt(
            { name: CRYPTO_ALGORITHM, iv },
            key,
            encoder.encode(JSON.stringify(normalizeDocument(document)))
        );
        return JSON.stringify({
            encrypted: true,
            version: CRYPTO_VERSION,
            alg: CRYPTO_ALGORITHM,
            kdf: CRYPTO_KDF,
            iterations: CRYPTO_ITERATIONS,
            salt: bytesToBase64(salt),
            iv: bytesToBase64(iv),
            data: bytesToBase64(new Uint8Array(ciphertext)),
        });
    }

    async function decryptDocument(value, passphrase) {
        let envelope;
        try {
            envelope = JSON.parse(value);
        } catch {
            throw new Error('远端同步文件不是有效 JSON');
        }
        if (!envelope?.encrypted) return normalizeDocument(envelope);
        if (
            envelope.version !== CRYPTO_VERSION ||
            envelope.alg !== CRYPTO_ALGORITHM ||
            envelope.kdf !== CRYPTO_KDF ||
            envelope.iterations !== CRYPTO_ITERATIONS
        ) {
            throw new Error('不支持的同步加密格式');
        }
        const key = await deriveKey(passphrase, base64ToBytes(envelope.salt));
        let plaintext;
        try {
            plaintext = await crypto.subtle.decrypt(
                { name: CRYPTO_ALGORITHM, iv: base64ToBytes(envelope.iv) },
                key,
                base64ToBytes(envelope.data)
            );
        } catch {
            throw new Error('无法解密同步数据，请检查加密口令');
        }
        return normalizeDocument(JSON.parse(decoder.decode(plaintext)));
    }

    function decodeBase64Json(value) {
        return JSON.parse(decoder.decode(base64ToBytes(value)));
    }

    function gistIdFromValue(value) {
        const text = String(value || '').trim();
        if (!text) return '';
        try {
            const url = new URL(text);
            const parts = url.pathname.split('/').filter(Boolean);
            return parts[parts.length - 1] || '';
        } catch {
            return text;
        }
    }

    function parseTranslatorSyncToken(value) {
        const token = String(value || '').trim();
        if (!token.startsWith('kt_')) throw new Error('需要 Translator 生成的 kt_ 同步码');
        const parsed = decodeBase64Json(token.slice(3));
        if (parsed.syncType !== 'gist') throw new Error('Dark Model 目前只支持 Translator 的 GitHub Gist 同步码');
        if (!parsed.syncKey) throw new Error('同步码缺少 GitHub Gist 令牌');
        if (!parsed.syncEncryptKey) throw new Error('同步码缺少加密口令');
        return {
            gistId: gistIdFromValue(parsed.syncUrl),
            githubToken: String(parsed.syncKey),
            encryptionKey: String(parsed.syncEncryptKey),
        };
    }

    return Object.freeze({
        SCHEMA_VERSION,
        createDocument,
        decryptDocument,
        documentUpdatedAt,
        encryptDocument,
        gistIdFromValue,
        materializeConfig,
        mergeDocuments,
        normalizeDocument,
        parseTranslatorSyncToken,
        recordConfigChange,
    });
});
