/**
 * ╔══════════════════════════════════════════╗
 * ║        SMUGGLER SLOTS — Discord Bot      ║
 * ║   Professional Slot Management System   ║
 * ╚══════════════════════════════════════════╝
 */

const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  EmbedBuilder, ActivityType, PermissionsBitField,
  ButtonBuilder, ButtonStyle, ActionRowBuilder, ChannelType
} = require("discord.js");
const Database = require("better-sqlite3");
const path = require("path");

// ══════════════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════════════
const TOKEN = process.env.DISCORD_TOKEN || "MTUxODU2NTQ3MzU0Nzk4MDgwMQ.Gd3aZ4.xtcaeus_dkLALF_VKp-DLzcYGV4Dr1BGKbCQ0g";
const GUILD_ID = process.env.GUILD_ID        || "1495786428490059866";
const MOD_ROLE = process.env.MOD_ROLE        || "Slot Manager";
const MAX_HERE = parseInt(process.env.MAX_HERE_PINGS || "2");
const PING_SUFFIX  = process.env.PING_SUFFIX || "USE MM TO BE SAFE";
const BOT_THUMB    = process.env.BOT_THUMBNAIL || "";
const EMBED_COLOR  = parseInt(process.env.EMBED_COLOR || "b000ff", 16);

// ══════════════════════════════════════════════
//  DATABASE
// ══════════════════════════════════════════════
const db = new Database(path.join(__dirname, "slots.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS slots (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id       TEXT NOT NULL,
    user_id        TEXT NOT NULL,
    category       TEXT,
    status         TEXT NOT NULL DEFAULT 'active',
    duration_hours INTEGER,
    created_at     TEXT NOT NULL,
    expires_at     TEXT,
    held_at        TEXT,
    here_pings     INTEGER NOT NULL DEFAULT 0,
    everyone_pings INTEGER NOT NULL DEFAULT 0,
    notes          TEXT
  );
  CREATE TABLE IF NOT EXISTS slot_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_id    INTEGER NOT NULL,
    action     TEXT NOT NULL,
    actor_id   TEXT NOT NULL,
    reason     TEXT,
    timestamp  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ticket_config (
    guild_id         TEXT PRIMARY KEY,
    staff_role_id    TEXT,
    category_id      TEXT,
    panel_title      TEXT NOT NULL DEFAULT 'Support Tickets',
    panel_desc       TEXT NOT NULL DEFAULT 'Click the button below to open a support ticket. Our staff will assist you shortly.',
    panel_color      TEXT NOT NULL DEFAULT 'b000ff',
    ticket_intro     TEXT NOT NULL DEFAULT 'A staff member will be with you shortly. Please describe your issue in detail.',
    log_channel_id   TEXT
  );
  CREATE TABLE IF NOT EXISTS tickets (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id     TEXT NOT NULL,
    channel_id   TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'open',
    created_at   TEXT NOT NULL,
    closed_at    TEXT
  );
`);

// ══════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════
const nowStr = () => new Date().toISOString();

function logAction(slotId, action, actorId, reason = "") {
  db.prepare(
    "INSERT INTO slot_history (slot_id, action, actor_id, reason, timestamp) VALUES (?,?,?,?,?)"
  ).run(slotId, action, String(actorId), reason, nowStr());
}

function fmtRelative(iso) {
  if (!iso) return "Never";
  const dt  = new Date(iso);
  const now = new Date();
  const diffMs = dt - now;
  const past   = diffMs < 0;
  const secs   = Math.abs(diffMs) / 1000;

  let s;
  if      (secs < 60)        s = `${Math.floor(secs)} seconds`;
  else if (secs < 3600)      s = `${Math.floor(secs/60)} minutes`;
  else if (secs < 86400)     s = `${Math.floor(secs/3600)} hours`;
  else if (secs < 86400*30)  s = `${Math.floor(secs/86400)} days`;
  else if (secs < 86400*365) { const m = Math.floor(secs/(86400*30));  s = `${m} month${m>1?'s':''}`; }
  else                       { const y = Math.floor(secs/(86400*365)); s = `${y} year${y>1?'s':''}`; }

  return past ? `${s} ago` : `in ${s}`;
}

function statusEmoji(status) {
  return { active: "🟢", held: "🔴", revoked: "⛔" }[status] || "⚪";
}

function hasMod(member) {
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  return member.roles.cache.some(r => r.name === MOD_ROLE);
}

function errEmbed(desc) {
  return new EmbedBuilder().setTitle("❌ Error").setDescription(desc).setColor(0xff0000);
}

// Slot Info embed — matches the reference image exactly
function buildSlotInfoEmbed(slot, botUser) {
  const thumb      = BOT_THUMB || botUser.displayAvatarURL();
  const createdVal = `\`${fmtRelative(slot.created_at)}\``;
  const expiryVal  = slot.expires_at ? `\`${fmtRelative(slot.expires_at)}\`` : "`Never`";
  const durationVal = slot.duration_hours ? String(slot.duration_hours) : "∞";
  const pingVal    = `\`\`\`\n@everyone : 0\n@here : ${MAX_HERE}\n\`\`\``;

  return new EmbedBuilder()
    .setTitle("Slot Info")
    .setColor(EMBED_COLOR)
    .setThumbnail(thumb)
    .addFields(
      { name: "User",         value: `<@${slot.user_id}>`, inline: false },
      { name: "Duration",     value: durationVal,           inline: false },
      { name: "Category",     value: slot.category || "—",  inline: false },
      { name: "Created",      value: createdVal,             inline: false },
      { name: "Expiry",       value: expiryVal,              inline: false },
      { name: "Ping Allowed", value: pingVal,                inline: false }
    )
    .setFooter({ text: "Smuggler Slots • Professional Slot Management" });
}

// Ticket panel embed — professional purple aesthetic
function buildTicketPanelEmbed(cfg, botUser) {
  const color = parseInt(cfg.panel_color || "b000ff", 16);
  const thumb = BOT_THUMB || botUser.displayAvatarURL();
  return new EmbedBuilder()
    .setTitle(cfg.panel_title)
    .setDescription(cfg.panel_desc)
    .setColor(color)
    .setThumbnail(thumb)
    .addFields({
      name: "How It Works",
      value: "```\n1. Click 🎫 Open Ticket below\n2. Describe your issue\n3. Staff will respond shortly\n```",
      inline: false
    })
    .setFooter({ text: "Smuggler Slots • Support System" })
    .setTimestamp();
}

// Ticket open embed — shown inside the new ticket channel
function buildTicketOpenEmbed(user, ticketNum, cfg, botUser) {
  const color = parseInt(cfg.panel_color || "b000ff", 16);
  const thumb = BOT_THUMB || botUser.displayAvatarURL();
  return new EmbedBuilder()
    .setTitle(`🎫 Ticket #${ticketNum}`)
    .setDescription(cfg.ticket_intro)
    .setColor(color)
    .setThumbnail(thumb)
    .addFields(
      { name: "Opened By", value: `<@${user.id}>`,           inline: true },
      { name: "Status",    value: "🟢 Open",                  inline: true },
      { name: "Created",   value: `\`${fmtRelative(nowStr())}\``, inline: false }
    )
    .setFooter({ text: "Smuggler Slots • Support System • Click 🔒 Close to resolve" })
    .setTimestamp();
}

// ══════════════════════════════════════════════
//  SLASH COMMANDS DEFINITION
// ══════════════════════════════════════════════
const commands = [
  // ── /slot ──────────────────────────────────
  new SlashCommandBuilder()
    .setName("slot")
    .setDescription("Smuggler Slots management")
    .addSubcommand(s => s.setName("create").setDescription("Create a slot for a user")
      .addUserOption(o => o.setName("user").setDescription("User to give a slot").setRequired(true))
      .addIntegerOption(o => o.setName("duration").setDescription("Duration in hours (optional)"))
      .addStringOption(o => o.setName("category").setDescription("Category label e.g. 001, VIP")))
    .addSubcommand(s => s.setName("revoke").setDescription("Permanently remove a slot")
      .addUserOption(o => o.setName("user").setDescription("User to revoke").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Reason")))
    .addSubcommand(s => s.setName("hold").setDescription("Put a slot on hold")
      .addUserOption(o => o.setName("user").setDescription("User to hold").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Reason")))
    .addSubcommand(s => s.setName("release").setDescription("Release a held slot")
      .addUserOption(o => o.setName("user").setDescription("User to release").setRequired(true)))
    .addSubcommand(s => s.setName("warn").setDescription("DM a warning to a slot holder")
      .addUserOption(o => o.setName("user").setDescription("User to warn").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Warning reason").setRequired(true)))
    .addSubcommand(s => s.setName("transfer").setDescription("Transfer a slot to another user")
      .addUserOption(o => o.setName("from").setDescription("Current holder").setRequired(true))
      .addUserOption(o => o.setName("to").setDescription("New holder").setRequired(true)))
    .addSubcommand(s => s.setName("timer").setDescription("Set or clear slot expiry timer")
      .addUserOption(o => o.setName("user").setDescription("Slot holder").setRequired(true))
      .addIntegerOption(o => o.setName("hours").setDescription("Hours from now (blank = clear timer)")))
    .addSubcommand(s => s.setName("extend").setDescription("Add hours to an existing timer")
      .addUserOption(o => o.setName("user").setDescription("Slot holder").setRequired(true))
      .addIntegerOption(o => o.setName("hours").setDescription("Hours to add").setRequired(true)))
    .addSubcommand(s => s.setName("info").setDescription("View full slot details")
      .addUserOption(o => o.setName("user").setDescription("Slot holder").setRequired(true)))
    .addSubcommand(s => s.setName("list").setDescription("View all active and held slots"))
    .addSubcommand(s => s.setName("note").setDescription("Add a staff note to a slot")
      .addUserOption(o => o.setName("user").setDescription("Slot holder").setRequired(true))
      .addStringOption(o => o.setName("text").setDescription("Note text").setRequired(true))),

  // ── /send ──────────────────────────────────
  new SlashCommandBuilder()
    .setName("send")
    .setDescription("Send a message to a channel as the bot")
    .addStringOption(o => o.setName("message").setDescription("The message to send").setRequired(true))
    .addChannelOption(o => o.setName("channel").setDescription("Target channel (defaults to current)")),

  // ── /ticket ────────────────────────────────
  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Ticket system management")
    .addSubcommand(s => s.setName("setup").setDescription("Send the ticket panel to a channel")
      .addChannelOption(o => o.setName("channel").setDescription("Channel to post the panel in").setRequired(true))
      .addRoleOption(o => o.setName("staff_role").setDescription("Role that can see tickets"))
      .addStringOption(o => o.setName("title").setDescription("Panel title (default: Support Tickets)"))
      .addStringOption(o => o.setName("description").setDescription("Panel description text"))
      .addStringOption(o => o.setName("intro").setDescription("Message shown inside each new ticket"))
      .addChannelOption(o => o.setName("log_channel").setDescription("Channel to log ticket events")))
    .addSubcommand(s => s.setName("close").setDescription("Close the current ticket channel"))
    .addSubcommand(s => s.setName("add").setDescription("Add a user to the current ticket")
      .addUserOption(o => o.setName("user").setDescription("User to add").setRequired(true)))
    .addSubcommand(s => s.setName("remove").setDescription("Remove a user from the current ticket")
      .addUserOption(o => o.setName("user").setDescription("User to remove").setRequired(true)))
    .addSubcommand(s => s.setName("config").setDescription("Update ticket panel text without resending")
      .addStringOption(o => o.setName("title").setDescription("New panel title"))
      .addStringOption(o => o.setName("description").setDescription("New panel description"))
      .addStringOption(o => o.setName("intro").setDescription("New in-ticket intro message"))
      .addStringOption(o => o.setName("color").setDescription("Embed color hex e.g. b000ff"))),
].map(c => c.toJSON());

// ══════════════════════════════════════════════
//  CLIENT
// ══════════════════════════════════════════════
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  try {
    console.log("⏳ Registering slash commands...");
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
    console.log("✅ Slash commands registered to guild", GUILD_ID);
  } catch (err) {
    console.error("❌ Failed to register commands:", err.message);
  }
}

// ══════════════════════════════════════════════
//  READY
// ══════════════════════════════════════════════
client.once("ready", async () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║   Smuggler Slots — Online ✅          ║`);
  console.log(`║   Bot: ${client.user.tag}`);
  console.log(`║   Guild: ${GUILD_ID}`);
  console.log(`╚══════════════════════════════════════╝\n`);

  client.user.setActivity("🔫 Smuggler Slots", { type: ActivityType.Watching });
  await registerCommands();
  setInterval(checkExpiredSlots, 60_000);
});

// ══════════════════════════════════════════════
//  INTERACTION ROUTER
// ══════════════════════════════════════════════
client.on("interactionCreate", async interaction => {
  try {
    // ── Buttons ──────────────────────────────
    if (interaction.isButton()) {
      if (interaction.customId === "ticket_open")  return await handleTicketOpen(interaction);
      if (interaction.customId === "ticket_close") return await handleTicketClose(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    // ── Permission guard (not needed for /send public facing) ──
    const cmd = interaction.commandName;
    const sub = interaction.options.getSubcommand(false);

    if (cmd === "send")   return await cmdSend(interaction);
    if (cmd === "ticket") {
      if (!hasMod(interaction.member)) return interaction.reply({ embeds: [permDenied()], ephemeral: true });
      if (sub === "setup")  return await cmdTicketSetup(interaction);
      if (sub === "close")  return await cmdTicketClose(interaction);
      if (sub === "add")    return await cmdTicketAdd(interaction);
      if (sub === "remove") return await cmdTicketRemove(interaction);
      if (sub === "config") return await cmdTicketConfig(interaction);
      return;
    }

    if (cmd === "slot") {
      if (!hasMod(interaction.member)) return interaction.reply({ embeds: [permDenied()], ephemeral: true });
      if (sub === "create")   return await cmdCreate(interaction);
      if (sub === "revoke")   return await cmdRevoke(interaction);
      if (sub === "hold")     return await cmdHold(interaction);
      if (sub === "release")  return await cmdRelease(interaction);
      if (sub === "warn")     return await cmdWarn(interaction);
      if (sub === "transfer") return await cmdTransfer(interaction);
      if (sub === "timer")    return await cmdTimer(interaction);
      if (sub === "extend")   return await cmdExtend(interaction);
      if (sub === "info")     return await cmdInfo(interaction);
      if (sub === "list")     return await cmdList(interaction);
      if (sub === "note")     return await cmdNote(interaction);
    }
  } catch (err) {
    console.error("Interaction error:", err);
    const embed = errEmbed(err.message);
    if (interaction.replied || interaction.deferred)
      await interaction.followUp({ embeds: [embed], ephemeral: true }).catch(() => {});
    else
      await interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
  }
});

function permDenied() {
  return new EmbedBuilder()
    .setTitle("🚫 Permission Denied")
    .setDescription(`You need the **${MOD_ROLE}** role or Administrator to use this command.`)
    .setColor(0xff0000);
}

// ══════════════════════════════════════════════
//  SLOT COMMANDS
// ══════════════════════════════════════════════

// /slot create — ephemeral ACK, public slot info embed via channel.send
async function cmdCreate(i) {
  // Reply ephemerally so "X used /slot create" is only visible to the mod
  await i.deferReply({ ephemeral: true });

  const user     = i.options.getUser("user");
  const duration = i.options.getInteger("duration") || null;
  const category = i.options.getString("category")  || null;

  const existing = db.prepare(
    "SELECT * FROM slots WHERE guild_id=? AND user_id=? AND status IN ('active','held')"
  ).get(String(i.guildId), String(user.id));

  if (existing) {
    return i.editReply({ embeds: [new EmbedBuilder()
      .setTitle("⚠️ Slot Already Exists")
      .setDescription(`<@${user.id}> already has an **${existing.status}** slot.`)
      .setColor(0xffcc00)] });
  }

  const expiresAt = duration ? new Date(Date.now() + duration * 3600_000).toISOString() : null;
  const result = db.prepare(
    "INSERT INTO slots (guild_id, user_id, category, status, duration_hours, created_at, expires_at) VALUES (?,?,?,?,?,?,?)"
  ).run(String(i.guildId), String(user.id), category, "active", duration, nowStr(), expiresAt);

  logAction(result.lastInsertRowid, "create", i.user.id);
  const slot = db.prepare("SELECT * FROM slots WHERE id=?").get(result.lastInsertRowid);

  // Send the public Slot Info embed directly in the channel (no interaction trace)
  await i.channel.send({ content: `<@${user.id}>`, embeds: [buildSlotInfoEmbed(slot, client.user)] });

  // Quietly confirm to the mod (ephemeral, only they see it)
  await i.editReply({ content: "✅ Slot created." });
}

// /slot revoke
async function cmdRevoke(i) {
  await i.deferReply({ ephemeral: true });
  const user   = i.options.getUser("user");
  const reason = i.options.getString("reason") || "No reason provided";

  const slot = db.prepare(
    "SELECT * FROM slots WHERE guild_id=? AND user_id=? AND status IN ('active','held')"
  ).get(String(i.guildId), String(user.id));

  if (!slot) return i.editReply({ embeds: [errEmbed(`<@${user.id}> has no active or held slot.`)] });

  db.prepare("UPDATE slots SET status='revoked' WHERE id=?").run(slot.id);
  logAction(slot.id, "revoke", i.user.id, reason);

  await i.channel.send({ embeds: [new EmbedBuilder()
    .setTitle("⛔ Slot Revoked")
    .setDescription(`<@${user.id}>'s slot has been permanently removed.`)
    .addFields({ name: "Reason", value: reason })
    .setColor(0xff0000)
    .setFooter({ text: "Smuggler Slots • Professional Slot Management" })
    .setTimestamp()] });

  await i.editReply({ content: "✅ Done." });

  try {
    const member = await i.guild.members.fetch(user.id);
    await member.send({ embeds: [new EmbedBuilder()
      .setTitle("⛔ Your Slot Has Been Revoked")
      .setDescription(`Your slot in **${i.guild.name}** has been permanently removed.`)
      .addFields({ name: "Reason", value: reason })
      .setColor(0xff0000)] });
  } catch {}
}

// /slot hold
async function cmdHold(i) {
  await i.deferReply({ ephemeral: true });
  const user   = i.options.getUser("user");
  const reason = i.options.getString("reason") || "No reason provided";

  const slot = db.prepare(
    "SELECT * FROM slots WHERE guild_id=? AND user_id=? AND status='active'"
  ).get(String(i.guildId), String(user.id));

  if (!slot) return i.editReply({ embeds: [errEmbed(`<@${user.id}> has no active slot to hold.`)] });

  db.prepare("UPDATE slots SET status='held', held_at=? WHERE id=?").run(nowStr(), slot.id);
  logAction(slot.id, "hold", i.user.id, reason);

  await i.channel.send({ embeds: [new EmbedBuilder()
    .setTitle("🔴 Slot On Hold")
    .setDescription(`<@${user.id}>'s slot has been placed on hold.`)
    .addFields({ name: "Reason", value: reason })
    .setColor(0xff6600)
    .setFooter({ text: "Smuggler Slots • Use /slot release to restore" })
    .setTimestamp()] });

  await i.editReply({ content: "✅ Done." });

  try {
    const member = await i.guild.members.fetch(user.id);
    await member.send({ embeds: [new EmbedBuilder()
      .setTitle("🔴 Your Slot Is On Hold")
      .setDescription(`Your slot in **${i.guild.name}** has been placed on hold. Contact staff to release it.`)
      .addFields({ name: "Reason", value: reason })
      .setColor(0xff6600)] });
  } catch {}
}

// /slot release
async function cmdRelease(i) {
  await i.deferReply({ ephemeral: true });
  const user = i.options.getUser("user");

  const slot = db.prepare(
    "SELECT * FROM slots WHERE guild_id=? AND user_id=? AND status='held'"
  ).get(String(i.guildId), String(user.id));

  if (!slot) return i.editReply({ embeds: [errEmbed(`<@${user.id}> has no held slot.`)] });

  db.prepare("UPDATE slots SET status='active', held_at=NULL, here_pings=0, everyone_pings=0 WHERE id=?").run(slot.id);
  logAction(slot.id, "release", i.user.id);

  await i.channel.send({ content: `<@${user.id}>`, embeds: [new EmbedBuilder()
    .setTitle("🟢 Slot Released")
    .setDescription(`<@${user.id}>'s slot is now active. Ping counter reset to 0.`)
    .setColor(0x00cc44)
    .setFooter({ text: "Smuggler Slots • Professional Slot Management" })
    .setTimestamp()] });

  await i.editReply({ content: "✅ Done." });

  try {
    const member = await i.guild.members.fetch(user.id);
    await member.send({ embeds: [new EmbedBuilder()
      .setTitle("🟢 Your Slot Has Been Released")
      .setDescription(`Your slot in **${i.guild.name}** is active again. Ping counter reset.`)
      .setColor(0x00cc44)] });
  } catch {}
}

// /slot warn
async function cmdWarn(i) {
  await i.deferReply({ ephemeral: true });
  const user   = i.options.getUser("user");
  const reason = i.options.getString("reason");

  const slot = db.prepare(
    "SELECT * FROM slots WHERE guild_id=? AND user_id=? AND status IN ('active','held')"
  ).get(String(i.guildId), String(user.id));

  if (!slot) return i.editReply({ embeds: [errEmbed(`<@${user.id}> has no active or held slot.`)] });

  logAction(slot.id, "warn", i.user.id, reason);

  let dmSent = true;
  try {
    const member = await i.guild.members.fetch(user.id);
    await member.send({ embeds: [new EmbedBuilder()
      .setTitle("⚠️ Official Warning — Smuggler Slots")
      .setDescription(`You have received a warning for your slot in **${i.guild.name}**.`)
      .addFields(
        { name: "Reason", value: reason },
        { name: "Notice", value: "Further violations may result in your slot being held or revoked." }
      )
      .setColor(0xffcc00)
      .setTimestamp()] });
  } catch { dmSent = false; }

  await i.editReply({ embeds: [new EmbedBuilder()
    .setTitle("⚠️ Warning Issued")
    .addFields(
      { name: "User",         value: `<@${user.id}>`,              inline: true },
      { name: "DM Delivered", value: dmSent ? "✅ Yes" : "❌ DMs Closed", inline: true },
      { name: "Reason",       value: reason }
    )
    .setColor(0xffcc00)
    .setFooter({ text: "Smuggler Slots • Professional Slot Management" })
    .setTimestamp()] });
}

// /slot transfer
async function cmdTransfer(i) {
  await i.deferReply({ ephemeral: true });
  const fromUser = i.options.getUser("from");
  const toUser   = i.options.getUser("to");

  const slot = db.prepare(
    "SELECT * FROM slots WHERE guild_id=? AND user_id=? AND status IN ('active','held')"
  ).get(String(i.guildId), String(fromUser.id));

  if (!slot) return i.editReply({ embeds: [errEmbed(`<@${fromUser.id}> has no active or held slot.`)] });

  const toExisting = db.prepare(
    "SELECT id FROM slots WHERE guild_id=? AND user_id=? AND status IN ('active','held')"
  ).get(String(i.guildId), String(toUser.id));

  if (toExisting) return i.editReply({ embeds: [new EmbedBuilder()
    .setTitle("⚠️ Target Already Has a Slot")
    .setDescription(`<@${toUser.id}> already holds a slot. Revoke it first.`)
    .setColor(0xffcc00)] });

  db.prepare(
    "UPDATE slots SET user_id=?, status='active', here_pings=0, everyone_pings=0, held_at=NULL WHERE id=?"
  ).run(String(toUser.id), slot.id);
  logAction(slot.id, "transfer", i.user.id, `from:${fromUser.id} to:${toUser.id}`);

  await i.channel.send({ embeds: [new EmbedBuilder()
    .setTitle("🔄 Slot Transferred")
    .addFields(
      { name: "From", value: `<@${fromUser.id}>`, inline: true },
      { name: "To",   value: `<@${toUser.id}>`,   inline: true }
    )
    .setColor(0x5865f2)
    .setFooter({ text: "Smuggler Slots • Professional Slot Management" })
    .setTimestamp()] });

  await i.editReply({ content: "✅ Done." });
}

// /slot timer
async function cmdTimer(i) {
  await i.deferReply({ ephemeral: true });
  const user  = i.options.getUser("user");
  const hours = i.options.getInteger("hours");

  const slot = db.prepare(
    "SELECT * FROM slots WHERE guild_id=? AND user_id=? AND status IN ('active','held')"
  ).get(String(i.guildId), String(user.id));

  if (!slot) return i.editReply({ embeds: [errEmbed(`<@${user.id}> has no active or held slot.`)] });

  let desc;
  if (hours == null) {
    db.prepare("UPDATE slots SET expires_at=NULL, duration_hours=NULL WHERE id=?").run(slot.id);
    desc = "Timer **cleared** — slot has no expiry.";
  } else {
    const exp = new Date(Date.now() + hours * 3600_000).toISOString();
    db.prepare("UPDATE slots SET expires_at=?, duration_hours=? WHERE id=?").run(exp, hours, slot.id);
    desc = `Expires **${fmtRelative(exp)}**.`;
  }
  logAction(slot.id, "timer_set", i.user.id, `hours=${hours}`);

  await i.editReply({ embeds: [new EmbedBuilder()
    .setTitle("⏱️ Timer Updated").setDescription(desc)
    .addFields({ name: "User", value: `<@${user.id}>`, inline: true })
    .setColor(0x0099ff)
    .setFooter({ text: "Smuggler Slots • Professional Slot Management" })
    .setTimestamp()] });
}

// /slot extend
async function cmdExtend(i) {
  await i.deferReply({ ephemeral: true });
  const user  = i.options.getUser("user");
  const hours = i.options.getInteger("hours");

  const slot = db.prepare(
    "SELECT * FROM slots WHERE guild_id=? AND user_id=? AND status IN ('active','held')"
  ).get(String(i.guildId), String(user.id));

  if (!slot) return i.editReply({ embeds: [errEmbed(`<@${user.id}> has no active or held slot.`)] });

  const base   = slot.expires_at && new Date(slot.expires_at) > new Date() ? new Date(slot.expires_at) : new Date();
  const newExp = new Date(base.getTime() + hours * 3600_000).toISOString();
  const newDur = (slot.duration_hours || 0) + hours;
  db.prepare("UPDATE slots SET expires_at=?, duration_hours=? WHERE id=?").run(newExp, newDur, slot.id);
  logAction(slot.id, "extend", i.user.id, `+${hours}h`);

  await i.editReply({ embeds: [new EmbedBuilder()
    .setTitle("⏩ Slot Extended")
    .addFields(
      { name: "User",       value: `<@${user.id}>`,     inline: true },
      { name: "Added",      value: `+${hours} hour(s)`, inline: true },
      { name: "New Expiry", value: fmtRelative(newExp) }
    )
    .setColor(0x0099ff)
    .setFooter({ text: "Smuggler Slots • Professional Slot Management" })
    .setTimestamp()] });
}

// /slot info
async function cmdInfo(i) {
  await i.deferReply({ ephemeral: true });
  const user = i.options.getUser("user");

  const slot = db.prepare(
    "SELECT * FROM slots WHERE guild_id=? AND user_id=? ORDER BY id DESC LIMIT 1"
  ).get(String(i.guildId), String(user.id));

  if (!slot) return i.editReply({ embeds: [errEmbed(`<@${user.id}> has never had a slot.`)] });

  const embed   = buildSlotInfoEmbed(slot, client.user);
  const history = db.prepare(
    "SELECT * FROM slot_history WHERE slot_id=? ORDER BY timestamp DESC LIMIT 5"
  ).all(slot.id);

  if (history.length) {
    const lines = history.map(h => {
      const r = h.reason ? ` — ${h.reason}` : "";
      return `\`${h.action.toUpperCase()}\` by <@${h.actor_id}>${r}`;
    });
    embed.addFields({ name: "Recent Activity", value: lines.join("\n") });
  }
  if (slot.notes) embed.addFields({ name: "📝 Staff Note", value: slot.notes });

  await i.editReply({ embeds: [embed] });
}

// /slot list
async function cmdList(i) {
  await i.deferReply({ ephemeral: true });

  const slots = db.prepare(
    "SELECT * FROM slots WHERE guild_id=? AND status IN ('active','held') ORDER BY status, created_at"
  ).all(String(i.guildId));

  if (!slots.length) return i.editReply({ embeds: [new EmbedBuilder()
    .setTitle("📋 No Active Slots").setDescription("There are no active or held slots right now.")
    .setColor(EMBED_COLOR)] });

  const active = slots.filter(s => s.status === "active");
  const held   = slots.filter(s => s.status === "held");

  const embed = new EmbedBuilder()
    .setTitle("📋 Slot List")
    .setDescription(`**${slots.length}** total  |  🟢 ${active.length} active  |  🔴 ${held.length} held`)
    .setColor(EMBED_COLOR)
    .setFooter({ text: "Smuggler Slots • Professional Slot Management" })
    .setTimestamp();

  const buildLines = arr => arr.map(s => {
    const cat = s.category ? `\`${s.category}\`` : "";
    const bar = `[${"█".repeat(s.here_pings)}${"░".repeat(Math.max(0, MAX_HERE - s.here_pings))}]`;
    return `${statusEmoji(s.status)} <@${s.user_id}> ${cat} ${bar} @here`;
  }).join("\n") || "None";

  if (active.length) embed.addFields({ name: "🟢 Active", value: buildLines(active) });
  if (held.length)   embed.addFields({ name: "🔴 Held",   value: buildLines(held) });

  await i.editReply({ embeds: [embed] });
}

// /slot note
async function cmdNote(i) {
  await i.deferReply({ ephemeral: true });
  const user = i.options.getUser("user");
  const text = i.options.getString("text");

  const slot = db.prepare(
    "SELECT * FROM slots WHERE guild_id=? AND user_id=? AND status IN ('active','held')"
  ).get(String(i.guildId), String(user.id));

  if (!slot) return i.editReply({ content: "❌ No active/held slot found for that user." });

  db.prepare("UPDATE slots SET notes=? WHERE id=?").run(text, slot.id);
  logAction(slot.id, "note", i.user.id, text);

  await i.editReply({ embeds: [new EmbedBuilder()
    .setTitle("📝 Note Saved")
    .setDescription(`Note added to <@${user.id}>'s slot. Visible in \`/slot info\`.`)
    .setColor(0x0099ff)] });
}

// ══════════════════════════════════════════════
//  SEND COMMAND
// ══════════════════════════════════════════════
async function cmdSend(i) {
  if (!hasMod(i.member)) return i.reply({ embeds: [permDenied()], ephemeral: true });

  await i.deferReply({ ephemeral: true });
  const message = i.options.getString("message");
  const channel = i.options.getChannel("channel") || i.channel;

  await channel.send(message);
  await i.editReply({ content: `✅ Message sent to <#${channel.id}>.` });
}

// ══════════════════════════════════════════════
//  TICKET COMMANDS
// ══════════════════════════════════════════════

// /ticket setup
async function cmdTicketSetup(i) {
  await i.deferReply({ ephemeral: true });

  const channel   = i.options.getChannel("channel");
  const staffRole = i.options.getRole("staff_role");
  const title     = i.options.getString("title")       || "Support Tickets";
  const desc      = i.options.getString("description") || "Click the button below to open a support ticket. Our staff will assist you shortly.";
  const intro     = i.options.getString("intro")       || "A staff member will be with you shortly. Please describe your issue in detail.";
  const logCh     = i.options.getChannel("log_channel");

  // Save config
  db.prepare(`
    INSERT INTO ticket_config (guild_id, staff_role_id, panel_title, panel_desc, ticket_intro, log_channel_id)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      staff_role_id  = excluded.staff_role_id,
      panel_title    = excluded.panel_title,
      panel_desc     = excluded.panel_desc,
      ticket_intro   = excluded.ticket_intro,
      log_channel_id = excluded.log_channel_id
  `).run(String(i.guildId), staffRole ? String(staffRole.id) : null, title, desc, intro, logCh ? String(logCh.id) : null);

  const cfg = db.prepare("SELECT * FROM ticket_config WHERE guild_id=?").get(String(i.guildId));

  // Build the panel
  const panelEmbed = buildTicketPanelEmbed(cfg, client.user);
  const openBtn = new ButtonBuilder()
    .setCustomId("ticket_open")
    .setLabel("🎫  Open Ticket")
    .setStyle(ButtonStyle.Primary);
  const row = new ActionRowBuilder().addComponents(openBtn);

  await channel.send({ embeds: [panelEmbed], components: [row] });
  await i.editReply({ content: `✅ Ticket panel sent to <#${channel.id}>.` });
}

// /ticket config — update text without resending panel
async function cmdTicketConfig(i) {
  await i.deferReply({ ephemeral: true });

  const updates = {};
  const title = i.options.getString("title");
  const desc  = i.options.getString("description");
  const intro = i.options.getString("intro");
  const color = i.options.getString("color");

  const cfg = db.prepare("SELECT * FROM ticket_config WHERE guild_id=?").get(String(i.guildId));
  if (!cfg) return i.editReply({ content: "❌ No ticket config found. Run `/ticket setup` first." });

  if (title) db.prepare("UPDATE ticket_config SET panel_title=? WHERE guild_id=?").run(title, String(i.guildId));
  if (desc)  db.prepare("UPDATE ticket_config SET panel_desc=?  WHERE guild_id=?").run(desc,  String(i.guildId));
  if (intro) db.prepare("UPDATE ticket_config SET ticket_intro=? WHERE guild_id=?").run(intro, String(i.guildId));
  if (color) db.prepare("UPDATE ticket_config SET panel_color=? WHERE guild_id=?").run(color.replace("#", ""), String(i.guildId));

  const changed = [title && "title", desc && "description", intro && "intro message", color && "color"]
    .filter(Boolean).join(", ");

  await i.editReply({ embeds: [new EmbedBuilder()
    .setTitle("✅ Ticket Config Updated")
    .setDescription(changed ? `Updated: **${changed}**\nRun \`/ticket setup\` to resend the panel with new text.` : "Nothing changed.")
    .setColor(EMBED_COLOR)] });
}

// Button: open ticket
async function handleTicketOpen(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  const user  = interaction.user;
  const cfg   = db.prepare("SELECT * FROM ticket_config WHERE guild_id=?").get(String(guild.id));

  // Check if user already has an open ticket
  const existing = db.prepare(
    "SELECT * FROM tickets WHERE guild_id=? AND user_id=? AND status='open'"
  ).get(String(guild.id), String(user.id));

  if (existing) {
    return interaction.editReply({ content: `❌ You already have an open ticket: <#${existing.channel_id}>` });
  }

  // Count tickets for numbering
  const count = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE guild_id=?").get(String(guild.id));
  const ticketNum = (count.c || 0) + 1;

  // Permission overwrites
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
    { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
  ];

  if (cfg?.staff_role_id) {
    overwrites.push({
      id: cfg.staff_role_id,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
    });
  }

  const ticketChannel = await guild.channels.create({
    name: `ticket-${String(ticketNum).padStart(4, "0")}`,
    type: ChannelType.GuildText,
    permissionOverwrites: overwrites,
    ...(cfg?.category_id ? { parent: cfg.category_id } : {})
  });

  // Save to DB
  db.prepare(
    "INSERT INTO tickets (guild_id, channel_id, user_id, status, created_at) VALUES (?,?,?,?,?)"
  ).run(String(guild.id), String(ticketChannel.id), String(user.id), "open", nowStr());

  const ticket = db.prepare("SELECT * FROM tickets WHERE channel_id=?").get(String(ticketChannel.id));

  // Build open embed + close button
  const openEmbed = buildTicketOpenEmbed(user, ticketNum, cfg || {
    panel_color: "b000ff",
    ticket_intro: "A staff member will be with you shortly. Please describe your issue in detail."
  }, client.user);

  const closeBtn = new ButtonBuilder()
    .setCustomId("ticket_close")
    .setLabel("🔒  Close Ticket")
    .setStyle(ButtonStyle.Danger);
  const row = new ActionRowBuilder().addComponents(closeBtn);

  await ticketChannel.send({
    content: cfg?.staff_role_id ? `<@&${cfg.staff_role_id}> <@${user.id}>` : `<@${user.id}>`,
    embeds: [openEmbed],
    components: [row]
  });

  // Log if configured
  if (cfg?.log_channel_id) {
    const logCh = guild.channels.cache.get(cfg.log_channel_id);
    if (logCh) await logCh.send({ embeds: [new EmbedBuilder()
      .setTitle("🎫 Ticket Opened")
      .addFields(
        { name: "User",    value: `<@${user.id}>`,        inline: true },
        { name: "Channel", value: `<#${ticketChannel.id}>`, inline: true },
        { name: "Ticket",  value: `#${ticketNum}`,          inline: true }
      )
      .setColor(EMBED_COLOR)
      .setTimestamp()] }).catch(() => {});
  }

  await interaction.editReply({ content: `✅ Your ticket has been created: <#${ticketChannel.id}>` });
}

// Button: close ticket
async function handleTicketClose(interaction) {
  await interaction.deferReply({ ephemeral: false });

  const ticket = db.prepare(
    "SELECT * FROM tickets WHERE channel_id=? AND status='open'"
  ).get(String(interaction.channelId));

  if (!ticket) return interaction.editReply({ content: "❌ This is not an open ticket channel." });

  // Only staff or the ticket owner can close
  const isMod   = hasMod(interaction.member);
  const isOwner = ticket.user_id === String(interaction.user.id);
  if (!isMod && !isOwner) return interaction.editReply({ content: "❌ Only staff or the ticket owner can close this ticket." });

  db.prepare("UPDATE tickets SET status='closed', closed_at=? WHERE channel_id=?")
    .run(nowStr(), String(interaction.channelId));

  const cfg = db.prepare("SELECT * FROM ticket_config WHERE guild_id=?").get(String(interaction.guildId));
  const color = parseInt((cfg?.panel_color || "b000ff"), 16);

  await interaction.editReply({ embeds: [new EmbedBuilder()
    .setTitle("🔒 Ticket Closed")
    .setDescription(`Closed by <@${interaction.user.id}>. This channel will be deleted in 5 seconds.`)
    .setColor(color)
    .setTimestamp()] });

  // Log
  if (cfg?.log_channel_id) {
    const logCh = interaction.guild.channels.cache.get(cfg.log_channel_id);
    if (logCh) await logCh.send({ embeds: [new EmbedBuilder()
      .setTitle("🔒 Ticket Closed")
      .addFields(
        { name: "Closed By", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Ticket Owner", value: `<@${ticket.user_id}>`,  inline: true }
      )
      .setColor(color)
      .setTimestamp()] }).catch(() => {});
  }

  setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
}

// /ticket close (slash)
async function cmdTicketClose(i) {
  return handleTicketClose(i);
}

// /ticket add
async function cmdTicketAdd(i) {
  await i.deferReply({ ephemeral: true });
  const user = i.options.getUser("user");

  const ticket = db.prepare(
    "SELECT * FROM tickets WHERE channel_id=? AND status='open'"
  ).get(String(i.channelId));

  if (!ticket) return i.editReply({ content: "❌ This is not an open ticket channel." });

  await i.channel.permissionOverwrites.create(user.id, {
    ViewChannel: true, SendMessages: true, ReadMessageHistory: true
  });

  await i.channel.send({ embeds: [new EmbedBuilder()
    .setDescription(`➕ <@${user.id}> has been added to this ticket by <@${i.user.id}>.`)
    .setColor(EMBED_COLOR)] });

  await i.editReply({ content: `✅ Added <@${user.id}> to the ticket.` });
}

// /ticket remove
async function cmdTicketRemove(i) {
  await i.deferReply({ ephemeral: true });
  const user = i.options.getUser("user");

  const ticket = db.prepare(
    "SELECT * FROM tickets WHERE channel_id=? AND status='open'"
  ).get(String(i.channelId));

  if (!ticket) return i.editReply({ content: "❌ This is not an open ticket channel." });
  if (ticket.user_id === String(user.id)) return i.editReply({ content: "❌ Cannot remove the ticket owner." });

  await i.channel.permissionOverwrites.create(user.id, { ViewChannel: false });

  await i.channel.send({ embeds: [new EmbedBuilder()
    .setDescription(`➖ <@${user.id}> has been removed from this ticket by <@${i.user.id}>.`)
    .setColor(0xff6600)] });

  await i.editReply({ content: `✅ Removed <@${user.id}> from the ticket.` });
}

// ══════════════════════════════════════════════
//  @here / @everyone PING MONITORING
// ══════════════════════════════════════════════
client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;

  const hasHere     = message.content.includes("@here");
  const hasEveryone = message.content.includes("@everyone");
  if (!hasHere && !hasEveryone) return;

  const slot = db.prepare(
    "SELECT * FROM slots WHERE guild_id=? AND user_id=? AND status='active'"
  ).get(String(message.guild.id), String(message.author.id));

  if (!slot) return;

  const newHere     = slot.here_pings     + (hasHere     ? 1 : 0);
  const newEveryone = slot.everyone_pings + (hasEveryone ? 1 : 0);

  db.prepare("UPDATE slots SET here_pings=?, everyone_pings=? WHERE id=?")
    .run(newHere, newEveryone, slot.id);

  if (!hasHere) return;

  if (newHere > MAX_HERE) {
    db.prepare("UPDATE slots SET status='held', held_at=? WHERE id=?").run(nowStr(), slot.id);
    logAction(slot.id, "auto_hold", client.user.id, `Exceeded @here limit (${newHere}/${MAX_HERE})`);

    await message.channel.send({ embeds: [new EmbedBuilder()
      .setTitle("🔴 Slot Auto-Held — Ping Limit Exceeded")
      .setDescription(
        `<@${message.author.id}> your slot has been **automatically held** for exceeding the @here limit of **${MAX_HERE}**.\n\nContact a staff member to release your slot.`
      )
      .setColor(0xff0000)
      .setFooter({ text: "Smuggler Slots • Professional Slot Management" })] });

    try {
      await message.author.send({ embeds: [new EmbedBuilder()
        .setTitle("🔴 Your Slot Has Been Auto-Held")
        .setDescription(`You exceeded the @here limit in **${message.guild.name}**. Contact staff to release it.`)
        .setColor(0xff0000)] });
    } catch {}

  } else {
    await message.channel.send(`• ${newHere}/${MAX_HERE} @here | ${PING_SUFFIX}`);

    if (newHere === MAX_HERE) {
      await message.channel.send({ embeds: [new EmbedBuilder()
        .setTitle("⚠️ Final @here Ping Used")
        .setDescription(
          `<@${message.author.id}> you have used all **${MAX_HERE}** @here pings.\nAny further @here pings will **automatically hold** your slot.`
        )
        .setColor(0xffcc00)
        .setFooter({ text: "Smuggler Slots • Professional Slot Management" })] });
    }
  }
});

// ══════════════════════════════════════════════
//  TIMER EXPIRY
// ══════════════════════════════════════════════
async function checkExpiredSlots() {
  const expired = db.prepare(
    "SELECT * FROM slots WHERE status='active' AND expires_at IS NOT NULL AND expires_at <= ?"
  ).all(nowStr());

  for (const slot of expired) {
    db.prepare("UPDATE slots SET status='revoked' WHERE id=?").run(slot.id);
    logAction(slot.id, "timer_expired", client.user.id, "Slot timer expired");

    const guild = client.guilds.cache.get(slot.guild_id);
    if (!guild) continue;
    try {
      const member = await guild.members.fetch(slot.user_id);
      await member.send({ embeds: [new EmbedBuilder()
        .setTitle("⏰ Slot Expired")
        .setDescription(`Your slot in **${guild.name}** has expired and been removed.`)
        .setColor(0x555555)] });
    } catch {}

    console.log(`Slot #${slot.id} expired for user ${slot.user_id}`);
  }
}

// ══════════════════════════════════════════════
//  START
// ══════════════════════════════════════════════
if (!TOKEN || TOKEN === "PASTE_YOUR_BOT_TOKEN_HERE") {
  console.error("❌ ERROR: Set DISCORD_TOKEN before running.");
  process.exit(1);
}

client.login(TOKEN).catch(err => {
  console.error("❌ Login failed:", err.message);
  process.exit(1);
});
