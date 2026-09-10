import { pb } from "./pocketbase.js";

const app = document.getElementById("app");
let stopPlayersSubscription = null;
let joinedGame = null;

renderJoinForm();

function renderJoinForm(error = "") {
  app.innerHTML = `
    <a href="/">&larr; На главную</a>
    <div class="card play-card">
      <p class="eyebrow">Вход в игру</p>
      <h1>Присоединиться</h1>
      <label for="game-code">Код игры</label>
      <input type="text" id="game-code" maxlength="6" autocomplete="off" autocapitalize="characters" placeholder="Например, K7M2QX" />
      <label for="nickname">Твоё имя</label>
      <input type="text" id="nickname" maxlength="20" autocomplete="nickname" placeholder="Например, Маша" />
      <div id="error">${escapeHtml(error)}</div>
      <button class="btn" id="join-game">Войти в лобби</button>
    </div>
  `;

  document.getElementById("game-code").addEventListener("input", (event) => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });
  document.getElementById("join-game").addEventListener("click", joinGame);
}

async function joinGame() {
  const codeInput = document.getElementById("game-code");
  const nicknameInput = document.getElementById("nickname");
  const errorEl = document.getElementById("error");
  const code = codeInput.value.trim().toUpperCase();
  const nickname = nicknameInput.value.trim();

  errorEl.textContent = "";
  if (code.length !== 6) {
    errorEl.textContent = "Введите 6-значный код игры.";
    return;
  }
  if (!nickname) {
    errorEl.textContent = "Введите имя.";
    return;
  }

  const button = document.getElementById("join-game");
  button.disabled = true;
  try {
    const game = await pb.collection("games").getFirstListItem(`code = "${code}"`);
    if (game.status !== "lobby") {
      errorEl.textContent = "Эта игра уже началась или завершена.";
      return;
    }
    const player = await pb.collection("players").create({ game: game.id, nickname });
    joinedGame = { game, player };
    await renderLobby();
  } catch (error) {
    errorEl.textContent = describeError(error);
  } finally {
    button.disabled = false;
  }
}

async function renderLobby() {
  const { game, player } = joinedGame;
  if (stopPlayersSubscription) stopPlayersSubscription();
  app.innerHTML = `
    <div class="card play-card">
      <p class="eyebrow">Лобби</p>
      <h1>Ты в игре</h1>
      <p>Код игры: <strong class="inline-code">${escapeHtml(game.code)}</strong></p>
      <p id="lobby-status">Ждём ведущего…</p>
    </div>
    <div class="card">
      <h2>Игроки <span id="player-count">0</span></h2>
      <div id="player-list">Загрузка…</div>
    </div>
  `;

  const refreshPlayers = async () => {
    const players = await pb.collection("players").getFullList({ filter: `game = "${game.id}"` });
    const list = document.getElementById("player-list");
    const count = document.getElementById("player-count");
    if (!list || !count) return;
    count.textContent = players.length;
    list.innerHTML = players.length
      ? players.map((item) => `<div class="player-row"><strong>${escapeHtml(item.nickname)}</strong>${item.id === player.id ? " <span class=\"badge\">это ты</span>" : ""}</div>`).join("")
      : "Пока никто не присоединился.";
  };

  await refreshPlayers();
  stopPlayersSubscription = await pb.collection("players").subscribe("*", (event) => {
    if (event.record.game === game.id) refreshPlayers();
  });
}

function describeError(error) {
  const response = error?.response;
  const fieldErrors = response?.data
    ? Object.entries(response.data).map(([field, details]) => `${field}: ${details?.message || details}`).join(" ")
    : "";
  if (response?.status === 404) return "Игра с таким кодом не найдена.";
  if (response?.status === 400 && fieldErrors.includes("nickname")) return "Это имя уже занято в данной игре.";
  return fieldErrors || response?.message || error?.message || "Не удалось войти в игру.";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
