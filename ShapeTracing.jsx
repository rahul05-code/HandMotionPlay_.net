import React, { useEffect, useRef, useState, useMemo } from "react";
import Card from "../../components/common/Card";
import Button from "../../components/common/Button";
import { ArrowLeft, Clock, Target, Award, Hexagon, RefreshCw, ChevronRight, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { SHAPES } from "../../data/shapes";

// Constants
const PINCH_THRESHOLD = 0.05;
const ACCURACY_TOLERANCE = 25; // pixels distance from path to be considered "accurate"

const ShapeTracing = () => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const cursorCanvasRef = useRef(null);
    const handLandmarkerRef = useRef(null);
    const requestRef = useRef(null);

    // UI State
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const [currentShapeIndex, setCurrentShapeIndex] = useState(0);
    const [accuracy, setAccuracy] = useState(0);
    const [completed, setCompleted] = useState(0);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [isShapeComplete, setIsShapeComplete] = useState(false);

    // Hot Refs
    const isDrawingRef = useRef(false);
    const lastXRef = useRef(null);
    const lastYRef = useRef(null);
    const lastTimeRef = useRef(-1);
    const shapePath2DRef = useRef(null);

    // Coverage Tracking Refs
    const coverageCanvasRef = useRef(null);
    const totalShapePixelsRef = useRef(0);
    const lastCoverageCheckRef = useRef(0);
    const isShapeCompleteRef = useRef(false);

    const totalPointsRef = useRef(0);
    const correctPointsRef = useRef(0);
    const lastUiSyncRef = useRef(0);

    const currentShape = SHAPES[currentShapeIndex];

    // Timer setup
    useEffect(() => {
        if (!isModelLoaded) return;
        setElapsedTime(0);
        const interval = setInterval(() => {
            if (!isShapeCompleteRef.current) {
                setElapsedTime(prev => prev + 1);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [isModelLoaded, currentShapeIndex]); // reset on shape change

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    // Initialize MediaPipe
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
                    numHands: 1
                });

                if (!active) return;
                handLandmarkerRef.current = handLandmarker;

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
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            if (handLandmarkerRef.current) handLandmarkerRef.current.close();
            if (mediaStream) {
                mediaStream.getTracks().forEach(t => t.stop());
            } else if (videoRef.current && videoRef.current.srcObject) {
                videoRef.current.srcObject.getTracks().forEach(t => t.stop());
            }
        };
    }, []);

    // Draw the target shape outline once per shape change
    useEffect(() => {
        if (!cursorCanvasRef.current) return;
        const canvas = cursorCanvasRef.current;
        const container = canvas.parentElement;

        // Ensure size is synced first
        if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
        }

        const path = new Path2D();
        SHAPES[currentShapeIndex].draw(path, canvas.width, canvas.height);
        shapePath2DRef.current = path; // store for hit testing logic later if needed via canvas api

        // Setup Coverage Canvas (Invisible)
        if (!coverageCanvasRef.current) {
            coverageCanvasRef.current = document.createElement('canvas');
        }
        const oc = coverageCanvasRef.current;
        oc.width = canvas.width; oc.height = canvas.height;
        const octx = oc.getContext('2d', { willReadFrequently: true });
        octx.clearRect(0, 0, oc.width, oc.height);
        octx.lineWidth = ACCURACY_TOLERANCE;
        octx.strokeStyle = '#fff'; // color doesn't matter, just not transparent
        octx.stroke(path);

        const imgData = octx.getImageData(0, 0, oc.width, oc.height).data;
        let filledParams = 0;
        for (let i = 3; i < imgData.length; i += 4) {
            if (imgData[i] > 0) filledParams++;
        }
        totalShapePixelsRef.current = filledParams;

        // Reset tracking stats
        totalPointsRef.current = 0;
        correctPointsRef.current = 0;
        setAccuracy(0);
        setIsShapeComplete(false);
        isShapeCompleteRef.current = false;

        // Clear drawing canvas overlay
        if (canvasRef.current) {
            const drwCtx = canvasRef.current.getContext('2d');
            drwCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }

    }, [currentShapeIndex, isModelLoaded]); // re-run when shape changes or canvas is ready

    const predictWebcam = () => {
        if (!videoRef.current || !canvasRef.current || !handLandmarkerRef.current || !cursorCanvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current; // Foreground Drawing
        const cursorCanvas = cursorCanvasRef.current; // Background Video + Cursor + Shape Outline
        const ctx = canvas.getContext("2d");
        const cursorCtx = cursorCanvas.getContext("2d");

        const container = canvas.parentElement;
        if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
            canvas.width = container.clientWidth; canvas.height = container.clientHeight;
            cursorCanvas.width = container.clientWidth; cursorCanvas.height = container.clientHeight;
            ctx.lineCap = "round"; ctx.lineJoin = "round";
        }

        let startTimeMs = performance.now();

        // Setup Base Layer (Mirrored Video)
        cursorCtx.save();
        cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
        cursorCtx.translate(cursorCanvas.width, 0);
        cursorCtx.scale(-1, 1);
        const vRatio = cursorCanvas.width / video.videoWidth;
        const hRatio = cursorCanvas.height / video.videoHeight;
        const ratio = Math.max(vRatio, hRatio);
        const centerShift_x = (cursorCanvas.width - video.videoWidth * ratio) / 2;
        const centerShift_y = (cursorCanvas.height - video.videoHeight * ratio) / 2;
        cursorCtx.globalAlpha = 0.2; // Dim video heavily
        cursorCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight,
            centerShift_x, centerShift_y, video.videoWidth * ratio, video.videoHeight * ratio);
        cursorCtx.restore();

        // Setup Shape Outline Layer
        cursorCtx.save();
        cursorCtx.setLineDash([15, 15]);
        cursorCtx.lineWidth = 6;
        cursorCtx.strokeStyle = "rgba(168, 85, 247, 0.5)"; // var(--accent) with opacity
        // A pulsing effect on the stroke thickness
        const pulse = 6 + Math.sin(startTimeMs / 200) * 2;
        cursorCtx.lineWidth = pulse;
        if (shapePath2DRef.current) {
            cursorCtx.stroke(shapePath2DRef.current);
        }
        cursorCtx.restore();

        // Run ML
        if (lastTimeRef.current !== video.currentTime) {
            lastTimeRef.current = video.currentTime;
            let results = handLandmarkerRef.current.detectForVideo(video, startTimeMs);

            if (results.landmarks && results.landmarks.length > 0) {
                const primary = results.landmarks[0];
                const indexTip = primary[8];
                const thumbTip = primary[4];

                const x = (1 - indexTip.x) * canvas.width;
                const y = indexTip.y * canvas.height;

                const dx = indexTip.x - thumbTip.x;
                const dy = indexTip.y - thumbTip.y;
                const dz = indexTip.z - thumbTip.z;
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                const isPinching = distance < PINCH_THRESHOLD;

                const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
                const primaryColor = isDark ? '#00C2FF' : '#00C2FF';
                const successColor = isDark ? '#ffffffff' : '#ffffffff';
                const dangerColor = isDark ? '#ff3b3b' : '#dc2626';

                // Draw Cursor
                cursorCtx.beginPath();
                cursorCtx.arc(x, y, 12, 0, 2 * Math.PI);
                cursorCtx.fillStyle = isPinching ? 'transparent' : primaryColor;
                cursorCtx.fill();
                cursorCtx.lineWidth = 3;
                cursorCtx.strokeStyle = isPinching ? successColor : (isDark ? '#ffffff' : primaryColor);
                cursorCtx.stroke();

                if (isPinching) {
                    if (!isDrawingRef.current) {
                        isDrawingRef.current = true;
                        lastXRef.current = x; lastYRef.current = y;
                    } else {
                        // Core Drawing
                        ctx.beginPath();
                        ctx.moveTo(lastXRef.current, lastYRef.current);
                        ctx.lineTo(x, y);

                        // "Is Point On Path" Accuracy check using isPointInStroke
                        let isAccurate = false;
                        if (shapePath2DRef.current) {
                            cursorCtx.save();
                            cursorCtx.lineWidth = ACCURACY_TOLERANCE * 2;
                            isAccurate = cursorCtx.isPointInStroke(shapePath2DRef.current, x, y);
                            cursorCtx.restore();
                        }

                        if (!isShapeCompleteRef.current) {
                            ctx.strokeStyle = isAccurate ? primaryColor : dangerColor;
                            ctx.lineWidth = 14;
                            ctx.stroke();

                            // Erase coverage pixels behind the scenes if accurate
                            if (isAccurate && coverageCanvasRef.current) {
                                const octx = coverageCanvasRef.current.getContext('2d');
                                octx.globalCompositeOperation = 'destination-out';
                                octx.beginPath();
                                octx.arc(x, y, 15, 0, 2 * Math.PI);
                                octx.fill();
                            }

                            // Accumulate scores
                            totalPointsRef.current += 1;
                            if (isAccurate) correctPointsRef.current += 1;

                            const now = Date.now();
                            if (now - lastUiSyncRef.current > 500) {
                                const newAcc = Math.round((correctPointsRef.current / totalPointsRef.current) * 100);
                                setAccuracy(newAcc);
                                lastUiSyncRef.current = now;

                                // Check Coverage %
                                if (now - lastCoverageCheckRef.current > 1000) { // check coverage every 1s
                                    const imgData = coverageCanvasRef.current.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
                                    let remaining = 0;
                                    for (let i = 3; i < imgData.length; i += 4) {
                                        if (imgData[i] > 0) remaining++;
                                    }
                                    const coverage = (totalShapePixelsRef.current - remaining) / totalShapePixelsRef.current;
                                    if (coverage > 0.95 && newAcc > 70) {
                                        setIsShapeComplete(true);
                                        isShapeCompleteRef.current = true;
                                        setCompleted(c => c + 1);
                                    }
                                    lastCoverageCheckRef.current = now;
                                }
                            }
                        }

                        lastXRef.current = x; lastYRef.current = y;
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

    const handleReset = () => {
        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
        totalPointsRef.current = 0;
        correctPointsRef.current = 0;
        setAccuracy(0);
        setElapsedTime(0);
        setIsShapeComplete(false);
        isShapeCompleteRef.current = false;

        // Re-draw coverage canvas
        if (coverageCanvasRef.current && shapePath2DRef.current) {
            const octx = coverageCanvasRef.current.getContext('2d');
            octx.globalCompositeOperation = 'source-over';
            octx.clearRect(0, 0, coverageCanvasRef.current.width, coverageCanvasRef.current.height);
            octx.lineWidth = ACCURACY_TOLERANCE;
            octx.strokeStyle = '#fff';
            octx.stroke(shapePath2DRef.current);
            const imgData = octx.getImageData(0, 0, coverageCanvasRef.current.width, coverageCanvasRef.current.height).data;
            let filledParams = 0;
            for (let i = 3; i < imgData.length; i += 4) { if (imgData[i] > 0) filledParams++; }
            totalShapePixelsRef.current = filledParams;
        }
    };

    const handleNextShape = () => {
        setIsShapeComplete(false);
        isShapeCompleteRef.current = false;
        setCurrentShapeIndex((prev) => (prev + 1) % SHAPES.length);
    };
    return (
        <div className="page-container" style={{ padding: "2rem", maxWidth: "1400px" }}>

            {/* Header */}
            <Link to="/games" style={{ color: 'var(--text-muted)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', textDecoration: 'none' }}>
                <ArrowLeft size={16} /> Back to Games
            </Link>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 style={{ margin: 0 }}>Shape Tracing</h1>
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
                    {/* Camera Area with Mock Trace Path */}
                    <div style={{
                        width: "100%",
                        height: "550px",
                        background: "var(--card-bg)",
                        borderRadius: "16px",
                        border: "1px solid var(--border-color)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative",
                        overflow: "hidden"
                    }}>
                        {!isModelLoaded && (
                            <div style={{ position: 'absolute', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                <Loader2 size={40} style={{ animation: 'spin 2s linear infinite', marginBottom: '1rem', color: 'var(--primary)' }} />
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Initializing AI Model and Camera...</div>
                            </div>
                        )}

                        <video ref={videoRef} style={{ display: 'none' }} autoPlay playsInline></video>

                        <canvas ref={cursorCanvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1, background: 'var(--card-bg)' }} />
                        <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 2, pointerEvents: 'none' }} />

                        {isShapeComplete && (
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.85)', zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', backdropFilter: 'blur(4px)' }}>
                                <Award size={64} color="var(--success)" style={{ marginBottom: '1rem' }} />
                                <h2 style={{ fontSize: '2.5rem', marginBottom: '0.5rem', color: '#fff' }}>Perfect!</h2>
                                <p style={{ fontSize: '1.2rem', color: '#ccc', marginBottom: '2rem' }}>You traced the {currentShape.name} successfully.</p>

                                <div style={{ display: 'flex', gap: '2rem', marginBottom: '2.5rem' }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--success)' }}>{accuracy}%</div>
                                        <div style={{ fontSize: '0.9rem', color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px' }}>Accuracy</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary)' }}>{formatTime(elapsedTime)}</div>
                                        <div style={{ fontSize: '0.9rem', color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px' }}>Time</div>
                                    </div>
                                </div>

                                <button
                                    onClick={handleNextShape}
                                    style={{ background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '50px', padding: '1rem 3rem', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 15px rgba(0, 136, 255, 0.4)' }}>
                                    Next Shape <ChevronRight size={20} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '0.5rem' }} />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* How to Play */}
                    <div>
                        <h3 style={{ marginBottom: '1rem' }}>How to Play</h3>
                        <ul style={{ color: 'var(--text-muted)', paddingLeft: '1.2rem', lineHeight: '1.8' }}>
                            <li>Point your index finger and <b>Pinch</b> to start tracing the shape</li>
                            <li>Keep your finger close to the dashed outline for higher accuracy</li>
                            <li>The line turns <span style={{ color: 'var(--danger)' }}>red</span> if you stray too far!</li>
                            <li>Release your pinch when you complete the shape</li>
                        </ul>
                    </div>
                </div>

                {/* Right Column: Controls Sidebar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                    {/* Current Shape */}
                    <Card>
                        <h4 style={{ marginBottom: '1rem', fontSize: '0.95rem' }}>Current Shape</h4>
                        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                            <h2 style={{ marginBottom: '0.5rem' }}>{currentShape.name}</h2>
                            <span style={{
                                background: `${currentShape.color}20`, color: currentShape.color,
                                padding: '0.2rem 0.8rem', borderRadius: '50px', fontSize: '0.75rem', fontWeight: 'bold'
                            }}>{currentShape.diff}</span>
                        </div>
                    </Card>

                    {/* Session Stats */}
                    <Card>
                        <h4 style={{ marginBottom: '1.5rem', fontSize: '0.95rem' }}>Session Stats</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
                                <Clock size={16} color="var(--primary)" style={{ margin: '0 auto 0.5rem auto' }} />
                                <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.2rem' }}>{formatTime(elapsedTime)}</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Duration</div>
                            </div>
                            <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
                                <Target size={16} color="var(--success)" style={{ margin: '0 auto 0.5rem auto' }} />
                                <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.2rem' }}>{accuracy}%</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Accuracy</div>
                            </div>
                            <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
                                <Award size={16} color="var(--accent)" style={{ margin: '0 auto 0.5rem auto' }} />
                                <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.2rem' }}>{completed}</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Completed</div>
                            </div>
                            <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
                                <Hexagon size={16} color="#f59e0b" style={{ margin: '0 auto 0.5rem auto' }} />
                                <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.2rem' }}>{SHAPES.length}</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Total Shapes</div>
                            </div>
                        </div>
                    </Card>

                    {/* All Shapes List */}
                    <Card>
                        <h4 style={{ marginBottom: '1rem', fontSize: '0.95rem' }}>All Shapes</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', flex: 1, overflowY: 'auto', maxHeight: '400px', paddingRight: '0.5rem' }}>
                            {SHAPES.map((shape, idx) => {
                                const isActive = currentShapeIndex === idx;
                                return (
                                    <div key={idx}
                                        onClick={() => setCurrentShapeIndex(idx)}
                                        style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '0.8rem 1.2rem', borderRadius: '50px', cursor: 'pointer',
                                            background: isActive ? 'var(--primary)' : 'var(--bg-primary)',
                                            border: '1px solid var(--border-color)',
                                            transition: 'all 0.2s',
                                            opacity: isDrawingRef.current ? 0.5 : 1 // dim slightly when tracing to discourage clicking
                                        }}>
                                        <span style={{ fontWeight: '600', color: isActive ? '#fff' : 'var(--text-main)', fontSize: '0.95rem' }}>{idx + 1}. {shape.name}</span>
                                        <span style={{ color: isActive ? '#fff' : shape.color, background: isActive ? 'rgba(255,255,255,0.2)' : `${shape.color}15`, padding: '0.2rem 0.6rem', borderRadius: '50px', fontSize: '0.7rem', fontWeight: 'bold' }}>{shape.diff}</span>
                                    </div>
                                )
                            })}
                        </div>
                    </Card>

                    {/* Sticky Actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: 'auto' }}>
                        {/* Sticky Actions */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: 'auto' }}>
                            <button
                                onClick={handleReset}
                                style={{
                                    background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '50px',
                                    padding: '1rem', fontSize: '1rem', fontWeight: '600', cursor: 'pointer',
                                    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem',
                                    transition: 'all 0.2s'
                                }}>
                                <RefreshCw size={18} /> Reset Shape
                            </button>
                            <button
                                onClick={handleNextShape}
                                style={{
                                    background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '50px',
                                    padding: '1rem', fontSize: '1rem', fontWeight: '600', cursor: 'pointer',
                                    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem',
                                    transition: 'all 0.2s'
                                }}>
                                Next Shape <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>

                </div>

            </div>
        </div>
    );
};

export default ShapeTracing;
