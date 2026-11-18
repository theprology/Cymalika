# Install Cipher from a terminal

You do not need a GitHub account to download a public release. These commands install Cipher itself. They do not install Ollama, download models, or grant computer-control permissions.

## Mac or Linux

Open Terminal, paste this command, then press Enter:

```sh
curl -fsSL https://github.com/theprology/cipher/releases/latest/download/install.sh | bash
```

- **Apple Silicon Mac:** installs `Cipher.app` in your personal `~/Applications` folder. Quit an already-running Cipher before installing.
- **Debian/Ubuntu Linux:** installs the Debian package using apt. Your terminal may ask for your administrator password.
- **Other Linux x64 desktops:** installs the AppImage in your user data folder.
- Creates a launcher at `~/.local/bin/cipher` when that name is available. The installer prints the full launch command. It leaves an unrelated existing command unchanged.

The Mac download currently supports Apple Silicon. Linux downloads currently support x64.

To inspect the script before running it:

```sh
curl -fsSL -o cipher-install.sh https://github.com/theprology/cipher/releases/latest/download/install.sh
less cipher-install.sh
bash cipher-install.sh
```

Optional flags:

```sh
bash cipher-install.sh --version 0.3.0 --dry-run
bash cipher-install.sh --version 0.3.0 --verify-only
bash cipher-install.sh --appimage
```

`--dry-run` shows the selected download without installing. `--verify-only` downloads and checks the release checksum, then removes the temporary files. `--appimage` chooses a user-only Linux install instead of apt.

## Windows

Open **PowerShell**, paste this command, then press Enter:

```powershell
irm https://github.com/theprology/cipher/releases/latest/download/install.ps1 | iex
```

The script downloads the Windows x64 setup program, checks its SHA-256 checksum, and runs its per-user installer. Open Cipher from the Start menu afterward. Quit a running Cipher before installing. It does not change your PowerShell execution policy or security settings.

To inspect the script and see what it would do first:

```powershell
Invoke-WebRequest https://github.com/theprology/cipher/releases/latest/download/install.ps1 -OutFile cipher-install.ps1
Get-Content .\cipher-install.ps1
.\cipher-install.ps1 -Version 0.3.0 -WhatIf
```

If your execution policy blocks a downloaded script, use your normal approved software-installation process or download the installer directly from Releases. The installer does not bypass that policy.

For a portable copy or verification only:

```powershell
.\cipher-install.ps1 -Portable
.\cipher-install.ps1 -Version 0.3.0 -VerifyOnly
```

## After installation

1. Keep Ollama running with a model you already installed.
2. Open Cipher.
3. Follow **Getting started**, near the bottom-left.
4. Open your project and begin with **Ask**.

Downloads come from [Cipher's GitHub Releases](https://github.com/theprology/cipher/releases). Checksums detect a mismatched download; they are not a substitute for publisher signing. Cipher 0.4 Mac downloads are Developer ID signed and Apple-notarized. Windows publisher signing is pending an external provider review, so Windows may show an unknown-publisher notice. Linux packages have GitHub build-provenance attestations. Review that notice yourself. Cipher does not change OS protections or approve permissions for you.
