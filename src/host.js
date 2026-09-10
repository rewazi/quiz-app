import { pb, isLoggedIn, currentUser, login, register, logout } from "./pocketbase.js";

const app = document.getElementById("app");
let stopPlayersSubscription = null;

function getQuizIdFromHash() {
  const m = location.hash.match(/^#\/quiz\/(.+)$/);
  return m ? m[1] : null;
}

function getGameIdFromHash() {
  const match = location.hash.match(/^#\/game\/([^/]+)$/);
  return match ? match[1] : null;
}

function navigateTo(hash) {
  location.hash = hash;
}

window.addEventListener("hashchange", render);
document.addEventListener("pb-auth-change", render);

render();

async function render() {
  if (!isLoggedIn()) {
    renderAuth();
    return;
  }
  const gameId = getGameIdFromHash();
  if (gameId) {
    await renderGameLobby(gameId);
    return;
  }
  const quizId = getQuizIdFromHash();
  if (quizId) {
    await renderQuizEditor(quizId);
  } else {
    await renderQuizList();
  }
}

// ---------- Auth ----------

function renderAuth() {
  app.innerHTML = `
    <h1>Ведущий</h1>
    <div class="card">
      <h3 id="auth-title">Вход</h3>
      <label>Email</label>
      <input type="email" id="email" autocomplete="email" />
      <label>Пароль</label>
      <input type="password" id="password" autocomplete="current-password" minlength="8" />
      <div id="error"></div>
      <div class="row" style="margin-top:16px;">
        <button class="btn" id="submit-btn">Войти</button>
        <button class="btn secondary" id="toggle-mode">Нет аккаунта? Регистрация</button>
      </div>
    </div>
    <a href="/">На главную</a>
  `;

  let mode = "login";
  const title = document.getElementById("auth-title");
  const submitBtn = document.getElementById("submit-btn");
  const toggleBtn = document.getElementById("toggle-mode");
  const errorEl = document.getElementById("error");

  toggleBtn.addEventListener("click", () => {
    mode = mode === "login" ? "register" : "login";
    title.textContent = mode === "login" ? "Вход" : "Регистрация";
    submitBtn.textContent = mode === "login" ? "Войти" : "Создать аккаунт";
    toggleBtn.textContent = mode === "login" ? "Нет аккаунта? Регистрация" : "Уже есть аккаунт? Вход";
    errorEl.textContent = "";
  });

  submitBtn.addEventListener("click", async () => {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    errorEl.textContent = "";
    if (!email || !password) {
      errorEl.textContent = "Введите email и пароль.";
      return;
    }
    if (mode === "register" && password.length < 8) {
      errorEl.textContent = "Пароль должен содержать минимум 8 символов.";
      return;
    }
    submitBtn.disabled = true;
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password);
      }
    } catch (err) {
      errorEl.textContent = err.accountCreated
        ? `Аккаунт создан, но автоматический вход не выполнен. Войдите вручную. ${describeError(err)}`
        : describeError(err);
      if (err.accountCreated) {
        mode = "login";
        title.textContent = "Вход";
        submitBtn.textContent = "Войти";
        toggleBtn.textContent = "Нет аккаунта? Регистрация";
      }
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function describeError(err) {
  const response = err?.response;
  const fieldErrors = response?.data
    ? Object.entries(response.data)
        .map(([field, details]) => `${field}: ${details?.message || details}`)
        .join(" ")
    : "";
  return fieldErrors || response?.message || err?.message || "Что-то пошло не так.";
}

function getQuestionOptions(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ---------- Quiz list ----------

async function renderQuizList() {
  app.innerHTML = `
    <div class="row" style="justify-content:space-between;">
      <h1>Мои анкеты</h1>
      <button class="btn secondary" id="logout-btn">Выйти</button>
    </div>
    <div class="card">
      <label>Название новой анкеты</label>
      <div class="row">
        <input type="text" id="new-quiz-title" maxlength="100" placeholder="Например: Основы JS" />
        <button class="btn" id="create-quiz-btn" style="flex:0 0 auto;">Создать</button>
      </div>
      <div id="error"></div>
    </div>
    <div class="card" id="quiz-list-card">
      <h3>Список</h3>
      <div id="quiz-list">Загрузка…</div>
    </div>
  `;

  document.getElementById("logout-btn").addEventListener("click", () => {
    logout();
    render();
  });

  document.getElementById("create-quiz-btn").addEventListener("click", async () => {
    const input = document.getElementById("new-quiz-title");
    const title = input.value.trim();
    const errorEl = document.getElementById("error");
    if (!title) {
      errorEl.textContent = "Введите название.";
      return;
    }
    try {
      const quiz = await pb.collection("quizzes").create({
        title,
        owner: currentUser().id,
        isPublished: false
      });
      navigateTo(`#/quiz/${quiz.id}`);
    } catch (err) {
      errorEl.textContent = describeError(err);
    }
  });

  const listEl = document.getElementById("quiz-list");
  try {
    const quizzes = await pb.collection("quizzes").getFullList({
      filter: `owner = "${currentUser().id}"`
    });
    if (quizzes.length === 0) {
      listEl.textContent = "Пока нет анкет — создайте первую выше.";
      return;
    }
    listEl.innerHTML = quizzes
      .map(
        (q) => `
        <div class="quiz-list-item">
          <div>
            <strong>${escapeHtml(q.title)}</strong>
            <span class="badge">${q.isPublished ? "опубликована" : "черновик"}</span>
          </div>
          <div class="row" style="flex:0 0 auto;">
            <a class="btn secondary" href="#/quiz/${q.id}">Редактировать</a>
            <button class="btn start-game" data-quiz-id="${q.id}">Создать игру</button>
          </div>
        </div>`
      )
      .join("");

    listEl.querySelectorAll(".start-game").forEach((button) => {
      button.addEventListener("click", () => createGame(button.dataset.quizId));
    });
  } catch (err) {
    listEl.textContent = describeError(err);
  }
}

async function createGame(quizId) {
  try {
    const code = await createGameCode();
    const game = await pb.collection("games").create({
      quiz: quizId,
      host: currentUser().id,
      code,
      status: "lobby"
    });
    navigateTo(`#/game/${game.id}`);
  } catch (err) {
    const errorEl = document.getElementById("error");
    if (errorEl) errorEl.textContent = describeError(err);
  }
}

async function createGameCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    try {
      await pb.collection("games").getFirstListItem(`code = "${code}"`);
    } catch (err) {
      if (err?.status === 404) return code;
      throw err;
    }
  }
  throw new Error("Не удалось сгенерировать код игры. Попробуйте ещё раз.");
}

async function renderGameLobby(gameId) {
  if (stopPlayersSubscription) stopPlayersSubscription();
  app.innerHTML = `<p>Загрузка лобби…</p>`;

  let game;
  try {
    game = await pb.collection("games").getOne(gameId, { expand: "quiz" });
  } catch (err) {
    app.innerHTML = `<p>${escapeHtml(describeError(err))}</p><a href="#/">Назад</a>`;
    return;
  }

  app.innerHTML = `
    <a href="#/" id="lobby-back">&larr; Мои анкеты</a>
    <div class="card lobby-card">
      <p class="eyebrow">Лобби ведущего</p>
      <h1>${escapeHtml(game.expand?.quiz?.title || "Игра")}</h1>
      <p>Код для игроков</p>
      <strong class="game-code">${escapeHtml(game.code)}</strong>
      <p id="lobby-status">Ожидаем игроков</p>
    </div>
    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <h2>Игроки <span id="player-count">0</span></h2>
        <button class="btn danger" id="close-game">Закрыть игру</button>
      </div>
      <div id="player-list">Загрузка…</div>
    </div>
  `;

  document.getElementById("lobby-back").addEventListener("click", () => {
    if (stopPlayersSubscription) stopPlayersSubscription();
  });
  document.getElementById("close-game").addEventListener("click", async () => {
    await pb.collection("games").delete(gameId);
    navigateTo("#/");
  });

  const refreshPlayers = async () => {
    const players = await pb.collection("players").getFullList({ filter: `game = "${gameId}"` });
    const list = document.getElementById("player-list");
    const count = document.getElementById("player-count");
    if (!list || !count) return;
    count.textContent = players.length;
    list.innerHTML = players.length
      ? players.map((player) => `<div class="player-row"><strong>${escapeHtml(player.nickname)}</strong></div>`).join("")
      : "Пока никто не присоединился.";
  };

  await refreshPlayers();
  stopPlayersSubscription = await pb.collection("players").subscribe("*", (event) => {
    if (event.record.game === gameId) refreshPlayers();
  });
}

// ---------- Quiz editor ----------

async function renderQuizEditor(quizId) {
  app.innerHTML = `<p>Загрузка…</p>`;

  let quiz;
  try {
    quiz = await pb.collection("quizzes").getOne(quizId);
  } catch (err) {
    app.innerHTML = `<p>Анкета не найдена.</p><a href="#" onclick="history.back()">Назад</a>`;
    return;
  }

  app.innerHTML = `
    <a href="#" id="back-link">&larr; Мои анкеты</a>
    <h1>${escapeHtml(quiz.title)}</h1>
    <div class="card">
      <label>Название</label>
      <input type="text" id="quiz-title" maxlength="100" value="${escapeAttr(quiz.title)}" />
      <label class="row" style="align-items:center; gap:8px; margin-top:12px;">
        <input type="checkbox" id="quiz-published" style="width:auto;" ${quiz.isPublished ? "checked" : ""} />
        <span>Опубликована (доступна для игры)</span>
      </label>
      <div id="quiz-error"></div>
      <div style="margin-top:12px;">
        <button class="btn" id="save-quiz-btn">Сохранить</button>
      </div>
    </div>

    <div class="card">
      <h3>Вопросы</h3>
      <div id="question-list">Загрузка…</div>
    </div>

    <div class="card">
      <h3>Добавить вопрос</h3>
      ${questionFormHtml()}
      <div id="question-error"></div>
      <div style="margin-top:12px;">
        <button class="btn" id="add-question-btn">Добавить вопрос</button>
      </div>
    </div>
  `;

  document.getElementById("back-link").addEventListener("click", (e) => {
    e.preventDefault();
    navigateTo("#/");
  });

  document.getElementById("save-quiz-btn").addEventListener("click", async () => {
    const title = document.getElementById("quiz-title").value.trim();
    const isPublished = document.getElementById("quiz-published").checked;
    const errorEl = document.getElementById("quiz-error");
    if (!title) {
      errorEl.textContent = "Название не может быть пустым.";
      return;
    }
    try {
      await pb.collection("quizzes").update(quizId, { title, isPublished });
      errorEl.textContent = "";
      errorEl.style.color = "#16a34a";
      errorEl.textContent = "Сохранено.";
    } catch (err) {
      errorEl.style.color = "#dc2626";
      errorEl.textContent = describeError(err);
    }
  });

  setupOptionRows();

  document.getElementById("add-question-btn").addEventListener("click", () => addQuestion(quizId));

  await loadQuestions(quizId);
}

function questionFormHtml() {
  return `
    <label>Текст вопроса</label>
    <input type="text" id="q-text" maxlength="300" placeholder="Что означает HTML?" />
    <label>Изображение (необязательно)</label>
    <input type="file" id="q-image" accept="image/*" />
    <label>Ограничение по времени (сек)</label>
    <input type="number" id="q-time" value="20" min="5" max="120" />
    <label>Варианты ответа (2–4), отметьте правильный</label>
    <div id="option-rows"></div>
    <button type="button" class="btn secondary" id="add-option-row" style="margin-top:8px;">+ вариант</button>
  `;
}

function setupOptionRows() {
  const rowsEl = document.getElementById("option-rows");
  const addBtn = document.getElementById("add-option-row");

  function optionRow(index) {
    const row = document.createElement("div");
    row.className = "option-row";
    row.innerHTML = `
      <input type="radio" name="correct-option" value="${index}" ${index === 0 ? "checked" : ""} style="flex:0 0 auto; width:auto;" />
      <input type="text" class="option-text" placeholder="Вариант ${index + 1}" maxlength="200" />
      <button type="button" class="btn danger remove-option" style="flex:0 0 auto; padding:6px 10px;">×</button>
    `;
    row.querySelector(".remove-option").addEventListener("click", () => {
      if (rowsEl.children.length <= 2) return; // minimum 2 options
      row.remove();
      renumberOptions();
    });
    return row;
  }

  function renumberOptions() {
    [...rowsEl.children].forEach((row, i) => {
      row.querySelector(".option-text").placeholder = `Вариант ${i + 1}`;
      row.querySelector('input[type=radio]').value = i;
    });
  }

  rowsEl.appendChild(optionRow(0));
  rowsEl.appendChild(optionRow(1));

  addBtn.addEventListener("click", () => {
    if (rowsEl.children.length >= 4) return;
    rowsEl.appendChild(optionRow(rowsEl.children.length));
  });
}

async function addQuestion(quizId) {
  const text = document.getElementById("q-text").value.trim();
  const timeLimit = Number(document.getElementById("q-time").value) || 20;
  const imageFile = document.getElementById("q-image").files[0];
  const optionInputs = [...document.querySelectorAll(".option-text")];
  const options = optionInputs.map((i) => i.value.trim());
  const correctRadio = document.querySelector('input[name="correct-option"]:checked');
  const errorEl = document.getElementById("question-error");

  errorEl.textContent = "";
  if (!text) {
    errorEl.textContent = "Введите текст вопроса.";
    return;
  }
  if (options.some((o) => !o)) {
    errorEl.textContent = "Заполните все варианты ответа.";
    return;
  }
  if (!correctRadio) {
    errorEl.textContent = "Отметьте правильный вариант.";
    return;
  }

  try {
    const existing = await pb.collection("questions").getFullList({
      filter: `quiz = "${quizId}"`
    });
    const order = existing.length;

    const formData = new FormData();
    formData.append("quiz", quizId);
    formData.append("order", String(order));
    formData.append("text", text);
    formData.append("options", JSON.stringify(options));
    formData.append("correctIndex", correctRadio.value);
    formData.append("timeLimit", String(timeLimit));
    if (imageFile) formData.append("image", imageFile);

    await pb.collection("questions").create(formData);

    // reset form
    document.getElementById("q-text").value = "";
    document.getElementById("q-image").value = "";
    document.getElementById("q-time").value = "20";
    document.getElementById("option-rows").innerHTML = "";
    setupOptionRows();

    await loadQuestions(quizId);
  } catch (err) {
    errorEl.textContent = describeError(err);
  }
}

async function loadQuestions(quizId) {
  const listEl = document.getElementById("question-list");
  let questions;
  try {
    questions = await pb.collection("questions").getFullList({
      filter: `quiz = "${quizId}"`,
      sort: "order"
    });
  } catch (err) {
    listEl.textContent = describeError(err);
    return;
  }

  if (questions.length === 0) {
    listEl.textContent = "Пока нет вопросов — добавьте первый ниже.";
    return;
  }

  listEl.innerHTML = questions
    .map(
      (q, i) => `
      <div class="quiz-list-item" data-id="${q.id}">
        <div>
          <strong>${i + 1}. ${escapeHtml(q.text)}</strong><br />
          <span class="badge">${getQuestionOptions(q.options).length} варианта</span>
          <span class="badge">${q.timeLimit}с</span>
        </div>
        <div class="row" style="flex:0 0 auto; gap:4px;">
          <button class="btn secondary move-up" ${i === 0 ? "disabled" : ""} style="padding:4px 10px;">↑</button>
          <button class="btn secondary move-down" ${i === questions.length - 1 ? "disabled" : ""} style="padding:4px 10px;">↓</button>
          <button class="btn danger delete-question" style="padding:4px 10px;">Удалить</button>
        </div>
      </div>`
    )
    .join("");

  listEl.querySelectorAll(".delete-question").forEach((btn, i) => {
    btn.addEventListener("click", async () => {
      await pb.collection("questions").delete(questions[i].id);
      await loadQuestions(quizId);
    });
  });

  listEl.querySelectorAll(".move-up").forEach((btn, i) => {
    btn.addEventListener("click", () => swapOrder(quizId, questions, i, i - 1));
  });
  listEl.querySelectorAll(".move-down").forEach((btn, i) => {
    btn.addEventListener("click", () => swapOrder(quizId, questions, i, i + 1));
  });
}

async function swapOrder(quizId, questions, i, j) {
  if (j < 0 || j >= questions.length) return;
  const a = questions[i];
  const b = questions[j];
  await Promise.all([
    pb.collection("questions").update(a.id, { order: b.order }),
    pb.collection("questions").update(b.id, { order: a.order })
  ]);
  await loadQuestions(quizId);
}

// ---------- helpers ----------

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;");
}
