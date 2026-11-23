# Userscript update and settings sync architecture

Read this document before changing update URLs, remote storage, merge rules, or the Dark Model settings UI.

## Scope

- Script code includes AI Conversation Navigator, ChatGPT Copy Fix, Dark Model, and Chaoxing Download Helper. These four scripts are published from this repository. Translator remains published by `AlexbeatsZ/kiss-translator`.
- Runtime data: Dark Model site-mode rules and only Translator's no-auto-translate website patterns are synchronized.
- Explicit exclusion: LinkSwift is not imported, committed, published, or referenced as an install target.

## Separation of code and data

Tampermonkey needs an unauthenticated `@updateURL`, so installable script code is public. Runtime data never enters either Git repository.

The authoritative sync service (`AlexbeatsZ/dark-model-sync-server`, formerly kiss-sync-server) runs on ROG and listens only on `127.0.0.1:17892`. ROG browsers use the default loopback address. Since 2026-11-23 there are no SSH tunnels: ROG `tailscale serve --tcp 17892` exposes the service to the tailnet. Other devices save the ROG MagicDNS FQDN (`http://<rog>.<tailnet>.ts.net:17892`) once in the Dark Model settings, stored in GM key `__dark_model_sync_endpoint_v1__`; it is never in public source. A private build may inject `globalThis.__DARK_MODEL_SYNC_TRANSPORT__ = { endpoint, token }`, which overrides the endpoint and adds a Bearer token. Browsers never receive the server key.

ROG stores each logical document in a separate AES-256-GCM encrypted file using the existing server-local key. Dark Model uses `/v1/dark-model-config`. Translator `/v1/site-exclusions` sync was removed on 2026-11-23, so Translator clients will fail sync harmlessly.

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
- Public files contain no token formats or private/Tailscale IP addresses; the only sync address embedded in Dark Model is the default loopback `127.0.0.1:17892`. `@connect ts.net` covers MagicDNS, and `@connect *` lets Tampermonkey prompt for any other host the user enters.
- Every local script has public `@updateURL` and `@downloadURL` metadata pointing to its own stable Raw file on `main`. Increment `@version` when publishing an update. Preserve the installed name and namespace so existing installations can be updated in place. Translator's catalog entry points to its existing publisher.
- ROG health and the Dark Model endpoint are verified, via loopback and the tailnet FQDN, after server deployment.
