// DOM Elements
const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

const drawCanvasElement = document.getElementById('draw_canvas');
const drawCtx = drawCanvasElement.getContext('2d');

// UI Elements
const spinner = document.getElementById('loadingSpinner');
const loadingText = document.getElementById('loadingText');
const colorSwatches = document.querySelectorAll('.color');
const brushSizeDisplay = document.getElementById('brushSizeDisplay');
const btnDecrease = document.getElementById('decreaseBrush');
const btnIncrease = document.getElementById('increaseBrush');
const btnEraser = document.getElementById('btnEraser');
const btnClear = document.getElementById('btnClear');
const btnDownload = document.getElementById('btnDownload');

// State Variables
let isDrawing = false;
let isErasing = false;
let lastX = 0;
let lastY = 0;
let currentColor = '#0088ff';
let currentBrushSize = 8;
let cooldownCounter = 0; // Prevent rapid color/size switching every frame
const COOLDOWN_FRAMES = 15;

// Initialization
function initializeCanvases() {
    // Match internal resolution to actual DOM display size
    const rect = canvasElement.parentElement.getBoundingClientRect();
    const w = rect.width || 1280;
    const h = rect.height || 720;

    canvasElement.width = w;
    canvasElement.height = h;
    drawCanvasElement.width = w;
    drawCanvasElement.height = h;

    // Set initial drawing styles
    drawCtx.lineCap = 'round';
    drawCtx.lineJoin = 'round';
    drawCtx.strokeStyle = currentColor;
    drawCtx.lineWidth = currentBrushSize;
}

// MediaPipe Hands Setup
const hands = new Hands({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
});

hands.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
    },
    width: 1280,
    height: 720
});

// Start Camera
camera.start().then(() => {
    // Hide loaders once started
    if (spinner) spinner.style.display = 'none';
    if (loadingText) loadingText.style.display = 'none';
    initializeCanvases();
});


// Helper functions for gesture math
function calculateDistance(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

function countExtendedFingers(landmarks) {
    let count = 0;
    // Thumb: Compare tip x to ip x (rough heuristic given different hand orientations)
    if (landmarks[4].x < landmarks[3].x) count++; // Assuming right hand facing camera
    
    // Index, Middle, Ring, Pinky
    if (landmarks[8].y < landmarks[6].y) count++;
    if (landmarks[12].y < landmarks[10].y) count++;
    if (landmarks[16].y < landmarks[14].y) count++;
    if (landmarks[20].y < landmarks[18].y) count++;
    
    return count;
}


// Main Render Loop
function onResults(results) {
    // Update logic counters
    if (cooldownCounter > 0) cooldownCounter--;

    // 1. Draw camera feed and hand landmarks
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Mirror the video horizontally for intuitive interaction
    canvasCtx.translate(canvasElement.width, 0);
    canvasCtx.scale(-1, 1);

    // Draw raw video to bottom canvas
    if (results.image) {
        canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    }

    let drawingHand = null;
    let controlHand = null;

    if (results.multiHandLandmarks && results.multiHandedness) {
        
        // Identify drawing hand (typically dominant/first found) and control hand
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            const classification = results.multiHandedness[i].label; // 'Right' or 'Left'

            // Draw visual landmarks over hands
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 3 });
            drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', lineWidth: 2 });

            // We'll treat the first detected hand as drawing, second as control for simplicity 
            // no matter if it's left or right due to webcam mirroring rules.
            if (i === 0) drawingHand = landmarks;
            if (i === 1) controlHand = landmarks;
        }

        // ==========================================
        // BOTH HANDS LOGIC (CLEAR CANVAS)
        // ==========================================
        if (drawingHand && controlHand) {
            const fingers1 = countExtendedFingers(drawingHand);
            const fingers2 = countExtendedFingers(controlHand);

            if (fingers1 >= 4 && fingers2 >= 4) {
                if (cooldownCounter === 0) {
                    drawCtx.clearRect(0, 0, drawCanvasElement.width, drawCanvasElement.height);
                    cooldownCounter = COOLDOWN_FRAMES * 2; // Extra cooldown for clear
                    return; // Skip other gestures if clearing
                }
            }
        }

        // ==========================================
        // CONTROL HAND LOGIC (LEFT HAND typically)
        // ==========================================
        if (controlHand && cooldownCounter === 0) {
            
            // 1. Change Colors (Based on finger count)
            // Index up = Color 1, +Middle = Color 2, etc. (1-5 range)
            const extended = countExtendedFingers(controlHand);
            if (extended > 0 && extended <= 5) {
                // We have 7 colors, let's map 1-5 to the first 5 colors
                switchToColorIndex(extended - 1);
                cooldownCounter = COOLDOWN_FRAMES;
            }

            // 2. Change Brush Size (Pinch distance)
            const pinchDist = calculateDistance(controlHand[4], controlHand[8]); // Thumb tip to Index tip
            // If thumb and index fingers are the only ones mainly involved
            if (extended <= 2 && pinchDist < 0.1) {
                // Distance is small -> Pinch recognized
                // Logic based on Y movement of the pinch (up increases, down decreases)
                // For simplicity as requested: "close this then point size increase or decrese"
                // Let's implement robust UI buttons as backup, and a simple toggle up/down
                
                // If pinch is high on screen (y < 0.5), increase. Low -> decrease
                if (controlHand[8].y < 0.4) {
                    changeBrushSize(currentBrushSize + 2);
                    cooldownCounter = COOLDOWN_FRAMES / 2;
                } else if (controlHand[8].y > 0.6) {
                    changeBrushSize(currentBrushSize - 2);
                    cooldownCounter = COOLDOWN_FRAMES / 2;
                }
            }
        }

        // ==========================================
        // DRAWING HAND LOGIC
        // ==========================================
        if (drawingHand) {
            const indexTip = drawingHand[8];
            const middleTip = drawingHand[12];
            
            // Map relative coordinates to canvas pixels
            const px = indexTip.x * drawCanvasElement.width;
            const py = indexTip.y * drawCanvasElement.height;

            // Gesture: Index + Thumb up, others down = DRAW
            // Simplified: Index Finger is extended, Middle finger is down
            if (indexTip.y < drawingHand[6].y && middleTip.y > drawingHand[10].y) {
                
                // Start drawing path if wasn't drawing
                if (!isDrawing) {
                    isDrawing = true;
                    lastX = px;
                    lastY = py;
                }

                // Draw Line
                drawCtx.globalCompositeOperation = isErasing ? 'destination-out' : 'source-over';
                drawCtx.lineWidth = isErasing ? currentBrushSize * 3 : currentBrushSize;

                drawCtx.beginPath();
                drawCtx.moveTo(lastX, lastY);
                drawCtx.lineTo(px, py);
                drawCtx.stroke();

                // Update last positions
                lastX = px;
                lastY = py;

                // Draw a small indicator circle on the video canvas to show the cursor
                canvasCtx.beginPath();
                canvasCtx.arc(px, py, currentBrushSize / 2, 0, 2 * Math.PI);
                canvasCtx.fillStyle = isErasing ? '#FFFFFF' : currentColor;
                canvasCtx.fill();

            } else {
                // Not drawing
                isDrawing = false;
            }

            // Gesture: Erase (All fingers open on drawing hand)
            const fingersDrawing = countExtendedFingers(drawingHand);
            if (fingersDrawing >= 4) {
                isErasing = true;
                btnEraser.textContent = "Eraser [ACTIVE]";
                btnEraser.style.backgroundColor = 'var(--danger)';
            } else {
                isErasing = false;
                btnEraser.textContent = "Eraser (Open Hand)";
                btnEraser.style.backgroundColor = 'var(--card-border)';
            }
        }

    } else {
        // No hands detected
        isDrawing = false;
    }
    canvasCtx.restore();
}

// ==========================================
// UI INTERACTION HOOKS (Mouse fallbacks)
// ==========================================

function switchToColorIndex(index) {
    if (index >= 0 && index < colorSwatches.length) {
        colorSwatches.forEach(c => c.classList.remove('active'));
        colorSwatches[index].classList.add('active');
        currentColor = colorSwatches[index].getAttribute('data-color');
        drawCtx.strokeStyle = currentColor;
        isErasing = false; // Reset eraser if picking color
    }
}

colorSwatches.forEach((swatch, index) => {
    swatch.addEventListener('click', () => {
        switchToColorIndex(index);
    });
});

function changeBrushSize(newSize) {
    if (newSize >= 2 && newSize <= 50) {
        currentBrushSize = newSize;
        brushSizeDisplay.textContent = currentBrushSize + 'px';
        drawCtx.lineWidth = currentBrushSize;
    }
}

btnDecrease.addEventListener('click', () => changeBrushSize(currentBrushSize - 2));
btnIncrease.addEventListener('click', () => changeBrushSize(currentBrushSize + 2));

btnEraser.addEventListener('click', () => {
    isErasing = !isErasing;
    if(isErasing) {
        btnEraser.style.backgroundColor = 'var(--danger)';
    } else {
        btnEraser.style.backgroundColor = 'var(--card-border)';
    }
});

btnClear.addEventListener('click', () => {
    drawCtx.clearRect(0, 0, drawCanvasElement.width, drawCanvasElement.height);
});

btnDownload.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'handmotion-art.png';
    link.href = drawCanvasElement.toDataURL();
    link.click();
});
