// À modifier : adresse mail de contact
const EMAIL_CONTACT = "charlymichaut@gmail.com";

// Formspree — remplace XXXXXXXX par ton ID de formulaire (formspree.io/f/XXXXXXXX)
const FORMSPREE_ENDPOINT = "https://formspree.io/f/xojzqzgv";

const HASH_MOT_DE_PASSE_ARTISTE = "45fe8349f9ab7994e4e588c6dfbca0e24c1636b9d3eb6b78d3bb530f6ce67690";

// =====================================================================
// Configuration Firebase — remplir avec les valeurs de ton projet
// 1. Aller sur https://console.firebase.google.com
// 2. Créer un projet → Ajouter une app web → Copier la config ci-dessous
// 3. Activer Firestore Database (mode production + règles ouvertes)
// =====================================================================
const FIREBASE_CONFIG = {

  apiKey: "AIzaSyA9PV1tSzgrVvpBQeGKfdKYC5S6mAt0TW4",

  authDomain: "desmauxdansdesmots.firebaseapp.com",

  projectId: "desmauxdansdesmots",

  storageBucket: "desmauxdansdesmots.firebasestorage.app",

  messagingSenderId: "168419854235",

  appId: "1:168419854235:web:dc5b7035a3d2a5bd27433e"

};


firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.firestore();

let estAuthentifie = sessionStorage.getItem("artiste_auth") === "1";

const SVG_PLAY   = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>`;
const SVG_PAUSE  = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
const SVG_LOCK   = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
const SVG_UNLOCK = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;

let playerAbortController = new AbortController();

let chansons = [];
let avis = [];

// =====================================================================
// Firestore — helpers de lecture/écriture
// =====================================================================

async function saveChanson(chanson) {
    await db.collection("chansons").doc(String(chanson.id)).set(chanson);
}

async function deleteChanson(id) {
    await db.collection("chansons").doc(String(id)).delete();
}

async function saveAvis(avisItem) {
    await db.collection("avis").doc(String(avisItem.id)).set(avisItem);
}

async function deleteAvis(id) {
    await db.collection("avis").doc(String(id)).delete();
}

// =====================================================================
// Chargement des données
// =====================================================================

async function chargerDonnees() {
    try {
        const snap = await db.collection("chansons").get();
        chansons = snap.docs.map(d => d.data()).sort((a, b) => b.id - a.id);
    } catch (err) {
        console.error("[Firebase] Erreur lecture chansons :", err.code, err.message);
        chansons = [];
    }

    try {
        const snap = await db.collection("avis").get();
        avis = snap.docs
            .map(d => ({ ...d.data(), reponse: d.data().reponse || null }))
            .sort((a, b) => b.id - a.id);
    } catch (err) {
        console.error("[Firebase] Erreur lecture avis :", err.code, err.message);
        avis = [];
    }
}

// =====================================================================
// Selects
// =====================================================================

function mettreAJourSelectChansons() {
    const select = document.getElementById("chanson-avis");
    const valeurActuelle = select.value;
    select.innerHTML = '<option value="">Choisir une chanson</option>';
    chansons.forEach(chanson => {
        const option = document.createElement("option");
        option.value = String(chanson.id);
        option.textContent = `${chanson.titre} — ${chanson.artiste}`;
        select.appendChild(option);
    });
    if (valeurActuelle && chansons.some(c => String(c.id) === valeurActuelle)) select.value = valeurActuelle;
    mettreAJourFiltreAvis();
}

function mettreAJourFiltreAvis() {
    const sel = document.getElementById("filtre-avis");
    const valActuelle = sel.value;
    sel.innerHTML = '<option value="">Toutes les chansons</option>';
    chansons.forEach(c => {
        const opt = document.createElement("option");
        opt.value = String(c.id);
        opt.textContent = c.titre;
        sel.appendChild(opt);
    });
    if (valActuelle && chansons.some(c => String(c.id) === valActuelle)) sel.value = valActuelle;
}

// =====================================================================
// Player audio
// =====================================================================

function echapper(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function detecterTypeMime(url) {
    if (url.startsWith("data:")) { const m = url.match(/^data:([^;,]+)/); return m ? m[1] : "audio/mpeg"; }
    const ext = url.split("?")[0].split(".").pop().toLowerCase();
    return ({ mp3:"audio/mpeg", ogg:"audio/ogg", wav:"audio/wav", flac:"audio/flac", m4a:"audio/mp4", aac:"audio/aac", webm:"audio/webm" }[ext] || "audio/mpeg");
}

function formaterTemps(sec) {
    if (!isFinite(sec) || isNaN(sec)) return "--:--";
    return `${Math.floor(sec/60)}:${String(Math.floor(sec%60)).padStart(2,"0")}`;
}

function initPlayer(playerEl, src) {
    const btn     = playerEl.querySelector(".player-btn");
    const fill    = playerEl.querySelector(".player-fill");
    const barWrap = playerEl.querySelector(".player-bar-wrap");
    const cur     = playerEl.querySelector(".player-cur");
    const dur     = playerEl.querySelector(".player-dur");
    const signal  = playerAbortController.signal;
    let audio = null;

    function getAudio() {
        if (audio) return audio;
        audio = new Audio(src);
        audio.preload = "none";
        audio.addEventListener("timeupdate", () => { const p = audio.duration ? (audio.currentTime/audio.duration)*100 : 0; fill.style.width=`${p}%`; cur.textContent=formaterTemps(audio.currentTime); });
        audio.addEventListener("loadedmetadata", () => { dur.textContent = formaterTemps(audio.duration); });
        audio.addEventListener("ended", () => { playerEl.classList.remove("playing"); btn.innerHTML=SVG_PLAY; fill.style.width="0%"; cur.textContent="0:00"; });
        audio.addEventListener("error", () => { dur.textContent="Erreur"; playerEl.classList.remove("playing","loading"); btn.innerHTML=SVG_PLAY; });
        audio.addEventListener("canplay", () => { playerEl.classList.remove("loading"); });
        return audio;
    }

    btn.addEventListener("click", () => {
        const a = getAudio();
        if (a.paused) {
            document.dispatchEvent(new CustomEvent("player-play", { detail: { el: playerEl } }));
            playerEl.classList.add("playing");
            if (a.readyState < 2) playerEl.classList.add("loading");
            btn.innerHTML = SVG_PAUSE;
            a.play().catch(() => { playerEl.classList.remove("playing","loading"); btn.innerHTML=SVG_PLAY; });
        } else {
            a.pause(); playerEl.classList.remove("playing"); btn.innerHTML=SVG_PLAY;
        }
    }, { signal });

    document.addEventListener("player-play", e => {
        if (e.detail.el !== playerEl && audio && !audio.paused) { audio.pause(); playerEl.classList.remove("playing"); btn.innerHTML=SVG_PLAY; }
    }, { signal });

    barWrap.addEventListener("click", e => {
        const a = getAudio();
        const pct = Math.max(0, Math.min(1, (e.clientX - barWrap.getBoundingClientRect().left) / barWrap.getBoundingClientRect().width));
        if (a.duration) a.currentTime = pct * a.duration;
        if (a.paused) {
            document.dispatchEvent(new CustomEvent("player-play", { detail: { el: playerEl } }));
            playerEl.classList.add("playing"); btn.innerHTML=SVG_PAUSE;
            a.play().catch(() => { playerEl.classList.remove("playing"); btn.innerHTML=SVG_PLAY; });
        }
    }, { signal });
}

// =====================================================================
// Affichage chansons
// =====================================================================

function afficherChansons() {
    playerAbortController.abort();
    playerAbortController = new AbortController();

    const liste = document.getElementById("chansons-liste");
    liste.innerHTML = "";

    if (!chansons.length) {
        liste.innerHTML = '<p class="chanson-meta">Aucune chanson pour le moment.</p>';
        return;
    }

    chansons.forEach((chanson, index) => {
        const card = document.createElement("article");
        card.className = "chanson-card";
        card.dataset.id = String(chanson.id);

        const avisChanson = avis.filter(item => String(item.chansonId) === String(chanson.id));
        const moyenne = avisChanson.length ? (avisChanson.reduce((acc,item) => acc+item.note, 0) / avisChanson.length).toFixed(1) : null;

        const noteMoyenne = moyenne
            ? `<p class="chanson-meta note-display">Note moyenne : ${echapper(moyenne)}/5 (${avisChanson.length} avis)</p>`
            : '<p class="chanson-meta note-display">Pas encore d\'avis</p>';

        const playerHtml = chanson.audioUrl ? `
            <div class="player">
                <button class="player-btn" type="button" aria-label="Lecture / Pause">${SVG_PLAY}</button>
                <div class="player-body">
                    <div class="player-bar-wrap" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                        <div class="player-bar"><div class="player-fill"></div></div>
                    </div>
                    <div class="player-times"><span class="player-cur">0:00</span><span class="player-dur">--:--</span></div>
                </div>
            </div>
        ` : '<p class="chanson-meta">Audio à venir...</p>';

        const btnSupprimer = estAuthentifie
            ? `<button class="btn-supprimer" type="button" data-action="supprimer-chanson" data-id="${chanson.id}">Supprimer</button>`
            : '';

        card.innerHTML = `
            <span class="track-num">${String(index+1).padStart(2,"0")}</span>
            <h3>${echapper(chanson.titre)}</h3>
            <p class="chanson-meta">${echapper(chanson.artiste)} · ${echapper(chanson.date)}</p>
            <span class="genre-tag">${echapper(chanson.genre)}</span>
            ${noteMoyenne}
            ${playerHtml}
            ${btnSupprimer}
        `;

        liste.appendChild(card);
        if (chanson.audioUrl) initPlayer(card.querySelector(".player"), chanson.audioUrl);
    });
}

function mettreAJourNoteChanson(chansonId) {
    const card = document.querySelector(`.chanson-card[data-id="${chansonId}"]`);
    if (!card) return;
    const avisChanson = avis.filter(item => String(item.chansonId) === String(chansonId));
    const moyenne = avisChanson.length ? (avisChanson.reduce((acc,item) => acc+item.note, 0) / avisChanson.length).toFixed(1) : null;
    const noteEl = card.querySelector(".note-display");
    if (noteEl) noteEl.textContent = moyenne ? `Note moyenne : ${moyenne}/5 (${avisChanson.length} avis)` : "Pas encore d'avis";
}

async function supprimerChanson(id) {
    if (!estAuthentifie) return;
    const chanson = chansons.find(c => c.id === id);
    const titre = chanson ? chanson.titre : "cette chanson";
    const avisLies = avis.filter(a => String(a.chansonId) === String(id));
    const infoAvis = avisLies.length
        ? ` Cela supprimera aussi les ${avisLies.length} avis associé(s).`
        : "";
    if (!await confirmer(`Supprimer « ${titre} » définitivement ?${infoAvis}`)) return;
    try {
        await deleteChanson(id);
        for (const a of avisLies) {
            try { await deleteAvis(a.id); } catch {}
        }
    } catch {
        afficherNotification("Erreur lors de la suppression.", "error");
        return;
    }
    chansons = chansons.filter(c => c.id !== id);
    avis = avis.filter(a => String(a.chansonId) !== String(id));
    afficherChansons();
    afficherAvis();
    mettreAJourSelectChansons();
    afficherNotification("Chanson supprimée.");
}

// =====================================================================
// Affichage avis
// =====================================================================

function afficherAvis() {
    const liste = document.getElementById("avis-liste");
    const filtreId = document.getElementById("filtre-avis").value;
    liste.innerHTML = "";

    const avisAffiches = filtreId ? avis.filter(a => String(a.chansonId) === filtreId) : avis;

    if (!avisAffiches.length) {
        liste.innerHTML = `<p class="chanson-meta">${filtreId ? "Aucun avis pour cette chanson." : "Aucun avis pour le moment. Soyez le premier à réagir."}</p>`;
        return;
    }

    avisAffiches.forEach(avisItem => {
        const chansonAssociee = chansons.find(c => String(c.id) === String(avisItem.chansonId));
        const card = document.createElement("article");
        card.className = "avis-card";

        const reponseHtml = avisItem.reponse ? `
            <div class="avis-reponse">
                <p class="reponse-label">Charly M :</p>
                <p class="reponse-texte">${echapper(avisItem.reponse.texte)}</p>
                <p class="reponse-date">${echapper(avisItem.reponse.date)}</p>
            </div>` : '';

        const formReponseHtml = estAuthentifie ? `
            <div class="avis-actions-artiste">
                <button class="btn-repondre" type="button" data-action="toggle-reponse" data-id="${avisItem.id}">
                    ${avisItem.reponse ? 'Modifier la réponse' : 'Répondre'}
                </button>
                <button class="btn-supprimer-avis" type="button" data-action="supprimer-avis" data-id="${avisItem.id}">Supprimer l'avis</button>
            </div>
            <div class="reponse-form hidden" id="reponse-form-${avisItem.id}">
                <textarea class="reponse-textarea" placeholder="Votre réponse..." rows="3">${avisItem.reponse ? echapper(avisItem.reponse.texte) : ''}</textarea>
                <div class="reponse-actions">
                    <button type="button" class="btn-publier-reponse" data-action="publier-reponse" data-id="${avisItem.id}">Publier</button>
                    ${avisItem.reponse ? `<button type="button" class="btn-supprimer-reponse" data-action="supprimer-reponse" data-id="${avisItem.id}">Supprimer la réponse</button>` : ''}
                </div>
            </div>` : '';

        card.innerHTML = `
            <div class="avis-header">
                <span class="avis-nom">${echapper(avisItem.nom)}</span>
                <span class="avis-note">${"⭐".repeat(Math.min(Math.max(avisItem.note,1),5))}</span>
            </div>
            <p class="avis-chanson">À propos de : ${echapper(chansonAssociee ? chansonAssociee.titre : "Chanson supprimée")}</p>
            <p class="avis-commentaire">${echapper(avisItem.commentaire)}</p>
            <p class="avis-date">${echapper(avisItem.date)}</p>
            ${reponseHtml}
            ${formReponseHtml}
        `;
        liste.appendChild(card);
    });
}

// =====================================================================
// Notifications
// =====================================================================

function afficherNotification(message, type = "success") {
    const n = document.getElementById("notification");
    n.textContent = message;
    n.className = `notification ${type} show`;
    setTimeout(() => n.classList.remove("show"), 3200);
}

function lireFichierAudioEnDataUrl(fichier) {
    return new Promise((resolve, reject) => {
        const lecteur = new FileReader();
        lecteur.onload = () => resolve(lecteur.result);
        lecteur.onerror = () => reject(new Error("Lecture impossible"));
        lecteur.readAsDataURL(fichier);
    });
}

// =====================================================================
// Authentification
// =====================================================================

function syncBtnArtiste() {
    const btn = document.getElementById("btn-artiste");
    btn.innerHTML = estAuthentifie ? SVG_UNLOCK : SVG_LOCK;
    btn.classList.toggle("unlocked", estAuthentifie);
}

function ouvrirModal() {
    const modal = document.getElementById("modal-artiste");
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    setTimeout(() => document.getElementById("mdp-artiste").focus(), 50);
}

function fermerModal() {
    const modal = document.getElementById("modal-artiste");
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    document.getElementById("auth-erreur").textContent = "";
    document.getElementById("mdp-artiste").value = "";
}

function afficherSectionUpload() {
    document.getElementById("upload-section").classList.remove("hidden");
    syncBtnArtiste();
}

function cacherSectionUpload() {
    document.getElementById("upload-section").classList.add("hidden");
    syncBtnArtiste();
}

document.getElementById("btn-artiste").addEventListener("click", () => {
    if (estAuthentifie) { document.getElementById("upload-section").scrollIntoView({ behavior: "smooth" }); }
    else { ouvrirModal(); }
});

document.getElementById("btn-fermer-modal").addEventListener("click", fermerModal);
document.getElementById("modal-artiste").addEventListener("click", e => { if (e.target === document.getElementById("modal-artiste")) fermerModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") fermerModal(); });

async function hacherMotDePasse(motDePasse) {
    const data = new TextEncoder().encode(motDePasse);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

document.getElementById("form-auth").addEventListener("submit", async e => {
    e.preventDefault();
    const saisie = document.getElementById("mdp-artiste").value;
    const hashSaisie = await hacherMotDePasse(saisie);
    if (hashSaisie === HASH_MOT_DE_PASSE_ARTISTE) {
        estAuthentifie = true;
        sessionStorage.setItem("artiste_auth", "1");
        fermerModal();
        afficherSectionUpload();
        afficherChansons();
        afficherAvis();
        afficherNotification("Bienvenue, Charly M !");
    } else {
        document.getElementById("auth-erreur").textContent = "Mot de passe incorrect.";
        document.getElementById("mdp-artiste").value = "";
        document.getElementById("mdp-artiste").focus();
    }
});

document.getElementById("btn-deconnecter").addEventListener("click", () => {
    estAuthentifie = false;
    sessionStorage.removeItem("artiste_auth");
    cacherSectionUpload();
    afficherChansons();
    afficherAvis();
    afficherNotification("Déconnecté de l'espace artiste.");
});

// =====================================================================
// Formulaire upload
// =====================================================================

document.getElementById("form-chanson").addEventListener("submit", async e => {
    e.preventDefault();
    if (!estAuthentifie) return;

    const titre  = document.getElementById("titre-chanson").value.trim();
    const genre  = document.getElementById("genre-chanson").value.trim();
    const date   = document.getElementById("annee-chanson").value.trim();
    const urlAudio = document.getElementById("url-audio").value.trim();
    const fichierAudio = document.getElementById("fichier-audio").files[0];

    if (!urlAudio && !fichierAudio) {
        afficherNotification("Ajoute un lien audio ou un fichier audio.", "error");
        return;
    }

    let audioUrl = urlAudio;

    if (fichierAudio) {
        try {
            audioUrl = await lireFichierAudioEnDataUrl(fichierAudio);
        } catch {
            afficherNotification("Le fichier audio n'a pas pu être chargé.", "error");
            return;
        }
    }

    const nouvelleChanson = { id: Date.now(), titre, artiste: "Charly M", genre, date, audioUrl };

    try {
        await saveChanson(nouvelleChanson);
        chansons.unshift(nouvelleChanson);
    } catch {
        afficherNotification("Erreur lors de la sauvegarde de la chanson.", "error");
        return;
    }

    afficherChansons();
    mettreAJourSelectChansons();
    e.target.reset();
    afficherNotification("Chanson publiée avec succès !");
});

// =====================================================================
// Formulaire avis
// =====================================================================

// Anti-spam : horodatage du rendu du formulaire avis
let avisFormRenduA = Date.now();

document.getElementById("form-avis").addEventListener("submit", async e => {
    e.preventDefault();

    // 1. Honeypot : si le champ caché est rempli, c'est un bot
    const honeypot = e.target.querySelector("[name='hp_avis']");
    if (honeypot && honeypot.value) return;

    // 2. Timing : moins de 2 secondes = bot
    if (Date.now() - avisFormRenduA < 2000) return;

    // 3. Rate limiting : max 3 avis par 10 minutes
    const RATE_KEY = "avis_rate_v1";
    const maintenant = Date.now();
    const historique = JSON.parse(localStorage.getItem(RATE_KEY) || "[]");
    const recents = historique.filter(t => maintenant - t < 10 * 60 * 1000);
    if (recents.length >= 3) {
        afficherNotification("Trop d'avis en peu de temps. Réessayez dans quelques minutes.", "error");
        return;
    }
    recents.push(maintenant);
    localStorage.setItem(RATE_KEY, JSON.stringify(recents));

    const nom = document.getElementById("nom-avis").value.trim() || "Anonyme";
    const chansonId = document.getElementById("chanson-avis").value;
    const noteStr = document.getElementById("note-avis").value;
    const note = parseInt(noteStr, 10);
    const commentaire = document.getElementById("commentaire-avis").value.trim();

    if (!chansonId) { afficherNotification("Choisis une chanson avant de poster l'avis.", "error"); return; }
    if (!noteStr || isNaN(note) || note < 1 || note > 5) { afficherNotification("Sélectionne une note entre 1 et 5.", "error"); return; }

    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    const nouvelAvis = { id: Date.now(), nom, chansonId, note, commentaire, date: new Date().toLocaleDateString("fr-FR"), reponse: null };
    try {
        await saveAvis(nouvelAvis);
    } catch {
        afficherNotification("Erreur réseau. Réessayez.", "error");
        btn.disabled = false;
        return;
    }
    avis.unshift(nouvelAvis);
    mettreAJourNoteChanson(chansonId);
    afficherAvis();
    e.target.reset();
    avisFormRenduA = Date.now();
    btn.disabled = false;
    afficherNotification("Merci pour ton avis !");
});

document.getElementById("filtre-avis").addEventListener("change", () => afficherAvis());

// =====================================================================
// Formulaire contact
// =====================================================================

document.getElementById("form-contact").addEventListener("submit", async e => {
    e.preventDefault();

    // Honeypot : si le champ caché est rempli, c'est un bot
    const honeypot = e.target.querySelector("[name='_gotcha']");
    if (honeypot && honeypot.value) {
        // Simuler un succès pour ne pas alerter le bot
        e.target.reset();
        afficherNotification("Message envoyé ! Charly M vous répondra bientôt.");
        return;
    }

    const btn = e.target.querySelector("button[type=submit]");
    const nom = document.getElementById("nom-contact").value.trim();
    const email = document.getElementById("email-contact").value.trim();
    const sujet = document.getElementById("sujet-contact").value.trim();
    const message = document.getElementById("message-contact").value.trim();

    btn.disabled = true;
    btn.textContent = "Envoi en cours...";

    try {
        const response = await fetch(FORMSPREE_ENDPOINT, {
            method: "POST",
            headers: { "Accept": "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({ nom, email, sujet, message })
        });
        if (response.ok) {
            e.target.reset();
            afficherNotification("Message envoyé ! Charly M vous répondra bientôt.");
        } else {
            const data = await response.json().catch(() => ({}));
            const erreur = data.errors ? data.errors.map(err => err.message).join(", ") : "Erreur lors de l'envoi.";
            afficherNotification(erreur, "error");
        }
    } catch {
        afficherNotification("Impossible d'envoyer le message. Vérifiez votre connexion.", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "Envoyer";
    }
});

// =====================================================================
// Réponses de Charly aux avis
// =====================================================================

function toggleReponseForm(avisId) {
    const form = document.getElementById(`reponse-form-${avisId}`);
    if (!form) return;
    form.classList.toggle("hidden");
    if (!form.classList.contains("hidden")) form.querySelector(".reponse-textarea").focus();
}

async function publierReponse(avisId) {
    if (!estAuthentifie) return;
    const form = document.getElementById(`reponse-form-${avisId}`);
    const texte = form.querySelector(".reponse-textarea").value.trim();
    if (!texte) { afficherNotification("La réponse ne peut pas être vide.", "error"); return; }
    const avisItem = avis.find(a => a.id === avisId);
    if (!avisItem) return;
    const ancienneReponse = avisItem.reponse;
    avisItem.reponse = { texte, date: new Date().toLocaleDateString("fr-FR") };
    try {
        await saveAvis(avisItem);
    } catch {
        afficherNotification("Erreur lors de la sauvegarde.", "error");
        avisItem.reponse = ancienneReponse;
        return;
    }
    afficherAvis();
    afficherNotification("Réponse publiée !");
}

async function supprimerReponse(avisId) {
    if (!estAuthentifie) return;
    if (!await confirmer("Supprimer cette réponse ?")) return;
    const avisItem = avis.find(a => a.id === avisId);
    if (!avisItem) return;
    const ancienneReponse = avisItem.reponse;
    avisItem.reponse = null;
    try {
        await saveAvis(avisItem);
    } catch {
        afficherNotification("Erreur lors de la suppression.", "error");
        avisItem.reponse = ancienneReponse;
        return;
    }
    afficherAvis();
    afficherNotification("Réponse supprimée.");
}

function confirmer(message) {
    return new Promise(resolve => {
        const modal = document.getElementById("modal-confirmer");
        document.getElementById("confirmer-message").textContent = message;
        modal.classList.add("show");
        modal.setAttribute("aria-hidden", "false");

        function oui() { cleanup(); resolve(true); }
        function non() { cleanup(); resolve(false); }
        function surOverlay(e) { if (e.target === modal) non(); }
        function surEchap(e) { if (e.key === "Escape") non(); }

        function cleanup() {
            modal.classList.remove("show");
            modal.setAttribute("aria-hidden", "true");
            document.getElementById("confirmer-oui").removeEventListener("click", oui);
            document.getElementById("confirmer-non").removeEventListener("click", non);
            modal.removeEventListener("click", surOverlay);
            document.removeEventListener("keydown", surEchap);
        }

        document.getElementById("confirmer-oui").addEventListener("click", oui);
        document.getElementById("confirmer-non").addEventListener("click", non);
        modal.addEventListener("click", surOverlay);
        document.addEventListener("keydown", surEchap);
        setTimeout(() => document.getElementById("confirmer-oui").focus(), 50);
    });
}

async function supprimerAvis(avisId) {
    if (!estAuthentifie) return;
    if (!await confirmer("Supprimer cet avis définitivement ? Cette action est irréversible.")) return;
    const avisItem = avis.find(a => a.id === avisId);
    const chansonId = avisItem ? avisItem.chansonId : null;
    try {
        await deleteAvis(avisId);
    } catch {
        afficherNotification("Erreur lors de la suppression.", "error");
        return;
    }
    avis = avis.filter(a => a.id !== avisId);
    if (chansonId) mettreAJourNoteChanson(chansonId);
    afficherAvis();
    afficherNotification("Avis supprimé.");
}


// =====================================================================
// Délégation d'événements (les onclick inline sont bloqués par CSP)
// =====================================================================

document.getElementById("chansons-liste").addEventListener("click", e => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "supprimer-chanson") supprimerChanson(Number(btn.dataset.id));
});

document.getElementById("avis-liste").addEventListener("click", e => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    switch (btn.dataset.action) {
        case "toggle-reponse":    toggleReponseForm(id); break;
        case "supprimer-avis":    supprimerAvis(id); break;
        case "publier-reponse":   publierReponse(id); break;
        case "supprimer-reponse": supprimerReponse(id); break;
    }
});

// =====================================================================
// Navigation active
// =====================================================================


const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        const link = document.querySelector(`.site-nav a[href="#${entry.target.id}"]`);
        if (link) link.classList.toggle("active", entry.isIntersecting);
    });
}, { threshold: 0.2, rootMargin: "-10% 0px -60% 0px" });

document.querySelectorAll("section[id]").forEach(s => sectionObserver.observe(s));

// =====================================================================
// Init
// =====================================================================

(async () => {
    await chargerDonnees();
    syncBtnArtiste();
    if (estAuthentifie) afficherSectionUpload();
    mettreAJourSelectChansons();
    afficherChansons();
    afficherAvis();
})();
