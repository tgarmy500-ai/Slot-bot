# 🔫 Smuggler Slots
**Professional Discord Slot Management Bot**

---

## STEP 1 — Create the Bot on Discord

1. Go to → **https://discord.com/developers/applications**
2. Click **"New Application"** → name it **Smuggler Slots** → Create
3. Click **"Bot"** in the left sidebar
4. Click **"Reset Token"** → **"Yes, do it"** → **Copy the token**
   > ⚠️ Save this token. You will paste it into your `.env` file.
5. Scroll down to **Privileged Gateway Intents** and enable ALL THREE:
   - ✅ Presence Intent
   - ✅ Server Members Intent
   - ✅ Message Content Intent
6. Click **"Save Changes"**

---

## STEP 2 — Invite the Bot to Your Server

1. Still in the Developer Portal → click **"OAuth2"** → **"URL Generator"**
2. Under **SCOPES**, tick:
   - ✅ `bot`
   - ✅ `applications.commands`
3. Under **BOT PERMISSIONS**, tick:
   - ✅ Send Messages
   - ✅ Embed Links
   - ✅ Read Message History
   - ✅ View Channels
   - ✅ Mention Everyone
4. Copy the generated URL at the bottom
5. Open it in your browser → select your server → **Authorise**

---

## STEP 3 — Get Your Server ID

1. In Discord → **User Settings** → **Advanced** → enable **Developer Mode**
2. Right-click your **server icon** → **"Copy Server ID"**
3. Paste it into your `.env` file as `GUILD_ID`

---

## STEP 4 — Set Up on Your VPS

```bash
# 1. Upload the bot files to your VPS (via SFTP or scp)
scp -r smuggler-slots-bot/ user@your-vps-ip:~/

# 2. SSH into your VPS
ssh user@your-vps-ip

# 3. Go to the bot folder
cd ~/smuggler-slots-bot

# 4. Install Python & pip (skip if already installed)
sudo apt update && sudo apt install python3 python3-pip -y

# 5. Install bot dependencies
pip3 install -r requirements.txt

# 6. Create your config file
cp .env.example .env
nano .env
```

Inside `.env`, fill in:
```env
DISCORD_TOKEN=paste_your_bot_token_here
GUILD_ID=paste_your_server_id_here
MOD_ROLE=Slot Manager
PING_SUFFIX=USE MM TO BE SAFE
MAX_HERE_PINGS=2
```

Press `Ctrl+X` → `Y` → Enter to save.

---

## STEP 5 — Run 24/7 with systemd

```bash
# Edit the service file — update the paths to match your username
nano smuggler-slots.service
# Change "ubuntu" to your actual VPS username in both WorkingDirectory and EnvironmentFile lines

# Install and start the service
sudo cp smuggler-slots.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable smuggler-slots
sudo systemctl start smuggler-slots

# Verify it's running
sudo systemctl status smuggler-slots

# Watch live logs
sudo journalctl -u smuggler-slots -f
```

### Alternative — run with screen (simpler)
```bash
chmod +x start.sh
screen -S smuggler-slots
./start.sh
# To detach: Ctrl+A then D
# To reconnect: screen -r smuggler-slots
```

---

## STEP 6 — Discord Server Setup

1. Create a role called **`Slot Manager`** (or change `MOD_ROLE` in `.env`)
2. Give that role to your staff members
3. Only that role + server Admins can use `/slot` commands

---

## Commands

| Command | What It Does |
|---|---|
| `/slot create @user [duration] [category]` | Create a slot |
| `/slot revoke @user [reason]` | Permanently remove |
| `/slot hold @user [reason]` | Freeze slot |
| `/slot release @user` | Restore held slot |
| `/slot warn @user <reason>` | DM a warning |
| `/slot transfer @from @to` | Move slot to another user |
| `/slot timer @user [hours]` | Set/clear expiry timer |
| `/slot extend @user <hours>` | Add hours to timer |
| `/slot info @user` | Full slot details panel |
| `/slot list` | All active/held slots |
| `/slot note @user <text>` | Add internal staff note |

---

## How @here Pings Work

When a slot holder sends `@here` in any channel:

| Ping Count | What Happens |
|---|---|
| 1st ping | Bot posts: `• 1/2 @here \| USE MM TO BE SAFE` |
| 2nd ping | Bot posts: `• 2/2 @here \| USE MM TO BE SAFE` + final warning embed |
| 3rd ping+ | Slot is **automatically held** — user notified via DM |

When a held slot is released with `/slot release`, the counter **resets to 0**.

---

## Slot Info Panel (matches reference design)

```
Slot Info                           [bot avatar]

User
@username

Duration
720

Category
001

Created
5 days ago

Expiry
in 3 months

Ping Allowed
@everyone : 0
@here : 1/2
```

---

## Customising

Edit these values in your `.env`:

| Variable | Default | Description |
|---|---|---|
| `MAX_HERE_PINGS` | `2` | Max @here pings before auto-hold |
| `PING_SUFFIX` | `USE MM TO BE SAFE` | Text after the ping counter |
| `EMBED_COLOR` | `b000ff` | Embed accent color (hex) |
| `BOT_THUMBNAIL` | *(bot avatar)* | Custom image URL for slot info |
| `MOD_ROLE` | `Slot Manager` | Role name that can use /slot commands |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Commands not showing | Make sure `GUILD_ID` is set correctly in `.env`, then restart bot |
| "Unknown interaction" | Restart the bot — commands need to sync on first run |
| Bot not responding to @here | Enable **Message Content Intent** in Developer Portal |
| Bot offline after reboot | Run `sudo systemctl enable smuggler-slots` to auto-start |

---

*Smuggler Slots — Professional Slot Management*
