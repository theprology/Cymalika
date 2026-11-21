# Install CyMalika from a terminal

You do not need a GitHub account to download a public release. These commands install CyMalika itself. They do not install Ollama, download models, or grant computer-control permissions.

## Mac or Linux

Open Terminal, paste this command, then press Enter:

```sh
curl -fsSL https://github.com/theprology/Cymalika/releases/latest/download/install.sh | bash
```

- **Apple Silicon Mac:** installs `CyMalika.app` in your personal `~/Applications` folder. Quit an already-running CyMalika before installing.
- **Debian/Ubuntu Linux:** installs the Debian package using apt. Your terminal may ask for your administrator password.
- **Other Linux x64 desktops:** installs the AppImage in your user data folder.
- Creates a launcher at `~/.local/bin/cymalika` when that name is available. The installer prints the full launch command. It leaves an unrelated existing command unchanged.

The Mac download currently supports Apple Silicon. Linux downloads currently support x64.

To inspect the script before running it:

```sh
curl -fsSL -o cymalika-install.sh https://github.com/theprology/Cymalika/releases/latest/download/install.sh
less cymalika-install.sh
bash cymalika-install.sh
```

Optional flags:

```sh
bash cymalika-install.sh --version 0.3.0 --dry-run
bash cymalika-install.sh --version 0.3.0 --verify-only
bash cymalika-install.sh --appimage
```

`--dry-run` shows the selected download without installing. `--verify-only` downloads and checks the release checksum, then removes the temporary files. `--appimage` chooses a user-only Linux install instead of apt.

## Windows

Open **PowerShell**, paste this command, then press Enter:

```powershell
irm https://github.com/theprology/Cymalika/releases/latest/download/install.ps1 | iex
```

The script downloads the Windows x64 setup program, checks its SHA-256 checksum, and runs its per-user installer. Open CyMalika from the Start menu afterward. Quit a running CyMalika before installing. It does not change your PowerShell execution policy or security settings.

To inspect the script and see what it would do first:

```powershell
Invoke-WebRequest https://github.com/theprology/Cymalika/releases/latest/download/install.ps1 -OutFile cymalika-install.ps1
Get-Content .\cymalika-install.ps1
.\cymalika-install.ps1 -Version 0.3.0 -WhatIf
```

If your execution policy blocks a downloaded script, use your normal approved software-installation process or download the installer directly from Releases. The installer does not bypass that policy.

For a portable copy or verification only:

```powershell
.\cymalika-install.ps1 -Portable
.\cymalika-install.ps1 -Version 0.3.0 -VerifyOnly
```

## After installation

1. Keep Ollama running with a model you already installed.
2. Open CyMalika.
3. Follow **Getting started**, near the bottom-left.
4. Open your project and begin with **Ask**.

Downloads come from [CyMalika's GitHub Releases](https://github.com/theprology/Cymalika/releases). Checksums detect a mismatched download; they are not a substitute for publisher signing. CyMalika 0.4 Mac downloads are Developer ID signed and Apple-notarized. Windows publisher signing is pending an external provider review, so Windows may show an unknown-publisher notice. Linux packages have GitHub build-provenance attestations. Review that notice yourself. CyMalika does not change OS protections or approve permissions for you.
