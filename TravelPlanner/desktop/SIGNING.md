# Code signing (Windows desktop)

The CI workflow (`.github/workflows/desktop.yml`) signs the Windows build
automatically **when two repository secrets are present**, and builds unsigned
when they're absent — no code changes needed either way.

| Secret | Value |
| --- | --- |
| `WINDOWS_CERT_BASE64` | your `.pfx` certificate, base64-encoded on one line |
| `WINDOWS_CERT_PASSWORD` | the `.pfx` password |

Add them under **repo → Settings → Secrets and variables → Actions → New
repository secret**.

## Free path — self-signed certificate (test/verify only)

Run the helper on Windows (PowerShell, no admin required):

```powershell
cd TravelPlanner\desktop\scripts
.\make-selfsigned-cert.ps1
```

It creates a self-signed code-signing cert, exports `cert.pfx`, writes the
base64 string to `cert.b64.txt`, and prints the two secret values to paste into
GitHub. Delete `cert.pfx` and `cert.b64.txt` once the secrets are stored (both
are git-ignored so they can't be committed by accident).

**What a self-signed cert does and doesn't do:** it makes CI produce a *signed*
installer and proves the signing pipeline end-to-end. It is **not** trusted by
other people's machines, so Windows SmartScreen will still warn your users. Use
it to validate the flow, not as your public signing identity.

## Real path — trusted signature

Since June 2023 a publicly-trusted code-signing key must live on certified
hardware or in a cloud HSM, so you can't just download a `.pfx` from a CA. The
CI-friendly option is a **cloud signing service** (e.g. Azure Trusted Signing,
SSL.com eSigner, DigiCert KeyLocker). Those sign via their own API rather than a
`.pfx` secret, so the workflow needs a different signing step — open an issue or
ask and it can be wired up for whichever provider you choose.
