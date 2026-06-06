import fs from "fs";

const games = new Map();
const DB_FILE = "./game-data.json";

// ---------------- DB ----------------
function loadDB() {
  if (!fs.existsSync(DB_FILE)) return {};
  return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

let db = loadDB();

// ---------------- SETTINGS ----------------
const levels = [
  { time: 45000, points: 1 },
  { time: 40000, points: 2 },
  { time: 35000, points: 3 },
  { time: 30000, points: 4 },
  { time: 25000, points: 5 },
  { time: 20000, points: 6 },
  { time: 15000, points: 7 }
];

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// ---------------- UTILS ----------------
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randLetter = () => rand(letters.split(""));
const randLength = () => Math.floor(Math.random() * 4) + 5;

// mot très basique anti spam (peut être amélioré avec API)
function isValidWord(word, letter, length) {
  return (
    typeof word === "string" &&
    word.length === length &&
    word[0] === letter.toLowerCase()
  );
}

// ---------------- MAIN COMMAND ----------------
export default {
  name: "game",
  description: "Jeu de mots PRO",

  async execute(sock, message) {
    const { from, sender, body } = message;

    const game = games.get(from);

    // ---------------- START GAME ----------------
    if (body === ".game") {
      if (games.has(from)) {
        return sock.sendMessage(from, {
          text: "⚠️ Une partie est déjà en cours."
        });
      }

      games.set(from, {
        players: [],
        started: false,
        level: 0,
        answers: new Set(),
        letter: null,
        length: null,
        timer: null
      });

      await sock.sendMessage(from, {
        text:
          "🎮 *GAME START*\n\n" +
          "Écrivez *join* pour participer.\n👥 Max 8 joueurs.\n⏳ 30 secondes."
      });

      setTimeout(() => startGame(sock, from), 30000);
    }

    if (!game) return;

    // ---------------- JOIN ----------------
    if (body?.toLowerCase() === "join" && !game.started) {
      if (game.players.length >= 8) {
        return sock.sendMessage(from, {
          text: "❌ 8 joueurs maximum atteints."
        });
      }

      if (!game.players.includes(sender)) {
        game.players.push(sender);

        await sock.sendMessage(from, {
          text: `✅ @${sender.split("@")[0]} rejoint (${game.players.length}/8)`,
          mentions: [sender]
        });
      }
    }

    // ---------------- ANSWER ----------------
    if (game.started) {
      const answer = body?.toLowerCase();

      if (!answer) return;

      if (game.answers.has(sender)) return; // anti double réponse

      if (isValidWord(answer, game.letter, game.length)) {
        game.answers.add(sender);

        const player = game.players.find(p => p.id === sender);

        if (player) {
          player.points += levels[game.level].points;

          db[sender] = (db[sender] || 0) + levels[game.level].points;
          saveDB(db);
        }

        await sock.sendMessage(from, {
          text: `🏆 @${sender.split("@")[0]} +${levels[game.level].points} pts`,
          mentions: [sender]
        });

        clearTimeout(game.timer);
        nextRound(sock, from);
      }
    }
  }
};

// ---------------- ENGINE ----------------
async function startGame(sock, from) {
  const game = games.get(from);
  if (!game) return;

  if (game.players.length < 2) {
    games.delete(from);
    return sock.sendMessage(from, {
      text: "❌ Pas assez de joueurs."
    });
  }

  game.started = true;

  game.players = game.players.map(id => ({
    id,
    points: 0,
    alive: true
  }));

  await sock.sendMessage(from, {
    text: "🚀 Partie lancée !"
  });

  nextRound(sock, from);
}

async function nextRound(sock, from) {
  const game = games.get(from);
  if (!game) return;

  const alive = game.players.filter(p => p.alive);

  if (alive.length <= 1) {
    const winner = alive[0];

    await showLeaderboard(sock, from, winner);
    games.delete(from);
    return;
  }

  if (game.level >= levels.length) game.level = levels.length - 1;

  const level = levels[game.level];

  game.letter = randLetter();
  game.length = randLength();
  game.answers = new Set();

  await sock.sendMessage(from, {
    text:
      `🧩 *NIVEAU ${game.level + 1}*\n` +
      `🔤 Lettre : *${game.letter}*\n` +
      `📏 ${game.length} lettres\n` +
      `⏳ ${level.time / 1000}s`
  });

  game.timer = setTimeout(async () => {
    const losers = game.players.filter(p => !game.answers.has(p.id));

    losers.forEach(p => (p.alive = false));

    await sock.sendMessage(from, {
      text:
        `⏰ Temps écoulé !\n\n❌ Éliminés : ` +
        losers.map(p => "@" + p.id.split("@")[0]).join(", "),
      mentions: losers.map(p => p.id)
    });

    game.level++;
    nextRound(sock, from);
  }, level.time);
}

// ---------------- LEADERBOARD ----------------
async function showLeaderboard(sock, from, winner) {
  let sorted = Object.entries(db)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  let text =
    `🎉 *FIN DU JEU*\n\n` +
    `👑 Winner : @${winner.id.split("@")[0]}\n\n` +
    `🏆 *TOP GLOBAL*\n`;

  sorted.forEach(([id, pts], i) => {
    text += `\n${i + 1}. @${id.split("@")[0]} ➜ ${pts} pts`;
  });

  await sock.sendMessage(from, {
    text,
    mentions: [winner.id, ...sorted.map(x => x[0])]
  });
}
