# Userscript update and settings sync architecture

Read this document before changing update URLs, remote storage, merge rules, or the Dark Model settings UI.

## Scope

- Script code: AI Conversation Navigator, ChatGPT Copy Fix, and Dark Model are published from this repository. Translator remains published by `AlexbeatsZ/kiss-translator`.
- Runtime data: Dark Model site-mode rules and only Translator's no-auto-translate website patterns are synchronized.
- Explicit exclusion: LinkSwift is not imported, committed, published, or referenced as an install target.

## Separation of code and data

Tampermonkey needs an unauthenticated `@updateURL`, so installable script code is public. Runtime data never enters either Git repository.

The authoritative sync service runs on ROG and listens only on `127.0.0.1:17892`. ROG browsers connect directly. OMEN and Mac expose the same loopback address through their existing SSH-over-Tailscale local forwards. Browsers never receive a Tailscale address or server key.

ROG stores each logical document in a separate AES-256-GCM encrypted file using the existing server-local key. Dark Model uses `/v1/dark-model-config`; Translator uses `/v1/site-exclusions`.

Dark Model local sync state contains only `deviceId`, the last merged `document`, `lastSyncAt`, and `dirty`. Legacy Gist token/id/passphrase fields are not copied into the new state and the legacy state key is deleted on the next state write.

## Dark Model remote document

The decrypted schema is version 1:

```json
{
  "schema": 1,
  "defaultMode": { "value": "darkreader", "updatedAt": 0, "deviceId": "..." },
  "rules": {
    "example.com": { "value": "filter", "updatedAt": 0, "deviceId": "..." }
  }
}
```

Rule values are `darkreader`, `filter`, `off`, or `null`. `null` is a deletion tombstone and must not be removed casually because an offline device could otherwise resurrect an old rule.

Merge is last-writer-wins per entry. `updatedAt` is primary; `deviceId` and then serialized value are deterministic tie breakers. Both client and ROG server merge per entry, so concurrent uploads cannot replace an unrelated rule.

## First sync and scheduling

- If the ROG Dark Model document does not exist, the current local configuration becomes the first remote version.
- If the remote document exists and the device has no sync history, remote values win direct conflicts while unique local rules are retained.
- A local edit records the change immediately, marks the sync state dirty, and schedules upload after about 2.5 seconds.
- A clean device pulls at least once per hour. Manual sync always bypasses the interval.
- Only the top-level frame runs scheduled sync to avoid duplicate traffic.
- `?????` checks `/health` before forcing a sync. `????????` clears only merge metadata and does not delete site rules.

## Translator scope

Translator derives its remote data exclusively from non-global rules whose `transOpen` is exactly `"false"`. It never serializes global settings, translation profiles, provider credentials, shortcuts, tuning, subtitles, selectors, injected code, custom styles, or other rule fields. Like Dark Model, it merges per website and retains deletion tombstones.

## Acceptance

- All installable scripts parse with Node.
- Sync core tests cover cross-device merge, deletion tombstones, deterministic ties, and independent rule/default edits.
- Public files contain no token formats or private/Tailscale IP addresses; the only sync address embedded in Dark Model is loopback `127.0.0.1:17892`.
- Every local script has the expected public `@updateURL`; Translator's catalog entry points to its existing publisher.
- ROG health, Translator's existing endpoint, and Dark Model's separate endpoint are verified after server deployment.
