const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/dark-model-sync-core.js');

test('merges rules per entry instead of overwriting the whole configuration', () => {
    const local = core.createDocument({
        defaultMode: 'darkreader',
        rules: { 'example.com': 'filter' },
    }, 10, 'device-a');
    const remote = core.createDocument({
        defaultMode: 'off',
        rules: { 'other.example': 'off' },
    }, 20, 'device-b');

    const merged = core.materializeConfig(core.mergeDocuments(local, remote));
    assert.equal(merged.defaultMode, 'off');
    assert.deepEqual(merged.rules, {
        'example.com': 'filter',
        'other.example': 'off',
    });
});

test('keeps tombstones so a deleted rule is not resurrected by an older device', () => {
    const base = core.createDocument({
        defaultMode: 'darkreader',
        rules: { 'example.com': 'filter' },
    }, 10, 'device-a');
    const deleted = core.recordConfigChange(
        base,
        { defaultMode: 'darkreader', rules: { 'example.com': 'filter' } },
        { defaultMode: 'darkreader', rules: {} },
        30,
        'device-a'
    );
    const stale = core.createDocument({
        defaultMode: 'darkreader',
        rules: { 'example.com': 'off' },
    }, 20, 'device-b');

    const merged = core.mergeDocuments(deleted, stale);
    assert.deepEqual(core.materializeConfig(merged).rules, {});
    assert.equal(merged.rules['example.com'].value, null);
});

test('uses device id as deterministic tie breaker', () => {
    const first = core.createDocument({ defaultMode: 'filter', rules: {} }, 50, 'device-a');
    const second = core.createDocument({ defaultMode: 'off', rules: {} }, 50, 'device-z');
    assert.equal(core.materializeConfig(core.mergeDocuments(first, second)).defaultMode, 'off');
    assert.equal(core.materializeConfig(core.mergeDocuments(second, first)).defaultMode, 'off');
});

test('encrypts and decrypts the complete sync document', async () => {
    const document = core.createDocument({
        defaultMode: 'darkreader',
        rules: { 'example.com/path': 'filter' },
    }, 123, 'device-a');
    const encrypted = await core.encryptDocument(document, 'correct horse battery staple');
    assert.equal(encrypted.includes('example.com'), false);
    assert.deepEqual(
        core.materializeConfig(await core.decryptDocument(encrypted, 'correct horse battery staple')),
        core.materializeConfig(document)
    );
    await assert.rejects(
        core.decryptDocument(encrypted, 'wrong passphrase'),
        /无法解密同步数据/
    );
});

test('imports the existing Translator kt_ Gist share token', () => {
    const payload = {
        syncType: 'gist',
        syncUrl: 'https://gist.github.com/AlexbeatsZ/abcdef123456',
        syncUser: '',
        syncKey: 'github-token-placeholder',
        syncEncryptKey: 'encryption-passphrase',
    };
    const token = `kt_${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')}`;
    assert.deepEqual(core.parseTranslatorSyncToken(token), {
        gistId: 'abcdef123456',
        githubToken: 'github-token-placeholder',
        encryptionKey: 'encryption-passphrase',
    });
});
