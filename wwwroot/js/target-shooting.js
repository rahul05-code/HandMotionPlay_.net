import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/vision_bundle.mjs";

const TARGET_TYPES = [
    { type: 'normal', color: '#3b82f6', points: 10, radius: 25, speedMult: 1 },
    { type: 'fast', color: '#f59e0b', points: 20, radius: 20, speedMult: 1.5 },
    { type: 'small', color: '#10b981', points: 30, radius: 15, speedMult: 1.2 },
    { type: 'special', color: '#a855f7', points: 50, radius: 20, speedMult: 1.8 }
];

const PINCH_THRESHOLD = 0.05;
const DEBOUNCE_TIME = 300; 

// UI
const video = document.getElementById('videoRef');
const canvas = document.getElementById('canvasRef');
const cursorCanvas = document.getElementById('cursorCanvasRef');

const loadingSpinner = document.getElementById('loadingSpinner');
const loadingText = document.getElementById('loadingText');
const loadingBtn = document.querySelector('.loading-btn');
const comboText = document.getElementById('comboText');

const scoreDisplay = document.querySelector('.score-card h2');
const statsValues = document.querySelectorAll('.stat-box span');
const durationDisplay = statsValues[0];
const hitsDisplay = statsValues[1];
const maxComboDisplay = statsValues[2];
const accuracyDisplay = statsValues[3];

const difficultyBtns = document.querySelectorAll('.difficulty');
const resetBtn = document.querySelector('.reset-btn');

let ctx, cursorCtx;
if (canvas) ctx = canvas.getContext('2d');
if (cursorCanvas) cursorCtx = cursorCanvas.getContext('2d');

let handLandmarker = null;
let requestRef = null;

// Game State
let isModelLoaded = false;
let isPlaying = false;
let difficulty = 0; // 0: Easy, 1: Medium, 2: Hard
let score = 0;
let hits = 0;
let combo = 0;
let maxCombo = 0;
let shots = 0;
let startTime = Date.now();
let elapsedTime = 0;

let targets = [];
let particles = [];
let lastShootTime = [0, 0];
let lastSpawnTime = 0;
let lastTime = -1;

const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
};

setInterval(() => {
    if (isPlaying) {
        elapsedTime = Math.floor((Date.now() - startTime) / 1000);
        if (durationDisplay) durationDisplay.innerText = formatTime(elapsedTime);
    }
}, 1000);

const setDifficulty = (idx) => {
    difficulty = idx;
    difficultyBtns.forEach((btn, i) => {
        if (i === idx) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    handleReset();
};

difficultyBtns.forEach((btn, i) => btn.addEventListener('click', () => setDifficulty(i)));

const saveSessionData = () => {
    if (shots > 0) {
        const accuracy = shots > 0 ? (hits / shots) * 100 : 0;
        const payload = {
            GameId: 3, // Target Shooting
            Score: score,
            Accuracy: accuracy,
            DurationSeconds: elapsedTime
        };
        fetch('/api/Session/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true
        }).catch(err => console.error('Failed to save session', err));
    }
};

window.addEventListener('beforeunload', () => {
    saveSessionData();
});

const handleReset = () => {
    saveSessionData();

    targets = [];
    particles = [];
    score = 0;
    hits = 0;
    combo = 0;
    shots = 0;
    startTime = Date.now();
    elapsedTime = 0;
    updateUI();
};
if (resetBtn) resetBtn.addEventListener('click', handleReset);

const updateUI = () => {
    if (scoreDisplay) scoreDisplay.innerText = score;
    if (hitsDisplay) hitsDisplay.innerText = hits;
    if (maxComboDisplay) maxComboDisplay.innerText = `${maxCombo}x`;
    if (accuracyDisplay) {
        const acc = shots > 0 ? Math.round((hits / shots) * 100) : 0;
        accuracyDisplay.innerText = `${acc}%`;
    }
    if (combo > 5 && comboText) {
        comboText.innerText = `${combo}x COMBO!`;
        comboText.style.display = 'block';
    } else if (comboText) {
        comboText.style.display = 'none';
    }
};

const createExplosion = (x, y, color) => {
    for (let i = 0; i < 15; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 2;
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: Math.random() * 4 + 2,
            color,
            life: 1.0,
            decay: Math.random() * 0.05 + 0.02
        });
    }
};

async function initializeMediaPipe() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("Camera API is not available in browsers over unsecure HTTP. Please use HTTPS or access via localhost.");
            if (loadingText) loadingText.innerText = "Camera API blocked by browser security.";
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720, facingMode: "user" }
            });
            video.srcObject = stream;
            video.setAttribute('autoplay', 'true');
            video.setAttribute('playsinline', 'true');
            video.play();
        } catch (camErr) {
            alert("Camera error: " + camErr.message + ". Please ensure camera permissions are not blocked in url bar.");
            if (loadingText) loadingText.innerText = "Camera access denied.";
            return;
        }

        const vision = await FilesetResolver.forVisionTasks("/wasm");
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: `/wasm/hand_landmarker.task`,
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            numHands: 2
        });

        video.addEventListener("loadeddata", () => {
            isModelLoaded = true;
            isPlaying = true;
            startTime = Date.now();
            
            if (loadingSpinner) loadingSpinner.style.display = 'none';
            if (loadingText) loadingText.style.display = 'none';
            if (loadingBtn) loadingBtn.innerText = "Ready to Shoot";
            loadingBtn.classList.add('btn-danger'); // Use red locally
            
            predictWebcam();
        });
        if (video.readyState >= 2) {
            isModelLoaded = true;
            isPlaying = true;
            startTime = Date.now();
            
            if (loadingSpinner) loadingSpinner.style.display = 'none';
            if (loadingText) loadingText.style.display = 'none';
            if (loadingBtn) loadingBtn.innerText = "Ready to Shoot";
            loadingBtn.classList.add('btn-danger');
            
            predictWebcam();
        }
    } catch (err) {
        console.error("error init", err);
        if (loadingText) loadingText.innerText = "Failed to load camera/AI";
    }
}

function predictWebcam() {
    if (!video || !canvas || !cursorCanvas || !handLandmarker) return;

    const container = canvas.parentElement;
    if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        cursorCanvas.width = container.clientWidth;
        cursorCanvas.height = container.clientHeight;
    }

    let startTimeMs = performance.now();

    // Spawn
    const diffConfigs = [
        { spawnRate: 1500, maxTargets: 4, speedBase: 1 },    // Easy
        { spawnRate: 1000, maxTargets: 7, speedBase: 1.5 },  // Medium
        { spawnRate: 600, maxTargets: 12, speedBase: 2.2 }   // Hard
    ];
    const diffConfig = diffConfigs[difficulty];

    if (startTimeMs - lastSpawnTime > diffConfig.spawnRate && targets.length < diffConfig.maxTargets) {
        const tType = TARGET_TYPES[Math.floor(Math.random() * TARGET_TYPES.length)];
        const r = tType.radius;
        const x = r + Math.random() * (canvas.width - 2 * r);
        const y = r + Math.random() * (canvas.height - 2 * r);
        const speed = diffConfig.speedBase * tType.speedMult * 3;
        const angle = Math.random() * Math.PI * 2;

        targets.push({
            id: Math.random(), x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            ...tType
        });
        lastSpawnTime = startTimeMs;
    }

    cursorCtx.save();
    cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
    cursorCtx.translate(cursorCanvas.width, 0);
    cursorCtx.scale(-1, 1);
    const vRatio = cursorCanvas.width / video.videoWidth;
    const hRatio = cursorCanvas.height / video.videoHeight;
    const ratio = Math.max(vRatio, hRatio);
    const centerShift_x = (cursorCanvas.width - video.videoWidth * ratio) / 2;
    const centerShift_y = (cursorCanvas.height - video.videoHeight * ratio) / 2;

    cursorCtx.globalAlpha = 0.25;
    cursorCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight,
        centerShift_x, centerShift_y, video.videoWidth * ratio, video.videoHeight * ratio);
    cursorCtx.globalAlpha = 1.0;
    cursorCtx.restore();

    let shouldUpdateUI = false;

    if (lastTime !== video.currentTime && isPlaying) {
        lastTime = video.currentTime;
        let results = handLandmarker.detectForVideo(video, startTimeMs);

        if (results.landmarks && results.landmarks.length > 0) {
            results.landmarks.forEach((landmarks, handIndex) => {
                const indexTip = landmarks[8];
                const thumbTip = landmarks[4];
                
                // Mirror mapping
                const x = centerShift_x + (1 - indexTip.x) * video.videoWidth * ratio;
                const y = centerShift_y + indexTip.y * video.videoHeight * ratio;

                const dx = indexTip.x - thumbTip.x;
                const dy = indexTip.y - thumbTip.y;
                const dz = indexTip.z - thumbTip.z;
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

                const isPinching = distance < PINCH_THRESHOLD;
                const canShoot = (startTimeMs - lastShootTime[handIndex]) > DEBOUNCE_TIME;

                cursorCtx.beginPath();
                cursorCtx.arc(x, y, 15, 0, 2 * Math.PI);
                cursorCtx.fillStyle = 'transparent';
                cursorCtx.lineWidth = 2;

                let isAimingAtTarget = false;
                for (let i = 0; i < targets.length; i++) {
                    const t = targets[i];
                    const distToTarget = Math.sqrt((x - t.x) ** 2 + (y - t.y) ** 2);
                    if (distToTarget <= t.radius + 15) {
                        isAimingAtTarget = true;
                        break;
                    }
                }

                // Default theme color (assume light text in dark ui if undefined)
                let crosshairColor = isAimingAtTarget ? '#ef4444' : '#ffffff'; 

                if (isPinching) {
                    cursorCtx.strokeStyle = '#22c55e'; // success green
                    cursorCtx.lineWidth = 4;
                    cursorCtx.fill();
                    cursorCtx.beginPath();
                    cursorCtx.arc(x, y, 4, 0, 2 * Math.PI);
                    cursorCtx.fillStyle = '#22c55e';
                    cursorCtx.fill();
                } else {
                    cursorCtx.strokeStyle = crosshairColor;
                }
                cursorCtx.stroke();

                cursorCtx.beginPath();
                cursorCtx.moveTo(x - 20, y); cursorCtx.lineTo(x + 20, y);
                cursorCtx.moveTo(x, y - 20); cursorCtx.lineTo(x, y + 20);
                cursorCtx.strokeStyle = isPinching ? '#22c55e' : crosshairColor;
                cursorCtx.stroke();

                if (isPinching && canShoot) {
                    shots += 1;
                    lastShootTime[handIndex] = startTimeMs;
                    let hitSomething = false;

                    for (let i = targets.length - 1; i >= 0; i--) {
                        const t = targets[i];
                        const distToTarget = Math.sqrt((x - t.x) ** 2 + (y - t.y) ** 2);

                        if (distToTarget <= t.radius + 15) {
                            hitSomething = true;
                            score += Math.floor(t.points * (1 + (combo * 0.1)));
                            hits += 1;
                            combo += 1;
                            if (combo > maxCombo) maxCombo = combo;

                            createExplosion(t.x, t.y, t.color);
                            targets.splice(i, 1);
                            break;
                        }
                    }

                    if (!hitSomething) combo = 0;
                    shouldUpdateUI = true;
                }
            });
        }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    targets.forEach(t => {
        t.x += t.vx;
        t.y += t.vy;

        if (t.x - t.radius < 0) { t.x = t.radius; t.vx *= -1; }
        if (t.x + t.radius > canvas.width) { t.x = canvas.width - t.radius; t.vx *= -1; }
        if (t.y - t.radius < 0) { t.y = t.radius; t.vy *= -1; }
        if (t.y + t.radius > canvas.height) { t.y = canvas.height - t.radius; t.vy *= -1; }

        ctx.beginPath();
        ctx.arc(t.x, t.y, t.radius, 0, 2 * Math.PI);
        ctx.fillStyle = t.color;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffffff';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(t.x, t.y, t.radius * 0.6, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.radius * 0.2, 0, 2 * Math.PI);
        ctx.fillStyle = '#ff0000ff';
        ctx.fill();
    });

    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;

        if (p.life <= 0) {
            particles.splice(i, 1);
        } else {
            ctx.globalAlpha = p.life;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, 2 * Math.PI);
            ctx.fillStyle = p.color;
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
    }

    if (shouldUpdateUI || Math.random() < 0.05) updateUI();

    requestRef = requestAnimationFrame(predictWebcam);
}


if (video) {
    initializeMediaPipe();
}
