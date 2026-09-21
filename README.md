# FamilyDrive

Projet de gestion de fichiers familial avec interface de type explorateur Windows.

## Démarrage

1. Installer les dépendances :
   npm install

2. Lancer le serveur :
   npm start

3. Ouvrir dans le navigateur :
   http://localhost:3000

## Accès depuis Internet

Le serveur écoute sur toutes les interfaces réseau (`0.0.0.0`). Dans GitHub Codespaces, ouvre l’onglet **Ports**, rends le port utilisé par l’application **Public**, puis ouvre l’URL transférée par GitHub. Cette URL est accessible depuis un autre appareil tant que le Codespace et le serveur restent actifs.

Pour une adresse permanente, déploie le projet sur un hébergeur Node.js comme Render, Railway ou Fly.io. `localhost` et l’adresse IP du conteneur ne sont pas des adresses publiques permanentes.

## GitHub Pages

GitHub Pages héberge uniquement l’interface. Le workflow `.github/workflows/pages.yml` publie les fichiers frontend sans publier les données privées. L’API doit être déployée séparément sur Render avec `render.yaml`.

Le frontend GitHub Pages utilise par défaut `https://familydrive.onrender.com` comme API dans `config.js`. Si l’URL Render est différente, modifie `window.FAMILYDRIVE_API_URL` dans ce fichier avant de publier.

Pour obtenir exactement `https://fuzax.github.io`, le dépôt doit s’appeler `fuzax.github.io`. Avec le dépôt actuel `familystorage-`, l’adresse Pages sera `https://fuzax.github.io/familystorage-/`.

## Fonctionnalités

- navigation dans les dossiers
- création de dossiers
- téléversement de fichiers
- téléchargement de fichiers
- suppression de fichiers et dossiers
- stockage local dans le dossier `storage/`

## Comptes et connexion

L’application contient maintenant :

- création de compte par e-mail et mot de passe ;
- connexion et déconnexion ;
- session protégée par cookie HTTP-only ;
- protection des API de fichiers pour les utilisateurs connectés ;
- connexion uniquement par e-mail et mot de passe.

La connexion e-mail fonctionne immédiatement. Les comptes sont enregistrés dans `users.json` en local, ou dans le chemin défini par `AUTH_DB_PATH` sur un hébergeur.

## Administration

Pour activer la catégorie Administration pour un compte, ajoute son adresse e-mail dans `admin-emails.json` :

```json
[
   "mon-adresse@example.com"
]
```

La catégorie reste cachée pour les autres comptes. Elle affiche les statistiques globales et le journal des activités. Le fichier peut être déplacé avec la variable `ADMIN_EMAILS_PATH`.
