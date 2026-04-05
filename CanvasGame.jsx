import React, { useEffect, useRef, useState } from "react";
import Card from "../../components/common/Card";
import Button from "../../components/common/Button";
import { ArrowLeft, Clock, Award, Minus, Plus, Eraser, Trash2, Download, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

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
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
};


const CanvasGame = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cursorCanvasRef = useRef(null); // Overlaid canvas for the cursor/brush preview
  const handLandmarkerRef = useRef(null);
  const requestRef = useRef(null);
  
  // Drawing State UI
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [currentColor, setCurrentColor] = useState('#3b82f6');
  const [brushSize, setBrushSize] = useState(8);
  const [isErasing, setIsErasing] = useState(false);
  
  // Game Stats
  const [startTime, setStartTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);
  const [strokes, setStrokes] = useState(0);
  
  // Internal HOT Refs (prevents 60fps re-renders)
  const isDrawingRef = useRef(false);
  const lastXRef = useRef(null);
  const lastYRef = useRef(null);
  const lastTimeRef = useRef(-1);
  const lastClearCallRef = useRef(0);
  const lastUiSyncTimeRef = useRef(0);
  
  // State refs reflecting UI equivalents
  const currentColorRef = useRef('#3b82f6');
  const brushSizeRef = useRef(8);
  const isErasingRef = useRef(false);
  
  // Gesture Debounce Refs
  const fingerCountStableRef = useRef(0);
  const fingerCountValueRef = useRef(-1);

  // Compute duration display
  useEffect(() => {
    let interval;
    if (isModelLoaded) {
      setStartTime(Date.now()); // reset on load
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isModelLoaded]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Initialize MediaPipe and Camera
  useEffect(() => {
    let active = true;
    let mediaStream = null;

    const initializeMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks("/wasm");
        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `/wasm/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2 // Allow two hands for advanced gestures
        });

        if (!active) return;
        handLandmarkerRef.current = handLandmarker;

        // Setup WebCam
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 1280, height: 720, facingMode: "user" } 
        });
        
        if (!active) {
             mediaStream.getTracks().forEach(t => t.stop());
             return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.addEventListener("loadeddata", () => {
            setIsModelLoaded(true);
            predictWebcam();
          });
        }
      } catch (err) {
        console.error("Error initializing MediaPipe:", err);
      }
    };

    initializeMediaPipe();

    return () => {
      active = false;
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      if (handLandmarkerRef.current) {
        handLandmarkerRef.current.close();
      }
      if (mediaStream) {
          mediaStream.getTracks().forEach(t => t.stop());
      } else if (videoRef.current && videoRef.current.srcObject) {
          videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      }
    };
  }, []); // Run once on mount

  const predictWebcam = () => {
    if (!videoRef.current || !canvasRef.current || !handLandmarkerRef.current || !cursorCanvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    
    const cursorCanvas = cursorCanvasRef.current;
    const cursorCtx = cursorCanvas.getContext("2d");

    // Match canvas internal size to its CSS display size
    const container = canvas.parentElement;
    if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      cursorCanvas.width = container.clientWidth;
      cursorCanvas.height = container.clientHeight;
      // Setup default ctx properties for drawing canvas
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }

    let startTimeMs = performance.now();
    
    // Draw underlying video feed mirrored
    cursorCtx.save();
    cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
    cursorCtx.translate(cursorCanvas.width, 0);
    cursorCtx.scale(-1, 1);
    // Fill the area without distorting aspect ratio (object-fit: cover equivalent)
    const vRatio = cursorCanvas.width / video.videoWidth;
    const hRatio = cursorCanvas.height / video.videoHeight;
    const ratio  = Math.max(vRatio, hRatio);
    const centerShift_x = (cursorCanvas.width - video.videoWidth*ratio) / 2;
    const centerShift_y = (cursorCanvas.height - video.videoHeight*ratio) / 2;  
    
    cursorCtx.globalAlpha = 0.3; // Make background semi-transparent
    cursorCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight,
                       centerShift_x, centerShift_y, video.videoWidth*ratio, video.videoHeight*ratio);
    cursorCtx.globalAlpha = 1.0;
    cursorCtx.restore();


    if (lastTimeRef.current !== video.currentTime) {
      lastTimeRef.current = video.currentTime;
      let results = handLandmarkerRef.current.detectForVideo(video, startTimeMs);

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

        // --- SECONDARY HAND LOGIC ---
        if (results.landmarks.length > 1) {
          const secondary = results.landmarks[1];
          const p2 = getPinchDistance(secondary);
          const f2 = getExtendedFingers(secondary);
          const o2 = f2 >= 4;

          // Rule 3: Two hands open -> Clear Canvas
          if (isOpen && o2) {
            const now = Date.now();
            if (now - lastClearCallRef.current > 1500) { // 1.5s cooldown
              clearCanvas();
              lastClearCallRef.current = now;
            }
          } 
          // Rule 5: Primary Open + Secondary Pinching -> Adjust Brush Size
          else if (isOpen && p2 < 0.2 && f2 < 4) { // Open hand erasing is suppressed while sliding size
            isModifyingSize = true;
            let size = Math.max(2, Math.min(40, p2 * 300));
            const roundedSize = Math.round(size);
            if (Math.abs(roundedSize - brushSizeRef.current) >= 1) { 
               brushSizeRef.current = roundedSize;
               const now = Date.now();
               // Throttle React state updates to ~10fps
               if (now - lastUiSyncTimeRef.current > 100) {
                   setBrushSize(roundedSize);
                   lastUiSyncTimeRef.current = now;
               }
            }
          }
          // Rule 4: Primary Pinching + Secondary Fingers -> Change Color
          else if (isPinching) { 
            const UI_COLORS = ['#ffffff', 'var(--primary)', 'var(--danger)', 'var(--success)', '#f59e0b']; // White, Blue, Red, Green, Orange
            if (f2 >= 1 && f2 <= 5) {
              if (f2 === fingerCountValueRef.current) {
                fingerCountStableRef.current += 1;
                // Require gesture to hold stable for ~10 frames to avoid flickering
                if (fingerCountStableRef.current > 10) {
                  const idx = Math.min(f2 - 1, 4); // Ensure index is within bounds
                  const newUiColor = UI_COLORS[idx];
                  
                  // Compute actual hex/rgb for the canvas
                  const actualColor = newUiColor.startsWith('var(') 
                    ? getComputedStyle(document.documentElement).getPropertyValue(newUiColor.slice(4, -1)).trim()
                    : newUiColor;

                  if (currentColorRef.current !== actualColor) {
                    currentColorRef.current = actualColor;
                    
                    const now = Date.now();
                    if (now - lastUiSyncTimeRef.current > 100) {
                      setUiColorState(newUiColor);
                      lastUiSyncTimeRef.current = now;
                    }
                  }
                }
              } else {
                fingerCountValueRef.current = f2;
                fingerCountStableRef.current = 0;
              }
            }
          }
        }

        // --- PRIMARY HAND DRAWING LOGIC ---
        if (isPinching) {
          // Rule 1: Index + Thumb pinch -> DRAW COLOR
          drawnThisFrame = true;
          if (isErasingRef.current) {
            isErasingRef.current = false;
            setIsErasing(false);
          }
        } 
        else if (isOpen && !isModifyingSize) {
          // Rule 2: Open "Hold" Hand -> ERASE
          drawnThisFrame = true;
          if (!isErasingRef.current) {
            isErasingRef.current = true;
            setIsErasing(true);
          }
        }
      }

      // Render the virtual brush cursor
      if (isCursorActive) {
        cursorCtx.beginPath();
        cursorCtx.arc(currentX, currentY, brushSizeRef.current / 2 + 4, 0, 2 * Math.PI);
        cursorCtx.fillStyle = drawnThisFrame ? (isErasingRef.current ? '#ffffff' : currentColorRef.current) : 'transparent';
        cursorCtx.fill();
        cursorCtx.lineWidth = 2;
        cursorCtx.strokeStyle = drawnThisFrame ? (isErasingRef.current ? '#ff0000' : '#ffffff') : '#ffffff';
        cursorCtx.stroke();

        if (drawnThisFrame) {
          if (!isDrawingRef.current) {
            isDrawingRef.current = true;
            lastXRef.current = currentX;
            lastYRef.current = currentY;
            setStrokes(s => s + 1);
          } else {
            ctx.beginPath();
            ctx.moveTo(lastXRef.current, lastYRef.current);
            ctx.lineTo(currentX, currentY);
            let strokeColor = isErasingRef.current ? "var(--card-bg)" : currentColorRef.current;
            if (strokeColor.startsWith('var(')) {
               strokeColor = getComputedStyle(document.documentElement).getPropertyValue(strokeColor.slice(4, -1)).trim();
            }
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = brushSizeRef.current;
            ctx.globalCompositeOperation = isErasingRef.current ? "destination-out" : "source-over";
            ctx.stroke();

            // Store current point for next frame
            lastXRef.current = currentX;
            lastYRef.current = currentY;
          }
        } else {
           isDrawingRef.current = false;
        }
      } else {
         isDrawingRef.current = false;
      }
    }

    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  const setUiColorState = (c) => {
    setCurrentColor(c);
    setIsErasing(false);
  };

  const clearCanvas = () => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      setStrokes(0);
    }
  };

  const downloadCanvas = () => {
    if (canvasRef.current) {
      const link = document.createElement('a');
      link.download = `handmotion-play-drawing-${Date.now()}.png`;
      
      // Create a temporary canvas to merge background color so it's not transparent in the OS image viewer
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvasRef.current.width;
      tempCanvas.height = canvasRef.current.height;
      const tCtx = tempCanvas.getContext('2d');
      tCtx.fillStyle = '#0a0e17'; // roughly var(--bg-main)
      tCtx.fillRect(0,0, tempCanvas.width, tempCanvas.height);
      tCtx.drawImage(canvasRef.current, 0, 0);
      
      link.href = tempCanvas.toDataURL('image/png');
      link.click();
    }
  };
  return (
    <>
      <div className="page-container" style={{ padding: "2rem", maxWidth: "1400px" }}>

        {/* Header */}
        <Link to="/games" style={{ color: 'var(--text-muted)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', textDecoration: 'none' }}>
          <ArrowLeft size={16} /> Back to Games
        </Link>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h1 style={{ margin: 0 }}>Canvas Drawing</h1>
          <Button 
            text={isModelLoaded ? "AI Active" : "Loading Model..."} 
            variant="primary" 
            style={{ 
              opacity: isModelLoaded ? 1 : 0.8, 
              cursor: isModelLoaded ? 'default' : 'not-allowed',
              background: isModelLoaded ? 'var(--success)' : 'var(--primary)',
              boxShadow: isModelLoaded ? '0 0 10px var(--success)' : 'none'
            }} 
          />
        </div>

        {/* Layout Grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "3fr 1fr",
          gap: "2rem"
        }}>

          {/* Left Column: Camera + Instructions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Camera Area */}
            <div style={{
              width: "100%",
              height: "550px", // Increased height for better drawing area
              background: "var(--card-bg)",
              borderRadius: "16px",
              border: "1px solid var(--border-color)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--primary)",
              position: "relative",
              overflow: "hidden" // Clip the canvases to rounded corners
            }}>
              {!isModelLoaded && (
                <div style={{ position: 'absolute', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <Loader2 size={40} style={{ animation: 'spin 2s linear infinite', marginBottom: '1rem' }} />
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Initializing AI Model and Camera...</div>
                </div>
              )}
              
              {/* Hidden Video element for MediaPipe feed */}
              <video 
                ref={videoRef} 
                style={{ display: 'none' }} 
                autoPlay 
                playsInline 
              ></video>

              {/* Top Layer Canvas (Background video + Brush Cursor) */}
              <canvas 
                ref={cursorCanvasRef} 
                style={{ 
                  position: 'absolute', 
                  top: 0, 
                  left: 0, 
                  width: '100%', 
                  height: '100%', 
                  zIndex: 1, 
                  background: 'var(--card-bg)' // Solid fallback
                }} 
              />
              
              {/* Drawing Layer Canvas (The actual artwork) */}
              <canvas 
                ref={canvasRef} 
                style={{ 
                  position: 'absolute', 
                  top: 0, 
                  left: 0, 
                  width: '100%', 
                  height: '100%', 
                  zIndex: 2, 
                  pointerEvents: 'none' 
                }} 
              />
            </div>

            {/* How to Play */}
            <div>
              <h3 style={{ marginBottom: '1rem' }}>How to Play</h3>
              <ul style={{ color: 'var(--text-muted)', paddingLeft: '1.2rem', lineHeight: '1.8' }}>
                <li><b>Draw:</b> Pinch (Index + Thumb) on main hand</li>
                <li><b>Erase:</b> Hold main hand fully open</li>
                <li><b>Clear:</b> Hold both hands fully open</li>
                <li><b>Colors:</b> While drawing, show 1-5 fingers on other hand</li>
                <li><b>Brush Size:</b> While erasing, pinch with other hand to adjust</li>
              </ul>
            </div>
          </div>

          {/* Right Column: Controls Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Session Stats */}
            <Card>
              <h4 style={{ marginBottom: '1.5rem', fontSize: '0.95rem' }}>Session Stats</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
                  <Clock size={18} color="var(--primary)" style={{ margin: '0 auto 0.5rem auto' }} />
                  <div style={{ fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '0.2rem' }}>{formatTime(elapsedTime)}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Duration</div>
                </div>
                <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
                  <Award size={18} color="var(--accent)" style={{ margin: '0 auto 0.5rem auto' }} />
                  <div style={{ fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '0.2rem' }}>{strokes}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Strokes</div>
                </div>
              </div>
            </Card>

            {/* Colors */}
            <Card>
              <h4 style={{ marginBottom: '1.5rem', fontSize: '0.95rem' }}>Colors</h4>
              <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
                {['#ffffff', 'var(--primary)', 'var(--danger)', 'var(--success)', '#f59e0b'].map((c, i) => (
                  <div 
                    key={i} 
                    onClick={() => { 
                      setUiColorState(c); 
                      const actualColor = c.startsWith('var(') 
                         ? getComputedStyle(document.documentElement).getPropertyValue(c.slice(4, -1)).trim()
                         : c;
                      currentColorRef.current = actualColor; 
                      isErasingRef.current = false; 
                    }}
                    style={{
                      width: '36px', height: '36px', borderRadius: '50%', background: c,
                      cursor: 'pointer', 
                      border: (!isErasing && currentColor === c) ? '3px solid var(--text-main)' : '2px solid transparent',
                      boxShadow: (!isErasing && currentColor === c) ? `0 0 10px ${c}` : 'none',
                      transition: 'all 0.2s ease'
                    }}>
                  </div>
                ))}
              </div>
            </Card>

            {/* Brush Size */}
            <Card>
              <h4 style={{ marginBottom: '1.5rem', fontSize: '0.95rem' }}>Brush Size</h4>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-primary)', padding: '0.8rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <button 
                  onClick={() => {
                    const newSize = Math.max(2, brushSize - 2);
                    setBrushSize(newSize);
                    brushSizeRef.current = newSize;
                  }}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: '0.5rem' }}>
                  <Minus size={16} />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)' }}>
                  <div style={{ width: `${brushSize}px`, height: `${brushSize}px`, minWidth: '4px', minHeight: '4px', background: isErasing ? '#fff' : currentColor, borderRadius: '50%' }}></div>
                  {brushSize}px
                </div>
                <button 
                  onClick={() => {
                    const newSize = Math.min(40, brushSize + 2);
                    setBrushSize(newSize);
                    brushSizeRef.current = newSize;
                  }}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: '0.5rem' }}>
                  <Plus size={16} />
                </button>
              </div>
            </Card>

            {/* Tools */}
            <Card>
              <h4 style={{ marginBottom: '1.5rem', fontSize: '0.95rem' }}>Tools</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <button 
                  onClick={() => {
                    const newVal = !isErasing;
                    setIsErasing(newVal);
                    isErasingRef.current = newVal;
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', width: '100%', padding: '0.8rem', background: isErasing ? 'var(--primary)' : 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '12px', color: isErasing ? '#fff' : 'var(--text-main)', cursor: 'pointer', fontWeight: '500', transition: 'all 0.2s' }}>
                  <Eraser size={18} /> Eraser
                </button>
                <button 
                  onClick={clearCanvas}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', width: '100%', padding: '0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '12px', color: 'var(--danger)', cursor: 'pointer', fontWeight: '500', transition: 'all 0.2s' }}>
                  <Trash2 size={18} /> Clear Canvas
                </button>
                <button 
                  onClick={downloadCanvas}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', width: '100%', padding: '0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '12px', color: 'var(--text-main)', cursor: 'pointer', fontWeight: '500', transition: 'all 0.2s' }}>
                  <Download size={18} /> Download Art
                </button>
              </div>
            </Card>

          </div>

        </div>

      </div>
    </>
  );
};

export default CanvasGame;