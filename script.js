const themeButton = document.getElementById("themeButton");
const themeIcon = document.getElementById("themeIcon");
const themeText = document.getElementById("themeText");
const appView = document.getElementById("appView");
const searchInput = document.getElementById("searchInput");

async function loadAccount() {
    try {
        const response = await fetch("/api/auth/me");
        const data = await response.json();
        if (!data.user) {
            window.location.assign("/");
            return;
        }
        document.getElementById("accountName").textContent = data.user.name;
        document.getElementById("accountEmail").textContent = data.user.email;
        document.querySelector(".avatar").textContent = data.user.name.charAt(0).toUpperCase();
    } catch (error) {
        window.location.assign("/");
    }
}

document.getElementById("logoutButton")?.addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
});

loadAccount();

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
    viewMode: "list"
};

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

async function requestJson(url, options = {}) {
    const response = await fetch(url, options);
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

    if (!storageLabel || !storageBar || !storageText) return;

    try {
        const stats = await requestJson("/api/stats");
        const percent = Math.min(100, Number(stats.usedPercent) || 0);
        storageLabel.textContent = `${percent.toFixed(0)}%`;
        storageBar.style.width = `${percent}%`;
        storageText.textContent = `${Number(stats.usedGb).toFixed(1)} Go utilisés sur ${Number(stats.totalGb).toFixed(0)} Go`;
    } catch (error) {
        storageLabel.textContent = "0%";
        storageBar.style.width = "0%";
        storageText.textContent = "Stockage local disponible";
    }
}

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
            <img class="preview-image" src="/api/download?path=${encodeURIComponent(itemPath)}" alt="Aperçu" />
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
                        const previewUrl = isPreviewableFile(entry.name) ? `/api/download?path=${encodeURIComponent(entry.path)}` : "";
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
                                    ${!isFolder ? `<a class="action-link" href="/api/download?path=${encodeURIComponent(entry.path)}" target="_blank" rel="noreferrer">Télécharger</a>` : ""}
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
                                                ${!isFolder && mode !== "trash" ? `<a class="action-link" href="/api/download?path=${encodeURIComponent(entry.path)}" target="_blank" rel="noreferrer">Télécharger</a>` : ""}
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

    if (view === "albums") {
        renderPlaceholderView("Albums", "Les albums arrivent bientôt pour organiser vos souvenirs.");
        return;
    }

    if (view === "favorites") {
        renderPlaceholderView("Favoris", "Vos fichiers favoris seront affichés ici.");
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

renderHomeView();
