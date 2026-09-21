const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const STORAGE_ROOT = process.env.STORAGE_ROOT || path.join(__dirname, "storage");
const TRASH_ROOT = process.env.TRASH_ROOT || path.join(__dirname, "trash");
const TMP_UPLOAD_DIR = process.env.TMP_UPLOAD_DIR || path.join(__dirname, "tmp-uploads");
const AUTH_DB_PATH = process.env.AUTH_DB_PATH || path.join(__dirname, "users.json");
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const sessions = new Map();

fs.mkdirSync(STORAGE_ROOT, { recursive: true });
fs.mkdirSync(TRASH_ROOT, { recursive: true });
fs.mkdirSync(TMP_UPLOAD_DIR, { recursive: true });

const upload = multer({ dest: TMP_UPLOAD_DIR });

function readUsers() {
    if (!fs.existsSync(AUTH_DB_PATH)) return [];
    try {
        const users = JSON.parse(fs.readFileSync(AUTH_DB_PATH, "utf8"));
        return Array.isArray(users) ? users : [];
    } catch (error) {
        return [];
    }
}

function writeUsers(users) {
    fs.mkdirSync(path.dirname(AUTH_DB_PATH), { recursive: true });
    fs.writeFileSync(AUTH_DB_PATH, JSON.stringify(users, null, 2));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
    const [salt, expected] = String(storedHash || "").split(":");
    if (!salt || !expected) return false;
    const actual = crypto.scryptSync(password, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function getSessionToken(req) {
    const cookies = String(req.headers.cookie || "").split(";");
    const sessionCookie = cookies.find((cookie) => cookie.trim().startsWith("familydrive_session="));
    return sessionCookie ? decodeURIComponent(sessionCookie.split("=").slice(1).join("=")) : "";
}

function getCurrentUser(req) {
    const token = getSessionToken(req);
    const session = sessions.get(token);
    if (!session || session.expiresAt < Date.now()) {
        if (token) sessions.delete(token);
        return null;
    }
    return readUsers().find((user) => user.id === session.userId) || null;
}

function createSession(res, user) {
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS });
    res.setHeader("Set-Cookie", `familydrive_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`);
}

function publicUser(user) {
    return user ? { id: user.id, name: user.name, email: user.email, provider: user.provider } : null;
}

function normalizeRelativePath(rawPath = "") {
    if (!rawPath) return "";
    return rawPath
        .replace(/\\/g, "/")
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");
}

function safeTargetPath(relativePath = "", root = STORAGE_ROOT) {
    const normalized = normalizeRelativePath(relativePath);
    const target = normalized ? path.resolve(root, normalized) : root;
    const relative = path.relative(root, target);

    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
        return target;
    }

    throw new Error("Chemin invalide");
}

function getDirectoryEntries(relativePath = "", root = STORAGE_ROOT) {
    const directory = safeTargetPath(relativePath, root);

    if (!fs.existsSync(directory)) {
        throw new Error("Dossier introuvable");
    }

    return fs
        .readdirSync(directory, { withFileTypes: true })
        .map((entry) => {
            const absolutePath = path.join(directory, entry.name);
            const relative = path.relative(root, absolutePath).split(path.sep).join("/");
            const stat = fs.statSync(absolutePath);
            const prefixedPath = root === TRASH_ROOT && relative ? `trash/${relative}` : relative;

            return {
                name: entry.name,
                type: entry.isDirectory() ? "folder" : "file",
                path: prefixedPath,
                size: stat.size,
                modifiedAt: stat.mtime.toISOString()
            };
        })
        .sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === "folder" ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });
}

function buildParentPath(currentPath = "") {
    if (!currentPath) return "";
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    return parts.join("/");
}

function getStorageStats() {
    const totals = {
        files: 0,
        folders: 0,
        usedBytes: 0,
        totalBytes: 1000 * 1000 * 1000 * 1000
    };

    function walk(directory) {
        if (!fs.existsSync(directory)) return;

        const entries = fs.readdirSync(directory, { withFileTypes: true });
        for (const entry of entries) {
            const entryPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                totals.folders += 1;
                walk(entryPath);
            } else {
                totals.files += 1;
                totals.usedBytes += fs.statSync(entryPath).size;
            }
        }
    }

    walk(STORAGE_ROOT);

    return {
        ...totals,
        usedGb: (totals.usedBytes / (1024 * 1024 * 1024)).toFixed(2),
        totalGb: (totals.totalBytes / (1024 * 1024 * 1024)).toFixed(0),
        usedPercent: totals.totalBytes ? Math.min(100, (totals.usedBytes / totals.totalBytes) * 100) : 0
    };
}

function buildFolderTree(dirPath = "") {
    const absoluteDir = safeTargetPath(dirPath, STORAGE_ROOT);
    if (!fs.existsSync(absoluteDir) || !fs.statSync(absoluteDir).isDirectory()) {
        return { name: "Accueil", path: "", children: [] };
    }

    const children = fs
        .readdirSync(absoluteDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => {
            const childPath = dirPath ? `${dirPath}/${entry.name}` : entry.name;
            return buildFolderTree(childPath);
        })
        .sort((a, b) => a.name.localeCompare(b.name));

    return {
        name: dirPath ? path.basename(dirPath) : "Accueil",
        path: dirPath,
        children
    };
}

function uniqueName(targetPath) {
    let candidate = targetPath;
    let index = 1;

    while (fs.existsSync(candidate)) {
        const parsed = path.parse(targetPath);
        candidate = path.join(parsed.dir, `${parsed.name} (${index})${parsed.ext}`);
        index += 1;
    }

    return candidate;
}

function moveToTrash(relativePath) {
    const normalizedPath = normalizeRelativePath(relativePath).replace(/^trash\//, "");
    const source = safeTargetPath(normalizedPath, STORAGE_ROOT);
    if (!fs.existsSync(source)) {
        throw new Error("Élément introuvable");
    }

    const originalName = path.basename(normalizedPath) || "element";
    const trashTarget = uniqueName(path.join(TRASH_ROOT, originalName));

    fs.renameSync(source, trashTarget);
    return trashTarget;
}

function restoreFromTrash(relativePath) {
    const normalizedPath = normalizeRelativePath(relativePath).replace(/^trash\//, "");
    const source = safeTargetPath(normalizedPath, TRASH_ROOT);
    if (!fs.existsSync(source)) {
        throw new Error("Élément introuvable dans la corbeille");
    }

    const originalName = path.basename(normalizedPath) || "element";
    const target = uniqueName(path.join(STORAGE_ROOT, originalName));
    fs.renameSync(source, target);
    return target;
}

function moveItem(currentPath, destinationPath) {
    const source = safeTargetPath(currentPath, STORAGE_ROOT);
    const destRoot = destinationPath ? safeTargetPath(destinationPath, STORAGE_ROOT) : STORAGE_ROOT;

    if (!fs.existsSync(source)) {
        throw new Error("Élément introuvable");
    }

    if (!fs.existsSync(destRoot)) {
        fs.mkdirSync(destRoot, { recursive: true });
    }

    const fileName = path.basename(currentPath) || "element";
    const destinationFile = path.join(destRoot, fileName);
    const finalTarget = uniqueName(destinationFile);
    fs.renameSync(source, finalTarget);
    return finalTarget;
}

function renameItem(currentPath, newName) {
    const cleanName = String(newName || "").trim();
    if (!cleanName) {
        throw new Error("Le nouveau nom est obligatoire");
    }

    const source = safeTargetPath(currentPath, STORAGE_ROOT);
    const directory = path.dirname(source);
    const target = uniqueName(path.join(directory, cleanName));

    fs.renameSync(source, target);
    return target;
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname, { index: false }));

app.get("/api/auth/me", (req, res) => {
    res.json({ user: publicUser(getCurrentUser(req)) });
});

app.post("/api/auth/register", (req, res) => {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (name.length < 2) return res.status(400).json({ message: "Le nom doit contenir au moins 2 caractères." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Adresse e-mail invalide." });
    if (password.length < 8) return res.status(400).json({ message: "Le mot de passe doit contenir au moins 8 caractères." });

    const users = readUsers();
    if (users.some((user) => user.email === email)) {
        return res.status(409).json({ message: "Un compte existe déjà avec cet e-mail." });
    }

    const user = {
        id: crypto.randomUUID(),
        name,
        email,
        passwordHash: hashPassword(password),
        provider: "email",
        createdAt: new Date().toISOString()
    };
    users.push(user);
    writeUsers(users);
    createSession(res, user);
    res.status(201).json({ user: publicUser(user) });
});

app.post("/api/auth/login", (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const user = readUsers().find((candidate) => candidate.email === email);

    if (!user || !verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ message: "E-mail ou mot de passe incorrect." });
    }

    createSession(res, user);
    res.json({ user: publicUser(user) });
});

app.post("/api/auth/logout", (req, res) => {
    const token = getSessionToken(req);
    sessions.delete(token);
    res.setHeader("Set-Cookie", "familydrive_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0");
    res.json({ ok: true });
});

app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth/") || req.path === "/health") return next();
    if (!getCurrentUser(req)) return res.status(401).json({ message: "Connexion requise." });
    next();
});

app.get("/api/files", (req, res) => {
    try {
        const currentPath = normalizeRelativePath(decodeURIComponent(req.query.path || ""));
        const root = currentPath === "trash" ? TRASH_ROOT : STORAGE_ROOT;
        const directory = safeTargetPath(currentPath, root);

        if (!fs.existsSync(directory)) {
            return res.status(404).json({ message: "Dossier introuvable" });
        }

        const entries = getDirectoryEntries(currentPath, root);
        const parentPath = currentPath === "trash" ? "" : buildParentPath(currentPath);

        res.json({
            currentPath,
            parentPath,
            entries,
            rootType: currentPath === "trash" ? "trash" : "storage"
        });
    } catch (error) {
        res.status(400).json({ message: error.message || "Erreur de lecture" });
    }
});

app.post("/api/folders", (req, res) => {
    try {
        const folderName = String(req.body?.name || "").trim();
        const currentPath = normalizeRelativePath(req.body?.path || "");

        if (!folderName) {
            return res.status(400).json({ message: "Le nom du dossier est obligatoire" });
        }

        const directory = safeTargetPath(currentPath, STORAGE_ROOT);
        const targetFolder = uniqueName(path.join(directory, folderName));
        fs.mkdirSync(targetFolder, { recursive: true });

        res.status(201).json({
            message: "Dossier créé",
            name: folderName,
            path: path.relative(STORAGE_ROOT, targetFolder).split(path.sep).join("/")
        });
    } catch (error) {
        res.status(400).json({ message: error.message || "Impossible de créer le dossier" });
    }
});

app.post("/api/upload", upload.array("files", 200), (req, res) => {
    try {
        const currentPath = normalizeRelativePath(req.body?.path || "");
        const directory = safeTargetPath(currentPath, STORAGE_ROOT);

        if (!fs.existsSync(directory)) {
            return res.status(404).json({ message: "Dossier introuvable" });
        }

        const uploaded = [];

        for (const file of req.files || []) {
            const target = uniqueName(path.join(directory, file.originalname));
            fs.copyFileSync(file.path, target);
            fs.unlinkSync(file.path);
            uploaded.push(file.originalname);
        }

        res.json({ ok: true, uploaded });
    } catch (error) {
        res.status(400).json({ message: error.message || "Impossible de téléverser" });
    }
});

app.get("/api/download", (req, res) => {
    try {
        const relativePath = normalizeRelativePath(decodeURIComponent(req.query.path || ""));
        const filePath = safeTargetPath(relativePath, STORAGE_ROOT);

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            return res.status(404).json({ message: "Fichier introuvable" });
        }

        res.download(filePath);
    } catch (error) {
        res.status(400).json({ message: error.message || "Téléchargement impossible" });
    }
});

app.post("/api/rename", (req, res) => {
    try {
        const currentPath = normalizeRelativePath(req.body?.path || "");
        const newName = String(req.body?.newName || "").trim();

        if (!currentPath) {
            return res.status(400).json({ message: "Aucun élément sélectionné" });
        }

        const renamed = renameItem(currentPath, newName);
        res.json({ ok: true, path: path.relative(STORAGE_ROOT, renamed).split(path.sep).join("/") });
    } catch (error) {
        res.status(400).json({ message: error.message || "Renommage impossible" });
    }
});

app.post("/api/move", (req, res) => {
    try {
        const currentPath = normalizeRelativePath(req.body?.path || "");
        const destinationPath = normalizeRelativePath(req.body?.destinationPath || "");

        if (!currentPath) {
            return res.status(400).json({ message: "Aucun élément sélectionné" });
        }

        const moved = moveItem(currentPath, destinationPath);
        res.json({ ok: true, path: path.relative(STORAGE_ROOT, moved).split(path.sep).join("/") });
    } catch (error) {
        res.status(400).json({ message: error.message || "Déplacement impossible" });
    }
});

app.delete("/api/files", (req, res) => {
    try {
        const relativePath = normalizeRelativePath(decodeURIComponent(req.query.path || ""));
        const isTrashPath = relativePath === "trash" || relativePath.startsWith("trash/");
        const target = isTrashPath
            ? safeTargetPath(relativePath.replace(/^trash\//, ""), TRASH_ROOT)
            : safeTargetPath(relativePath, STORAGE_ROOT);

        if (relativePath === "" || relativePath === "trash") {
            return res.status(400).json({ message: "Le dossier racine ne peut pas être supprimé" });
        }

        if (!fs.existsSync(target)) {
            return res.status(404).json({ message: "Elément introuvable" });
        }

        if (isTrashPath) {
            fs.rmSync(target, { recursive: true, force: true });
            return res.json({ ok: true, deleted: relativePath });
        }

        moveToTrash(relativePath);
        res.json({ ok: true, deleted: relativePath });
    } catch (error) {
        res.status(400).json({ message: error.message || "Suppression impossible" });
    }
});

app.post("/api/restore", (req, res) => {
    try {
        const relativePath = normalizeRelativePath(req.body?.path || "");
        const storagePath = relativePath.startsWith("trash/") ? relativePath.replace(/^trash\//, "") : relativePath;

        if (!storagePath) {
            return res.status(400).json({ message: "Aucun élément à restaurer" });
        }

        const restored = restoreFromTrash(storagePath);
        res.json({ ok: true, path: path.relative(STORAGE_ROOT, restored).split(path.sep).join("/") });
    } catch (error) {
        res.status(400).json({ message: error.message || "Restauration impossible" });
    }
});

app.post("/api/trash/clear", (req, res) => {
    try {
        if (fs.existsSync(TRASH_ROOT)) {
            fs.rmSync(TRASH_ROOT, { recursive: true, force: true });
            fs.mkdirSync(TRASH_ROOT, { recursive: true });
        }
        res.json({ ok: true });
    } catch (error) {
        res.status(400).json({ message: "Vidage de la corbeille impossible" });
    }
});

app.get("/api/health", (req, res) => {
    res.json({ ok: true, message: "FamilyDrive API OK" });
});

app.get("/api/tree", (req, res) => {
    try {
        res.json(buildFolderTree());
    } catch (error) {
        res.status(500).json({ message: "Impossible de créer l’arbre des dossiers" });
    }
});

app.get("/api/stats", (req, res) => {
    try {
        const stats = getStorageStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ message: "Impossible de calculer les statistiques" });
    }
});

app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
        return next();
    }
    res.sendFile(path.join(__dirname, getCurrentUser(req) ? "index.html" : "auth.html"));
});

function startServer(port) {
    const server = app.listen(port, HOST, () => {
        console.log(`FamilyDrive is running on http://localhost:${port}`);
        console.log(`FamilyDrive is listening on ${HOST}:${port}`);
    });

    server.on("error", (error) => {
        if (error.code === "EADDRINUSE") {
            const nextPort = port + 1;
            if (nextPort < port + 20) {
                console.log(`Port ${port} occupé, tentative sur le port ${nextPort}...`);
                startServer(nextPort);
                return;
            }
        }
        throw error;
    });
}

startServer(DEFAULT_PORT);
