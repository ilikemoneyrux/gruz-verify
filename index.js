// Gruz Verify – osobny bot tylko do weryfikacji (captcha), żeby działała 24/7 niezależnie od głównego bota na Renderze.
// Bez bazy danych: rola, minimalny wiek konta, kanał logów i język są zapisane w customId przycisku panelu
// (/verify-panel wysyła panel; Discord nie pozwala użytkownikom zmieniać customId wiadomości bota).
// Zmienne: DISCORD_TOKEN (wymagany), PORT (Koyeb sprawdza, czy serwis odpowiada), KOYEB_PUBLIC_DOMAIN (podaje Koyeb).
const http = require('http');
const path = require('path');
const {
  Client, GatewayIntentBits, PermissionFlagsBits: P, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, SlashCommandBuilder, ChannelType, ActivityType,
} = require('discord.js');
const { captcha, newCode } = require('./captcha');

const COLOR = 0xb45cff;
const T = {
  en: {
    vfTitle: '✅ Verification',
    vfText: 'To get access to the server, click **Verify** and type the code from the picture.\nThis keeps bots and raiders out.',
    vfButton: 'Verify', vfEnter: 'Enter code',
    vfAlready: 'You are already verified. ✅',
    vfTooNew: 'Your Discord account is too new. Accounts must be at least {d} days old to join.',
    vfCaptcha: 'Type the code from the picture (letters and digits, not case sensitive). You have 3 tries and 5 minutes.',
    vfModalTitle: 'Verification', vfModalLabel: 'Code from the picture',
    vfOk: 'Verified – welcome! 🎉',
    vfWrong: 'Wrong code. Tries left: {n}.',
    vfExpired: 'The code expired or you used all tries. Click **Verify** again.',
    vfSlow: 'Too many attempts. Try again in a few minutes.',
    vfPanelSent: 'Verification panel sent to {ch}. New members get {r} after solving the captcha.',
    vfRoleHigh: 'I cannot give {r} – drag my role above it in Server Settings → Roles.',
    vfLog: '✅ {user} verified.',
    noPerm: 'I am missing the **{perm}** permission.',
    err: 'Something went wrong. Try again.',
  },
  pl: {
    vfTitle: '✅ Weryfikacja',
    vfText: 'Żeby dostać dostęp do serwera, kliknij **Zweryfikuj** i przepisz kod z obrazka.\nTo chroni serwer przed botami i rajdami.',
    vfButton: 'Zweryfikuj', vfEnter: 'Wpisz kod',
    vfAlready: 'Jesteś już zweryfikowany. ✅',
    vfTooNew: 'Twoje konto Discord jest za nowe. Musi mieć co najmniej {d} dni.',
    vfCaptcha: 'Przepisz kod z obrazka (litery i cyfry, wielkość liter bez znaczenia). Masz 3 próby i 5 minut.',
    vfModalTitle: 'Weryfikacja', vfModalLabel: 'Kod z obrazka',
    vfOk: 'Zweryfikowano – witaj! 🎉',
    vfWrong: 'Zły kod. Zostało prób: {n}.',
    vfExpired: 'Kod wygasł albo wykorzystałeś próby. Kliknij **Zweryfikuj** jeszcze raz.',
    vfSlow: 'Za dużo prób. Spróbuj za kilka minut.',
    vfPanelSent: 'Panel weryfikacji wysłany na {ch}. Nowi dostaną {r} po przepisaniu kodu.',
    vfRoleHigh: 'Nie mogę dać {r} – przeciągnij moją rolę nad nią w Ustawieniach serwera → Role.',
    vfLog: '✅ {user} zweryfikowany.',
    noPerm: 'Brakuje mi uprawnienia **{perm}**.',
    err: 'Coś poszło nie tak. Spróbuj jeszcze raz.',
  },
};
const t = (lang, key, vars = {}) => (T[lang]?.[key] ?? T.en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const reply = (i, content) => i.reply({ content, ephemeral: true });
const logoFile = () => new AttachmentBuilder(path.join(__dirname, 'assets', 'logo.png'), { name: 'logo.png' });

/** Ustawienia panelu w customId: vf:<akcja>:<rola>:<dni>:<kanał logów lub ->:<en|pl>; snowflake ma do 20 cyfr, limit customId to 100 znaków */
const pack = (act, s) => `vf:${act}:${s.role}:${s.minAge}:${s.log || '-'}:${s.lang}`;
function unpack(id) {
  const [kind, act, role, minAge, log, lang] = id.split(':');
  if (kind !== 'vf' || !/^\d{5,25}$/.test(role || '')) return null;
  return { act, s: { role, minAge: Math.max(0, Math.min(365, Number(minAge) || 0)), log: /^\d{5,25}$/.test(log) ? log : null, lang: lang === 'pl' ? 'pl' : 'en' } };
}

const pending = new Map(); // userId -> { code, at, tries }
const attempts = new Map(); // userId -> [czasy startu]
// stare wpisy znikają, żeby mapy nie rosły bez końca
setInterval(() => {
  const now = Date.now();
  for (const [k, p] of pending) if (now - p.at > 5 * 6e4) pending.delete(k);
  for (const [k, a] of attempts) if (!a.some((x) => now - x < 10 * 6e4)) attempts.delete(k);
}, 6e4).unref();

const command = new SlashCommandBuilder().setName('verify-panel').setDescription('Post the captcha verification panel')
  .setDefaultMemberPermissions(P.Administrator).setDMPermission(false)
  .addRoleOption((o) => o.setName('role').setDescription('Role given after verification').setRequired(true))
  .addChannelOption((o) => o.setName('channel').setDescription('Where to post the panel (default: here)').addChannelTypes(ChannelType.GuildText))
  .addIntegerOption((o) => o.setName('min_account_age_days').setDescription('Minimum Discord account age').setMinValue(0).setMaxValue(365))
  .addChannelOption((o) => o.setName('logs').setDescription('Channel for "X verified" logs').addChannelTypes(ChannelType.GuildText))
  .addStringOption((o) => o.setName('language').setDescription('Panel language').addChoices({ name: 'English', value: 'en' }, { name: 'Polski', value: 'pl' }));

async function panel(i) {
  const role = i.options.getRole('role', true);
  const s = { role: role.id, minAge: i.options.getInteger('min_account_age_days') || 0, log: i.options.getChannel('logs')?.id || null, lang: i.options.getString('language') || 'en' };
  const me = i.guild.members.me;
  if (!me.permissions.has(P.ManageRoles)) return reply(i, t(s.lang, 'noPerm', { perm: 'Manage Roles' }));
  if (role.position >= me.roles.highest.position || role.managed) return reply(i, t(s.lang, 'vfRoleHigh', { r: `${role}` }));
  const ch = i.options.getChannel('channel') || i.channel;
  const e = new EmbedBuilder().setColor(COLOR).setTitle(t(s.lang, 'vfTitle')).setDescription(t(s.lang, 'vfText')).setThumbnail('attachment://logo.png');
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(pack('start', s)).setLabel(t(s.lang, 'vfButton')).setEmoji('✅').setStyle(ButtonStyle.Success));
  await ch.send({ embeds: [e], components: [row], files: [logoFile()] });
  return reply(i, t(s.lang, 'vfPanelSent', { ch: `${ch}`, r: `${role}` }));
}

async function button(i, act, s) {
  if (i.member.roles.cache.has(s.role)) return reply(i, t(s.lang, 'vfAlready'));
  if (act === 'start') {
    if (s.minAge && Date.now() - i.user.createdTimestamp < s.minAge * 864e5) return reply(i, t(s.lang, 'vfTooNew', { d: s.minAge }));
    const times = (attempts.get(i.user.id) || []).filter((x) => Date.now() - x < 10 * 6e4);
    if (times.length >= 5) return reply(i, t(s.lang, 'vfSlow'));
    times.push(Date.now());
    attempts.set(i.user.id, times);
    const code = newCode(6);
    pending.set(i.user.id, { code, at: Date.now(), tries: 0 });
    const png = await captcha(code);
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(pack('enter', s)).setLabel(t(s.lang, 'vfEnter')).setEmoji('⌨️').setStyle(ButtonStyle.Primary));
    return i.reply({ content: t(s.lang, 'vfCaptcha'), files: [new AttachmentBuilder(png, { name: 'verify.png' })], components: [row], ephemeral: true });
  }
  if (act === 'enter') {
    const p = pending.get(i.user.id);
    if (!p || Date.now() - p.at > 5 * 6e4 || p.tries >= 3) return reply(i, t(s.lang, 'vfExpired'));
    return i.showModal(new ModalBuilder().setCustomId(pack('modal', s)).setTitle(t(s.lang, 'vfModalTitle'))
      .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel(t(s.lang, 'vfModalLabel')).setStyle(TextInputStyle.Short).setMinLength(4).setMaxLength(10).setRequired(true))));
  }
}

async function submit(i, s) {
  const p = pending.get(i.user.id);
  if (!p || Date.now() - p.at > 5 * 6e4 || p.tries >= 3) { pending.delete(i.user.id); return reply(i, t(s.lang, 'vfExpired')); }
  const given = i.fields.getTextInputValue('code').trim().toUpperCase().replace(/\s/g, '').replace(/0/g, 'O').replace(/1/g, 'I');
  const want = p.code.replace(/0/g, 'O').replace(/1/g, 'I');
  if (given !== want) {
    p.tries++;
    if (p.tries >= 3) { pending.delete(i.user.id); return reply(i, t(s.lang, 'vfExpired')); }
    return reply(i, t(s.lang, 'vfWrong', { n: 3 - p.tries }));
  }
  pending.delete(i.user.id);
  try {
    await i.member.roles.add(s.role, 'Gruz captcha');
  } catch {
    return reply(i, t(s.lang, 'vfRoleHigh', { r: `<@&${s.role}>` }));
  }
  if (s.log) {
    try {
      const ch = await i.client.channels.fetch(s.log);
      if (ch?.guildId === i.guildId) await ch.send({ content: t(s.lang, 'vfLog', { user: `${i.user} (${i.user.tag})` }), allowedMentions: { parse: [] } });
    } catch { /* kanał usunięty albo brak dostępu */ }
  }
  return reply(i, t(s.lang, 'vfOk'));
}

// GuildMembers (Server Members Intent w Developer Portal) – bez tego bot nie zna wszystkich członków i nie policzy roli
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const MEMBER_ROLE = 'member';

/** Status „Verified users: N” = liczba osób z rolą Member na wszystkich serwerach bota */
function verifiedCount() {
  let n = 0;
  for (const g of client.guilds.cache.values()) {
    const r = g.roles.cache.find((x) => x.name.toLowerCase() === MEMBER_ROLE);
    if (r) n += r.members.size;
  }
  return n;
}
function setStatus() {
  const n = verifiedCount();
  client.user.setPresence({ activities: [{ name: 'Verified users', type: ActivityType.Custom, state: `Verified users: ${n}` }] });
}
// zmiany ról przychodzą seriami (np. rajd, masowe nadanie) – status najwyżej raz na 15 s, Discord limituje zmiany statusu
let statusTimer = null;
const statusSoon = () => { statusTimer ||= setTimeout(() => { statusTimer = null; setStatus(); }, 15_000); };
for (const ev of ['guildMemberAdd', 'guildMemberRemove', 'guildMemberUpdate', 'roleUpdate', 'guildCreate', 'guildDelete']) client.on(ev, statusSoon);

client.once('ready', async () => {
  console.log(`[verify] zalogowany jako ${client.user.tag} na ${client.guilds.cache.size} serwerach`);
  try { await client.application.commands.set([command]); } catch (e) { console.error('[verify] komendy:', e.message); }
  for (const g of client.guilds.cache.values()) {
    try { await g.members.fetch(); } catch (e) { console.error('[verify] członkowie', g.name, e.message); }
  }
  setStatus();
  console.log(`[verify] Verified users: ${verifiedCount()}`);
});
client.on('interactionCreate', async (i) => {
  try {
    if (!i.inGuild()) return;
    if (i.isChatInputCommand() && i.commandName === 'verify-panel') return await panel(i);
    if (i.isButton() || i.isModalSubmit()) {
      const u = unpack(i.customId);
      if (!u) return;
      if (i.isModalSubmit() && u.act === 'modal') return await submit(i, u.s);
      if (i.isButton()) return await button(i, u.act, u.s);
    }
  } catch (e) {
    console.error('[verify]', e);
    if (i.isRepliable() && !i.replied && !i.deferred) i.reply({ content: T.en.err, ephemeral: true }).catch(() => {});
  }
});
client.on('error', (e) => console.error('[verify] klient:', e.message));

module.exports = { pack, unpack, verifiedCount, client }; // do testu

if (require.main === module) {
  // Koyeb sprawdza port; ping przez publiczny adres co 10 min na wypadek usypiania darmowej instancji
  const port = Number(process.env.PORT) || 8000;
  http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ ok: true, ready: client.isReady() })); }).listen(port);
  if (process.env.KOYEB_PUBLIC_DOMAIN) {
    setInterval(() => fetch(`https://${process.env.KOYEB_PUBLIC_DOMAIN}/`, { signal: AbortSignal.timeout(20_000) }).catch((e) => console.warn('[keepalive]', e.message)), 10 * 60_000);
  }

  if (!process.env.DISCORD_TOKEN) { console.error('[verify] brak DISCORD_TOKEN'); process.exit(1); }
  client.login(process.env.DISCORD_TOKEN);
}
