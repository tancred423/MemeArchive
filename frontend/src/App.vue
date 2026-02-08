<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from "vue";

const password = ref<string>("");
const passwordInputRef = ref<HTMLInputElement | null>(null);
const error = ref<string>("");
const isAuthed = ref<boolean>(false);
const TOKEN_KEY = "guest_token";

type Meme = {
  id: string;
  title: string;
  tags: string[];
  imageDataUrl: string;
  createdAt: number;
};

const title = ref<string>("");
const tagList = ref<string[]>([]);
const tagInput = ref<string>("");
const imageDataUrl = ref<string>("");
const memes = ref<Meme[]>([]);
const search = ref<string>("");
const sort = ref<string>("newest");
const copiedId = ref<string>("");
const showAddPanel = ref<boolean>(false);
const editingMemeId = ref<string | null>(null);
const appName = import.meta.env.VITE_APP_NAME || "Meme Archive";

// Pagination
const page = ref(1);
const totalMemes = ref(0);
const pageSize = ref(24);
const gridRef = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | null = null;
let resizeTimeout: number | null = null;

const totalPages = computed(() => Math.max(1, Math.ceil(totalMemes.value / pageSize.value)));

const paginationPages = computed(() => {
  const total = totalPages.value;
  const current = page.value;
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | string)[] = [1];
  if (current > 3) pages.push("...");
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
});

// Storage
const storageUsed = ref(0);
const storageMax = ref(0);
const storagePercent = computed(() => {
  if (!storageMax.value) return 0;
  return Math.min(100, (storageUsed.value / storageMax.value) * 100);
});
const storageLevel = computed(() => {
  const pct = storagePercent.value;
  if (pct >= 90) return "danger";
  if (pct >= 70) return "warning";
  return "";
});

// Theme
const THEME_KEY = "meme_archive_theme";
type ThemeMode = "system" | "light" | "dark";
const theme = ref<ThemeMode>((localStorage.getItem(THEME_KEY) as ThemeMode) || "system");
const showThemeMenu = ref(false);

function applyTheme(mode: ThemeMode) {
  let resolved: "light" | "dark" = "dark";
  if (mode === "light") resolved = "light";
  else if (mode === "dark") resolved = "dark";
  else resolved = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.setAttribute("content", resolved);
  const darkreader = document.querySelector('meta[name="darkreader-lock"]');
  if (resolved === "light" && !darkreader) {
    const m = document.createElement("meta");
    m.name = "darkreader-lock";
    document.head.appendChild(m);
  } else if (resolved === "dark" && darkreader) {
    darkreader.remove();
  }
}

let themeMedia: MediaQueryList | null = null;
function setupSystemThemeListener() {
  themeMedia?.removeEventListener("change", onSystemThemeChange);
  if (theme.value !== "system") return;
  themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
  themeMedia.addEventListener("change", onSystemThemeChange);
}
function onSystemThemeChange() {
  if (theme.value === "system") applyTheme("system");
}
function setTheme(mode: ThemeMode) {
  theme.value = mode;
  localStorage.setItem(THEME_KEY, mode);
  applyTheme(mode);
  setupSystemThemeListener();
  showThemeMenu.value = false;
  document.removeEventListener("click", closeThemeMenu);
}
function closeThemeMenu() {
  showThemeMenu.value = false;
  document.removeEventListener("click", closeThemeMenu);
}
function toggleThemeMenu() {
  showThemeMenu.value = !showThemeMenu.value;
  if (showThemeMenu.value) {
    setTimeout(() => document.addEventListener("click", closeThemeMenu), 0);
  } else {
    document.removeEventListener("click", closeThemeMenu);
  }
}

// Auth helpers
function getAuthHeaders(): Record<string, string> {
  const token = sessionStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function logout() {
  const headers = getAuthHeaders();
  sessionStorage.removeItem(TOKEN_KEY);
  isAuthed.value = false;
  document.title = "Meme Archive";
  password.value = "";
  memes.value = [];
  resizeObserver?.disconnect();
  resizeObserver = null;
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers,
    });
  } catch {
    // ignore
  }
}

// Data loading
async function loadMemes() {
  const params = new URLSearchParams();
  if (search.value.trim()) params.set("search", search.value.trim());
  if (sort.value) params.set("sort", sort.value);
  params.set("page", String(page.value));
  params.set("limit", String(pageSize.value));
  const res = await fetch(`/api/memes?${params.toString()}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Failed to load");
  const data = await res.json();
  memes.value = Array.isArray(data.items) ? data.items : [];
  totalMemes.value = data.total ?? 0;
}

async function loadStorage() {
  try {
    const res = await fetch("/api/storage", { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      storageUsed.value = data.usedBytes ?? 0;
      storageMax.value = data.maxBytes ?? 0;
    }
  } catch {
    /* ignore */
  }
}

async function checkAuth() {
  const res = await fetch("/api/auth/check", { headers: getAuthHeaders() });
  if (!res.ok) return false;
  const data = await res.json();
  return Boolean(data.ok);
}

async function submitPassword() {
  error.value = "";
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: password.value }),
    });
    if (!res.ok) {
      error.value = "Incorrect password";
      return;
    }
    const data = await res.json();
    if (data?.token) sessionStorage.setItem(TOKEN_KEY, data.token);
    isAuthed.value = true;
    document.title = appName;
    await nextTick();
    pageSize.value = calculatePageSize() || 24;
    await loadMemes();
    await loadStorage();
    setupGridObserver();
  } catch {
    error.value = "Failed to reach backend";
  }
}

// Page-size calculation
function calculatePageSize(): number {
  const container = gridRef.value;
  if (!container) return 24;
  const containerWidth = container.clientWidth;
  const gap = 20;
  let minCardWidth = 200;
  if (containerWidth <= 450) minCardWidth = 130;
  else if (containerWidth <= 720) minCardWidth = 160;
  const cols = Math.max(1, Math.floor((containerWidth + gap) / (minCardWidth + gap)));
  const cardWidth = (containerWidth - (cols - 1) * gap) / cols;
  const cardHeight = cardWidth + 110;
  const availableHeight = window.innerHeight - 250;
  const rows = Math.max(3, Math.floor(availableHeight / (cardHeight + gap)));
  return Math.min(60, cols * rows);
}

function onGridResize() {
  if (resizeTimeout) clearTimeout(resizeTimeout);
  resizeTimeout = window.setTimeout(() => {
    const newSize = calculatePageSize();
    if (newSize > 0 && newSize !== pageSize.value) {
      pageSize.value = newSize;
      const maxPage = Math.max(1, Math.ceil(totalMemes.value / newSize));
      if (page.value > maxPage) page.value = maxPage;
      if (isAuthed.value) loadMemes();
    }
  }, 300);
}

function setupGridObserver() {
  resizeObserver?.disconnect();
  if (gridRef.value) {
    resizeObserver = new ResizeObserver(onGridResize);
    resizeObserver.observe(gridRef.value);
  }
}

function goToPage(p: number) {
  page.value = Math.max(1, Math.min(p, totalPages.value));
  loadMemes();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

// Tag handling
function commitTagInput() {
  const v = tagInput.value.trim();
  if (!v) return;
  const parts = v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of parts) {
    if (p && !tagList.value.includes(p)) tagList.value.push(p);
  }
  tagInput.value = "";
}
function removeTag(index: number) {
  tagList.value = tagList.value.filter((_: string, i: number) => i !== index);
}
function onTagInputKeydown(event: KeyboardEvent) {
  if (event.key === "," || event.key === "Enter") {
    event.preventDefault();
    commitTagInput();
  }
}
function getTagsForSubmit(): string[] {
  const fromInput = tagInput.value.trim();
  const tags = [...tagList.value];
  if (fromInput) {
    const lastWord = fromInput.split(/\s+/).pop() ?? fromInput;
    if (lastWord && !tags.includes(lastWord)) tags.push(lastWord);
  }
  return tags;
}

// File handling
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  imageDataUrl.value = await readFileAsDataUrl(file);
}
async function handlePaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items ?? [];
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        imageDataUrl.value = await readFileAsDataUrl(file);
        return;
      }
    }
  }
}

// Meme CRUD
async function submitMeme() {
  error.value = "";
  if (!title.value.trim()) {
    error.value = "Title is required";
    return;
  }
  if (!editingMemeId.value && !imageDataUrl.value) {
    error.value = "Image is required for new meme";
    return;
  }
  const payload = {
    title: title.value.trim(),
    tags: getTagsForSubmit(),
    imageDataUrl: imageDataUrl.value || undefined,
  };
  const wasEditing = !!editingMemeId.value;
  if (wasEditing) {
    const res = await fetch(`/api/memes/${editingMemeId.value}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      error.value =
        res.status === 413
          ? "Image too large. Try a smaller image or ask the admin to raise the upload limit."
          : ((data as { error?: string }).error ?? "Failed to update meme");
      return;
    }
  } else {
    if (!imageDataUrl.value) return;
    const res = await fetch("/api/memes", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ ...payload, imageDataUrl: imageDataUrl.value }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      error.value =
        res.status === 413
          ? "Image too large. Try a smaller image or ask the admin to raise the upload limit."
          : ((data as { error?: string }).error ?? "Failed to add meme");
      return;
    }
  }
  closeAddPanel();
  if (!wasEditing) page.value = 1;
  await loadMemes();
  await loadStorage();
}

async function deleteMemeConfirm(meme: Meme) {
  if (!confirm(`Delete "${meme.title}"?`)) return;
  const res = await fetch(`/api/memes/${meme.id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    error.value = "Failed to delete";
    return;
  }
  await loadMemes();
  if (memes.value.length === 0 && page.value > 1) {
    page.value--;
    await loadMemes();
  }
  await loadStorage();
}

async function copyImage(meme: Meme) {
  copiedId.value = "";
  const response = await fetch(meme.imageDataUrl);
  const blob = await response.blob();
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
  copiedId.value = meme.id;
  setTimeout(() => {
    if (copiedId.value === meme.id) copiedId.value = "";
  }, 1000);
}

// Search / sort
function runSearch() {
  page.value = 1;
  loadMemes();
}
function onSearchKeydown(event: KeyboardEvent) {
  if (event.key === "Enter") {
    event.preventDefault();
    runSearch();
  }
}

// Modal
function openAddPanel() {
  editingMemeId.value = null;
  title.value = "";
  tagList.value = [];
  tagInput.value = "";
  imageDataUrl.value = "";
  error.value = "";
  showAddPanel.value = true;
}
function openEditPanel(meme: Meme) {
  editingMemeId.value = meme.id;
  title.value = meme.title;
  tagList.value = [...(Array.isArray(meme.tags) ? meme.tags : [])];
  tagInput.value = "";
  imageDataUrl.value = meme.imageDataUrl;
  error.value = "";
  showAddPanel.value = true;
}
function closeAddPanel() {
  showAddPanel.value = false;
  editingMemeId.value = null;
  title.value = "";
  tagList.value = [];
  tagInput.value = "";
  imageDataUrl.value = "";
  error.value = "";
}

function memeTagsDisplay(meme: Meme): string {
  if (!meme.tags) return "";
  if (Array.isArray(meme.tags)) return meme.tags.join(", ");
  if (typeof meme.tags === "string") {
    try {
      const parsed = JSON.parse(meme.tags);
      return Array.isArray(parsed) ? parsed.join(", ") : meme.tags;
    } catch {
      return meme.tags;
    }
  }
  return "";
}

function onEscape(e: KeyboardEvent) {
  if (e.key === "Escape" && showAddPanel.value) closeAddPanel();
}

watch(sort, () => {
  page.value = 1;
  if (isAuthed.value) loadMemes();
});

onMounted(async () => {
  document.addEventListener("keydown", onEscape);
  applyTheme(theme.value);
  setupSystemThemeListener();
  try {
    const ok = await checkAuth();
    if (ok) {
      isAuthed.value = true;
      document.title = appName;
      await nextTick();
      pageSize.value = calculatePageSize() || 24;
      await loadMemes();
      await loadStorage();
      setupGridObserver();
    }
  } catch {
    // not authed
  }
  if (!isAuthed.value) {
    await nextTick();
    passwordInputRef.value?.focus();
  }
});

onUnmounted(() => {
  document.removeEventListener("keydown", onEscape);
  themeMedia?.removeEventListener("change", onSystemThemeChange);
  resizeObserver?.disconnect();
  if (resizeTimeout) clearTimeout(resizeTimeout);
});
</script>

<template>
  <div
    class="app"
    @paste="handlePaste"
  >
    <header
      v-if="isAuthed"
      class="header"
    >
      <h1 class="logo">
        {{ appName }}
      </h1>
      <div class="header-actions">
        <div
          v-if="storageMax > 0"
          class="storage-indicator"
        >
          <div class="storage-bar">
            <div
              class="storage-fill"
              :class="storageLevel"
              :style="{ width: storagePercent + '%' }"
            />
          </div>
          <span class="storage-text">{{ formatBytes(storageUsed) }} / {{ formatBytes(storageMax) }}</span>
        </div>
        <div class="theme-wrap">
          <button
            type="button"
            class="btn btn-ghost btn-icon-text"
            aria-label="Theme"
            aria-haspopup="true"
            :aria-expanded="showThemeMenu"
            @click.stop="toggleThemeMenu"
          >
            <span
              class="theme-icon"
              aria-hidden="true"
            >◐</span>
            {{ theme === "system" ? "System" : theme === "light" ? "Light" : "Dark" }}
          </button>
          <div
            v-if="showThemeMenu"
            class="theme-menu"
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              class="theme-option"
              :class="{ active: theme === 'system' }"
              @click="setTheme('system')"
            >
              System
            </button>
            <button
              type="button"
              role="menuitem"
              class="theme-option"
              :class="{ active: theme === 'light' }"
              @click="setTheme('light')"
            >
              Light
            </button>
            <button
              type="button"
              role="menuitem"
              class="theme-option"
              :class="{ active: theme === 'dark' }"
              @click="setTheme('dark')"
            >
              Dark
            </button>
          </div>
        </div>
        <button
          type="button"
          class="btn btn-ghost"
          @click="logout"
        >
          Logout
        </button>
      </div>
    </header>

    <main
      v-if="isAuthed"
      class="main"
    >
      <Teleport to="body">
        <div
          v-if="showAddPanel"
          class="modal-overlay"
          @click.self="closeAddPanel"
          @paste="handlePaste"
        >
          <div class="modal-panel">
            <div class="add-panel-header">
              <h2 class="panel-title">
                {{ editingMemeId ? "Edit Meme" : "Add Meme" }}
              </h2>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                aria-label="Close"
                @click="closeAddPanel"
              >
                ×
              </button>
            </div>
            <form
              class="add-form"
              @submit.prevent="submitMeme"
            >
              <input
                v-model="title"
                type="text"
                placeholder="Title"
                class="input title-input"
              >
              <div class="tags-wrap">
                <div class="tag-panels">
                  <span
                    v-for="(tag, i) in tagList"
                    :key="i"
                    class="tag-panel"
                  >
                    {{ tag }}
                    <button
                      type="button"
                      class="tag-remove"
                      aria-label="Remove tag"
                      @click="removeTag(i)"
                    >
                      ×
                    </button>
                  </span>
                  <input
                    v-model="tagInput"
                    type="text"
                    placeholder="Tags (comma or enter)"
                    class="input tag-input"
                    @keydown="onTagInputKeydown"
                    @blur="commitTagInput"
                  >
                </div>
              </div>
              <div class="file-selector-row">
                <div class="file-selector">
                  <label class="file-label">
                    <span class="file-text">Choose image</span>
                    <input
                      type="file"
                      accept="image/*"
                      class="file-input"
                      @change="handleFileChange"
                    >
                  </label>
                  <span class="file-sep">or paste image anywhere</span>
                </div>
              </div>
              <div
                v-if="imageDataUrl"
                class="preview-wrap"
              >
                <img
                  :src="imageDataUrl"
                  class="preview"
                  alt="Preview"
                >
              </div>
              <button
                type="submit"
                class="btn btn-primary btn-submit"
              >
                {{ editingMemeId ? "Save" : "Add" }}
              </button>
            </form>
            <p
              v-if="error"
              class="error-inline"
            >
              {{ error }}
            </p>
          </div>
        </div>
      </Teleport>

      <div class="library">
        <div class="controls">
          <div class="search-wrap">
            <input
              v-model="search"
              type="text"
              placeholder="Search title or tag"
              class="input search-input"
              @keydown="onSearchKeydown"
            >
            <button
              type="button"
              class="btn-icon"
              aria-label="Search"
              @mousedown.prevent
              @click="runSearch"
            >
              <svg
                class="icon-magnifier"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle
                  cx="11"
                  cy="11"
                  r="8"
                />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </button>
          </div>
          <select
            v-model="sort"
            class="select"
          >
            <option value="newest">
              Newest
            </option>
            <option value="oldest">
              Oldest
            </option>
            <option value="a-z">
              A–Z
            </option>
            <option value="z-a">
              Z–A
            </option>
          </select>
          <button
            type="button"
            class="btn btn-primary"
            @click="openAddPanel"
          >
            Add meme
          </button>
        </div>

        <div
          ref="gridRef"
          class="grid"
        >
          <div
            v-for="meme in memes"
            :key="meme.id"
            class="card"
            :class="{ copied: copiedId === meme.id }"
          >
            <button
              type="button"
              class="card-image-btn"
              @click="copyImage(meme)"
            >
              <div class="card-image-wrap">
                <img
                  :src="meme.imageDataUrl"
                  :alt="meme.title"
                  class="card-image"
                >
                <span
                  v-if="copiedId === meme.id"
                  class="card-copied-badge"
                >Copied</span>
              </div>
            </button>
            <div class="card-meta">
              <span class="card-title">{{ meme.title }}</span>
              <div
                v-if="memeTagsDisplay(meme)"
                class="card-tags"
              >
                {{ memeTagsDisplay(meme) }}
              </div>
            </div>
            <div class="card-actions">
              <button
                type="button"
                class="btn btn-card"
                @click.stop="openEditPanel(meme)"
              >
                Edit
              </button>
              <button
                type="button"
                class="btn btn-card btn-danger"
                @click.stop="deleteMemeConfirm(meme)"
              >
                Delete
              </button>
            </div>
          </div>
        </div>

        <div
          v-if="totalPages > 1"
          class="pagination"
        >
          <span class="page-info">
            {{ (page - 1) * pageSize + 1 }}–{{ Math.min(page * pageSize, totalMemes) }} of
            {{ totalMemes }}
          </span>
          <div class="page-controls">
            <button
              type="button"
              class="btn btn-ghost btn-page"
              :disabled="page <= 1"
              @click="goToPage(page - 1)"
            >
              ‹
            </button>
            <template
              v-for="p in paginationPages"
              :key="p"
            >
              <span
                v-if="p === '...'"
                class="page-ellipsis"
              >…</span>
              <button
                v-else
                type="button"
                class="btn btn-ghost btn-page"
                :class="{ active: p === page }"
                @click="goToPage(p as number)"
              >
                {{ p }}
              </button>
            </template>
            <button
              type="button"
              class="btn btn-ghost btn-page"
              :disabled="page >= totalPages"
              @click="goToPage(page + 1)"
            >
              ›
            </button>
          </div>
        </div>
      </div>
    </main>

    <div
      v-else
      class="login-wrap"
    >
      <div class="login-card">
        <form
          class="login-form"
          @submit.prevent="submitPassword"
        >
          <input
            ref="passwordInputRef"
            v-model="password"
            type="password"
            placeholder="Password"
            autocomplete="current-password"
            class="input login-input"
          >
          <button
            type="submit"
            class="btn btn-primary btn-block"
          >
            Enter
          </button>
        </form>
        <p
          v-if="error"
          class="error"
        >
          {{ error }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
}

/* ─── Header ─── */
.header {
  padding: 1rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  background: linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg) 100%);
  border-bottom: 1px solid var(--border);
}
.logo {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--accent);
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* ─── Storage indicator ─── */
.storage-indicator {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  margin-right: 0.5rem;
}
.storage-bar {
  width: 100px;
  height: 6px;
  background: var(--bg);
  border-radius: 3px;
  overflow: hidden;
  border: 1px solid var(--border);
}
.storage-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--accent);
  transition: width 0.3s ease;
}
.storage-fill.warning {
  background: #f59e0b;
}
.storage-fill.danger {
  background: var(--error);
}
.storage-text {
  font-size: 0.65rem;
  color: var(--text-muted);
  white-space: nowrap;
}

/* ─── Theme ─── */
.theme-wrap {
  position: relative;
}
.btn-icon-text {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.theme-icon {
  font-size: 1rem;
  opacity: 0.9;
}
.theme-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.25rem;
  min-width: 8rem;
  padding: 0.25rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
  z-index: 100;
}
.theme-option {
  display: block;
  width: 100%;
  padding: 0.5rem 0.75rem;
  text-align: left;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--text);
  font-size: 0.9rem;
  cursor: pointer;
}
.theme-option:hover {
  background: var(--accent-soft);
}
.theme-option.active {
  color: var(--accent);
  font-weight: 500;
}

/* ─── Buttons ─── */
.btn-ghost {
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border);
  padding: 0.4rem 0.75rem;
  font-size: 0.875rem;
}
.btn-ghost:hover {
  color: var(--accent);
  border-color: var(--accent);
}
.btn {
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  padding: 0.65rem 1.25rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.2s,
    border-color 0.2s,
    transform 0.1s;
}
.btn:active {
  transform: scale(0.98);
}
.btn-primary {
  background: var(--accent);
  color: var(--bg);
}
.btn-primary:hover {
  background: var(--accent-hover);
}
.btn-secondary {
  background: var(--bg-elevated);
  color: var(--text);
  border: 1px solid var(--border);
}
.btn-secondary:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.btn-block {
  width: 100%;
}

/* ─── Main / Layout ─── */
.main {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 2rem 1.5rem;
}
.library {
  width: 100%;
}

/* ─── Modal ─── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1.5rem;
}
.modal-panel {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.5rem;
  max-width: 900px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--shadow);
}
.add-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.25rem;
}
.add-panel-header .panel-title {
  margin: 0;
}
.btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 1.25rem;
  line-height: 1;
}
.panel-title {
  margin: 0 0 1.25rem;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text);
}

/* ─── Search ─── */
.search-wrap {
  display: flex;
  align-items: center;
  gap: 0;
  max-width: 320px;
}
.search-wrap .search-input {
  max-width: none;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  border-right: none;
}
.search-wrap .search-input:focus {
  border-color: var(--accent);
}
.search-wrap .search-input:focus + .btn-icon {
  border-color: var(--accent);
  color: var(--accent);
}
.btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.65rem 1rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  color: var(--text-muted);
  cursor: pointer;
  transition:
    border-color 0.2s,
    color 0.2s;
}
.btn-icon:hover {
  color: var(--accent);
  border-color: var(--accent);
}
.search-wrap:focus-within .search-input {
  border-color: var(--accent);
}
.search-wrap:focus-within .btn-icon {
  border-color: var(--accent);
  color: var(--accent);
}
.icon-magnifier {
  width: 1.25rem;
  height: 1.25rem;
}

/* ─── Form ─── */
.add-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.title-input {
  max-width: 400px;
}
.tags-wrap {
  width: 100%;
}
.file-selector-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.tag-panels {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.5rem;
  padding: 0.25rem 0;
}
.tag-panel {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.35rem 0.5rem 0.35rem 0.65rem;
  background: var(--accent-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  color: var(--text);
}
.tag-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  transition:
    color 0.2s,
    background 0.2s;
}
.tag-remove:hover {
  color: var(--error);
  background: rgba(248, 113, 113, 0.15);
}
.tag-input {
  flex: 1;
  min-width: 140px;
}
.file-selector {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.file-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.65rem 1rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  transition:
    border-color 0.2s,
    color 0.2s;
}
.file-label:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.file-input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
}
.file-text {
  font-size: 0.9rem;
}
.file-sep {
  font-size: 0.85rem;
  color: var(--text-muted);
}
.input {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.65rem 1rem;
  color: var(--text);
  transition: border-color 0.2s;
}
.input:focus {
  outline: none;
  border-color: var(--accent);
}
.preview-wrap {
  margin-top: 1rem;
}
.btn-submit {
  margin-top: 1rem;
}
.preview {
  display: block;
  max-width: 240px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}
.search-input {
  max-width: 320px;
}

/* ─── Controls ─── */
.controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}
.controls .btn-primary {
  margin-left: auto;
}
.select {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.65rem 2rem 0.65rem 1rem;
  color: var(--text);
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.65rem center;
}
.select:focus {
  outline: none;
  border-color: var(--accent);
}

/* ─── Grid ─── */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1.25rem;
}
.card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  text-align: left;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0;
  overflow: hidden;
  transition:
    border-color 0.2s,
    box-shadow 0.2s,
    transform 0.15s;
}
.card:hover {
  border-color: var(--accent);
  box-shadow: 0 8px 24px rgba(167, 139, 250, 0.12);
  transform: translateY(-2px);
}
.card.copied {
  border-color: var(--success);
  box-shadow: 0 0 0 2px rgba(52, 211, 153, 0.3);
}
.card-image-btn {
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
}
.card-image-wrap {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  background: var(--bg-card);
}
.card-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.card-copied-badge {
  position: absolute;
  bottom: 0.5rem;
  left: 0.5rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  background: var(--success);
  color: var(--bg);
  border-radius: 4px;
}
.card-meta {
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}
.card-title {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text);
  line-clamp: 2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-tags {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 0.25rem;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-actions {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 0.5rem 0.5rem;
  border-top: 1px solid var(--border);
  margin-top: auto;
}
.btn-card {
  flex: 1;
  padding: 0.35rem 0;
  font-size: 0.8rem;
  text-align: center;
  background: var(--bg-card);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition:
    border-color 0.2s,
    color 0.2s;
}
.btn-card:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.btn-card.btn-danger:hover {
  border-color: var(--error);
  color: var(--error);
}

/* ─── Pagination ─── */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 2rem;
  flex-wrap: wrap;
}
.page-info {
  font-size: 0.85rem;
  color: var(--text-muted);
  white-space: nowrap;
}
.page-controls {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.btn-page {
  min-width: 2.25rem;
  height: 2.25rem;
  padding: 0 0.5rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  border-radius: var(--radius-sm);
}
.btn-page.active {
  background: var(--accent);
  color: var(--bg);
  border-color: var(--accent);
}
.btn-page:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.page-ellipsis {
  padding: 0 0.25rem;
  color: var(--text-muted);
  font-size: 0.9rem;
}

/* ─── Error ─── */
.error-inline {
  margin: 0.75rem 0 0;
  font-size: 0.9rem;
  color: var(--error);
}

/* ─── Login ─── */
.login-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}
.login-card {
  width: 100%;
  max-width: 380px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 2rem;
  box-shadow: var(--shadow);
}
.login-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.login-input {
  width: 100%;
}
.error {
  margin: 1rem 0 0;
  font-size: 0.9rem;
  color: var(--error);
  text-align: center;
}

/* ─── Responsive: Tablet ─── */
@media (max-width: 720px) {
  .grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  }
}

/* ─── Responsive: Mobile ─── */
@media (max-width: 600px) {
  .header {
    padding: 0.75rem 1rem;
  }
  .logo {
    font-size: 1.25rem;
  }
  .main {
    padding: 1rem 0.75rem;
  }
  .controls {
    gap: 0.5rem;
  }
  .search-wrap {
    width: 100%;
    max-width: none;
    order: -1;
  }
  .controls .btn-primary {
    margin-left: auto;
    padding: 0.55rem 0.9rem;
    font-size: 0.85rem;
  }
  .select {
    padding: 0.55rem 0.75rem;
    font-size: 0.85rem;
  }
  .modal-overlay {
    padding: 0.5rem;
  }
  .modal-panel {
    max-height: 95vh;
    padding: 1rem;
  }
  .pagination {
    gap: 0.5rem;
    margin-top: 1.5rem;
  }
  .page-info {
    font-size: 0.75rem;
  }
}

/* ─── Responsive: Small Mobile ─── */
@media (max-width: 450px) {
  .header {
    padding: 0.5rem 0.75rem;
  }
  .logo {
    font-size: 1.1rem;
  }
  .main {
    padding: 0.75rem 0.5rem;
  }
  .grid {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 0.75rem;
  }
  .card-meta {
    padding: 0.5rem 0.65rem;
  }
  .card-title {
    font-size: 0.85rem;
  }
  .card-tags {
    font-size: 0.7rem;
  }
  .card-actions {
    gap: 0.35rem;
    padding: 0.35rem;
  }
  .btn-card {
    font-size: 0.7rem;
    padding: 0.3rem 0;
  }
  .title-input {
    max-width: none;
    width: 100%;
  }
  .preview {
    max-width: 100%;
  }
  .storage-bar {
    width: 60px;
  }
  .storage-text {
    font-size: 0.55rem;
  }
}

/* ─── Responsive: Very Small ─── */
@media (max-width: 350px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .header-actions {
    gap: 0.3rem;
    flex-wrap: wrap;
  }
  .btn-ghost {
    padding: 0.3rem 0.5rem;
    font-size: 0.8rem;
  }
  .storage-indicator {
    display: none;
  }
}
</style>
