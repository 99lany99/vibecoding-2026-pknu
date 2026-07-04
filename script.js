const STORAGE_KEY = "youtube-log-items";

const logForm = document.getElementById("logForm");
const urlInput = document.getElementById("urlInput");
const searchModeSelect = document.getElementById("searchModeSelect");
const keywordSearchInput = document.getElementById("keywordSearchInput");
const dateSearchInput = document.getElementById("dateSearchInput");
const monthSearchInput = document.getElementById("monthSearchInput");
const sortSelect = document.getElementById("sortSelect");
const videoList = document.getElementById("videoList");
const message = document.getElementById("message");
const clearAllButton = document.getElementById("clearAllButton");
const totalCount = document.getElementById("totalCount");
const doneCount = document.getElementById("doneCount");
const todoCount = document.getElementById("todoCount");

let items = loadItems();
let searchState = {
  mode: "keyword",
  keyword: "",
  date: "",
  month: ""
};
let sortMode = "newest";

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getKoreaDateParts(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(value));

  const lookup = {};
  parts.forEach((part) => {
    if (part.type !== "literal") {
      lookup[part.type] = part.value;
    }
  });

  return {
    year: lookup.year || "",
    month: lookup.month || "",
    day: lookup.day || "",
    ymd: `${lookup.year || ""}-${lookup.month || ""}-${lookup.day || ""}`
  };
}

function normalizeYouTubeUrl(rawValue) {
  const value = rawValue.trim();
  if (!value) {
    return null;
  }

  let url;
  try {
    url = new URL(value);
  } catch (error) {
    try {
      url = new URL(`https://${value}`);
    } catch (secondError) {
      return null;
    }
  }

  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
  const isYouTubeHost = host === "youtube.com" || host === "youtu.be" || host.endsWith(".youtube.com");
  if (!isYouTubeHost) {
    return null;
  }

  return url.href;
}

function toCanonicalWatchUrl(url) {
  const videoId = extractVideoId(url);
  if (!videoId) {
    return url;
  }

  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

function extractVideoId(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./, "").replace(/^m\./, "");

    if (host === "youtu.be") {
      return parsed.pathname.split("/").filter(Boolean)[0] || "";
    }

    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      return parsed.searchParams.get("v") || parsed.pathname.split("/").filter(Boolean).pop() || "";
    }
  } catch (error) {
    return "";
  }

  return "";
}

function extractKeywordsFromTitle(title) {
  const cleaned = (title || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[|/\\:;,.!?'"“”‘’"~`·・_\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return [];
  }

  const stopwords = new Set([
    "영상",
    "라이브",
    "공개",
    "강의",
    "강좌",
    "입문",
    "초보",
    "정리",
    "요약",
    "실전",
    "튜토리얼",
    "방법",
    "사용법",
    "추천",
    "무료",
    "최신",
    "기초",
    "이론",
    "ep",
    "episode",
    "part",
    "pt"
  ]);

  const tokens = cleaned
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .filter((token) => !stopwords.has(token.toLowerCase()))
    .filter((token) => !/^\d+$/.test(token));

  const seen = new Set();
  const tags = [];

  tokens.forEach((token) => {
    const normalized = token.replace(/[^\p{L}\p{N}]+/gu, "");
    if (!normalized) {
      return;
    }

    const tag = `#${normalized}`;
    if (!seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  });

  return tags.slice(0, 10);
}

function getDisplayLabel(item) {
  if (item.title) {
    return item.title;
  }

  const videoId = extractVideoId(item.url);
  if (videoId) {
    return `유튜브 영상 ${videoId}`;
  }

  return "유튜브 링크";
}

function setMessage(text, type = "") {
  message.textContent = text;
  message.classList.toggle("error", type === "error");
}

function updateStats() {
  const doneItems = items.filter((item) => item.completed);
  totalCount.textContent = items.length;
  doneCount.textContent = doneItems.length;
  todoCount.textContent = items.length - doneItems.length;
}

function openItem(url) {
  window.open(url, "_blank", "noopener,noreferrer");
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

async function fetchVideoMetadata(url) {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error("유효한 영상 ID를 찾을 수 없습니다.");
  }

  const canonicalUrl = toCanonicalWatchUrl(url);
  const sources = [
    `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`,
    `https://noembed.com/embed?url=${encodeURIComponent(canonicalUrl)}`
  ];

  let metadata = null;
  for (const source of sources) {
    try {
      metadata = await fetchJson(source);
      break;
    } catch (error) {
      metadata = null;
    }
  }

  if (!metadata) {
    throw new Error("영상 메타데이터를 가져오지 못했습니다.");
  }

  const title = metadata.title || "";
  return {
    title,
    thumbnailUrl: metadata.thumbnail_url || `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`,
    authorName: metadata.author_name || "",
    tags: extractKeywordsFromTitle(title)
  };
}

function getSearchableText(item) {
  const dateParts = getKoreaDateParts(item.createdAt);
  return [
    item.title || "",
    item.url || "",
    item.authorName || "",
    formatDateTime(item.createdAt),
    dateParts.ymd,
    dateParts.year,
    dateParts.month,
    dateParts.day,
    ...(item.tags || [])
  ].join(" ").toLowerCase();
}

function getVisibleItems() {
  let visibleItems = [...items];

  if (searchState.mode === "keyword" && searchState.keyword.trim()) {
    const query = searchState.keyword.trim().toLowerCase();
    visibleItems = visibleItems.filter((item) => getSearchableText(item).includes(query));
  }

  if (searchState.mode === "date" && searchState.date) {
    visibleItems = visibleItems.filter((item) => getKoreaDateParts(item.createdAt).ymd === searchState.date);
  }

  if (searchState.mode === "month" && searchState.month) {
    visibleItems = visibleItems.filter((item) => getKoreaDateParts(item.createdAt).ymd.startsWith(searchState.month));
  }

  visibleItems.sort((left, right) => {
    if (sortMode === "oldest") {
      return new Date(left.createdAt) - new Date(right.createdAt);
    }

    if (sortMode === "title") {
      return getDisplayLabel(left).localeCompare(getDisplayLabel(right), "ko");
    }

    if (sortMode === "status") {
      return Number(left.completed) - Number(right.completed) || new Date(right.createdAt) - new Date(left.createdAt);
    }

    return new Date(right.createdAt) - new Date(left.createdAt);
  });

  return visibleItems;
}

function toggleComplete(id) {
  items = items.map((item) => {
    if (item.id !== id) {
      return item;
    }

    return {
      ...item,
      completed: !item.completed
    };
  });

  saveItems();
  renderList();
}

function deleteItem(id) {
  items = items.filter((item) => item.id !== id);
  saveItems();
  renderList();
  setMessage("기록을 삭제했습니다.");
}

function renderEmptyState() {
  const empty = document.createElement("li");
  empty.className = "empty-state";
  empty.textContent = "아직 저장된 영상이 없습니다. 위 입력칸에 유튜브 URL을 넣고 저장해보세요.";
  videoList.appendChild(empty);
}

function renderList() {
  videoList.innerHTML = "";

  const visibleItems = getVisibleItems();

  if (items.length === 0) {
    renderEmptyState();
    updateStats();
    return;
  }

  if (visibleItems.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "검색 결과가 없습니다. 다른 키워드로 찾아보세요.";
    videoList.appendChild(empty);
    updateStats();
    return;
  }

  visibleItems.forEach((item) => {
    const li = document.createElement("li");
    li.className = `video-item${item.completed ? " done" : ""}`;

    const main = document.createElement("div");
    main.className = "video-main";

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "thumbnail-wrap";

    const thumbLink = document.createElement("a");
    thumbLink.className = "thumbnail";
    thumbLink.href = item.url;
    thumbLink.target = "_blank";
    thumbLink.rel = "noopener noreferrer";

    const thumbnail = document.createElement("img");
    thumbnail.src = item.thumbnailUrl || `https://i.ytimg.com/vi/${extractVideoId(item.url)}/hqdefault.jpg`;
    thumbnail.alt = item.title ? `${item.title} 썸네일` : "유튜브 썸네일";
    thumbnail.loading = "lazy";
    thumbLink.appendChild(thumbnail);

    const playOverlay = document.createElement("span");
    playOverlay.className = "play-overlay";
    playOverlay.setAttribute("aria-hidden", "true");
    playOverlay.textContent = "▶";
    thumbWrap.append(thumbLink, playOverlay);

    const title = document.createElement("h3");
    title.className = "video-title";
    const titleLink = document.createElement("a");
    titleLink.href = item.url;
    titleLink.target = "_blank";
    titleLink.rel = "noopener noreferrer";
    titleLink.textContent = getDisplayLabel(item);
    title.appendChild(titleLink);

    const meta = document.createElement("div");
    meta.className = "video-meta";

    const status = document.createElement("span");
    status.className = `chip${item.completed ? " done" : ""}`;
    status.textContent = item.completed ? "학습완료" : "학습중";

    const createdAt = document.createElement("span");
    createdAt.className = "chip";
    createdAt.textContent = formatDateTime(item.createdAt);

    meta.append(status, createdAt);

    const urlText = document.createElement("p");
    urlText.className = "url-text";
    const urlLink = document.createElement("a");
    urlLink.href = item.url;
    urlLink.target = "_blank";
    urlLink.rel = "noopener noreferrer";
    urlLink.textContent = item.url;
    urlText.appendChild(urlLink);

    main.append(thumbWrap);

    const content = document.createElement("div");
    content.className = "video-content";
    content.append(title, meta, urlText);

    const tags = item.tags || [];
    if (tags.length > 0) {
      const tagList = document.createElement("div");
      tagList.className = "tag-list";

      tags.forEach((tag) => {
        const tagChip = document.createElement("span");
        tagChip.className = "tag-chip";
        tagChip.textContent = tag;
        tagList.appendChild(tagChip);
      });

      content.append(tagList);
    }

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "item-button open";
    openButton.textContent = "새창 열기";
    openButton.addEventListener("click", () => openItem(item.url));

    const completeButton = document.createElement("button");
    completeButton.type = "button";
    completeButton.className = "item-button done";
    completeButton.textContent = item.completed ? "완료 취소" : "완료 표시";
    completeButton.addEventListener("click", () => toggleComplete(item.id));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "item-button delete";
    deleteButton.textContent = "삭제";
    deleteButton.addEventListener("click", () => deleteItem(item.id));

    actions.append(openButton, completeButton, deleteButton);
    content.append(actions);
    li.append(main, content);
    videoList.appendChild(li);
  });

  updateStats();
}

async function addItem(rawValue) {
  const url = normalizeYouTubeUrl(rawValue);
  if (!url) {
    setMessage("유효한 유튜브 URL을 입력해주세요.", "error");
    return;
  }

  const baseItem = {
    id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `video-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    url,
    completed: false,
    createdAt: new Date().toISOString()
  };

  let metadata = {
    title: "",
    thumbnailUrl: "",
    authorName: "",
    tags: []
  };
  let metadataLoaded = false;

  try {
    metadata = await fetchVideoMetadata(url);
    metadataLoaded = true;
  } catch (error) {
    // 제목/썸네일 조회에 실패해도 URL 저장은 계속합니다.
  }

  const item = {
    ...baseItem,
    ...metadata
  };

  items = [item, ...items];
  saveItems();
  renderList();

  setMessage(
    metadataLoaded
      ? "새 유튜브 기록을 저장했습니다."
      : "URL은 저장했지만 제목/썸네일은 불러오지 못했습니다.",
    metadataLoaded ? "" : "error"
  );
}

function syncSearchMode(focusField = false) {
  const mode = searchModeSelect.value;
  searchState.mode = mode;

  keywordSearchInput.classList.toggle("hidden", mode !== "keyword");
  dateSearchInput.classList.toggle("hidden", mode !== "date");
  monthSearchInput.classList.toggle("hidden", mode !== "month");

  if (focusField && mode === "keyword") {
    keywordSearchInput.focus();
  }

  if (focusField && mode === "date") {
    dateSearchInput.focus();
  }

  if (focusField && mode === "month") {
    monthSearchInput.focus();
  }

  renderList();
}

logForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await addItem(urlInput.value);
  logForm.reset();
  urlInput.focus();
});

clearAllButton.addEventListener("click", () => {
  if (items.length === 0) {
    setMessage("삭제할 기록이 없습니다.");
    return;
  }

  items = [];
  saveItems();
  renderList();
  setMessage("모든 기록을 삭제했습니다.");
});

searchModeSelect.addEventListener("change", () => syncSearchMode(true));
keywordSearchInput.addEventListener("input", () => {
  searchState.keyword = keywordSearchInput.value;
  renderList();
});
dateSearchInput.addEventListener("change", () => {
  searchState.date = dateSearchInput.value;
  renderList();
});
monthSearchInput.addEventListener("change", () => {
  searchState.month = monthSearchInput.value;
  renderList();
});

sortSelect.addEventListener("change", () => {
  sortMode = sortSelect.value;
  renderList();
});

renderList();
setMessage("유튜브 URL을 저장하고 다시 열어보세요.");
syncSearchMode(false);
