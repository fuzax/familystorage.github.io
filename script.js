window.FAMILYDRIVE_BASE_PATH = window.FAMILYDRIVE_BASE_PATH || "";
window.familyDriveUrl = window.familyDriveUrl || ((path) => path);

const themeButton = document.getElementById("themeButton");
const themeIcon = document.getElementById("themeIcon");
const themeText = document.getElementById("themeText");
const appView = document.getElementById("appView");
const searchInput = document.getElementById("searchInput");

async function loadAccount() {
    try {
        const response = await fetch(window.familyDriveUrl("/api/auth/me"), { credentials: "include" });
        const data = await response.json();
        if (!data.user) {
            window.location.assign(`${window.FAMILYDRIVE_BASE_PATH || ""}/auth.html`);
            return;
        }
        document.getElementById("accountName").textContent = data.user.name;
        document.getElementById("accountEmail").textContent = data.user.email;
        document.querySelector(".avatar").textContent = data.user.name.charAt(0).toUpperCase();
        try {
            await requestJson("/api/admin/overview");
            document.getElementById("adminNavButton")?.classList.remove("hidden");
        } catch (error) {
            document.getElementById("adminNavButton")?.classList.add("hidden");
        }
        return data.user;
    } catch (error) {
        window.location.assign(`${window.FAMILYDRIVE_BASE_PATH || ""}/auth.html`);
        return null;
    }
}

document.getElementById("logoutButton")?.addEventListener("click", async () => {
    await fetch(window.familyDriveUrl("/api/auth/logout"), { credentials: "include", method: "POST" });
    window.location.assign(`${window.FAMILYDRIVE_BASE_PATH || ""}/auth.html`);
});

async function ensureBox(forceChooser = false) {
    const data = await requestJson("/api/boxes");
    if (data.activeBoxId && !forceChooser) {
        const activeBox = data.boxes.find((box) => box.id === data.activeBoxId) || null;
        if (activeBox) state.box = activeBox;
        return activeBox;
    }

    return new Promise((resolve) => {
        appView.innerHTML = `
            <section class="box-chooser">
                <div class="box-chooser-intro">
                    <p class="eyebrow">VOTRE ESPACE PARTAGE</p>
                    <h1>Choisissez votre box</h1>
                    <p>Chaque box possède son espace séparé et 30 Go gratuits. Partagez son code avec les personnes de votre choix.</p>
                </div>
                <div class="box-actions">
                    ${data.boxes.length ? `<div class="box-form box-existing"><h2>Mes box existantes</h2><p>Ouvrez une box que vous avez déjà rejointe.</p><div class="box-existing-list">${data.boxes.map((box) => `<button type="button" class="existing-box-button" data-box-id="${box.id}"><strong>${box.name}</strong><span>Code : ${box.code}</span></button>`).join("")}</div></div>` : ""}
                    <form id="createBoxForm" class="box-form">
                        <h2>Créer une box</h2>
                        <p>Créez un nouvel espace familial privé.</p>
                        <input name="name" placeholder="Nom de la box" maxlength="60" required>
                        <button class="auth-submit" type="submit">Créer ma box de 30 Go</button>
                    </form>
                    <form id="joinBoxForm" class="box-form">
                        <h2>Se connecter à une box</h2>
                        <p>Utilisez le code reçu par un proche.</p>
                        <input name="code" placeholder="Code de la box" minlength="8" maxlength="16" required>
                        <button class="auth-submit" type="submit">Rejoindre la box</button>
                    </form>
                </div>
                <p id="boxMessage" class="auth-message" role="alert"></p>
            </section>
        `;

        const showBox = (box) => {
            state.box = box;
            resolve(box);
        };
        const message = document.getElementById("boxMessage");
        document.querySelectorAll(".existing-box-button").forEach((button) => {
            button.addEventListener("click", async () => {
                try {
                    const result = await requestJson("/api/boxes/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ boxId: button.dataset.boxId }) });
                    showBox(result.box);
                } catch (error) {
                    message.textContent = error.message;
                }
            });
        });
        document.getElementById("createBoxForm").addEventListener("submit", async (event) => {
            event.preventDefault();
            try {
                const result = await requestJson("/api/boxes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: new FormData(event.currentTarget).get("name") }) });
                showBox(result.box);
            } catch (error) {
                message.textContent = error.message;
            }
        });
        document.getElementById("joinBoxForm").addEventListener("submit", async (event) => {
            event.preventDefault();
            try {
                const result = await requestJson("/api/boxes/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: new FormData(event.currentTarget).get("code") }) });
                showBox(result.box);
            } catch (error) {
                message.textContent = error.message;
            }
        });
    });
}

const STORAGE_KEY = "familydrive-photos";
const defaultPhotos = [
    { id: "default-1", name: "Vacances", alt: "Paysage", src: "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=900&q=80", dateLabel: "Il y a 2 jours" },
    { id: "default-2", name: "Plage", alt: "Plage", src: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80", dateLabel: "Il y a 4 jours" },
    { id: "default-3", name: "Nature", alt: "Montagne", src: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=900&q=80", dateLabel: "Il y a 1 semaine" },
    { id: "default-4", name: "Souvenirs", alt: "Paysage", src: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=900&q=80", dateLabel: "Il y a 1 semaine" }
];

const state = {
    view: "home",
    currentPath: "",
    viewMode: "list",
    box: null
};

async function refreshBoxPanel() {
    const boxList = document.getElementById("boxList");
    if (!boxList) return;
    try {
        const data = await requestJson("/api/boxes");
        boxList.innerHTML = data.boxes.map((box) => `
            <button type="button" class="box-list-item ${box.id === state.box?.id ? "active" : ""}" data-box-id="${box.id}">
                <strong>${box.name}</strong>
                <span>${box.code} · ${box.usedGb} / ${box.quotaGb} Go</span>
            </button>
        `).join("") || `<span class="box-list-empty">Aucune box</span>`;
        boxList.querySelectorAll(".box-list-item").forEach((button) => {
            button.addEventListener("click", async () => {
                const result = await requestJson("/api/boxes/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ boxId: button.dataset.boxId }) });
                state.box = result.box;
                state.currentPath = "";
                refreshBoxPanel();
                renderHomeView();
            });
        });
    } catch (error) {
        boxList.innerHTML = "<span class=\"box-list-empty\">Box indisponible</span>";
    }
}

let photos = loadPhotos();

function loadPhotos() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (Array.isArray(saved) && saved.length > 0) {
            return saved;
        }
    } catch (error) {
        console.warn("Impossible de lire les photos sauvegardées.", error);
    }
    return [...defaultPhotos];
}

function savePhotos() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(photos));
}

function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
        reader.readAsDataURL(file);
    });
}

function createPhotoCard(photo) {
    const card = document.createElement("article");
    card.className = "photo-card";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-photo";
    deleteButton.setAttribute("aria-label", `Supprimer ${photo.name}`);
    deleteButton.dataset.id = photo.id;
    deleteButton.textContent = "✕";

    const image = document.createElement("img");
    image.src = photo.src;
    image.alt = photo.alt || photo.name;

    const info = document.createElement("div");
    info.className = "photo-info";

    const title = document.createElement("strong");
    title.textContent = photo.name;

    const meta = document.createElement("span");
    meta.textContent = photo.dateLabel || "Nouvelle photo";

    info.append(title, meta);
    card.append(deleteButton, image, info);
    return card;
}

function renderPhotosHome(filter = "") {
    const photoGrid = document.getElementById("photoGrid");
    if (!photoGrid) return;

    const query = filter.trim().toLowerCase();
    const filteredPhotos = photos.filter((photo) => {
        if (!query) return true;
        return (
            photo.name.toLowerCase().includes(query) ||
            (photo.alt || "").toLowerCase().includes(query)
        );
    });

    photoGrid.innerHTML = "";
    if (filteredPhotos.length === 0) {
        const emptyState = document.createElement("div");
        emptyState.className = "empty-state";
        emptyState.textContent = query
            ? "Aucune photo ne correspond à votre recherche."
            : "Aucune photo dans votre espace pour le moment.";
        photoGrid.appendChild(emptyState);
        return;
    }

    filteredPhotos.forEach((photo) => {
        photoGrid.appendChild(createPhotoCard(photo));
    });
}

function renderHomeView() {
    refreshStorageStats();
    refreshFolderTree();
    appView.innerHTML = `
        <section class="welcome">
            <div>
                <p class="eyebrow">VOTRE ESPACE FAMILIAL</p>
                <h1>Bienvenue sur <span>FamilyDrive</span></h1>
                <p class="subtitle">Retrouvez tous vos souvenirs au même endroit.</p>
                <p class="box-identity">Box : <strong>${state.box?.name || ""}</strong> <span>Code de partage : <b>${state.box?.code || ""}</b></span></p>
            </div>
            <button id="uploadButton" class="upload-button">＋ Ajouter des photos</button>
            <input id="fileInput" type="file" accept="image/*" multiple hidden>
        </section>

        <section class="stats">
            <div class="stat">
                <div class="stat-icon purple">▧</div>
                <div>
                    <strong>1 284</strong>
                    <span>Photos</span>
                </div>
            </div>
            <div class="stat">
                <div class="stat-icon blue">□</div>
                <div>
                    <strong>18</strong>
                    <span>Albums</span>
                </div>
            </div>
            <div class="stat">
                <div class="stat-icon yellow">☆</div>
                <div>
                    <strong>96</strong>
                    <span>Favoris</span>
                </div>
            </div>
        </section>

        <section class="photos-section">
            <div class="section-header">
                <h2>Photos récentes</h2>
                <a href="#">Voir tout →</a>
            </div>
            <div id="photoGrid" class="photo-grid"></div>
        </section>
    `;

    const uploadButton = document.getElementById("uploadButton");
    const fileInput = document.getElementById("fileInput");

    uploadButton.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", async () => {
        const files = Array.from(fileInput.files || []);
        if (files.length === 0) return;

        const newPhotos = [];
        for (const file of files) {
            const src = await fileToDataURL(file);
            newPhotos.push({
                id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                name: file.name,
                alt: file.name,
                src,
                dateLabel: "Nouvelle photo"
            });
        }

        photos = [...newPhotos, ...photos];
        savePhotos();
        renderPhotosHome(searchInput.value);
        fileInput.value = "";
    });

    const photoGrid = document.getElementById("photoGrid");
    photoGrid.addEventListener("click", (event) => {
        const deleteButton = event.target.closest(".delete-photo");
        if (!deleteButton) return;

        const { id } = deleteButton.dataset;
        photos = photos.filter((photo) => photo.id !== id);
        savePhotos();
        renderPhotosHome(searchInput.value);
    });

    renderPhotosHome(searchInput.value);
}

function renderPlaceholderView(title, text) {
    appView.innerHTML = `
        <div class="placeholder-view">
            <div class="placeholder-card">
                <h2>${title}</h2>
                <p>${text}</p>
            </div>
        </div>
    `;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function renderAdminView() {
    appView.innerHTML = `<div class="explorer-card admin-panel"><div class="section-header"><div><p class="eyebrow">ACCÈS ADMINISTRATEUR</p><h2>Vue globale</h2></div></div><div id="adminContent" class="admin-content">Chargement...</div></div>`;
    try {
        const overview = await requestJson("/api/admin/overview");
        const adminContent = document.getElementById("adminContent");
        adminContent.innerHTML = `
            <div class="admin-stats">
                <div class="stat"><strong>${overview.users}</strong><span>Utilisateurs</span></div>
                <div class="stat"><strong>${overview.boxes}</strong><span>Box</span></div>
                <div class="stat"><strong>${overview.members}</strong><span>Accès membres</span></div>
                <div class="stat"><strong>${overview.usedGb} Go</strong><span>Stockage utilisé</span></div>
            </div>
            <div class="admin-section">
                <div class="admin-section-heading"><h3>Utilisateurs</h3><input id="adminUserSearch" type="search" placeholder="Rechercher un utilisateur" aria-label="Rechercher un utilisateur"></div>
                <div id="adminUsers" class="admin-log"></div>
            </div>
            <div class="admin-section">
                <div class="admin-section-heading"><h3>Box</h3><input id="adminBoxSearch" type="search" placeholder="Rechercher une box" aria-label="Rechercher une box"></div>
                <div id="adminBoxes" class="admin-log"></div>
            </div>
            <div class="admin-section">
                <div class="admin-section-heading"><h3>Journal des activités</h3><input id="adminActivitySearch" type="search" placeholder="Filtrer les activités" aria-label="Filtrer les activités"></div>
                <div id="adminActivities" class="admin-log"></div>
            </div>
        `;
        const renderUsers = (query = "") => {
            const normalizedQuery = query.trim().toLocaleLowerCase();
            const users = overview.usersList.filter((candidate) => `${candidate.name} ${candidate.email}`.toLocaleLowerCase().includes(normalizedQuery));
            document.getElementById("adminUsers").innerHTML = users.length ? users.map((candidate) => `<div class="admin-log-row"><div><strong>${escapeHtml(candidate.name)}</strong><span>${escapeHtml(candidate.email)} · ${escapeHtml(candidate.provider || "email")}</span></div><time>${new Date(candidate.createdAt).toLocaleDateString("fr-FR")}</time></div>`).join("") : "Aucun utilisateur trouvé.";
        };
        const renderBoxes = (query = "") => {
            const normalizedQuery = query.trim().toLocaleLowerCase();
            const boxes = overview.boxesList.filter((box) => `${box.name} ${box.owner}`.toLocaleLowerCase().includes(normalizedQuery));
            document.getElementById("adminBoxes").innerHTML = boxes.length ? boxes.map((box) => `<div class="admin-log-row"><div><strong>${escapeHtml(box.name)}</strong><span>${escapeHtml(box.owner)} · ${box.memberCount} membre(s) · ${box.files} fichier(s)</span></div><time>${escapeHtml(box.usedGb)} Go</time></div>`).join("") : "Aucune box trouvée.";
        };
        const renderActivities = (query = "") => {
            const normalizedQuery = query.trim().toLocaleLowerCase();
            const activities = overview.activities.filter((activity) => `${activity.type} ${activity.userEmail || "Système"} ${activity.boxName || ""}`.toLocaleLowerCase().includes(normalizedQuery));
            document.getElementById("adminActivities").innerHTML = activities.length ? activities.map((activity) => `<div class="admin-log-row"><strong>${escapeHtml(activity.type)}</strong><span>${escapeHtml(activity.userEmail || "Système")} · ${escapeHtml(activity.boxName || "Sans box")} · ${new Date(activity.createdAt).toLocaleString("fr-FR")}</span></div>`).join("") : "Aucune activité trouvée.";
        };
        renderUsers();
        renderBoxes();
        renderActivities();
        document.getElementById("adminUserSearch").addEventListener("input", (event) => renderUsers(event.target.value));
        document.getElementById("adminBoxSearch").addEventListener("input", (event) => renderBoxes(event.target.value));
        document.getElementById("adminActivitySearch").addEventListener("input", (event) => renderActivities(event.target.value));
    } catch (error) {
        appView.innerHTML = `<div class="error-box">${error.message}</div>`;
    }
}

async function requestJson(url, options = {}) {
    const response = await fetch(window.familyDriveUrl(url), { credentials: "include", ...options });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.message || "Erreur serveur");
    }
    return data;
}

async function refreshStorageStats() {
    const storageLabel = document.getElementById("storageUsedLabel");
    const storageBar = document.getElementById("storageBar");
    const storageText = document.getElementById("storageText");
    const storageWarning = document.getElementById("storageWarning");

    if (!storageLabel || !storageBar || !storageText) return;

    try {
        const stats = await requestJson("/api/stats");
        const percent = Math.min(100, Number(stats.usedPercent) || 0);
        storageLabel.textContent = `${percent.toFixed(0)}%`;
        storageBar.style.width = `${percent}%`;
        storageText.textContent = `${Number(stats.usedGb).toFixed(1)} Go utilisés sur ${Number(stats.totalGb).toFixed(0)} Go`;
        storageBar.parentElement.classList.toggle("storage-near-full", percent >= 80 && percent < 95);
        storageBar.parentElement.classList.toggle("storage-critical", percent >= 95);
        if (storageWarning) {
            storageWarning.className = "storage-warning";
            if (percent >= 100) {
                storageWarning.textContent = "Stockage saturé : libérez de l’espace pour ajouter des fichiers.";
                storageWarning.classList.add("critical");
            } else if (percent >= 95) {
                storageWarning.textContent = "Attention : il reste très peu d’espace dans cette box.";
                storageWarning.classList.add("critical");
            } else if (percent >= 80) {
                storageWarning.textContent = "Prévention : votre box approche de la saturation.";
                storageWarning.classList.add("warning");
            }
        }
    } catch (error) {
        storageLabel.textContent = "0%";
        storageBar.style.width = "0%";
        storageText.textContent = "Stockage local disponible";
        storageBar.parentElement.classList.remove("storage-near-full", "storage-critical");
        if (storageWarning) storageWarning.textContent = "";
    }
}

window.setInterval(() => {
    if (state.box) refreshStorageStats();
}, 10000);

async function refreshFolderTree() {
    const treeContainer = document.getElementById("folderTree");
    if (!treeContainer) return;

    try {
        const tree = await requestJson("/api/tree");
        treeContainer.innerHTML = "";

        const appendBranch = (node, depth = 0) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "tree-item";
            if ((state.currentPath || "") === (node.path || "")) {
                button.classList.add("active");
            }
            button.style.marginLeft = `${depth * 12}px`;
            button.innerHTML = `<span class="tree-icon">📁</span><span>${node.name}</span>`;
            button.addEventListener("click", () => {
                state.currentPath = node.path || "";
                renderFilesView();
            });
            treeContainer.appendChild(button);

            (node.children || []).forEach((child) => appendBranch(child, depth + 1));
        };

        appendBranch(tree);
    } catch (error) {
        treeContainer.innerHTML = "<div class=\"empty-state\">Arbre indisponible</div>";
    }
}

async function loadFiles() {
    return requestJson(`/api/files?path=${encodeURIComponent(state.currentPath)}`);
}

async function loadTrash() {
    return requestJson(`/api/files?path=${encodeURIComponent("trash")}`);
}

function formatSize(size) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isPreviewableFile(fileName) {
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fileName || "");
}

function renderPreviewModal(itemPath) {
    const modal = document.createElement("div");
    modal.className = "preview-modal";
    modal.innerHTML = `
        <div class="preview-card">
            <button class="preview-close" type="button">✕</button>
            <img class="preview-image" src="${window.familyDriveUrl(`/api/download?path=${encodeURIComponent(itemPath)}`)}" alt="Aperçu" />
        </div>
    `;

    modal.querySelector(".preview-close").addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (event) => {
        if (event.target === modal) modal.remove();
    });

    document.body.appendChild(modal);
}

function bindExplorerActions({ filesBody, currentPath, mode }) {
    filesBody.querySelectorAll(".file-row-name").forEach((button) => {
        button.addEventListener("click", () => {
            const entryPath = button.dataset.entryPath;
            if (button.dataset.type === "folder") {
                state.currentPath = entryPath;
                renderFilesView(mode);
            } else if (isPreviewableFile(button.textContent.trim())) {
                renderPreviewModal(entryPath);
            }
        });
    });

    filesBody.querySelectorAll("[data-delete-path]").forEach((button) => {
        button.addEventListener("click", async () => {
            const pathToDelete = button.dataset.deletePath;
            const confirmed = window.confirm("Voulez-vous vraiment supprimer cet élément ?");
            if (!confirmed) return;

            await requestJson(`/api/files?path=${encodeURIComponent(pathToDelete)}`, { method: "DELETE" });
            if (mode === "trash") {
                renderTrashView();
                return;
            }
            renderFilesView(mode);
        });
    });

    filesBody.querySelectorAll("[data-rename-path]").forEach((button) => {
        button.addEventListener("click", async () => {
            const current = button.dataset.renamePath;
            const newName = window.prompt("Nouveau nom :", current.split("/").pop());
            if (!newName) return;

            await requestJson("/api/rename", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: current, newName })
            });
            renderFilesView(mode);
        });
    });

    filesBody.querySelectorAll("[data-move-path]").forEach((button) => {
        button.addEventListener("click", async () => {
            const current = button.dataset.movePath;
            const destination = window.prompt("Déplacer vers (chemin relatif, vide pour la racine) :", "");
            if (destination === null) return;

            await requestJson("/api/move", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: current, destinationPath: destination || "" })
            });
            renderFilesView(mode);
        });
    });

    filesBody.querySelectorAll("[data-restore-path]").forEach((button) => {
        button.addEventListener("click", async () => {
            const toRestore = button.dataset.restorePath;
            await requestJson("/api/restore", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: toRestore })
            });
            renderTrashView();
        });
    });

    filesBody.querySelectorAll("[data-share-path]").forEach((button) => {
        button.addEventListener("click", async () => {
            const password = window.prompt("Mot de passe du lien (laisser vide pour aucun mot de passe) :", "");
            if (password === null) return;
            const hours = window.prompt("Durée du lien en heures (1 à 168) :", "24");
            if (hours === null) return;
            const result = await requestJson("/api/shares", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: button.dataset.sharePath, password, hours: Number(hours) })
            });
            window.prompt("Copiez ce lien de partage :", `${window.location.origin}${result.url}`);
        });
    });

    filesBody.querySelectorAll("[data-open-path]").forEach((button) => {
        button.addEventListener("click", () => {
            const entryPath = button.dataset.openPath;
            const isFolder = button.dataset.type === "folder";
            if (isFolder) {
                state.currentPath = entryPath;
                renderFilesView(mode);
                return;
            }
            if (isPreviewableFile(button.dataset.name || "")) {
                renderPreviewModal(entryPath);
            }
        });
    });

    filesBody.querySelectorAll("[draggable='true']").forEach((item) => {
        item.addEventListener("dragstart", (event) => {
            event.dataTransfer.setData("text/plain", item.dataset.dragPath || "");
            event.dataTransfer.effectAllowed = "move";
        });

        item.addEventListener("dragover", (event) => {
            const targetPath = item.dataset.dropPath || "";
            if (targetPath && targetPath !== "") {
                event.preventDefault();
            }
        });

        item.addEventListener("drop", async (event) => {
            const targetPath = item.dataset.dropPath || "";
            if (!targetPath) return;
            event.preventDefault();
            const sourcePath = event.dataTransfer.getData("text/plain");
            if (!sourcePath || sourcePath === targetPath) return;

            await requestJson("/api/move", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: sourcePath, destinationPath: targetPath })
            });
            renderFilesView(mode);
        });
    });
}

function renderFilesView(mode = "files") {
    const targetPath = mode === "trash" ? "trash" : state.currentPath;
    refreshStorageStats();
    refreshFolderTree();

    appView.innerHTML = `
        <div class="explorer-card">
            <div class="explorer-toolbar">
                <div class="breadcrumb" id="breadcrumb"></div>
                <div class="toolbar-actions">
                    <div class="view-toggle">
                        <button class="view-button ${state.viewMode === "list" ? "active" : ""}" type="button" data-view-mode="list">Liste</button>
                        <button class="view-button ${state.viewMode === "grid" ? "active" : ""}" type="button" data-view-mode="grid">Grille</button>
                    </div>
                    <button id="newFolderButton" class="small-button">＋ Nouveau dossier</button>
                    <button id="uploadFolderButton" class="small-button primary">Téléverser</button>
                    <input id="folderUploadInput" type="file" multiple hidden>
                </div>
            </div>
            <div id="filesContainer" class="files-container"></div>
        </div>
    `;

    const loadData = mode === "trash" ? loadTrash : loadFiles;

    loadData().then((data) => {
        const breadcrumb = document.getElementById("breadcrumb");
        const filesContainer = document.getElementById("filesContainer");
        const pathValue = mode === "trash" ? "Corbeille" : data.currentPath;
        const segments = mode === "trash" ? ["Corbeille"] : (pathValue ? pathValue.split("/") : ["Accueil"]);
        const crumbs = [`<button class="crumb" data-path="">${mode === "trash" ? "Corbeille" : "Accueil"}</button>`];

        if (mode !== "trash") {
            let accum = "";
            segments.forEach((segment) => {
                if (!segment || segment === "Accueil") return;
                accum += (accum ? "/" : "") + segment;
                crumbs.push(`<button class="crumb" data-path="${accum}">${segment}</button>`);
            });
        }

        breadcrumb.innerHTML = crumbs.join(" / ");
        breadcrumb.querySelectorAll(".crumb").forEach((crumb) => {
            crumb.addEventListener("click", () => {
                if (mode === "trash") {
                    renderTrashView();
                    return;
                }
                state.currentPath = crumb.dataset.path || "";
                renderFilesView();
            });
        });

        if (data.entries.length === 0) {
            filesContainer.innerHTML = `<div class="empty-row">${mode === "trash" ? "La corbeille est vide." : "Ce dossier est vide."}</div>`;
        } else if (state.viewMode === "grid") {
            filesContainer.innerHTML = `
                <div class="file-grid">
                    ${data.entries.map((entry) => {
                        const isFolder = entry.type === "folder";
                        const previewUrl = isPreviewableFile(entry.name) ? window.familyDriveUrl(`/api/download?path=${encodeURIComponent(entry.path)}`) : "";
                        return `
                            <div class="file-card" draggable="true" data-drag-path="${entry.path}" data-drop-path="${isFolder ? entry.path : ""}">
                                <div class="file-card-preview ${isFolder ? "folder-preview" : ""}">
                                    ${previewUrl ? `<img src="${previewUrl}" alt="${entry.name}" />` : `${isFolder ? "📁" : "📄"}`}
                                </div>
                                <div class="file-card-body">
                                    <strong>${entry.name}</strong>
                                    <small>${isFolder ? "Dossier" : formatSize(entry.size)}</small>
                                </div>
                                <div class="row-actions compact">
                                    <button class="action-link" data-open-path="${entry.path}" data-type="${entry.type}" data-name="${entry.name}">${isFolder ? "Ouvrir" : (isPreviewableFile(entry.name) ? "Aperçu" : "Télécharger")}</button>
                                    ${!isFolder ? `<a class="action-link" href="${window.familyDriveUrl(`/api/download?path=${encodeURIComponent(entry.path)}`)}" target="_blank" rel="noreferrer">Télécharger</a><button class="action-link" data-share-path="${entry.path}">Partager</button>` : ""}
                                    ${mode !== "trash" ? `<button class="action-link" data-move-path="${entry.path}">Déplacer</button>` : ""}
                                    ${mode !== "trash" ? `<button class="action-link danger" data-delete-path="${entry.path}">Supprimer</button>` : `<button class="action-link danger" data-delete-path="${entry.path}">Supprimer</button>`}
                                </div>
                            </div>
                        `;
                    }).join("")}
                </div>
            `;
        } else {
            filesContainer.innerHTML = `
                <div class="files-table-wrap">
                    <table class="files-table">
                        <thead>
                            <tr>
                                <th>Nom</th>
                                <th>Type</th>
                                <th>Taille</th>
                                <th>Modifié</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.entries.map((entry) => {
                                const isFolder = entry.type === "folder";
                                return `
                                    <tr data-path="${entry.path}" draggable="true" data-drag-path="${entry.path}" data-drop-path="${isFolder ? entry.path : ""}">
                                        <td>
                                            <button class="file-row-name ${isFolder ? "folder" : "file"}" data-entry-path="${entry.path}" data-type="${entry.type}">
                                                ${isFolder ? "📁" : "📄"} ${entry.name}
                                            </button>
                                        </td>
                                        <td>${isFolder ? "Dossier" : "Fichier"}</td>
                                        <td>${isFolder ? "—" : formatSize(entry.size)}</td>
                                        <td>${new Date(entry.modifiedAt).toLocaleString("fr-FR")}</td>
                                        <td>
                                            <div class="row-actions">
                                                ${mode === "trash" ? `<button class="action-link" data-restore-path="${entry.path}">Restaurer</button>` : ""}
                                                ${!isFolder && mode !== "trash" ? `<a class="action-link" href="${window.familyDriveUrl(`/api/download?path=${encodeURIComponent(entry.path)}`)}" target="_blank" rel="noreferrer">Télécharger</a><button class="action-link" data-share-path="${entry.path}">Partager</button>` : ""}
                                                ${mode === "trash" ? `<button class="action-link danger" data-delete-path="${entry.path}">Supprimer</button>` : `<button class="action-link" data-rename-path="${entry.path}">Renommer</button>`}
                                                ${mode !== "trash" ? `<button class="action-link" data-move-path="${entry.path}">Déplacer</button>` : ""}
                                                ${mode !== "trash" ? `<button class="action-link danger" data-delete-path="${entry.path}">Supprimer</button>` : ""}
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            }).join("")}
                        </tbody>
                    </table>
                </div>
            `;
        }

        const filesBody = filesContainer.querySelector("tbody") || filesContainer;
        bindExplorerActions({ filesBody, currentPath: targetPath, mode });

        const goBackButton = document.createElement("button");
        goBackButton.className = "small-button secondary";
        if (mode === "trash" || !data.parentPath && data.currentPath === "") {
            goBackButton.disabled = true;
        }
        goBackButton.textContent = "⬅ Retour";
        goBackButton.addEventListener("click", () => {
            if (mode === "trash") return;
            state.currentPath = data.parentPath || "";
            renderFilesView();
        });

        const toolbar = document.querySelector(".toolbar-actions");
        toolbar.prepend(goBackButton);

        document.querySelectorAll(".view-button").forEach((button) => {
            button.addEventListener("click", () => {
                state.viewMode = button.dataset.viewMode;
                renderFilesView(mode);
            });
        });

        if (mode !== "trash") {
            document.getElementById("newFolderButton").addEventListener("click", async () => {
                const folderName = window.prompt("Nom du nouveau dossier :");
                if (!folderName) return;

                await requestJson("/api/folders", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: folderName, path: state.currentPath })
                });
                renderFilesView();
            });

            document.getElementById("uploadFolderButton").addEventListener("click", () => {
                document.getElementById("folderUploadInput").click();
            });

            document.getElementById("folderUploadInput").addEventListener("change", async (event) => {
                const files = Array.from(event.target.files || []);
                if (files.length === 0) return;

                const formData = new FormData();
                files.forEach((file) => formData.append("files", file));
                formData.append("path", state.currentPath);

                await requestJson("/api/upload", {
                    method: "POST",
                    body: formData
                });
                renderFilesView();
                event.target.value = "";
            });
        }
    }).catch((error) => {
        appView.innerHTML = `<div class="error-box">${error.message}</div>`;
    });
}

function renderTrashView() {
    state.view = "trash";
    renderFilesView("trash");
}

async function renderMembersView() {
    appView.innerHTML = `<div class="explorer-card members-panel"><div class="section-header"><div><p class="eyebrow">ESPACE PARTAGÉ</p><h2>Membres et invitations</h2></div></div><div id="membersContent">Chargement...</div></div>`;
    try {
        const data = await requestJson("/api/boxes/members");
        const canManage = state.box?.role === "owner";
        document.getElementById("membersContent").innerHTML = `
            ${canManage ? `<form id="inviteMemberForm" class="member-invite-form"><input name="hours" type="number" min="1" max="168" value="72" aria-label="Durée de l’invitation en heures"><select name="role" aria-label="Rôle"><option value="member">Membre</option><option value="readonly">Lecture seule</option></select><button class="small-button primary" type="submit">Créer une invitation</button></form>` : ""}
            <div class="member-list">${data.members.map((member) => `<div class="member-row"><div><strong>${member.name}</strong><span>${member.email}</span></div><b>${member.role}</b>${canManage && !member.owner ? `<select data-member-role="${member.id}"><option value="member" ${member.role === "member" ? "selected" : ""}>Membre</option><option value="readonly" ${member.role === "readonly" ? "selected" : ""}>Lecture seule</option></select><button class="action-link danger" data-remove-member="${member.id}">Retirer</button>` : ""}</div>`).join("")}</div>
        `;
        document.getElementById("inviteMemberForm")?.addEventListener("submit", async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const result = await requestJson("/api/boxes/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hours: form.get("hours"), role: form.get("role") }) });
            window.prompt("Copiez ce lien d’invitation :", `${window.location.origin}/?invitation=${result.invitation.token}`);
        });
        document.querySelectorAll("[data-member-role]").forEach((select) => select.addEventListener("change", async () => {
            await requestJson(`/api/boxes/members/${select.dataset.memberRole}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: select.value }) });
        }));
        document.querySelectorAll("[data-remove-member]").forEach((button) => button.addEventListener("click", async () => {
            if (!window.confirm("Retirer ce membre de la box ?")) return;
            await requestJson(`/api/boxes/members/${button.dataset.removeMember}`, { method: "DELETE" });
            renderMembersView();
        }));
    } catch (error) {
        appView.innerHTML = `<div class="error-box">${error.message}</div>`;
    }
}

async function renderSearchView(query) {
    try {
        const data = await requestJson(`/api/search?q=${encodeURIComponent(query)}`);
            appView.innerHTML = `<div class="explorer-card"><div class="section-header"><h2>Résultats pour « ${query} »</h2></div><div class="member-list">${data.results.length ? data.results.map((file) => `<div class="member-row"><div><strong>${file.name}</strong><span>${file.path} · ${formatSize(file.size)}${file.contentMatch ? ` · ${file.snippet || "Correspondance dans le contenu"}` : ""}</span></div><a class="action-link" href="${window.familyDriveUrl(`/api/download?path=${encodeURIComponent(file.path)}`)}" target="_blank" rel="noreferrer">Ouvrir</a></div>`).join("") : "Aucun résultat."}</div></div>`;
    } catch (error) {
        appView.innerHTML = `<div class="error-box">${error.message}</div>`;
    }
}

function detectAssistantSearch(query) {
    const normalized = query.toLowerCase();
    let type = "all";
    if (/photo|image|jpg|jpeg|png|gif/.test(normalized)) type = "image";
    if (/video|mp4|film/.test(normalized)) type = "video";
    if (/pdf|document|doc|excel|texte|fichier/.test(normalized)) type = "document";
    const cleanedQuery = normalized
        .replace(/\b(trouve|chercher|cherche|montre|affiche|moi|mes|dans|la|le|les|des|fichiers?|photos?|images?|videos?|documents?|pdf)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return { type, query: cleanedQuery };
}

async function renderAssistantView() {
    state.view = "assistant";
    const messages = [];
    appView.innerHTML = `
        <section class="assistant-panel">
            <div class="assistant-heading">
                <div>
                    <p class="eyebrow">CONVERSATION PRIVÉE</p>
                    <h1>Assistant IA</h1>
                    <p class="subtitle">Pose tes questions naturellement. L’assistant connaît uniquement la box active : <strong>${state.box?.name || ""}</strong>.</p>
                </div>
                <span class="assistant-scope">Box active uniquement</span>
            </div>
            <div id="assistantResults" class="assistant-results">
                <div class="assistant-welcome">Bonjour ! Je peux discuter avec toi et retrouver les fichiers de cette box. Que veux-tu savoir ?</div>
            </div>
            <form id="assistantForm" class="assistant-form">
                <input id="assistantQuery" name="query" type="search" placeholder="Écris ton message..." autocomplete="off" required>
                <button class="auth-submit" type="submit">Envoyer</button>
            </form>
            <p class="assistant-hint">Tu peux demander « quels documents parlent de la maison ? » ou simplement discuter.</p>
        </section>
    `;

    const results = document.getElementById("assistantResults");
    const addMessage = (role, content, files = []) => {
        const message = document.createElement("div");
        message.className = `assistant-message assistant-message-${role}`;
        const label = document.createElement("strong");
        label.textContent = role === "user" ? "Vous" : "Assistant";
        const text = document.createElement("p");
        text.textContent = content;
        message.append(label, text);
        if (files.length) {
            const fileList = document.createElement("div");
            fileList.className = "assistant-file-list";
            files.forEach((file) => {
                const link = document.createElement("a");
                link.className = "action-link";
                link.href = window.familyDriveUrl(`/api/download?path=${encodeURIComponent(file.path)}`);
                link.target = "_blank";
                link.rel = "noreferrer";
                link.textContent = `Ouvrir ${file.path}`;
                fileList.append(link);
            });
            message.append(fileList);
        }
        results.append(message);
        results.scrollTop = results.scrollHeight;
        return message;
    };

    document.getElementById("assistantForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const input = document.getElementById("assistantQuery");
        const button = event.currentTarget.querySelector("button");
        const query = input.value.trim();
        if (!query) return;
        messages.push({ role: "user", content: query });
        addMessage("user", query);
        input.value = "";
        input.disabled = true;
        button.disabled = true;
        const loading = addMessage("assistant", "Je réfléchis...");
        try {
            const data = await requestJson("/api/assistant/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages })
            });
            loading.remove();
            messages.push({ role: "assistant", content: data.message });
            addMessage("assistant", data.message, data.files || []);
        } catch (error) {
            loading.remove();
            messages.pop();
            addMessage("assistant", error.message);
        } finally {
            input.disabled = false;
            button.disabled = false;
            input.focus();
        }
    });
}

function switchView(view) {
    state.view = view;
    const navButtons = document.querySelectorAll(".nav-link");

    navButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.view === view);
    });

    if (view === "files") {
        state.currentPath = "";
        renderFilesView();
        return;
    }

    if (view === "home") {
        renderHomeView();
        return;
    }

    if (view === "trash") {
        renderTrashView();
        return;
    }

    if (view === "members") {
        renderMembersView();
        return;
    }

    if (view === "assistant") {
        renderAssistantView();
        return;
    }

    if (view === "albums") {
        renderPlaceholderView("Albums", "Les albums arrivent bientôt pour organiser vos souvenirs.");
        return;
    }

    if (view === "favorites") {
        renderPlaceholderView("Favoris", "Vos fichiers favoris seront affichés ici.");
        return;
    }

    if (view === "admin") {
        renderAdminView();
        return;
    }

    renderPlaceholderView("Corbeille", "Les éléments supprimés peuvent être restaurés depuis ici.");
}

function updateTheme() {
    const dark = document.body.classList.contains("dark");
    if (dark) {
        themeIcon.textContent = "☀";
        themeText.textContent = "Mode clair";
    } else {
        themeIcon.textContent = "☾";
        themeText.textContent = "Mode sombre";
    }
}

const savedTheme = localStorage.getItem("familydrive-theme");
if (savedTheme === "dark") {
    document.body.classList.add("dark");
}

updateTheme();

themeButton.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const dark = document.body.classList.contains("dark");
    localStorage.setItem("familydrive-theme", dark ? "dark" : "light");
    updateTheme();
});

searchInput.addEventListener("input", (event) => {
    if (state.view === "home") {
        renderPhotosHome(event.target.value);
    } else if (event.target.value.trim().length >= 2) {
        renderSearchView(event.target.value.trim());
    }
});

document.querySelectorAll(".nav-link").forEach((button) => {
    button.addEventListener("click", () => {
        const view = button.dataset.view;
        if (view) {
            switchView(view);
        }
    });
});

async function initApp() {
    const user = await loadAccount();
    if (!user) return;
    const invitationToken = new URLSearchParams(window.location.search).get("invitation");
    if (invitationToken) {
        try {
            const result = await requestJson("/api/boxes/join-invitation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: invitationToken }) });
            state.box = result.box;
            window.history.replaceState({}, "", window.location.pathname);
        } catch (error) {
            window.alert(error.message);
        }
    }
    const box = await ensureBox();
    if (!box) return;
    refreshBoxPanel();
    renderHomeView();
}

document.getElementById("boxHelpButton")?.addEventListener("click", () => {
    document.getElementById("boxHelpModal")?.classList.remove("hidden");
});

document.getElementById("closeBoxHelpButton")?.addEventListener("click", () => {
    document.getElementById("boxHelpModal")?.classList.add("hidden");
});

document.getElementById("boxHelpModal")?.addEventListener("click", (event) => {
    if (event.target.id === "boxHelpModal") event.currentTarget.classList.add("hidden");
});

document.getElementById("addBoxButton")?.addEventListener("click", () => {
    appView.innerHTML = "";
    ensureBox(true).then((box) => {
        if (box) {
            state.box = box;
            refreshBoxPanel();
            renderHomeView();
        }
    });
});

initApp();
