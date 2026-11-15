# Gruz Verify

Discord bot for Gruz Client that does only one thing: captcha verification. It runs 24/7 on Koyeb, separately from the main bot on Render.

- `/verify-panel role:<role> [channel] [min_account_age_days] [logs] [language]` posts the panel (administrators only).
- After the code is typed correctly, the bot gives the role.
- The bot status shows `Verified users: N`, where N is the number of members with the `Member` role.

The bot has no database. The panel's settings are stored in its button, so a restart changes nothing.

## Setup (once)

1. **Discord Developer Portal**: New Application "Gruz Verify", then open Bot.
   - Reset Token and copy the token.
   - Turn on **Server Members Intent**.
2. **Invite the bot**: OAuth2, then URL Generator.
   - Scopes: `bot` and `applications.commands`.
   - Permissions: `Manage Roles`, `Send Messages`, `Attach Files`, `Embed Links`, `View Channels`.
   - Then drag the bot's role above `Member`.
3. **Google Cloud**: Compute Engine, then VM instances, then Create instance.
   - Machine type: **e2-micro**.
   - Region: **us-central1**, **us-west1** or **us-east1**. Only these are free.
   - Boot disk: Debian 12, **Standard persistent disk**, 30 GB at most.
4. In the VM list, click **SSH**. Paste this into the terminal and paste the token when asked:
   `curl -fsSL https://raw.githubusercontent.com/ilikemoneyrux/gruz-verify/main/setup.sh | bash`
5. On Discord, run `/verify-panel role:@Member` and delete the old panel from the main bot.

Update: run the same command again. Logs: `sudo journalctl -u gruz-verify -f`.
