// ===================== STATE =====================
let currentSong = new Audio();
let songs = [];          // the currently active queue (sidebar list OR an opened album)
let currFolder = "";     // path of the currently active queue, e.g. "Songs/ncs"
let isShuffle = false;
let isRepeat = false;
let lastVolume = 70;     // remembered volume (0-100) for the mute/unmute toggle

const folderMetaCache = new Map(); // folder -> { title, description, cover }

// simple back/forward history for the two views (home / album)
let viewHistory = [{ view: "home" }];
let viewIndex = 0;

// ===================== HELPERS =====================
function secondsToMinutesSeconds(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function updateGreeting() {
    const hour = new Date().getHours();
    let greeting = "Good evening";
    if (hour < 5) greeting = "Good night";
    else if (hour < 12) greeting = "Good morning";
    else if (hour < 18) greeting = "Good afternoon";
    document.querySelector("#greetingHeading").innerHTML = `${greeting} 👋`;
}

function trackDisplayName(track) {
    // strip extension + decode for a clean title
    return decodeURI(track).replace(/\.[^/.]+$/, "");
}

function setPlaybarArt(src) {
    const artImg = document.querySelector("#albumArtImg");
    const requestedSrc = new URL(src, document.baseURI).href;
    artImg.onerror = () => {
        if (artImg.src !== requestedSrc) return;
        artImg.onerror = null;
        artImg.src = "IMG/music.svg";
    };
    artImg.src = requestedSrc;
}

function startCurrentSong() {
    if (!currentSong.src) return;
    const playRequest = currentSong.play();
    if (playRequest) {
        playRequest
            .then(() => { document.querySelector("#play").src = "IMG/pause.svg"; })
            .catch(() => { document.querySelector("#play").src = "IMG/play.svg"; });
    }
}

async function getFolderMeta(folder) {
    if (folderMetaCache.has(folder)) return folderMetaCache.get(folder);
    let meta = {
        title: folder.split("/").pop(),
        description: "",
        cover: "IMG/music.svg"
    };
    try {
        const res = await fetch(`/${folder}/info.json`);
        if (res.ok) {
            const data = await res.json();
            meta = {
                title: data.title || meta.title,
                description: data.description || "",
                cover: `/${folder}/cover.jpg`
            };
        }
    } catch (e) {
        // no info.json for this folder (e.g. the default "ncs" queue) — fall back silently
    }
    folderMetaCache.set(folder, meta);
    return meta;
}

// ===================== QUEUE LOADING =====================
async function getSongs(folder) {
    currFolder = folder;
    let a = await fetch(`/${folder}/`);
    let response = await a.text();
    let div = document.createElement("div");
    div.innerHTML = response;
    let as = div.getElementsByTagName("a");
    songs = [];
    for (let index = 0; index < as.length; index++) {
        const element = as[index];
        if (element.href.endsWith(".mp3")) {
            songs.push(element.href.split(`/${folder}/`)[1]);
        }
    }

    renderSidebarList();
    return songs;
}

function renderSidebarList() {
    let songUL = document.querySelector(".songList").getElementsByTagName("ul")[0];
    songUL.innerHTML = "";
    for (const song of songs) {
        songUL.innerHTML += `<li>
            <img class="invert" width="34" src="IMG/music.svg" alt="">
            <div class="info">
                <div>${trackDisplayName(song)}</div>
                <div>${currFolder.split("/").pop()}</div>
            </div>
            <div class="playnow">
                <span>Play Now</span>
                <img class="invert" src="IMG/play.svg" alt="">
            </div>
        </li>`;
    }

    Array.from(document.querySelector(".songList").getElementsByTagName("li")).forEach((li, i) => {
        li.addEventListener("click", () => playMusic(songs[i]));
    });
}

// ===================== PLAYBACK =====================
async function playMusic(track, pause = false) {
    if (!track) {
        document.querySelector("#songTitleDisplay").innerHTML = "–";
        document.querySelector("#songArtistDisplay").innerHTML = "Select a playlist to start";
        document.querySelector("#currentTime").innerHTML = "0:00";
        document.querySelector("#totalTime").innerHTML = "0:00";
        if (currFolder) {
            setPlaybarArt(`/${currFolder}/cover.jpg`);
        }
        return;
    }

    const playbackFolder = currFolder;
    const playbackSrc = `/${playbackFolder}/${track}`;
    currentSong.src = playbackSrc;
    if (!pause) {
        startCurrentSong();
    }

    // Update the structured song-info panel (never blow away its markup)
    document.querySelector("#songTitleDisplay").innerHTML = trackDisplayName(track);
    document.querySelector("#currentTime").innerHTML = "0:00";
    document.querySelector("#totalTime").innerHTML = "0:00";
    document.querySelector("#circle").style.left = "0%";
    document.querySelector(".seekbar").style.setProperty("--progress", "0%");

    const meta = await getFolderMeta(currFolder);
    if (currFolder !== playbackFolder || currentSong.src !== new URL(playbackSrc, document.baseURI).href) return;
    document.querySelector("#songArtistDisplay").innerHTML = meta.title;
    setPlaybarArt(meta.cover);

    highlightPlayingTrack(track);
}

function highlightPlayingTrack(track) {
    // Album view rows
    document.querySelectorAll(".track-row").forEach(row => {
        row.classList.toggle("playing", row.dataset.track === track);
    });
}

function currentIndex() {
    const current = decodeURI(currentSong.src.split("/").pop());
    return songs.findIndex(s => decodeURI(s) === current);
}

function playNext() {
    if (!songs.length) return;
    currentSong.pause();
    let index = currentIndex();
    if (isShuffle) {
        if (songs.length === 1) { playMusic(songs[0]); return; }
        let next;
        do { next = Math.floor(Math.random() * songs.length); } while (next === index);
        playMusic(songs[next]);
    } else if (index + 1 < songs.length) {
        playMusic(songs[index + 1]);
    } else if (isRepeat) {
        playMusic(songs[0]);
    }
}

function playPrevious() {
    if (!songs.length) return;
    if (currentSong.currentTime > 3 && !currentSong.ended) {
        currentSong.currentTime = 0;
        startCurrentSong();
        return;
    }

    currentSong.pause();
    let index = currentIndex();
    if (index - 1 >= 0) {
        playMusic(songs[index - 1]);
    } else if (isRepeat) {
        playMusic(songs[songs.length - 1]);
    }
}

// ===================== ALBUM CARDS (home view) =====================
async function displayAlbums() {
    let a = await fetch(`/Songs/`);
    let response = await a.text();
    let div = document.createElement("div");
    div.innerHTML = response;
    let anchors = Array.from(div.getElementsByTagName("a"));
    let cardContainer = document.querySelector(".cardContainer");
    cardContainer.innerHTML = "";

    for (const e of anchors) {
        const folderPath = new URL(e.href).pathname;
        if (folderPath === "/" || folderPath === "/Songs/" || folderPath === "/Songs" ||
            folderPath.includes(".htaccess") || folderPath.endsWith(".json")) continue;

        let folder = decodeURIComponent(folderPath.replace(/\/$/, "").split("/").pop());
        const meta = await getFolderMeta(`Songs/${folder}`);

        const card = document.createElement("div");
        card.className = "card";
        card.dataset.folder = folder;
        card.innerHTML = `
            <div class="play">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M5 20V4L19 12L5 20Z" stroke="#141B34" fill="#000" stroke-width="1.5" stroke-linejoin="round" />
                </svg>
            </div>
            <div class="card-img-wrap">
                <img src="${meta.cover}" alt="">
            </div>
            <h2>${meta.title}</h2>
            <p>${meta.description}</p>`;

        const img = card.querySelector(".card-img-wrap img");
        img.onerror = () => {
            img.onerror = null; img.replaceWith(Object.assign(document.createElement("div"), {
                className: "card-img-placeholder",
                innerHTML: `<img class="invert" width="40" src="IMG/music.svg" alt="">`
            }));
        };

        // Quick-play button: play the album without leaving the home view
        card.querySelector(".play").addEventListener("click", async (ev) => {
            ev.stopPropagation();
            await openAlbum(folder, { navigate: false });
            playMusic(songs[0]);
        });

        card.addEventListener("click", () => openAlbum(folder));
        cardContainer.appendChild(card);
    }
}

// ===================== ALBUM VIEW =====================
async function openAlbum(folder, opts = { navigate: true }) {
    const path = `Songs/${folder}`;
    await getSongs(path);
    const meta = await getFolderMeta(path);

    document.querySelector("#albumHeroCover").src = meta.cover;
    document.querySelector("#albumHeroCover").onerror = function () { this.onerror = null; this.src = "IMG/music.svg"; };
    document.querySelector("#albumHeroTitle").innerHTML = meta.title;
    document.querySelector("#albumHeroDesc").innerHTML = meta.description;
    document.querySelector("#albumSongCount").innerHTML = `${songs.length} song${songs.length === 1 ? "" : "s"}`;

    renderTrackList(folder, meta);

    if (opts.navigate !== false) {
        document.querySelector("#homeView").style.display = "none";
        document.querySelector("#albumView").style.display = "block";
        pushView({ view: "album", folder });
    }
}

function renderTrackList(folder, meta) {
    const list = document.querySelector("#albumTrackList");
    list.innerHTML = "";
    songs.forEach((song, i) => {
        const row = document.createElement("div");
        row.className = "track-row";
        row.dataset.track = song;
        row.innerHTML = `
            <div class="track-num-cell">
                <span class="track-num">${i + 1}</span>
                <span class="track-play-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M5 3L19 12L5 21V3Z" fill="currentColor"/>
                    </svg>
                </span>
            </div>
            <div class="track-info">
                <img class="track-thumb" src="${meta.cover}" alt="">
                <div class="track-text">
                    <div class="track-title">${trackDisplayName(song)}</div>
                    <div class="track-artist">${meta.title}</div>
                </div>
            </div>
            <div class="track-duration">--:--</div>`;

        row.querySelector(".track-thumb").onerror = function () { this.onerror = null; this.src = "IMG/music.svg"; };
        row.addEventListener("click", () => playMusic(song));
        list.appendChild(row);

        // Fetch duration lazily without blocking the render
        const probe = new Audio(`/${folder === "ncs" ? "Songs/ncs" : `Songs/${folder}`}/${song}`);
        probe.addEventListener("loadedmetadata", () => {
            row.querySelector(".track-duration").innerHTML = secondsToMinutesSeconds(probe.duration);
        });
    });
}

function goHome() {
    document.querySelector("#albumView").style.display = "none";
    document.querySelector("#homeView").style.display = "block";
}

// ===================== VIEW HISTORY (back/forward arrows) =====================
function pushView(state) {
    viewHistory = viewHistory.slice(0, viewIndex + 1);
    viewHistory.push(state);
    viewIndex = viewHistory.length - 1;
    const hash = state.view === "album" ? `#album/${encodeURIComponent(state.folder)}` : "#home";
    window.history.pushState(state, "", hash);
}

async function renderView(state) {
    if (state.view === "home") {
        goHome();
    } else {
        await openAlbum(state.folder, { navigate: false });
        document.querySelector("#homeView").style.display = "none";
        document.querySelector("#albumView").style.display = "block";
    }
}

// ===================== MAIN =====================
async function main() {
    window.history.replaceState({ view: "home" }, "", "#home");
    window.addEventListener("popstate", async (event) => {
        await renderView(event.state || { view: "home" });
    });
    updateGreeting();
    setInterval(updateGreeting, 60 * 1000);
    await getSongs("Songs/ncs");
    playMusic(songs[0], true);
    await displayAlbums();

    // Play / pause
    document.querySelector("#play").addEventListener("click", () => {
        if (!currentSong.src) return;
        if (currentSong.paused) {
            startCurrentSong();
        } else {
            currentSong.pause();
            document.querySelector("#play").src = "IMG/play.svg";
        }
    });

    // Seek + progress fill
    currentSong.addEventListener("timeupdate", () => {
        const pct = (currentSong.currentTime / currentSong.duration) * 100 || 0;
        document.querySelector("#currentTime").innerHTML = secondsToMinutesSeconds(currentSong.currentTime);
        document.querySelector("#totalTime").innerHTML = secondsToMinutesSeconds(currentSong.duration);
        document.querySelector("#circle").style.left = pct + "%";
        document.querySelector(".seekbar").style.setProperty("--progress", pct + "%");
    });

    document.querySelector(".seekbar").addEventListener("click", e => {
        let percent = (e.offsetX / e.target.getBoundingClientRect().width) * 100;
        document.querySelector("#circle").style.left = percent + "%";
        document.querySelector(".seekbar").style.setProperty("--progress", percent + "%");
        currentSong.currentTime = (currentSong.duration * percent) / 100;
    });

    // Auto-advance when a track finishes (previously missing entirely)
    currentSong.addEventListener("ended", () => {
        document.querySelector("#play").src = "IMG/play.svg";
        playNext();
    });

    // Sidebar open/close (mobile)
    document.querySelector("#hamburgerBtn").addEventListener("click", () => {
        document.querySelector("#sidebar").classList.add("open");
    });
    document.querySelector("#closeSidebar").addEventListener("click", () => {
        document.querySelector("#sidebar").classList.remove("open");
    });

    // Previous / Next
    document.querySelector("#previous").addEventListener("click", playPrevious);
    document.querySelector("#next").addEventListener("click", playNext);

    // Shuffle / Repeat (playbar)
    document.querySelector("#shuffleBtn").addEventListener("click", (e) => {
        isShuffle = !isShuffle;
        e.target.classList.toggle("active", isShuffle);
    });
    document.querySelector("#repeatBtn").addEventListener("click", (e) => {
        isRepeat = !isRepeat;
        e.target.classList.toggle("active", isRepeat);
    });

    // Volume slider (live, matches --vol-pct fill + mute icon)
    const volumeSlider = document.querySelector("#volumeSlider");
    const volumeIcon = document.querySelector("#volumeIcon");
    currentSong.volume = volumeSlider.value / 100;
    volumeSlider.style.setProperty("--vol-pct", volumeSlider.value + "%");

    volumeSlider.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        currentSong.volume = val / 100;
        e.target.style.setProperty("--vol-pct", val + "%");
        if (val > 0) {
            lastVolume = val;
            volumeIcon.src = volumeIcon.src.replace("mute.svg", "volume.svg");
        } else {
            volumeIcon.src = volumeIcon.src.replace("volume.svg", "mute.svg");
        }
    });

    volumeIcon.addEventListener("click", () => {
        if (volumeIcon.src.includes("volume.svg")) {
            volumeIcon.src = volumeIcon.src.replace("volume.svg", "mute.svg");
            currentSong.volume = 0;
            volumeSlider.value = 0;
            volumeSlider.style.setProperty("--vol-pct", "0%");
        } else {
            volumeIcon.src = volumeIcon.src.replace("mute.svg", "volume.svg");
            currentSong.volume = lastVolume / 100;
            volumeSlider.value = lastVolume;
            volumeSlider.style.setProperty("--vol-pct", lastVolume + "%");
        }
    });

    // Album view: back to home, play-all, shuffle-play
    document.querySelector("#navBackBtn").addEventListener("click", async () => {
        if (window.history.state?.view === "album") window.history.back();
        else goHome();
    });
    document.querySelector("#navFwdBtn").addEventListener("click", async () => {
        window.history.forward();
    });
    document.querySelector("#albumPlayAllBtn").addEventListener("click", () => {
        if (songs.length) playMusic(songs[0]);
    });
    document.querySelector("#albumShuffleBtn").addEventListener("click", (e) => {
        if (!songs.length) return;
        isShuffle = true;
        document.querySelector("#shuffleBtn").classList.add("active");
        e.currentTarget.classList.add("active");
        playMusic(songs[Math.floor(Math.random() * songs.length)]);
    });
}
main() 