# 🎵 ACT-III — Music Streaming App

> Spotify lite + stats fun + social. 100% web, no install required.

---

## 🚀 Déploiement en 5 étapes

### Étape 1 — Supabase

1. Créez un compte sur [supabase.com](https://supabase.com)
2. Créez un nouveau projet
3. Allez dans **SQL Editor** → collez le contenu de `supabase_setup.sql` → **Run**
4. Allez dans **Project Settings → API** et copiez :
   - `Project URL`
   - `anon public` key

### Étape 2 — Configurez app.js

Ouvrez `public/app.js` et remplacez les lignes 8-9 :

```js
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';  // ← votre URL
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';                // ← votre clé anon
```

### Étape 3 — Supabase Auth

Dans Supabase → **Authentication → Settings** :
- Désactivez la confirmation email pour les tests (Email confirmations → OFF)
- Ou laissez activé pour la prod

### Étape 4 — Render

1. Créez un compte sur [render.com](https://render.com)
2. Nouveau service → **Static Site**
3. Connectez votre repo GitHub (uploadez les fichiers d'abord)
4. Configuration :
   - **Root Directory** : laisser vide
   - **Build Command** : laisser vide
   - **Publish Directory** : `public`
5. Cliquez **Deploy** ✅

### Étape 5 — Profitez !

Votre app est en ligne. Partagez l'URL avec vos amis !

---

## 📁 Structure

```
act-iii/
├── public/
│   ├── index.html     → structure HTML complète
│   ├── style.css      → design dark minimaliste
│   ├── app.js         → toute la logique (auth, player, sync)
│   └── _redirects     → requis pour Render SPA routing
└── supabase_setup.sql → tables + RLS + données de démo
```

---

## ✨ Fonctionnalités

| Feature | Description |
|---|---|
| 🔐 Auth | Inscription/Connexion Supabase, code ACT3-XXXX |
| ☁️ Sync | Toutes les données dans Supabase, multi-appareils |
| 🎵 Player | Mini-player fixe + plein écran |
| 🔍 Recherche | Dynamique : artistes, albums, titres |
| ❤️ Favoris | Titres + Albums |
| 📁 Playlists | Création + ajout de titres |
| 📊 Stats | Minutes, likes, genre dominant |
| 🏆 Tier List | Basée sur l'historique d'écoute |
| 🎖️ Badges | Lève-tard, Explorateur, Addict… |
| 📈 Charts | Top 5 titres + écoutes par jour (Chart.js) |
| ➕ Contenu | Tout utilisateur peut ajouter artistes/albums/titres |
| 📱 Responsive | Mobile (nav bas) + Desktop (sidebar) |

---

## 🗄️ Base de données

```
profiles       → user_id, display_name, access_code, stats_json
artists        → name, cover_url (public)
albums         → artist_id, title, cover_url, year (public)
songs          → album_id, title, audio_url, duration_sec (public)
favorites      → user_id, type, item_id (privé)
history        → user_id, song_id, listened_at (privé)
playlists      → user_id, name (privé)
playlist_songs → playlist_id, song_id (privé)
```

---

## 🔐 Sécurité RLS

- **Public** : lecture libre sur artists, albums, songs
- **Auth** : écriture sur artists, albums, songs (tout utilisateur connecté)
- **Privé** : favorites, history, playlists → seulement par leur propriétaire

---

## 💡 Tips

- La cover d'un titre affiche celle de l'album si `cover_url` est null
- Les stats (minutes) se mettent à jour à chaque écoute
- Les badges se débloquent automatiquement selon l'historique
- La Tier List se construit sur les 200 dernières écoutes
