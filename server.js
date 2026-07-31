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
  DISCORD_BOT_TOKEN: "",
  DISCORD_MENSAJES_CHANNEL_ID: "",
  DISCORD_REPLAYS_WEBHOOK: "",
  DISCORD_CALLADMIN_WEBHOOK: "",
  DISCORD_BOLETERIA_CHANNEL_ID: "",
  DISCORD_BOLETERIA_PRIV_CHANNEL_ID: "",
  DISCORD_STAFF_CHANNEL_ID: "",
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

async function sendWebhook(webhookUrl, content) {
  if (!webhookUrl) return false;
  try {
    await axios.post(webhookUrl, { content: clean(content) });
    return true;
  } catch (err) {
    console.log("sendWebhook error:", err.message);
    return false;
  }
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
  await sendWebhook(callAdminWebhook, "**" + player + "** ha llamado a los administradores.\nRazon: " + razon);
  res.json({ ok: true });
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
    footer: { text: "By Tsq - " + time }
  };

  const privateEmbed = {
    ...publicEmbed,
    fields: [
      ...publicEmbed.fields,
      { name: "Auth", value: "```" + auth + "```", inline: false }
    ]
  };

  await sendChannelEmbed(boleteriaChannelId, publicEmbed);
  await sendChannelEmbed(boleteriaPrivChannelId, privateEmbed);

  res.json({ ok: true });
});

app.post("/staffEvent", async (req, res) => {
  const isLeave = req.body.action === "leave";
  const player = clean(req.body.player || "Staff");
  const auth = clean(req.body.auth || "NO_AUTH");
  const session = req.body.sessionMinutes ? minutesText(req.body.sessionMinutes) : "0 minutos";
  const now = new Date();
  const time = now.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

  await sendChannelEmbed(staffChannelId, {
    color: isLeave ? 0xFF5555 : 0xB066FF,
    title: isLeave ? "Staff Salio" : "Staff Entro",
    description: "**" + player + "** " + (isLeave ? "ha salido del host." : "ha entrado al host."),
    fields: [
      { name: "Auth", value: "```" + auth + "```", inline: false },
      { name: "Tiempo de sesion", value: isLeave ? session : "Sesion iniciada", inline: true }
    ],
    footer: { text: "By Tsq - " + time }
  });

  res.json({ ok: true });
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
