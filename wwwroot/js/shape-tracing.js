import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/vision_bundle.mjs";

const SHAPES = [
    { name: 'Circle', color: '#10b981', diff: 'Easy', draw: (path, w, h) => { path.arc(w/2, h/2, Math.min(w,h)*0.3, 0, Math.PI*2); } },
    { name: 'Square', color: '#3b82f6', diff: 'Easy', draw: (path, w, h) => { const s=Math.min(w,h)*0.6; path.rect((w-s)/2, (h-s)/2, s, s); } },
    { name: 'Triangle', color: '#f59e0b', diff: 'Easy', draw: (path, w, h) => { const s=Math.min(w,h)*0.6; const cx=w/2; const cy=h/2; path.moveTo(cx, cy-s/2); path.lineTo(cx+s/2, cy+s/2); path.lineTo(cx-s/2, cy+s/2); path.closePath(); } },
    { name: 'Star', color: '#a855f7', diff: 'Medium', draw: (path, w, h) => { 
        const cx=w/2; const cy=h/2; const outR=Math.min(w,h)*0.3; const inR=outR/2; 
        for(let i=0; i<10; i++) { 
             const r = (i%2===0)?outR:inR; const a = Math.PI/2 - (Math.PI*2*i/10); 
             if(i===0) path.moveTo(cx+Math.cos(a)*r, cy-Math.sin(a)*r); else path.lineTo(cx+Math.cos(a)*r, cy-Math.sin(a)*r);
        } path.closePath(); 
    } },
    { name: 'Heart', color: '#ef4444', diff: 'Hard', draw: (path, w, h) => {
        const x=w/2; const y=h/2 - Math.min(w,h)*0.1; const s=Math.min(w,h)*0.015;
        path.moveTo(x, y);
        for(let a=0; a<Math.PI*2; a+=0.1) {
            const hx = 16 * Math.pow(Math.sin(a), 3);
            const hy = 13 * Math.cos(a) - 5 * Math.cos(2*a) - 2 * Math.cos(3*a) - Math.cos(4*a);
            path.lineTo(x + hx*s, y - hy*s);
        }
        path.closePath();
    }}
];

const PINCH_THRESHOLD = 0.05;
const ACCURACY_TOLERANCE = 25;

// UI
const video = document.getElementById('videoRef');
const canvas = document.getElementById('canvasRef');
const cursorCanvas = document.getElementById('cursorCanvasRef');

const loadingSpinner = document.getElementById('loadingSpinner');
const loadingText = document.getElementById('loadingText');
const loadingBtn = document.querySelector('.loading-btn');

const successOverlay = document.getElementById('successOverlay');
const overlayShapeName = document.getElementById('overlayShapeName');
const overlayAccuracy = document.getElementById('overlayAccuracy');
const overlayTime = document.getElementById('overlayTime');

const statsValues = document.querySelectorAll('.stat-box span');
const durationDisplay = statsValues[0];
const accuracyDisplay = statsValues[1];
const completedDisplay = statsValues[2];
const totalShapesDisplay = statsValues[3];

const currentShapeContainer = document.querySelector('.current-shape');
const shapeListItems = document.querySelectorAll('.shape-item');
const resetBtns = document.querySelectorAll('.reset-btn');
const nextBtns = document.querySelectorAll('.next-btn');

let ctx, cursorCtx;
if (canvas) ctx = canvas.getContext('2d');
if (cursorCanvas) cursorCtx = cursorCanvas.getContext('2d', { willReadFrequently: true });

const coverageCanvas = document.createElement('canvas');
const coverageCtx = coverageCanvas.getContext('2d', { willReadFrequently: true });

let handLandmarker = null;
let requestRef = null;

// Game State
let isModelLoaded = false;
let currentShapeIndex = 0;
let accuracy = 0;
let completed = 0;
let elapsedTime = 0;
let isShapeComplete = false;
let startTimeCount = Date.now();

let isDrawing = false;
let lastX = null;
let lastY = null;
let lastTime = -1;
let shapePath2D = null;

let totalShapePixels = 0;
let lastCoverageCheck = 0;

let totalPoints = 0;
let correctPoints = 0;
let lastUiSync = 0;

if (totalShapesDisplay) totalShapesDisplay.innerText = SHAPES.length;

const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
};

setInterval(() => {
    if (isModelLoaded && !isShapeComplete) {
        elapsedTime = Math.floor((Date.now() - startTimeCount) / 1000);
        if (durationDisplay) durationDisplay.innerText = formatTime(elapsedTime);
    }
}, 1000);

const setupShape = () => {
    if (!cursorCanvas) return;
    const container = canvas.parentElement;
    if (cursorCanvas.width !== container.clientWidth || cursorCanvas.height !== container.clientHeight) {
        cursorCanvas.width = container.clientWidth; cursorCanvas.height = container.clientHeight;
        canvas.width = container.clientWidth; canvas.height = container.clientHeight;
        coverageCanvas.width = canvas.width; coverageCanvas.height = canvas.height;
    }

    const currentShape = SHAPES[currentShapeIndex];
    
    // UI Updates
    if (currentShapeContainer) {
        currentShapeContainer.innerHTML = `<h2>${currentShape.name}</h2><span class="badge" style="background:${currentShape.color}30; color:${currentShape.color}">${currentShape.diff}</span>`;
    }
    
    // Setup Paths
    shapePath2D = new Path2D();
    currentShape.draw(shapePath2D, cursorCanvas.width, cursorCanvas.height);
    
    coverageCtx.clearRect(0, 0, coverageCanvas.width, coverageCanvas.height);
    coverageCtx.lineWidth = ACCURACY_TOLERANCE;
    coverageCtx.strokeStyle = '#fff';
    coverageCtx.stroke(shapePath2D);
    
    const imgData = coverageCtx.getImageData(0, 0, coverageCanvas.width, coverageCanvas.height).data;
    let filled = 0;
    for (let i = 3; i < imgData.length; i += 4) {
        if (imgData[i] > 0) filled++;
    }
    totalShapePixels = filled;
    
    totalPoints = 0; correctPoints = 0;
    accuracy = 0;
    isShapeComplete = false;
    startTimeCount = Date.now();
    elapsedTime = 0;
    
    if (accuracyDisplay) accuracyDisplay.innerText = '0%';
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (successOverlay) successOverlay.style.display = 'none';
};

const saveSession = () => {
    if (totalPoints > 0) {
        const payload = {
            GameId: 2, // Shape Tracing
            Score: correctPoints * 10, 
            Accuracy: accuracy,
            DurationSeconds: elapsedTime
        };
        fetch('/api/Session/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(err => console.error('Failed to save session', err));
    }
};

const handleReset = () => {
    setupShape();
};

const handleNextShape = () => {
    currentShapeIndex = (currentShapeIndex + 1) % SHAPES.length;
    setupShape();
};

resetBtns.forEach(btn => btn.addEventListener('click', handleReset));
nextBtns.forEach(btn => btn.addEventListener('click', handleNextShape));

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
            numHands: 1
        });

        video.addEventListener("loadeddata", () => {
            isModelLoaded = true;
            if (loadingSpinner) loadingSpinner.style.display = 'none';
            if (loadingText) loadingText.style.display = 'none';
            if (loadingBtn) {
                loadingBtn.innerText = "AI Active";
                loadingBtn.classList.add('bg-success');
            }
            setupShape();
            predictWebcam();
        });
        if (video.readyState >= 2) {
            isModelLoaded = true;
            if (loadingSpinner) loadingSpinner.style.display = 'none';
            if (loadingText) loadingText.style.display = 'none';
            if (loadingBtn) {
                loadingBtn.innerText = "AI Active";
                loadingBtn.classList.add('bg-success');
            }
            setupShape();
            predictWebcam();
        }
    } catch (err) {
        console.error(err);
        if (loadingText) loadingText.innerText = "Error loading camera/AI";
    }
}

function predictWebcam() {
    if (!video || !canvas || !cursorCanvas || !handLandmarker) return;

    const container = canvas.parentElement;
    if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
        canvas.width = container.clientWidth; canvas.height = container.clientHeight;
        cursorCanvas.width = container.clientWidth; cursorCanvas.height = container.clientHeight;
        coverageCanvas.width = container.clientWidth; coverageCanvas.height = container.clientHeight;
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        setupShape();
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

    cursorCtx.globalAlpha = 0.2;
    cursorCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight,
        centerShift_x, centerShift_y, video.videoWidth * ratio, video.videoHeight * ratio);
    cursorCtx.restore();

    cursorCtx.save();
    cursorCtx.setLineDash([15, 15]);
    cursorCtx.strokeStyle = "rgba(168, 85, 247, 0.5)"; // accent
    const pulse = 6 + Math.sin(startTimeMs / 200) * 2;
    cursorCtx.lineWidth = pulse;
    if (shapePath2D) cursorCtx.stroke(shapePath2D);
    cursorCtx.restore();

    if (lastTime !== video.currentTime && !isShapeComplete) {
        lastTime = video.currentTime;
        let results = handLandmarker.detectForVideo(video, startTimeMs);

        if (results.landmarks && results.landmarks.length > 0) {
            const primary = results.landmarks[0];
            const indexTip = primary[8];
            const thumbTip = primary[4];

            const x = centerShift_x + (1 - indexTip.x) * video.videoWidth * ratio;
            const y = centerShift_y + indexTip.y * video.videoHeight * ratio;

            const dx = indexTip.x - thumbTip.x;
            const dy = indexTip.y - thumbTip.y;
            const dz = indexTip.z - thumbTip.z;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            
            const isPinching = distance < PINCH_THRESHOLD;

            cursorCtx.beginPath();
            cursorCtx.arc(x, y, 12, 0, 2 * Math.PI);
            cursorCtx.fillStyle = isPinching ? 'transparent' : '#00C2FF';
            cursorCtx.fill();
            cursorCtx.lineWidth = 3;
            cursorCtx.strokeStyle = isPinching ? '#22c55e' : '#ffffff';
            cursorCtx.stroke();

            if (isPinching) {
                if (!isDrawing) {
                    isDrawing = true;
                    lastX = x; lastY = y;
                } else {
                    ctx.beginPath();
                    ctx.moveTo(lastX, lastY);
                    ctx.lineTo(x, y);

                    let isAccurate = false;
                    if (shapePath2D) {
                        cursorCtx.save();
                        cursorCtx.lineWidth = ACCURACY_TOLERANCE * 2;
                        isAccurate = cursorCtx.isPointInStroke(shapePath2D, x, y);
                        cursorCtx.restore();
                    }

                    if (!isShapeComplete) {
                        ctx.strokeStyle = isAccurate ? '#00C2FF' : '#ef4444';
                        ctx.lineWidth = 14;
                        ctx.stroke();

                        if (isAccurate) {
                            coverageCtx.globalCompositeOperation = 'destination-out';
                            coverageCtx.beginPath();
                            coverageCtx.arc(x, y, 15, 0, 2 * Math.PI);
                            coverageCtx.fill();
                        }

                        totalPoints += 1;
                        if (isAccurate) correctPoints += 1;

                        const now = Date.now();
                        if (now - lastUiSync > 500) {
                            accuracy = Math.round((correctPoints / totalPoints) * 100);
                            if (accuracyDisplay) accuracyDisplay.innerText = `${accuracy}%`;
                            lastUiSync = now;

                            if (now - lastCoverageCheck > 1000) {
                                const imgData = coverageCtx.getImageData(0, 0, canvas.width, canvas.height).data;
                                let remaining = 0;
                                for (let i = 3; i < imgData.length; i += 4) {
                                    if (imgData[i] > 0) remaining++;
                                }
                                const coverage = (totalShapePixels - remaining) / totalShapePixels;
                                if (coverage > 0.95 && accuracy > 70) {
                                    isShapeComplete = true;
                                    completed++;
                                    if (completedDisplay) completedDisplay.innerText = completed;
                                    
                                    // Automate save upon shape completion
                                    saveSession();
                                    
                                    // Show success overlay
                                    if (successOverlay) {
                                        successOverlay.style.display = 'flex';
                                        if (overlayShapeName) overlayShapeName.innerText = SHAPES[currentShapeIndex].name;
                                        if (overlayAccuracy) overlayAccuracy.innerText = `${accuracy}%`;
                                        if (overlayTime) overlayTime.innerText = formatTime(elapsedTime);
                                    }
                                }
                                lastCoverageCheck = now;
                            }
                        }
                    }

                    lastX = x; lastY = y;
                }
            } else {
                isDrawing = false;
            }
        } else {
            isDrawing = false;
        }
    }

    requestRef = requestAnimationFrame(predictWebcam);
}

if (video) {
    initializeMediaPipe();
}
