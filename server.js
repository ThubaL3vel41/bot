const express = require("express");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const cors = require("cors");

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

function horaAR() {
  return new Date().toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires"
  });
}

function limpiarDiscord(texto) {
  return String(texto || "")
    .replace(/@/g, "(at)")
    .slice(0, 1800);
}

/* ================= CONFIG ================= */

const PORT = process.env.PORT || 3000;

const REPLAYS_WEBHOOK_URL = "https://discord.com/api/webhooks/1487173680776609943/Nn-RSR5UySsD-3LUPt3tnNXSTLHZVctB5DqQyWNU8Fsz2KW5PdtvXijB3Rn44d93l3cz";
const CALLADMIN_WEBHOOK_URL = "https://discord.com/api/webhooks/1505733610743926915/5P7G9WXoSy9W7DQe0159TBSdvQVk3KBewOE23AOHMCsVTp6bWC2149r9jh_yG7cQpFKD";
const BOLETERIA_WEBHOOK_URL = "https://discord.com/api/webhooks/1487173904123298015/JSsluyv8440xHDPsdItT3Gotn8771scTWrCOkOgr72fKYPyb9jV7DkJYhnsagraMgcsV";
const BOLETERIA_PRIV_WEBHOOK_URL = "https://discord.com/api/webhooks/1529525347157278800/1EIyl1Q7b48jo812mFPXvRGqgOvQNe1PJwxlMN0W-bpRrmuB54OvTY2WBORm6kFyw340";
const STAFF_WEBHOOK_URL = "https://discord.com/api/webhooks/1489611409322151966/fPjw3h1ZWBI8AeUB4oBv7G25qQZvonHgcGB1WUHWjLvYxfEvjbSx1k9ThJouAuvBpEAf";
const MENSAJES_WEBHOOK_URL = "https://discord.com/api/webhooks/1529524721027252334/WqP61RUqT0WLamuofQw05TNB4ZsukqzpBH8pGGq4lR8XhuzA4tYtCgf34YwuFpKZh2CS";

const ADMIN_ROLE_ID = "1505758592366674022";

/*
Para mandar mensajes desde Discord al host necesitás bot.
En Render agregá estas variables:
DISCORD_BOT_TOKEN=token_del_bot
DISCORD_MENSAJES_CHANNEL_ID=id_del_canal_mensajes
*/

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || "";
const DISCORD_MENSAJES_CHANNEL_ID = process.env.DISCORD_MENSAJES_CHANNEL_ID || "1529524552663564420";

let discordQueue = [];

/* ================= DB ================= */

let database = {
  bans: {},
  mutes: {},
  warns: {},
  stats: {},
  blacklist: {}
};

if (fs.existsSync("./database.json")) {
  try {
    database = JSON.parse(fs.readFileSync("./database.json", "utf8"));
  } catch (e) {
    console.log("No se pudo leer database.json");
  }
}

function guardarDB() {
  fs.writeFileSync("./database.json", JSON.stringify(database, null, 2));
}

function ensureStats(player) {
  if (!database.stats[player]) {
    database.stats[player] = {
      goles: 0,
      asistencias: 0,
      victorias: 0,
      derrotas: 0
    };
  }
}

/* ================= HOME ================= */

app.get("/", (req, res) => {
  res.send("Servidor JT funcionando");
});

/* ================= STATS ================= */

app.post("/goal", (req, res) => {
  const { player } = req.body;
  ensureStats(player);
  database.stats[player].goles++;
  guardarDB();
  res.json({ ok: true });
});

app.post("/assist", (req, res) => {
  const { player } = req.body;
  ensureStats(player);
  database.stats[player].asistencias++;
  guardarDB();
  res.json({ ok: true });
});

app.post("/win", (req, res) => {
  const { player } = req.body;
  ensureStats(player);
  database.stats[player].victorias++;
  guardarDB();
  res.json({ ok: true });
});

app.post("/loss", (req, res) => {
  const { player } = req.body;
  ensureStats(player);
  database.stats[player].derrotas++;
  guardarDB();
  res.json({ ok: true });
});

app.get("/stats/:player", (req, res) => {
  const player = req.params.player;
  ensureStats(player);
  res.json(database.stats[player]);
});

/* ================= BANS / MUTES / WARNS ================= */

app.post("/ban", (req, res) => {
  const { key, hours, reason } = req.body;

  database.bans[key] = {
    until: Date.now() + Number(hours || 24) * 3600000,
    reason: reason || "Sin razon"
  };

  guardarDB();
  res.json({ ok: true });
});

app.get("/checkban/:key", (req, res) => {
  const key = req.params.key;
  const ban = database.bans[key];

  if (!ban) return res.json({ banned: false });

  if (Date.now() >= ban.until) {
    delete database.bans[key];
    guardarDB();
    return res.json({ banned: false });
  }

  res.json({ banned: true, reason: ban.reason, until: ban.until });
});

app.post("/unban", (req, res) => {
  const { key } = req.body;
  delete database.bans[key];
  guardarDB();
  res.json({ ok: true });
});

app.post("/clearbans", (req, res) => {
  database.bans = {};
  guardarDB();
  res.json({ ok: true });
});

app.post("/mute", (req, res) => {
  const { key, minutes, reason } = req.body;

  database.mutes[key] = {
    until: Date.now() + Number(minutes || 1) * 60000,
    reason: reason || "Sin razon"
  };

  guardarDB();
  res.json({ ok: true });
});

app.get("/checkmute/:key", (req, res) => {
  const key = req.params.key;
  const mute = database.mutes[key];

  if (!mute) return res.json({ muted: false });

  if (Date.now() >= mute.until) {
    delete database.mutes[key];
    guardarDB();
    return res.json({ muted: false });
  }

  res.json({ muted: true, reason: mute.reason, until: mute.until });
});

app.post("/unmute", (req, res) => {
  const { key } = req.body;
  delete database.mutes[key];
  guardarDB();
  res.json({ ok: true });
});

app.post("/warn", (req, res) => {
  const { key, reason } = req.body;

  if (!database.warns[key]) {
    database.warns[key] = {
      count: 0,
      reasons: []
    };
  }

  database.warns[key].count++;
  database.warns[key].reasons.push(reason || "Sin razon");

  guardarDB();

  res.json({
    ok: true,
    count: database.warns[key].count
  });
});

app.get("/warns/:key", (req, res) => {
  const key = req.params.key;

  res.json(database.warns[key] || {
    count: 0,
    reasons: []
  });
});

/* ================= BLACKLIST ================= */

app.post("/blacklist", (req, res) => {
  const { auth, reason } = req.body;

  database.blacklist[auth] = {
    reason: reason || "Lista negra",
    date: Date.now()
  };

  guardarDB();
  res.json({ ok: true });
});

app.get("/checkblacklist/:auth", (req, res) => {
  const auth = req.params.auth;
  res.json({
    blacklisted: !!database.blacklist[auth],
    data: database.blacklist[auth] || null
  });
});

/* ================= REPLAYS ================= */

app.post("/uploadReplay", upload.single("file"), async (req, res) => {
  try {
    const form = new FormData();

    form.append(
      "file",
      fs.createReadStream(req.file.path),
      req.file.originalname
    );

    form.append(
      "content",
      req.body?.stats || "Nueva replay subida automaticamente"
    );

    await axios.post(REPLAYS_WEBHOOK_URL, form, {
      headers: form.getHeaders()
    });

    fs.unlinkSync(req.file.path);
    res.send("OK");
  } catch (err) {
    console.log(err);
    res.status(500).send("ERROR");
  }
});

/* ================= LLAMAR ADMIN ================= */

app.get("/calladmin", async (req, res) => {
  const player = req.query.player || "Sin nombre";
  const razon = req.query.razon || "Sin razon";

  try {
    await axios.post(CALLADMIN_WEBHOOK_URL, {
      content:
        `<@&${ADMIN_ROLE_ID}>\n\n` +
        `🚨 ${player} ha llamado a los administradores.\n\n` +
        `👤 Jugador: ${player}\n` +
        `📝 Razon: ${razon}`
    });

    res.send("ok");
  } catch (err) {
    console.log(err);
    res.status(500).send("error");
  }
});

/* ================= BOLETERIA GENERAL ================= */

app.post("/boleteria", async (req, res) => {
  const { action, player, id, auth, players, maxPlayers } = req.body;
  const entrada = action === "join";

  const embedPublico = {
    color: entrada ? 0x57F287 : 0xFF5555,
    title: entrada ? "📥 Jugador Entró" : "📤 Jugador Salió",
    description: `**${limpiarDiscord(player || "Sin nombre")}** ${entrada ? "se ha unido a la sala." : "ha salido de la sala."}`,
    fields: [
      {
        name: "🆔 ID",
        value: String(id || "?"),
        inline: true
      },
      {
        name: "👥 Jugadores en la sala",
        value: `${players || "?"}/${maxPlayers || "25"}`,
        inline: true
      }
    ],
    footer: {
      text: `By Juanpi_torico - ${horaAR()}`
    }
  };

  const embedPrivado = {
    ...embedPublico,
    fields: [
      ...embedPublico.fields,
      {
        name: "🔐 Auth",
        value: "```" + limpiarDiscord(auth || "Sin auth") + "```",
        inline: false
      }
    ]
  };

  try {
    await axios.post(BOLETERIA_WEBHOOK_URL, {
      embeds: [embedPublico]
    });

    await axios.post(BOLETERIA_PRIV_WEBHOOK_URL, {
      embeds: [embedPrivado]
    });

    res.json({ ok: true });
  } catch (err) {
    console.log(err);
    res.status(500).json({ ok: false });
  }
});

/* ================= BOLETERIA STAFF ================= */

app.post("/staffEvent", async (req, res) => {
  const { action, player, auth, sessionMinutes } = req.body;
  const entrada = action === "join";

  const embedStaff = {
    color: entrada ? 0xB066FF : 0xFF5555,
    title: entrada ? "🟣 Staff Entró" : "🔴 Staff Salió",
    description: `**${limpiarDiscord(player || "Sin nombre")}** ${entrada ? "ha entrado al host." : "ha salido del host."}`,
    fields: [
      {
        name: "🔐 Auth",
        value: "```" + limpiarDiscord(auth || "Sin auth") + "```",
        inline: false
      },
      {
        name: "⏱️ Tiempo de sesión",
        value: entrada ? "Sesión iniciada" : `${sessionMinutes || 0} minutos`,
        inline: true
      }
    ],
    footer: {
      text: `By Juanpi_torico - ${horaAR()}`
    }
  };

  try {
    await axios.post(STAFF_WEBHOOK_URL, {
      embeds: [embedStaff]
    });

    res.json({ ok: true });
  } catch (err) {
    console.log(err);
    res.status(500).json({ ok: false });
  }
});

/* ================= MENSAJES HOST -> DISCORD ================= */

app.post("/hostMessage", async (req, res) => {
  const { player, id, auth, message } = req.body;

  try {
    await axios.post(MENSAJES_WEBHOOK_URL, {
      content:
        `💬 [${id || "?"}] ${player || "Sin nombre"}:\n` +
        `${message || ""}\n\n` +
        `Auth: ${auth || "Sin auth"}`
    });

    res.json({ ok: true });
  } catch (err) {
    console.log(err);
    res.status(500).json({ ok: false });
  }
});

/* ================= MENSAJES DISCORD -> HOST ================= */

app.get("/discordMessages", (req, res) => {
  const messages = [...discordQueue];
  discordQueue = [];
  res.json({ ok: true, messages });
});

/*
Bot opcional para leer el canal "mensajes".
Instalá discord.js en Render:
npm install discord.js
*/

if (DISCORD_BOT_TOKEN && DISCORD_MENSAJES_CHANNEL_ID) {
  try {
    const { Client, GatewayIntentBits } = require("discord.js");

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });

    client.on("messageCreate", msg => {
      if (msg.author.bot) return;
      if (msg.channel.id !== DISCORD_MENSAJES_CHANNEL_ID) return;

      discordQueue.push({
        name: msg.author.username,
        message: msg.content
      });
    });

    client.login(DISCORD_BOT_TOKEN);
    console.log("Bot de mensajes conectado");
  } catch (err) {
    console.log("No se pudo iniciar discord.js", err);
  }
}

/* ================= SERVER ================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log("Servidor funcionando en puerto " + PORT);
});