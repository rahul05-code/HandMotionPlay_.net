import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/vision_bundle.mjs";

const PINCH_THRESHOLD = 0.06;

const getExtendedFingers = (landmarks) => {
    let count = 0;
    if (landmarks[8].y < landmarks[6].y) count++;
    if (landmarks[12].y < landmarks[10].y) count++;
    if (landmarks[16].y < landmarks[14].y) count++;
    if (landmarks[20].y < landmarks[18].y) count++;

    const distTip = Math.abs(landmarks[4].x - landmarks[9].x);
    const distIp = Math.abs(landmarks[3].x - landmarks[9].x);
    if (distTip > distIp + 0.02) count++;

    return count;
};

const getPinchDistance = (landmarks) => {
    const dx = landmarks[8].x - landmarks[4].x;
    const dy = landmarks[8].y - landmarks[4].y;
    const dz = landmarks[8].z - landmarks[4].z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

// UI Elements
const video = document.getElementById('input_video');
const canvas = document.getElementById('draw_canvas'); // Actually draws the line
const cursorCanvas = document.getElementById('output_canvas'); // Video feed & brush preview
const loadingSpinner = document.getElementById('loadingSpinner');
const loadingText = document.getElementById('loadingText');
const loadingBtn = document.querySelector('.loading-btn');

// Control elements
const colorSelects = document.querySelectorAll('.colors .color');
const prevBrushBtn = document.getElementById('decreaseBrush');
const nextBrushBtn = document.getElementById('increaseBrush');
const brushSizeDisplay = document.getElementById('brushSizeDisplay');
const btnEraser = document.getElementById('btnEraser');
const btnClear = document.getElementById('btnClear');
const btnDownload = document.getElementById('btnDownload');

// Stats elements
const statsDisplay = document.querySelectorAll('.stat-box span');
const durationDisplay = statsDisplay[0];
const strokesDisplay = statsDisplay[statsDisplay.length > 0 ? 1 : 0] || document.createElement('span'); // fallback

let ctx, cursorCtx;
if (canvas) ctx = canvas.getContext('2d');
if (cursorCanvas) cursorCtx = cursorCanvas.getContext('2d', { willReadFrequently: true });

let handLandmarker = null;
let animationId = null;

// Game State
let isModelLoaded = false;
let currentColor = '#0088ff';
let brushSize = 8;
let isErasing = false;
let startTime = Date.now();
let strokesCount = 0;

let isDrawing = false;
let lastX = null;
let lastY = null;
let lastTime = -1;
let lastClearCall = 0;
let lastUiSyncTime = 0;

let fingerCountStable = 0;
let fingerCountValue = -1;

const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
};

// Start Timing
setInterval(() => {
    if (isModelLoaded && durationDisplay) {
        durationDisplay.innerText = formatTime(Math.floor((Date.now() - startTime) / 1000));
    }
}, 1000);

const updateColorUI = (newColor) => {
    currentColor = newColor;
    isErasing = false;
    colorSelects.forEach(el => {
        if (el.getAttribute('data-color') === newColor) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
    if (btnEraser) btnEraser.classList.remove('active-tool');
};

const clearDrawCanvas = () => {
    if (strokesCount > 0) {
        const duration = Math.floor((Date.now() - startTime) / 1000);
        const payload = {
            GameId: 1, // Canvas Drawing
            Score: strokesCount * 5,
            Accuracy: 100, // Drawing doesn't have an accuracy metric per se
            DurationSeconds: duration
        };
        fetch('/api/Session/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(err => console.error('Failed to save session', err));
    }

    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        strokesCount = 0;
        startTime = Date.now();
        if (strokesDisplay) strokesDisplay.innerText = strokesCount;
    }
};

const downloadArt = () => {
    if (canvas) {
        const link = document.createElement('a');
        link.download = `handmotion-play-drawing-${Date.now()}.png`;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tCtx = tempCanvas.getContext('2d');
        tCtx.fillStyle = '#0a0e17'; 
        tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        tCtx.drawImage(canvas, 0, 0);

        link.href = tempCanvas.toDataURL('image/png');
        link.click();
    }
};

// UI Listeners
colorSelects.forEach(el => {
    el.addEventListener('click', () => updateColorUI(el.getAttribute('data-color')));
});

if (prevBrushBtn) prevBrushBtn.addEventListener('click', () => { brushSize = Math.max(2, brushSize - 2); brushSizeDisplay.innerText = `${brushSize}px`; });
if (nextBrushBtn) nextBrushBtn.addEventListener('click', () => { brushSize = Math.min(40, brushSize + 2); brushSizeDisplay.innerText = `${brushSize}px`; });
if (btnEraser) btnEraser.addEventListener('click', () => { 
    isErasing = !isErasing; 
    btnEraser.classList.toggle('active-tool', isErasing);
});
if (btnClear) btnClear.addEventListener('click', clearDrawCanvas);
if (btnDownload) btnDownload.addEventListener('click', downloadArt);

const UI_COLORS = ['#ffffff', '#0088ff', '#ff007f', '#00e676', '#ffea00']; // Mapping 1-5 fingers to these colors natively

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
            startTime = Date.now();
            if (loadingSpinner) loadingSpinner.style.display = 'none';
            if (loadingText) loadingText.style.display = 'none';
            if (loadingBtn) loadingBtn.innerText = "AI Active";
            loadingBtn.classList.add('btn-success');
            predictWebcam();
        });
        if (video.readyState >= 2) {
            isModelLoaded = true;
            startTime = Date.now();
            if (loadingSpinner) loadingSpinner.style.display = 'none';
            if (loadingText) loadingText.style.display = 'none';
            if (loadingBtn) loadingBtn.innerText = "AI Active";
            loadingBtn.classList.add('bg-success');
            predictWebcam();
        }
    } catch (err) {
        console.error("Error init MediaPipe", err);
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
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
    }

    let startTimeMs = performance.now();

    cursorCtx.save();
    cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
    cursorCtx.translate(cursorCanvas.width, 0);
    cursorCtx.scale(-1, 1);

    const vRatio = cursorCanvas.width / video.videoWidth;
    const hRatio = cursorCanvas.height / video.videoHeight;
    const ratio = Math.max(vRatio, hRatio);
    const centerShift_x = (cursorCanvas.width - video.videoWidth * ratio) / 2;
    const centerShift_y = (cursorCanvas.height - video.videoHeight * ratio) / 2;

    cursorCtx.globalAlpha = 0.3;
    cursorCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight,
        centerShift_x, centerShift_y, video.videoWidth * ratio, video.videoHeight * ratio);
    cursorCtx.globalAlpha = 1.0;
    cursorCtx.restore();

    if (lastTime !== video.currentTime && isModelLoaded) {
        lastTime = video.currentTime;
        let results = handLandmarker.detectForVideo(video, startTimeMs);

        let drawnThisFrame = false;
        let currentX = 0;
        let currentY = 0;
        let isCursorActive = false;

        if (results.landmarks && results.landmarks.length > 0) {
            isCursorActive = true;
            const primary = results.landmarks[0];
            const p1 = getPinchDistance(primary);
            const f1 = getExtendedFingers(primary);

            const isPinching = p1 < PINCH_THRESHOLD;
            const isOpen = f1 >= 4;

            currentX = (1 - primary[8].x) * canvas.width;
            currentY = primary[8].y * canvas.height;

            let isModifyingSize = false;

            // Secondary hand logic
            if (results.landmarks.length > 1) {
                const secondary = results.landmarks[1];
                const p2 = getPinchDistance(secondary);
                const f2 = getExtendedFingers(secondary);
                const o2 = f2 >= 4;

                if (isOpen && o2) {
                    const now = Date.now();
                    if (now - lastClearCall > 1500) {
                        clearDrawCanvas();
                        lastClearCall = now;
                    }
                }
                else if (isOpen && p2 < 0.2 && f2 < 4) {
                    isModifyingSize = true;
                    let size = Math.max(2, Math.min(40, p2 * 300));
                    const roundedSize = Math.round(size);
                    if (Math.abs(roundedSize - brushSize) >= 1) {
                        brushSize = roundedSize;
                        const now = Date.now();
                        if (now - lastUiSyncTime > 100) {
                            if (brushSizeDisplay) brushSizeDisplay.innerText = `${brushSize}px`;
                            lastUiSyncTime = now;
                        }
                    }
                }
                else if (isPinching) {
                    if (f2 >= 1 && f2 <= 5) {
                        if (f2 === fingerCountValue) {
                            fingerCountStable += 1;
                            if (fingerCountStable > 10) {
                                const newUiColor = UI_COLORS[Math.min(f2 - 1, 4)];
                                if (currentColor !== newUiColor) {
                                    currentColor = newUiColor;
                                    const now = Date.now();
                                    if (now - lastUiSyncTime > 100) {
                                        updateColorUI(currentColor);
                                        lastUiSyncTime = now;
                                    }
                                }
                            }
                        } else {
                            fingerCountValue = f2;
                            fingerCountStable = 0;
                        }
                    }
                }
            }

            if (isPinching) {
                drawnThisFrame = true;
                if (isErasing) {
                    isErasing = false;
                    if (btnEraser) btnEraser.classList.remove('active-tool');
                }
            }
            else if (isOpen && !isModifyingSize) {
                // Secondary fallback for erase (holding hand completely open)
                drawnThisFrame = false; // changed this logic from React if you just hold hand open it doesn't draw. To erase wait till pinch.
            }
        }

        if (isCursorActive) {
            cursorCtx.beginPath();
            cursorCtx.arc(currentX, currentY, brushSize / 2 + 4, 0, 2 * Math.PI);
            cursorCtx.fillStyle = isErasing ? '#ffffff' : currentColor;
            cursorCtx.fill();
            cursorCtx.lineWidth = 2;
            cursorCtx.strokeStyle = isErasing ? '#ff0000' : '#ffffff';
            cursorCtx.stroke();

            if (drawnThisFrame) {
                if (!isDrawing) {
                    isDrawing = true;
                    lastX = currentX;
                    lastY = currentY;
                    strokesCount++;
                    if (strokesDisplay) strokesDisplay.innerText = strokesCount;
                } else {
                    ctx.beginPath();
                    ctx.moveTo(lastX, lastY);
                    ctx.lineTo(currentX, currentY);
                    
                    ctx.strokeStyle = isErasing ? "#0a0e17" : currentColor;
                    ctx.lineWidth = brushSize;
                    ctx.globalCompositeOperation = isErasing ? "destination-out" : "source-over";
                    ctx.stroke();

                    lastX = currentX;
                    lastY = currentY;
                }
            } else {
                isDrawing = false;
            }
        } else {
            isDrawing = false;
        }
    }

    animationId = requestAnimationFrame(predictWebcam);
}

// Init
if (video) {
    initializeMediaPipe();
}
