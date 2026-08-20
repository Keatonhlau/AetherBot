# AetherBot

<p align="center">
  <em>Official Discord bot for the Aether extension ecosystem.</em>
</p>

AetherBot connects the Aether GitHub repository and the Aether-Extensions registry to your Discord server. It handles automated release announcements, extension browsing, and cryptographic developer verification — allowing extension authors to prove GitHub repository ownership and receive developer roles.

---

## Requirements

- **Node.js 22+**
- A **Discord application** with a bot token
- A **GitHub personal access token** (fine-grained, read-only)
- The `data/` directory must be writable (SQLite database)

---

## Installation

```bash
# Clone or copy the project
cd AetherBot

# Install dependencies
npm install

# Copy the example files
cp .env.example .env
cp config.example.json config.json
```

Edit `.env` with your real tokens. Edit `config.json` with your guild and role IDs.

---

## Running

```bash
# Development (with hot reload)
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

---

## Discord Bot Setup

### 1. Create a Discord Application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** and name it `AetherBot`
3. Go to the **Bot** tab → Click **Add Bot**
4. Under **Token**, click **Reset Token** and copy it to your `.env` as `DISCORD_TOKEN`

### 2. Enable Required Intents

Under **Bot → Privileged Gateway Intents**, enable:

- ✅ **Server Members Intent** — required to fetch member objects for role assignment

### 3. Invite the Bot

Go to **OAuth2 → URL Generator** and select:

**Scopes:**
- `bot`
- `applications.commands`

**Bot Permissions:**
- View Channels
- Send Messages
- Embed Links
- Manage Roles

Copy the generated URL and open it in your browser to invite the bot.

### 4. Role Hierarchy ⚠️

> **This step is critical.** The bot can only manage roles that are positioned **below** its own role in the server's role list.

In **Server Settings → Roles**, drag the **AetherBot** role so it is positioned **above** both:
- Extension Developer
- Verified Extension Developer

If the bot's role is below these roles, role assignment will silently fail.

---

## GitHub Token Setup

1. Go to [github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens/new)
2. Choose **Fine-grained personal access token**
3. Set **Resource owner** to your personal account
4. Under **Repository access**, choose **Public Repositories (read-only)**
5. No additional permissions are required — the bot only reads public data
6. Copy the token to your `.env` as `GITHUB_TOKEN`

---

## Configuration

### `.env`

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | ✅ | Your bot token |
| `GITHUB_TOKEN` | ✅ (recommended) | GitHub fine-grained token |
| `GITHUB_REPO` | Optional | Aether main repo (default: `wayback09/Aether`) |
| `GITHUB_REGISTRY_REPO` | Optional | Extensions registry repo (default: `wayback09/Aether-Extensions`) |
| `POLL_INTERVAL_SECONDS` | Optional | How often to poll for releases (default: `300`) |
| `VERIFY_TOKEN_TTL_HOURS` | Optional | Verification token lifetime (default: `24`) |
| `OWNER_USER_IDS` | Optional | Comma-separated Discord user IDs of Aether owners |

### `config.json`

```json
{
  "ownerUserIds": ["123456789012345678"],
  "guilds": {
    "YOUR_GUILD_ID": {
      "extensionDeveloperRoleId": "ROLE_ID",
      "verifiedDeveloperRoleId": "ROLE_ID"
    }
  }
}
```

Alternatively, configure roles in Discord using `/config set-dev-role` and `/config set-verified-role`.

---

## Developer Verification

Extension developers can verify their ownership of a GitHub repository to receive Discord roles.

### Step 1 — Link GitHub

```
/link-github username:your-github-username
```

The bot validates that the GitHub account exists.

### Step 2 — Start Verification

```
/verify extension-id:your-extension-id
```

The bot generates a cryptographic token and displays it **once** (ephemeral). It will also show the repository URL.

### Step 3 — Place the Token

In your extension's GitHub repository (the one listed in the Aether-Extensions registry), create a file called `aether-verify.txt` at the **repository root** containing exactly the token shown:

```
aether-verify.txt
─────────────────
abc123def456...your-64-char-token-here
```

Push the file to the `main` or `master` branch.

### Step 4 — Complete Verification

Run the same command again:

```
/verify extension-id:your-extension-id
```

The bot fetches `aether-verify.txt` from GitHub, compares it against the stored hash, and grants the appropriate role on success.

### Check Status

```
/verify-status
```

Shows your linked GitHub account, verified extensions, pending token status, and current roles.

### Unlink

```
/unlink
```

Removes your GitHub link, invalidates all pending tokens, removes verified extension records, and re-evaluates your roles.

---

## Roles

| Role | Granted When |
|---|---|
| **Extension Developer** | GitHub linked + at least 1 verified extension (or in `OWNER_USER_IDS`) |
| **Verified Extension Developer** | Owns an extension with `trust: "verified"` or `trust: "official"` (or in `OWNER_USER_IDS`) |

Role state is re-evaluated:
- When verification succeeds
- When the extension registry refreshes (every 10 minutes)
- On bot startup
- When the bot joins a new server
- When you run `/config sync-roles`
- When you run `/unlink`

---

## Release Announcements

### Configure a Channel

```
/announce-channel add channel:#releases
```

### Remove a Channel

```
/announce-channel remove channel:#releases
```

### List Configured Channels

```
/announce-channel list
```

### Test Immediately

```
/announce-now
```

Posts the latest Aether release to all configured channels in the current server immediately (admin only).

The poller checks for new releases every **5 minutes** by default. Releases are only posted once — the bot remembers announced releases in SQLite and survives restarts.

---

## Extension Registry

### Browse All Extensions

```
/extensions
```

Lists all registry entries with trust badges (🔵 Official, ✅ Verified, 👤 Community). Paginated with buttons if there are many entries.

### View Extension Details

```
/extension id:modrinth
```

Shows full details for a specific extension: name, ID, author, description, trust level, repository, and install URL.

### Registry Health

```
/registry
```

Displays: number of extensions, cache age, last refresh time, GitHub connectivity status.

---

## Admin Commands

All admin commands require **Manage Server** permission.

| Command | Description |
|---|---|
| `/config set-dev-role` | Set the Extension Developer role |
| `/config set-verified-role` | Set the Verified Extension Developer role |
| `/config show` | Show current configuration |
| `/config sync-roles` | Re-evaluate all managed roles |
| `/announce-channel add/remove/list` | Manage announcement channels |
| `/announce-now` | Post the latest release immediately |

---

## VPS Deployment

### Build

```bash
npm run build
```

### systemd Service

Create `/etc/systemd/system/aetherbot.service`:

```ini
[Unit]
Description=AetherBot Discord Bot
After=network.target

[Service]
Type=simple
User=aetherbot
WorkingDirectory=/opt/aetherbot
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

# Never log these — just in case
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### Secrets

Keep `.env` outside the Git repository and on persistent disk:

```bash
# On the VPS
cp .env.example .env
nano .env  # Fill in real tokens
```

The `.env` file is already in `.gitignore`.

### Enable and Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable aetherbot
sudo systemctl start aetherbot
sudo journalctl -u aetherbot -f  # Watch logs
```

### Database Location

The SQLite database is stored at `data/aetherbot.db`. Ensure this path is on persistent storage (not a tmpfs) and back it up regularly.

---

## Security Notes

- Verification tokens are **never stored in plaintext** — only SHA-256 hashes
- Tokens are shown to users **exactly once** via ephemeral (private) Discord messages
- Tokens expire after 24 hours (configurable)
- Tokens are **invalidated after 3 failed verification attempts**
- The bot verifies against the **registry's `repository` field** only — users cannot supply an arbitrary repository
- The bot never requests Administrator permission
- GitHub tokens and Discord tokens are never logged

---

## License

Copyright (c) 2026 wayback09. All Rights Reserved.

This software is proprietary. No permission is granted to copy, modify, distribute, or host this software without explicit permission from the author.
