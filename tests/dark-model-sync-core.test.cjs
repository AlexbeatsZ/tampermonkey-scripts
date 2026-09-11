const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/dark-model-sync-core.js');

test('merges rules per entry instead of overwriting the whole configuration', () => {
    const local = core.createDocument({ defaultMode: 'darkreader', rules: { 'example.com': 'filter' } }, 10, 'device-a');
    const remote = core.createDocument({ defaultMode: 'off', rules: { 'other.example': 'off' } }, 20, 'device-b');
    const merged = core.materializeConfig(core.mergeDocuments(local, remote));
    assert.equal(merged.defaultMode, 'off');
    assert.deepEqual(merged.rules, { 'example.com': 'filter', 'other.example': 'off' });
});

test('keeps tombstones so a deleted rule is not resurrected by an older device', () => {
    const base = core.createDocument({ defaultMode: 'darkreader', rules: { 'example.com': 'filter' } }, 10, 'device-a');
    const deleted = core.recordConfigChange(base,
        { defaultMode: 'darkreader', rules: { 'example.com': 'filter' } },
        { defaultMode: 'darkreader', rules: {} }, 30, 'device-a');
    const stale = core.createDocument({ defaultMode: 'darkreader', rules: { 'example.com': 'off' } }, 20, 'device-b');
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

test('records independent default-mode and rule edits', () => {
    const base = core.createDocument({ defaultMode: 'darkreader', rules: { 'a.example': 'filter' } }, 10, 'device-a');
    const changed = core.recordConfigChange(base,
        { defaultMode: 'darkreader', rules: { 'a.example': 'filter' } },
        { defaultMode: 'off', rules: { 'a.example': 'darkreader', 'b.example': 'filter' } }, 20, 'device-b');
    assert.equal(changed.defaultMode.value, 'off');
    assert.equal(changed.defaultMode.updatedAt, 20);
    assert.equal(changed.rules['a.example'].value, 'darkreader');
    assert.equal(changed.rules['b.example'].value, 'filter');
});
