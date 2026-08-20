$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$scriptsRoot = Join-Path $projectRoot 'scripts'
$expectedRepository = 'https://raw.githubusercontent.com/AlexbeatsZ/tampermonkey-scripts/main/'

$scripts = Get-ChildItem -LiteralPath $scriptsRoot -File -Filter '*.user.js'
if ($scripts.Count -ne 3) {
    throw "Expected exactly 3 local userscripts, found $($scripts.Count)."
}

foreach ($script in $scripts) {
    & node --check $script.FullName
    if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $($script.Name)" }

    $text = [System.IO.File]::ReadAllText($script.FullName)
    if ($text -match '(?im)^//\s+@name\s+LinkSwift\s*$') {
        throw "LinkSwift must not be published: $($script.Name)"
    }
    if ($text -notmatch '(?im)^//\s+@updateURL\s+https://') {
        throw "Missing update URL: $($script.Name)"
    }
    if ($text -notmatch [regex]::Escape($expectedRepository)) {
        throw "Unexpected update repository: $($script.Name)"
    }
}

& node --check (Join-Path $projectRoot 'lib\dark-model-sync-core.js')
if ($LASTEXITCODE -ne 0) { throw 'Sync core syntax check failed.' }
& node --test (Join-Path $projectRoot 'tests\dark-model-sync-core.test.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Sync core tests failed.' }

$publicFiles = @($scripts.FullName) + @((Join-Path $projectRoot 'lib\dark-model-sync-core.js'))
$secretPatterns = [ordered]@{
    PrivateKey = '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'
    GitHubToken = 'gh[pousr]_[A-Za-z0-9_]{20,}'
    OpenAIKey = 'sk-(?:proj-)?[A-Za-z0-9_-]{20,}'
    GoogleApiKey = 'AIza[0-9A-Za-z_-]{30,}'
    PrivateOrTailscaleIPv4 = '(?<![0-9])(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3})(?::\d+)?'
}

foreach ($path in $publicFiles) {
    $text = [System.IO.File]::ReadAllText($path)
    foreach ($entry in $secretPatterns.GetEnumerator()) {
        if ([regex]::IsMatch($text, $entry.Value)) {
            throw "$($entry.Key) pattern found in public file: $path"
        }
    }
}

Write-Output 'Validation passed.'
