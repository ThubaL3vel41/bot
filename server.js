const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const {
  Client,
  GatewayIntentBits,
  Partials,
  Events
} = require("discord.js");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const CONFIG = {
  /*
    Podes poner los datos aca para no usar Environment en Render.
    Ojo: no subas este archivo publico si tiene tokens/webhooks reales.
  */
  DISCORD_BOT_TOKEN: "",
  DISCORD_MENSAJES_CHANNEL_ID: "1529524552663564420",
  DISCORD_REPLAYS_WEBHOOK: "https://discord.com/api/webhooks/1487173680776609943/Nn-RSR5UySsD-3LUPt3tnNXSTLHZVctB5DqQyWNU8Fsz2KW5PdtvXijB3Rn44d93l3cz",
  DISCORD_CALLADMIN_WEBHOOK: "https://discord.com/api/webhooks/1505733610743926915/5P7G9WXoSy9W7DQe0159TBSdvQVk3KBewOE23AOHMCsVTp6bWC2149r9jh_yG7cQpFKD",
  DISCORD_CALLADMIN_ROLE_ID: "1505758592366674022",
  DISCORD_BOLETERIA_WEBHOOK: "https://discord.com/api/webhooks/1487173904123298015/JSsluyv8440xHDPsdItT3Gotn8771scTWrCOkOgr72fKYPyb9jV7DkJYhnsagraMgcsV",
  DISCORD_BOLETERIA_PRIV_WEBHOOK: "https://discord.com/api/webhooks/1529525347157278800/1EIyl1Q7b48jo812mFPXvRGqgOvQNe1PJwxlMN0W-bpRrmuB54OvTY2WBORm6kFyw340",
  DISCORD_STAFF_WEBHOOK: "https://discord.com/api/webhooks/1489611409322151966/fPjw3h1ZWBI8AeUB4oBv7G25qQZvonHgcGB1WUHWjLvYxfEvjbSx1k9ThJouAuvBpEAf",
  DISCORD_BOLETERIA_CHANNEL_ID: "1475337837569114297",
  DISCORD_BOLETERIA_PRIV_CHANNEL_ID: "1529525242110939307",
  DISCORD_STAFF_CHANNEL_ID: "1489611366795972798",
  DISCORD_OFICIAL: "https://discord.gg/jUFQbj58UW"
};

function config(name) {
  return CONFIG[name] || process.env[name] || "";
}

const PORT = process.env.PORT || 3000;
const DISCORD_OFICIAL = config("DISCORD_OFICIAL");

const botToken = config("DISCORD_BOT_TOKEN");
const mensajesChannelId = config("DISCORD_MENSAJES_CHANNEL_ID");
const boleteriaChannelId = config("DISCORD_BOLETERIA_CHANNEL_ID");
const boleteriaPrivChannelId = config("DISCORD_BOLETERIA_PRIV_CHANNEL_ID");
const staffChannelId = config("DISCORD_STAFF_CHANNEL_ID");
const replaysWebhook = config("DISCORD_REPLAYS_WEBHOOK");
const callAdminWebhook = config("DISCORD_CALLADMIN_WEBHOOK");
const callAdminRoleId = config("DISCORD_CALLADMIN_ROLE_ID");
const boleteriaWebhook = config("DISCORD_BOLETERIA_WEBHOOK");
const boleteriaPrivWebhook = config("DISCORD_BOLETERIA_PRIV_WEBHOOK");
const staffWebhook = config("DISCORD_STAFF_WEBHOOK");

const discordQueue = [];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

function clean(text) {
  return String(text || "")
    .replace(/@/g, "(at)")
    .replace(/https?:\/\/discord\.gg\/[^\s]+/gi, DISCORD_OFICIAL)
    .slice(0, 1800);
}

function minutesText(minutes) {
  if (!minutes) return "0 minutos";
  return minutes === 1 ? "1 minuto" : minutes + " minutos";
}

async function sendChannel(channelId, content) {
  if (!channelId || !client.isReady()) return false;
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.send) return false;
    await channel.send(clean(content));
    return true;
  } catch (err) {
    console.log("sendChannel error:", err.message);
    return false;
  }
}

async function sendChannelEmbed(channelId, embed) {
  if (!channelId || !client.isReady()) return false;
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.send) return false;
    await channel.send({ embeds: [embed] });
    return true;
  } catch (err) {
    console.log("sendChannelEmbed error:", err.message);
    return false;
  }
}

async function sendWebhook(webhookUrl, content, allowedMentions = { parse: [] }) {
  if (!webhookUrl) return false;
  try {
    await axios.post(webhookUrl, { content, allowed_mentions: allowedMentions });
    return true;
  } catch (err) {
    console.log("sendWebhook error:", err.message);
    return false;
  }
}

async function sendWebhookEmbed(webhookUrl, embed) {
  if (!webhookUrl) return false;
  try {
    await axios.post(webhookUrl, { embeds: [embed], allowed_mentions: { parse: [] } });
    return true;
  } catch (err) {
    console.log("sendWebhookEmbed error:", err.message);
    return false;
  }
}

async function sendEmbed(webhookUrl, channelId, embed) {
  if (webhookUrl) return sendWebhookEmbed(webhookUrl, embed);
  return sendChannelEmbed(channelId, embed);
}

async function sendWebhookFile(webhookUrl, buffer, filename, content) {
  if (!webhookUrl) return false;
  try {
    const form = new FormData();
    form.append("content", clean(content));
    form.append("file", buffer, filename);
    await axios.post(webhookUrl, form, { headers: form.getHeaders() });
    return true;
  } catch (err) {
    console.log("sendWebhookFile error:", err.message);
    return false;
  }
}

client.once(Events.ClientReady, bot => {
  console.log("Bot online como " + bot.user.tag);
});

client.on(Events.MessageCreate, message => {
  if (message.author.bot) return;
  if (!mensajesChannelId || message.channel.id !== mensajesChannelId) return;

  discordQueue.push({
    name: message.member && message.member.displayName ? message.member.displayName : message.author.username,
    message: message.content
  });

  if (discordQueue.length > 30) discordQueue.shift();
});

app.get("/", (req, res) => {
  res.json({
    ok: true,
    bot: client.isReady() ? "online" : "offline",
    routes: [
      "/discordMessages",
      "/uploadReplay",
      "/calladmin",
      "/boleteria",
      "/staffEvent",
      "/hostMessage"
    ]
  });
});

app.get("/discordMessages", (req, res) => {
  const messages = discordQueue.splice(0, discordQueue.length);
  res.json({ messages });
});

app.post("/uploadReplay", upload.single("file"), async (req, res) => {
  const file = req.file;
  const stats = req.body.stats || "Partida finalizada.";

  if (!file) {
    res.status(400).json({ ok: false, error: "Falta archivo replay" });
    return;
  }

  await sendWebhookFile(
    replaysWebhook,
    file.buffer,
    file.originalname || "replay.hbr2",
    stats
  );

  res.json({ ok: true });
});

app.get("/calladmin", async (req, res) => {
  const player = clean(req.query.player || "Jugador");
  const razon = clean(req.query.razon || "Sin razon");
  const mention = callAdminRoleId ? "<@&" + callAdminRoleId + "> " : "";
  const ok = await sendWebhook(
    callAdminWebhook,
    mention + "**" + player + "** ha llamado a los administradores.\nRazon: " + razon,
    callAdminRoleId ? { parse: [], roles: [callAdminRoleId] } : { parse: [] }
  );
  res.json({ ok, hasWebhook: !!callAdminWebhook, hasRole: !!callAdminRoleId });
});

app.post("/boleteria", async (req, res) => {
  const isLeave = req.body.action === "leave";
  const player = clean(req.body.player || "Jugador");
  const id = clean(req.body.id || "?");
  const auth = clean(req.body.auth || "NO_AUTH");
  const players = clean(req.body.players || "?");
  const maxPlayers = clean(req.body.maxPlayers || "25");
  const now = new Date();
  const time = now.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

  const publicEmbed = {
    color: isLeave ? 0xFF5555 : 0x57F287,
    title: isLeave ? "Jugador Salio" : "Jugador Entro",
    description: "**" + player + "** " + (isLeave ? "ha salido de la sala." : "se ha unido a la sala."),
    fields: [
      { name: "ID", value: String(id), inline: true },
      { name: "Jugadores en la sala", value: players + "/" + maxPlayers, inline: true }
    ],
    footer: { text: "By Juanpi_torico - " + time }
  };

  const privateEmbed = {
    ...publicEmbed,
    fields: [
      ...publicEmbed.fields,
      { name: "Auth", value: "```" + auth + "```", inline: false }
    ]
  };

  const okPublic = await sendEmbed(boleteriaWebhook, boleteriaChannelId, publicEmbed);
  const okPrivate = await sendEmbed(boleteriaPrivWebhook, boleteriaPrivChannelId, privateEmbed);

  res.json({ ok: okPublic && okPrivate, public: okPublic, private: okPrivate });
});

app.post("/staffEvent", async (req, res) => {
  const isLeave = req.body.action === "leave";
  const player = clean(req.body.player || "Staff");
  const auth = clean(req.body.auth || "NO_AUTH");
  const session = req.body.sessionMinutes ? minutesText(req.body.sessionMinutes) : "0 minutos";
  const now = new Date();
  const time = now.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

  const ok = await sendEmbed(staffWebhook, staffChannelId, {
    color: isLeave ? 0xFF5555 : 0xB066FF,
    title: isLeave ? "Staff Salio" : "Staff Entro",
    description: "**" + player + "** " + (isLeave ? "ha salido del host." : "ha entrado al host."),
    fields: [
      { name: "Auth", value: "```" + auth + "```", inline: false },
      { name: "Tiempo de sesion", value: isLeave ? session : "Sesion iniciada", inline: true }
    ],
    footer: { text: "By Juanpi_torico - " + time }
  });

  res.json({ ok });
});

app.post("/hostMessage", async (req, res) => {
  const player = clean(req.body.player || "Jugador");
  const message = clean(req.body.message || "");
  await sendChannel(mensajesChannelId, player + ": " + message);
  res.json({ ok: true });
});

[
  "goal",
  "assist",
  "win",
  "loss",
  "ban",
  "unban",
  "clearbans",
  "mute",
  "unmute",
  "warn",
  "blacklist",
  "unblacklist"
].forEach(route => {
  app.post("/" + route, async (req, res) => {
    console.log(route, req.body || {});
    res.json({ ok: true });
  });
});

app.listen(PORT, () => {
  console.log("Servidor escuchando en puerto " + PORT);
});

if (botToken) {
  client.login(botToken).catch(err => {
    console.log("No pude iniciar el bot:", err.message);
  });
} else {
  console.log("DISCORD_BOT_TOKEN no configurado. El servidor arranca, pero el bot queda offline.");
}
