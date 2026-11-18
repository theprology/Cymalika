# Publisher signing

A successful build is not a publisher signature. Cipher 0.4 Mac downloads are Developer ID signed and Apple-notarized. Linux packages have GitHub provenance attestations. Windows publisher signing is pending an external provider review; the previously published 0.3.0 downloads remain development builds. The signed-release workflow refuses to produce a signed candidate when credentials are absent; it does not silently fall back to ad-hoc or unsigned signing.

## Mac

Direct downloads require **Developer ID Application**, rather than Apple Development or Apple Distribution certificates. An Apple Developer account holder can create that certificate in Certificates, Identifiers & Profiles. The private key must remain under the publisher's control. Notarization additionally requires authorized Apple credentials.

Local build:

```sh
export CIPHER_SIGN_IDENTITY='Developer ID Application: Your Publisher (TEAMID)'
CIPHER_REQUIRE_SIGNING=1 ./build.sh
export CIPHER_NOTARY_PROFILE=YourStoredNotaryProfile
scripts/notarize-mac.sh build/Cipher.app
```

The helper submits to Apple, waits for acceptance, staples the ticket, validates it, and assesses the application with Gatekeeper. It does not treat certificate presence as successful notarization.

For **Signed release candidate** on GitHub, configure the protected `release` environment with:

- Secrets `MAC_CERTIFICATE_P12` (base64 certificate/private-key export), `MAC_CERTIFICATE_PASSWORD`.
- Secrets `APPLE_API_KEY_P8` (base64), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` for a key authorized for notarization.
- Variable `MAC_SIGN_IDENTITY`, the exact Developer ID Application identity.

Only enter secrets in your own local Keychain or GitHub environment secrets. Do not put them in chat, source code, logs, issues, or downloadable archives. The workflow imports into an ephemeral keychain, removes imported files, and deletes the keychain even after failure.

## Windows

Google Play and Apple memberships do not supply Windows Authenticode certificates. Use a certificate issued for your publisher or Azure Artifact Signing (formerly Trusted Signing), subject to the service's identity verification and eligibility.

In the GitHub `release` environment configure either:

- Secrets `WINDOWS_CERTIFICATE_P12` (base64 PFX/P12) and `WINDOWS_CERTIFICATE_PASSWORD`; or
- Variables `AZURE_SIGNING_ENDPOINT`, `AZURE_SIGNING_ACCOUNT`, `AZURE_SIGNING_PROFILE`, plus secrets `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` for the authorized service identity.

The signed build requires signing, then independently checks Authenticode on the application, setup, portable executable, and the bundled PowerShell helper. Windows may still display reputation or administrator prompts. Signing does not grant access to protected desktops or remove Windows security boundaries.

## Linux

Choose `linux` in the signed-candidate workflow to build, test and attest Linux packages without Apple or Windows credentials. Linux has no Apple-style notarization service. GitHub provenance attestations identify the workflow and repository that produced an artifact; they are separate from Windows/macOS publisher signatures. Linux desktop permissions still apply, especially under Wayland. Distribution repository signing can be added when Cipher maintains its own apt repository.

The signed-candidate workflow produces reviewable build artifacts, not an automatic public release. Publishing must use the verified candidates and matching checksums; do not replace an existing version's assets with different binaries.

Official references: [Apple Developer ID](https://developer.apple.com/developer-id/), [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution), [Windows signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options), [electron-builder 26 Windows signing](https://www.electron.build/v26/docs/features/code-signing/code-signing-win/).
