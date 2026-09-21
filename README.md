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
