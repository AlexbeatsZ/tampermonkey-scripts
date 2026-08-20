# Userscript update and settings sync architecture

Read this document before changing update URLs, remote storage, credential handling, merge rules, or the Dark Model settings UI.

## Scope

- Script code: AI Conversation Navigator, ChatGPT Copy Fix, and Dark Model are published from this repository. Translator remains published by `AlexbeatsZ/kiss-translator`.
- Runtime data: only Dark Model site-mode rules and the data already selected by Translator's built-in sync are synchronized.
- Explicit exclusion: LinkSwift is not imported, committed, published, or referenced as an install target.

## Separation of code and data

Tampermonkey needs an unauthenticated `@updateURL`, so installable script code is public. Runtime data never enters the Git repository.

Translator and Dark Model share one GitHub Secret Gist for convenience, but use separate files. Dark Model writes `dark-model-config_v1.json`; Translator keeps its existing filenames. A Secret Gist is unlisted rather than access-controlled, so every Dark Model document is encrypted before upload.

Credentials stay in the local userscript manager storage:

- GitHub token: a dedicated classic PAT with only the `gist` scope;
- encryption passphrase: independent from the GitHub password and token;
- Gist id and per-device sync metadata.

Neither credentials nor the `kt_` transfer token may appear in logs, exported Dark Model JSON, Git history, Issues, or documentation examples using real values.

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

Merge is last-writer-wins per entry. `updatedAt` is primary; `deviceId` and then serialized value are deterministic tie breakers. The entire configuration must never be replaced solely because one unrelated rule changed on another device.

## Encryption envelope

- AES-256-GCM;
- PBKDF2-HMAC-SHA-256 with 100,000 iterations and a fresh 16-byte salt;
- fresh 12-byte IV per upload;
- only the outer filename/key and maximum update timestamp remain plaintext.

Decryption failure is a hard stop. Never overwrite an unreadable remote file with local data, because the most likely causes are a wrong passphrase or corrupted remote state.

## First sync and scheduling

- If the Gist file does not exist, the current local configuration becomes the first remote version.
- If the Gist file exists and the device has no sync history, remote values win direct conflicts while unique local rules are retained.
- A local edit marks the sync state dirty before any page reload; the next top-level page uploads it even if a debounce timer was interrupted.
- A clean device pulls at least once per 24 hours. Manual sync always bypasses the interval.
- Only the top-level frame runs scheduled sync to avoid duplicate API traffic.

## Translator compatibility

Dark Model accepts the existing Translator `kt_` transfer token only when `syncType` is `gist`. It extracts the Gist id, dedicated PAT, and encryption passphrase locally. It must not modify Translator files inside the Gist.

Translator's existing sync uses whole-file timestamp arbitration. Avoid editing the same Translator settings concurrently on two offline devices unless that implementation is later upgraded to field-level merge.

## Acceptance

- All installable scripts parse with Node.
- Sync core tests cover cross-device merge, deletion tombstones, deterministic ties, encryption round trips, wrong-passphrase refusal, and Translator token import.
- Public files contain no known token formats or private/Tailscale IP addresses.
- Every local script has the expected public `@updateURL`; Translator's catalog entry points to its existing publisher.
- GitHub remote commit and raw install URLs are checked after push.
