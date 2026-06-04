# Mes Chansons — Charly M

Site statique de répertoire musical pour **Charly M**. Les visiteurs peuvent écouter les morceaux et laisser des avis. L'ajout et la suppression de chansons sont réservés à l'artiste via un espace protégé par mot de passe.

---

## Lancer le site en local

```bash
cd desmauxdansdesmots
python3 -m http.server 8732
```

Ouvrir ensuite **http://localhost:8732** dans le navigateur.

---

## Structure

```
desmauxdansdesmots/
├── index.html   # Structure de la page
├── style.css    # Thème sombre, composants
└── script.js    # Logique, stockage, player audio
```

Aucune dépendance externe. Aucun build. Tout fonctionne directement dans le navigateur.

---

## Fonctionnalités

| Fonctionnalité | Détail |
|---|---|
| Catalogue de chansons | Affiché en grille, persisté en `localStorage` |
| Player audio custom | Play/pause, barre de progression cliquable, chrono |
| Avis des auditeurs | Note 1–5 étoiles + commentaire, filtrables par chanson |
| Espace artiste | Protégé par mot de passe, session par onglet |
| Contact | Formulaire qui ouvre le client mail avec champs pré-remplis |
| Navigation sticky | Barre d'ancre avec section active surlignée |

---

## Espace artiste

Le bouton **artiste** (discret, en bas à droite du pied de page) ouvre un modal de connexion.

Une fois connecté, Charly peut :
- Publier une nouvelle chanson (lien audio externe ou fichier local ≤ 8 Mo)
- Supprimer un morceau existant

La session dure jusqu'à la fermeture de l'onglet.

### Changer le mot de passe

Dans `script.js`, ligne 2 :

```js
const MOT_DE_PASSE_ARTISTE = "Tonmdp";
```

### Changer l'adresse mail de contact

Dans `script.js`, ligne 2 :

```js
const EMAIL_CONTACT = "ton-email@example.com";
```

---

## Stockage

Les chansons et les avis sont sauvegardés dans le `localStorage` du navigateur (clés `mes_chansons_v2` et `mes_avis_v2`). Les données sont propres à chaque navigateur et ne sont pas partagées entre appareils.

Pour les fichiers audio importés localement, le fichier est converti en data URL — la limite recommandée est **8 Mo par fichier** pour rester dans le quota du localStorage (~5–10 Mo selon le navigateur). Préférer un **lien audio externe** pour les fichiers plus lourds.

---

## Déploiement

Ce site étant 100 % statique, il peut être hébergé gratuitement sur :

- **GitHub Pages** — pousser le dossier sur une branche `gh-pages`
- **Netlify / Vercel** — glisser-déposer le dossier dans l'interface
- **N'importe quel hébergeur web** — copier les 3 fichiers à la racine

> Note : avec un hébergement public, le mot de passe artiste est visible dans le code source. Pour une protection réelle, un backend est nécessaire.
