const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.disable("x-powered-by");
const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const STORAGE_ROOT = process.env.STORAGE_ROOT || path.join(__dirname, "storage");
const TRASH_ROOT = process.env.TRASH_ROOT || path.join(__dirname, "trash");
const TMP_UPLOAD_DIR = process.env.TMP_UPLOAD_DIR || path.join(__dirname, "tmp-uploads");
const AUTH_DB_PATH = process.env.AUTH_DB_PATH || path.join(__dirname, "users.json");
const BOXES_DB_PATH = process.env.BOXES_DB_PATH || path.join(__dirname, "boxes.json");
const BOXES_ROOT = process.env.BOXES_ROOT || path.join(__dirname, "boxes");
const BOX_QUOTA_BYTES = 30 * 1024 * 1024 * 1024;
const MAX_UPLOAD_FILE_BYTES = Number(process.env.MAX_UPLOAD_FILE_BYTES) || 5 * 1024 * 1024 * 1024;
const MAX_REQUESTS_PER_WINDOW = 120;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const sessions = new Map();
const rateLimits = new Map();

fs.mkdirSync(STORAGE_ROOT, { recursive: true });
fs.mkdirSync(TRASH_ROOT, { recursive: true });
fs.mkdirSync(TMP_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(BOXES_ROOT, { recursive: true });

const upload = multer({
    dest: TMP_UPLOAD_DIR,
    limits: { files: 200, fileSize: MAX_UPLOAD_FILE_BYTES }
});

function getClientAddress(req) {
    return String(req.ip || req.socket.remoteAddress || "unknown");
}

function rateLimit(req, res, next) {
    const now = Date.now();
    const key = `${getClientAddress(req)}:${req.path}`;
    const current = rateLimits.get(key);
    if (!current || current.resetAt <= now) {
        rateLimits.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
        return next();
    }
    if (current.count >= MAX_REQUESTS_PER_WINDOW) {
        res.setHeader("Retry-After", Math.ceil((current.resetAt - now) / 1000));
        return res.status(429).json({ message: "Trop de tentatives. Réessayez plus tard." });
    }
    current.count += 1;
    next();
}

function securityHeaders(req, res, next) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (req.secure || req.headers["x-forwarded-proto"] === "https") {
        res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
}

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

function readBoxes() {
    if (!fs.existsSync(BOXES_DB_PATH)) return [];
    try {
        const boxes = JSON.parse(fs.readFileSync(BOXES_DB_PATH, "utf8"));
        return Array.isArray(boxes) ? boxes : [];
    } catch (error) {
        return [];
    }
}

function writeBoxes(boxes) {
    fs.mkdirSync(path.dirname(BOXES_DB_PATH), { recursive: true });
    fs.writeFileSync(BOXES_DB_PATH, JSON.stringify(boxes, null, 2));
}

function getBoxRoots(box) {
    const root = path.join(BOXES_ROOT, box.id);
    return { storage: path.join(root, "storage"), trash: path.join(root, "trash") };
}

function ensureBoxRoots(box) {
    const roots = getBoxRoots(box);
    fs.mkdirSync(roots.storage, { recursive: true });
    fs.mkdirSync(roots.trash, { recursive: true });
    return roots;
}

function getActiveBox(req) {
    const cookies = String(req.headers.cookie || "").split(";");
    const boxCookie = cookies.find((cookie) => cookie.trim().startsWith("familydrive_box="));
    const boxId = boxCookie ? decodeURIComponent(boxCookie.split("=").slice(1).join("=").trim()) : "";
    const user = getCurrentUser(req);
    if (!user || !boxId) return null;
    return readBoxes().find((box) => box.id === boxId && box.members.includes(user.id)) || null;
}

function setActiveBox(res, boxId) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader("Set-Cookie", `familydrive_box=${encodeURIComponent(boxId)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure}`);
}

function publicBox(box, userId) {
    const stats = getStorageStats(ensureBoxRoots(box).storage);
    return { id: box.id, name: box.name, code: box.code, quotaGb: 30, usedGb: stats.usedGb, usedPercent: stats.usedPercent, owner: box.ownerId === userId, memberCount: box.members.length };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
    const [salt, expected] = String(storedHash || "").split(":");
    if (!salt || !expected) return false;
    const actual = crypto.scryptSync(password, salt, 64).toString("hex");
    const actualBuffer = Buffer.from(actual, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
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
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader("Set-Cookie", `familydrive_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure}`);
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

function validateItemName(rawName, label = "Nom") {
    const name = String(rawName || "").trim();
    if (!name || name === "." || name === ".." || name.length > 255 || /[\\/\u0000-\u001f\u007f]/.test(name)) {
        throw new Error(`${label} invalide`);
    }
    return name;
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

function getDirectoryEntries(relativePath = "", root = STORAGE_ROOT, isTrashRoot = false) {
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
            const prefixedPath = isTrashRoot && relative ? `trash/${relative}` : relative;

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

function getStorageStats(storageRoot = STORAGE_ROOT) {
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

    walk(storageRoot);

    return {
        ...totals,
        usedGb: (totals.usedBytes / (1024 * 1024 * 1024)).toFixed(2),
        totalGb: (totals.totalBytes / (1024 * 1024 * 1024)).toFixed(0),
        usedPercent: totals.totalBytes ? Math.min(100, (totals.usedBytes / totals.totalBytes) * 100) : 0
    };
}

function buildFolderTree(dirPath = "", storageRoot = STORAGE_ROOT) {
    const absoluteDir = safeTargetPath(dirPath, storageRoot);
    if (!fs.existsSync(absoluteDir) || !fs.statSync(absoluteDir).isDirectory()) {
        return { name: "Accueil", path: "", children: [] };
    }

    const children = fs
        .readdirSync(absoluteDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => {
            const childPath = dirPath ? `${dirPath}/${entry.name}` : entry.name;
            return buildFolderTree(childPath, storageRoot);
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

function moveToTrash(relativePath, storageRoot = STORAGE_ROOT, trashRoot = TRASH_ROOT) {
    const normalizedPath = normalizeRelativePath(relativePath).replace(/^trash\//, "");
    const source = safeTargetPath(normalizedPath, storageRoot);
    if (!fs.existsSync(source)) {
        throw new Error("Élément introuvable");
    }

    const originalName = path.basename(normalizedPath) || "element";
    const trashTarget = uniqueName(path.join(trashRoot, originalName));

    fs.renameSync(source, trashTarget);
    return trashTarget;
}

function restoreFromTrash(relativePath, storageRoot = STORAGE_ROOT, trashRoot = TRASH_ROOT) {
    const normalizedPath = normalizeRelativePath(relativePath).replace(/^trash\//, "");
    const source = safeTargetPath(normalizedPath, trashRoot);
    if (!fs.existsSync(source)) {
        throw new Error("Élément introuvable dans la corbeille");
    }

    const originalName = path.basename(normalizedPath) || "element";
    const target = uniqueName(path.join(storageRoot, originalName));
    fs.renameSync(source, target);
    return target;
}

function moveItem(currentPath, destinationPath, storageRoot = STORAGE_ROOT) {
    const source = safeTargetPath(currentPath, storageRoot);
    const destRoot = destinationPath ? safeTargetPath(destinationPath, storageRoot) : storageRoot;

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

function renameItem(currentPath, newName, storageRoot = STORAGE_ROOT) {
    const cleanName = validateItemName(newName, "Le nouveau nom");

    const source = safeTargetPath(currentPath, storageRoot);
    const directory = path.dirname(source);
    const target = uniqueName(path.join(directory, cleanName));

    fs.renameSync(source, target);
    return target;
}

app.use(securityHeaders);
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: true, limit: "32kb" }));
app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    const publicFiles = new Set(["/", "/index.html", "/auth.html", "/auth.js", "/script.js", "/style.css"]);
    if (publicFiles.has(req.path)) return next();
    return res.status(404).send("Not found");
});
app.use(express.static(__dirname, { index: false }));

app.get("/api/auth/me", (req, res) => {
    res.json({ user: publicUser(getCurrentUser(req)) });
});

app.post("/api/auth/register", rateLimit, (req, res) => {
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

app.post("/api/auth/login", rateLimit, (req, res) => {
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
    res.setHeader("Set-Cookie", [
        "familydrive_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0",
        "familydrive_box=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0"
    ]);
    res.json({ ok: true });
});

app.get("/api/boxes", (req, res) => {
    const user = getCurrentUser(req);
    if (!user) return res.status(401).json({ message: "Connexion requise." });
    const boxes = readBoxes().filter((box) => box.members.includes(user.id));
    res.json({ boxes: boxes.map((box) => publicBox(box, user.id)), activeBoxId: getActiveBox(req)?.id || null });
});

app.post("/api/boxes", (req, res) => {
    const user = getCurrentUser(req);
    if (!user) return res.status(401).json({ message: "Connexion requise." });
    const name = String(req.body?.name || "").trim();
    if (name.length < 2 || name.length > 60) {
        return res.status(400).json({ message: "Le nom de la box doit contenir entre 2 et 60 caractères." });
    }

    const boxes = readBoxes();
    let code = "";
    do {
        code = crypto.randomBytes(8).toString("hex").toUpperCase();
    } while (boxes.some((box) => box.code === code));

    const box = { id: crypto.randomUUID(), name, code, ownerId: user.id, members: [user.id], createdAt: new Date().toISOString() };
    boxes.push(box);
    writeBoxes(boxes);
    ensureBoxRoots(box);
    setActiveBox(res, box.id);
    res.status(201).json({ box: publicBox(box, user.id) });
});

app.post("/api/boxes/join", rateLimit, (req, res) => {
    const user = getCurrentUser(req);
    if (!user) return res.status(401).json({ message: "Connexion requise." });
    const code = String(req.body?.code || "").trim().toUpperCase();
    if (!/^[A-F0-9]{8}(?:[A-F0-9]{8})?$/.test(code)) return res.status(400).json({ message: "Code de box invalide." });
    const boxes = readBoxes();
    const box = boxes.find((candidate) => candidate.code === code);
    if (!box) return res.status(404).json({ message: "Aucune box ne correspond à ce code." });
    if (!box.members.includes(user.id)) box.members.push(user.id);
    writeBoxes(boxes);
    ensureBoxRoots(box);
    setActiveBox(res, box.id);
    res.json({ box: publicBox(box, user.id) });
});

app.post("/api/boxes/select", (req, res) => {
    const user = getCurrentUser(req);
    if (!user) return res.status(401).json({ message: "Connexion requise." });
    const box = readBoxes().find((candidate) => candidate.id === req.body?.boxId && candidate.members.includes(user.id));
    if (!box) return res.status(404).json({ message: "Box introuvable." });
    setActiveBox(res, box.id);
    res.json({ box: publicBox(box, user.id) });
});

app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth/") || req.path === "/health") return next();
    if (!getCurrentUser(req)) return res.status(401).json({ message: "Connexion requise." });
    if (!req.path.startsWith("/boxes") && !getActiveBox(req)) {
        return res.status(409).json({ message: "Sélectionnez ou créez une box pour continuer." });
    }
    next();
});

app.get("/api/files", (req, res) => {
    try {
        const roots = ensureBoxRoots(getActiveBox(req));
        const currentPath = normalizeRelativePath(decodeURIComponent(req.query.path || ""));
        const root = currentPath === "trash" ? roots.trash : roots.storage;
        const directory = safeTargetPath(currentPath === "trash" ? "" : currentPath, root);

        if (!fs.existsSync(directory)) {
            return res.status(404).json({ message: "Dossier introuvable" });
        }

        const entries = getDirectoryEntries(currentPath, root, currentPath === "trash");
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
    const storageRoot = ensureBoxRoots(getActiveBox(req)).storage;
        const folderName = validateItemName(req.body?.name, "Le nom du dossier");
        const currentPath = normalizeRelativePath(req.body?.path || "");

        const directory = safeTargetPath(currentPath, storageRoot);
        const targetFolder = uniqueName(path.join(directory, folderName));
        fs.mkdirSync(targetFolder, { recursive: true });

        res.status(201).json({
            message: "Dossier créé",
            name: folderName,
            path: path.relative(storageRoot, targetFolder).split(path.sep).join("/")
        });
    } catch (error) {
        res.status(400).json({ message: error.message || "Impossible de créer le dossier" });
    }
});

app.post("/api/upload", upload.array("files", 200), (req, res) => {
    try {
        const storageRoot = ensureBoxRoots(getActiveBox(req)).storage;
        const currentPath = normalizeRelativePath(req.body?.path || "");
        const directory = safeTargetPath(currentPath, storageRoot);

        if (!fs.existsSync(directory)) {
            return res.status(404).json({ message: "Dossier introuvable" });
        }

        const uploaded = [];
        const currentStats = getStorageStats(storageRoot);
        const incomingBytes = (req.files || []).reduce((total, file) => total + file.size, 0);
        if (currentStats.usedBytes + incomingBytes > BOX_QUOTA_BYTES) {
            for (const file of req.files || []) fs.unlinkSync(file.path);
            return res.status(413).json({ message: "Cette box a atteint sa limite gratuite de 30 Go." });
        }

        for (const file of req.files || []) {
            const fileName = validateItemName(path.basename(file.originalname), "Le nom du fichier");
            const target = uniqueName(path.join(directory, fileName));
            fs.copyFileSync(file.path, target);
            fs.unlinkSync(file.path);
            uploaded.push(fileName);
        }

        res.json({ ok: true, uploaded });
    } catch (error) {
        for (const file of req.files || []) {
            if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        }
        res.status(400).json({ message: error.message || "Impossible de téléverser" });
    }
});

app.get("/api/download", (req, res) => {
    try {
        const storageRoot = ensureBoxRoots(getActiveBox(req)).storage;
        const relativePath = normalizeRelativePath(decodeURIComponent(req.query.path || ""));
        const filePath = safeTargetPath(relativePath, storageRoot);

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
    const storageRoot = ensureBoxRoots(getActiveBox(req)).storage;
        const currentPath = normalizeRelativePath(req.body?.path || "");
        const newName = String(req.body?.newName || "").trim();

        if (!currentPath) {
            return res.status(400).json({ message: "Aucun élément sélectionné" });
        }

        const renamed = renameItem(currentPath, newName, storageRoot);
        res.json({ ok: true, path: path.relative(storageRoot, renamed).split(path.sep).join("/") });
    } catch (error) {
        res.status(400).json({ message: error.message || "Renommage impossible" });
    }
});

app.post("/api/move", (req, res) => {
    try {
    const storageRoot = ensureBoxRoots(getActiveBox(req)).storage;
        const currentPath = normalizeRelativePath(req.body?.path || "");
        const destinationPath = normalizeRelativePath(req.body?.destinationPath || "");

        if (!currentPath) {
            return res.status(400).json({ message: "Aucun élément sélectionné" });
        }

        const moved = moveItem(currentPath, destinationPath, storageRoot);
        res.json({ ok: true, path: path.relative(storageRoot, moved).split(path.sep).join("/") });
    } catch (error) {
        res.status(400).json({ message: error.message || "Déplacement impossible" });
    }
});

app.delete("/api/files", (req, res) => {
    try {
    const roots = ensureBoxRoots(getActiveBox(req));
        const relativePath = normalizeRelativePath(decodeURIComponent(req.query.path || ""));
        const isTrashPath = relativePath === "trash" || relativePath.startsWith("trash/");
        const target = isTrashPath
            ? safeTargetPath(relativePath.replace(/^trash\//, ""), roots.trash)
            : safeTargetPath(relativePath, roots.storage);

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

        moveToTrash(relativePath, roots.storage, roots.trash);
        res.json({ ok: true, deleted: relativePath });
    } catch (error) {
        res.status(400).json({ message: error.message || "Suppression impossible" });
    }
});

app.post("/api/restore", (req, res) => {
    try {
    const roots = ensureBoxRoots(getActiveBox(req));
        const relativePath = normalizeRelativePath(req.body?.path || "");
        const storagePath = relativePath.startsWith("trash/") ? relativePath.replace(/^trash\//, "") : relativePath;

        if (!storagePath) {
            return res.status(400).json({ message: "Aucun élément à restaurer" });
        }

        const restored = restoreFromTrash(storagePath, roots.storage, roots.trash);
        res.json({ ok: true, path: path.relative(roots.storage, restored).split(path.sep).join("/") });
    } catch (error) {
        res.status(400).json({ message: error.message || "Restauration impossible" });
    }
});

app.post("/api/trash/clear", (req, res) => {
    try {
        const trashRoot = ensureBoxRoots(getActiveBox(req)).trash;
        if (fs.existsSync(trashRoot)) {
            fs.rmSync(trashRoot, { recursive: true, force: true });
            fs.mkdirSync(trashRoot, { recursive: true });
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
        res.json(buildFolderTree("", ensureBoxRoots(getActiveBox(req)).storage));
    } catch (error) {
        res.status(500).json({ message: "Impossible de créer l’arbre des dossiers" });
    }
});

app.get("/api/stats", (req, res) => {
    try {
        const stats = getStorageStats(ensureBoxRoots(getActiveBox(req)).storage);
        stats.totalBytes = BOX_QUOTA_BYTES;
        stats.totalGb = "30";
        stats.usedPercent = Math.min(100, (stats.usedBytes / BOX_QUOTA_BYTES) * 100);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ message: "Impossible de calculer les statistiques" });
    }
});

app.use((error, req, res, next) => {
    for (const file of req.files || []) {
        if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    }
    if (res.headersSent) return next(error);
    if (error instanceof multer.MulterError) {
        const message = error.code === "LIMIT_FILE_SIZE"
            ? "Le fichier dépasse la taille maximale autorisée."
            : "Téléversement refusé par les limites de sécurité.";
        return res.status(413).json({ message });
    }
    res.status(400).json({ message: "Requête invalide." });
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
