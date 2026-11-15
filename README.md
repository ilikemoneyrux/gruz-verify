# Gruz Verify

Discord bot for Gruz Client that does only one thing: captcha verification. It runs 24/7 on Koyeb, separately from the main bot on Render.

- `/verify-panel role:<role> [channel] [min_account_age_days] [logs] [language]` posts the panel (administrators only).
- After the code is typed correctly, the bot gives the role.
- The bot status shows `Verified users: N`, where N is the number of members with the `Member` role.

The bot has no database. The panel's settings are stored in its button, so a restart changes nothing.

## Setup (once)

1. **Discord Developer Portal** → New Application "Gruz Verify" → Bot:
   - Reset Token and copy it (do not send it to anyone).
   - Turn on **Server Members Intent**. Without it the bot cannot count members.
2. Invite the bot: OAuth2 → URL Generator → scopes `bot` + `applications.commands`, permissions `Manage Roles`, `Send Messages`, `Attach Files`, `Embed Links`, `View Channels`. Then in Server Settings → Roles, drag the bot's role **above** `Member`.
3. **Koyeb** → Create Web Service → GitHub → repo `gruz-verify`:
   - Builder: Buildpack.
   - Run command: `npm start`.
   - Instance: Free.
   - Port: 8000 (HTTP, health check on `/`).
   - Environment variable: `DISCORD_TOKEN` = the token from step 1, as a Secret.
4. On Discord, run `/verify-panel role:@Member channel:#verify language:English` and delete the old panel from the main bot.

## Test

`node t.js` is not in the repo. The code was tested in a scratch folder: customId packing, the captcha image and member counting.
