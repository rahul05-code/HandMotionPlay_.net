import React, { useEffect, useRef, useState } from "react";
import Card from "../../components/common/Card";
import Button from "../../components/common/Button";
import { ArrowLeft, Clock, Target, Trophy, Zap, RefreshCw, Loader2, Award } from "lucide-react";
import { Link } from "react-router-dom";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

const TARGET_TYPES = [
    { type: 'normal', color: '#3b82f6', points: 10, radius: 25, speedMult: 1 },
    { type: 'fast', color: '#f59e0b', points: 20, radius: 20, speedMult: 1.5 },
    { type: 'small', color: '#10b981', points: 30, radius: 15, speedMult: 1.2 },
    { type: 'special', color: '#a855f7', points: 50, radius: 20, speedMult: 1.8 }
];

const PINCH_THRESHOLD = 0.05;
const DEBOUNCE_TIME = 300; // ms between shots per hand

const TargetGame = () => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const cursorCanvasRef = useRef(null);
    const handLandmarkerRef = useRef(null);
    const requestRef = useRef(null);

    // UI state
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const [difficulty, setDifficulty] = useState(0); // 0: Easy, 1: Medium, 2: Hard
    const [score, setScore] = useState(0);
    const [hits, setHits] = useState(0);
    const [combo, setCombo] = useState(0);
    const [maxCombo, setMaxCombo] = useState(0);
    const [shots, setShots] = useState(0); // Total shots fired
    const [elapsedTime, setElapsedTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    // Game state tracking
    const targetsRef = useRef([]);
    const lastShootTimeRef = useRef([0, 0]); // Track last shot time for 2 hands separately
    const lastSpawnTimeRef = useRef(0);
    const lastTimeRef = useRef(-1);

    // For sync back to UI
    const scoreRef = useRef(0);
    const hitsRef = useRef(0);
    const comboRef = useRef(0);
    const maxComboRef = useRef(0);
    const shotsRef = useRef(0);

    // Hit fx
    const particlesRef = useRef([]);

    // Timer setup
    useEffect(() => {
        let interval;
        if (isPlaying) {
            interval = setInterval(() => {
                setElapsedTime(prev => prev + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isPlaying]);

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
                    numHands: 2 // Enable dual hands
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
                        setIsPlaying(true);
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
            setIsPlaying(false);
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            if (handLandmarkerRef.current) handLandmarkerRef.current.close();
            if (mediaStream) {
                mediaStream.getTracks().forEach(t => t.stop());
            } else if (videoRef.current && videoRef.current.srcObject) {
                videoRef.current.srcObject.getTracks().forEach(t => t.stop());
            }
        };
    }, []);

    // Function to create particle explosion
    const createExplosion = (x, y, color) => {
        for (let i = 0; i < 15; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 5 + 2;
            particlesRef.current.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: Math.random() * 4 + 2,
                color,
                life: 1.0,
                decay: Math.random() * 0.05 + 0.02
            });
        }
    };

    const predictWebcam = () => {
        if (!videoRef.current || !canvasRef.current || !cursorCanvasRef.current || !handLandmarkerRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current; // Foreground targets
        const cursorCanvas = cursorCanvasRef.current; // Background Video + Cursors

        const ctx = canvas.getContext("2d");
        const cursorCtx = cursorCanvas.getContext("2d");

        const container = canvas.parentElement;
        if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
            canvas.width = container.clientWidth; canvas.height = container.clientHeight;
            cursorCanvas.width = container.clientWidth; cursorCanvas.height = container.clientHeight;
        }

        let startTimeMs = performance.now();

        // Spawn Target Logic
        const diffConfig = [
            { spawnRate: 1500, maxTargets: 4, speedBase: 1 },    // Easy
            { spawnRate: 1000, maxTargets: 7, speedBase: 1.5 },  // Medium
            { spawnRate: 600, maxTargets: 12, speedBase: 2.2 }   // Hard
        ][difficulty];

        if (startTimeMs - lastSpawnTimeRef.current > diffConfig.spawnRate && targetsRef.current.length < diffConfig.maxTargets) {
            const tType = TARGET_TYPES[Math.floor(Math.random() * TARGET_TYPES.length)];
            const r = tType.radius;
            // Spawn inside canvas bounds
            const x = r + Math.random() * (canvas.width - 2 * r);
            const y = r + Math.random() * (canvas.height - 2 * r);

            const speed = diffConfig.speedBase * tType.speedMult * 3;
            const angle = Math.random() * Math.PI * 2;

            targetsRef.current.push({
                id: Math.random(),
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                ...tType
            });
            lastSpawnTimeRef.current = startTimeMs;
        }

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
        cursorCtx.globalAlpha = 0.25;
        cursorCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight,
            centerShift_x, centerShift_y, video.videoWidth * ratio, video.videoHeight * ratio);
        cursorCtx.restore();

        // Run ML Hand Detection
        if (lastTimeRef.current !== video.currentTime) {
            lastTimeRef.current = video.currentTime;
            let results = handLandmarkerRef.current.detectForVideo(video, startTimeMs);

            if (results.landmarks && results.landmarks.length > 0) {
                // Loop through all hands (up to 2)
                results.landmarks.forEach((landmarks, handIndex) => {
                    const indexTip = landmarks[8];
                    const thumbTip = landmarks[4];

                    // Map normalized coordinates to the cropped/scaled video frame drawn on canvas
                    const x = centerShift_x + (1 - indexTip.x) * video.videoWidth * ratio;
                    const y = centerShift_y + indexTip.y * video.videoHeight * ratio;

                    const dx = indexTip.x - thumbTip.x;
                    const dy = indexTip.y - thumbTip.y;
                    const dz = indexTip.z - thumbTip.z;
                    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

                    const isPinching = distance < PINCH_THRESHOLD;
                    const canShoot = (startTimeMs - lastShootTimeRef.current[handIndex]) > DEBOUNCE_TIME;

                    // Draw Crosshair
                    cursorCtx.beginPath();
                    cursorCtx.arc(x, y, 15, 0, 2 * Math.PI);
                    cursorCtx.fillStyle = 'transparent';
                    cursorCtx.lineWidth = 2;

                    // Check if aiming at any target
                    let isAimingAtTarget = false;
                    for (let i = 0; i < targetsRef.current.length; i++) {
                        const t = targetsRef.current[i];
                        const distToTarget = Math.sqrt((x - t.x) ** 2 + (y - t.y) ** 2);
                        if (distToTarget <= t.radius + 15) { // 15px forgiveness padding used in hit detection
                            isAimingAtTarget = true;
                            break;
                        }
                    }

                    // Colors: Red when aiming at target, else theme color (black in light mode, white in dark mode)
                    // We can use the CSS variable --text-main for the default color.
                    // MediaPipe canvas doesn't easily read CSS variables directly without getComputedStyle on every frame
                    // So we'll get it from a ref or just use a standard fallback approach. Actually let's fetch it from document.
                    const themeColor = getComputedStyle(document.body).getPropertyValue('--text-main').trim() || '#fff';
                    const hoverColor = 'var(--danger)'; // Red color

                    let crosshairColor = isAimingAtTarget ? hoverColor : themeColor;

                    if (isPinching) {
                        cursorCtx.strokeStyle = 'var(--success)';
                        cursorCtx.lineWidth = 4;
                        // Add central dot when pinching
                        cursorCtx.fill();
                        cursorCtx.beginPath();
                        cursorCtx.arc(x, y, 4, 0, 2 * Math.PI);
                        cursorCtx.fillStyle = 'var(--success)';
                        cursorCtx.fill();
                    } else {
                        cursorCtx.strokeStyle = crosshairColor;
                    }
                    cursorCtx.stroke();

                    // Cross sections
                    cursorCtx.beginPath();
                    cursorCtx.moveTo(x - 20, y); cursorCtx.lineTo(x + 20, y);
                    cursorCtx.moveTo(x, y - 20); cursorCtx.lineTo(x, y + 20);
                    cursorCtx.strokeStyle = isPinching ? 'var(--success)' : crosshairColor;
                    cursorCtx.stroke();

                    // Check Shooting
                    if (isPinching && canShoot) {
                        shotsRef.current += 1;
                        lastShootTimeRef.current[handIndex] = startTimeMs;
                        let hitSomething = false;

                        // Check collisions backward to hit topmost targets first
                        for (let i = targetsRef.current.length - 1; i >= 0; i--) {
                            const t = targetsRef.current[i];
                            const distToTarget = Math.sqrt((x - t.x) ** 2 + (y - t.y) ** 2);

                            if (distToTarget <= t.radius + 15) { // 15px forgiveness padding
                                hitSomething = true;
                                scoreRef.current += Math.floor(t.points * (1 + (comboRef.current * 0.1)));
                                hitsRef.current += 1;
                                comboRef.current += 1;
                                if (comboRef.current > maxComboRef.current) maxComboRef.current = comboRef.current;

                                createExplosion(t.x, t.y, t.color);
                                targetsRef.current.splice(i, 1);
                                break; // Only hit one target per shot
                            }
                        }

                        if (!hitSomething) {
                            comboRef.current = 0; // Miss breaks combo
                        }
                    }
                });
            }
        }

        // --- DRAW GAME LAYER (Canvas) ---
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Update and draw targets
        targetsRef.current.forEach(t => {
            // Move
            t.x += t.vx;
            t.y += t.vy;

            // Bounce
            if (t.x - t.radius < 0) { t.x = t.radius; t.vx *= -1; }
            if (t.x + t.radius > canvas.width) { t.x = canvas.width - t.radius; t.vx *= -1; }
            if (t.y - t.radius < 0) { t.y = t.radius; t.vy *= -1; }
            if (t.y + t.radius > canvas.height) { t.y = canvas.height - t.radius; t.vy *= -1; }

            // Draw Target
            ctx.beginPath();
            ctx.arc(t.x, t.y, t.radius, 0, 2 * Math.PI);
            ctx.fillStyle = t.color;
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#ffffffff';
            ctx.stroke();

            // Inner Target Rings
            ctx.beginPath();
            ctx.arc(t.x, t.y, t.radius * 0.6, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(t.x, t.y, t.radius * 0.2, 0, 2 * Math.PI);
            ctx.fillStyle = '#ff0000ff';
            ctx.fill();
        });

        // Update and draw particles
        for (let i = particlesRef.current.length - 1; i >= 0; i--) {
            let p = particlesRef.current[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= p.decay;

            if (p.life <= 0) {
                particlesRef.current.splice(i, 1);
            } else {
                ctx.globalAlpha = p.life;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, 2 * Math.PI);
                ctx.fillStyle = p.color;
                ctx.fill();
                ctx.globalAlpha = 1.0;
            }
        }

        // Sync react state approx every 10 frames
        if (Math.random() < 0.1) {
            setScore(scoreRef.current);
            setHits(hitsRef.current);
            setCombo(comboRef.current);
            setMaxCombo(maxComboRef.current);
            setShots(shotsRef.current);
        }

        requestRef.current = requestAnimationFrame(predictWebcam);
    };

    const handleReset = () => {
        targetsRef.current = [];
        particlesRef.current = [];
        scoreRef.current = 0;
        hitsRef.current = 0;
        comboRef.current = 0;
        shotsRef.current = 0;
        setScore(0);
        setHits(0);
        setCombo(0);
        setShots(0);
        setElapsedTime(0);
    };

    const accuracy = shots > 0 ? Math.round((hits / shots) * 100) : 0;

    return (
        <div className="page-container" style={{ padding: "2rem", maxWidth: "1400px" }}>

            {/* Header */}
            <Link to="/games" style={{ color: 'var(--text-muted)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', textDecoration: 'none' }}>
                <ArrowLeft size={16} /> Back to Games
            </Link>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 style={{ margin: 0 }}>Target Shooting</h1>
                <Button
                    text={isModelLoaded ? "Ready to Shoot" : "Loading Sensors..."}
                    variant="primary"
                    style={{
                        opacity: isModelLoaded ? 1 : 0.8,
                        cursor: isModelLoaded ? 'default' : 'not-allowed',
                        background: isModelLoaded ? 'var(--danger)' : 'var(--primary)',
                        boxShadow: isModelLoaded ? '0 0 10px var(--danger)' : 'none'
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
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Initializing AI Camera...</div>
                            </div>
                        )}

                        <video ref={videoRef} style={{ display: 'none' }} autoPlay playsInline></video>

                        <canvas ref={cursorCanvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1, background: 'var(--card-bg)' }} />
                        <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 2, pointerEvents: 'none' }} />

                        {combo > 5 && (
                            <div style={{ position: 'absolute', top: "20px", right: "20px", zIndex: 5, color: 'var(--accent)', fontSize: '2rem', fontWeight: 'bold', textShadow: '0 0 10px rgba(168, 85, 247, 0.8)' }}>
                                {combo}x COMBO!
                            </div>
                        )}
                    </div>

                    {/* How to Play */}
                    <div>
                        <h3 style={{ marginBottom: '1rem' }}>How to Play</h3>
                        <ul style={{ color: 'var(--text-muted)', paddingLeft: '1.2rem', lineHeight: '1.8' }}>
                            <li><b>Dual Hand Mode enabled!</b> Move both hands to control two crosshairs.</li>
                            <li>Point your index finger at moving targets.</li>
                            <li><b>Pinch</b> (touch thumb and index finger together) to shoot.</li>
                            <li>Hit multiple targets in a row without missing to build <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>Combo Score</span>.</li>
                        </ul>
                    </div>
                </div>

                {/* Right Column: Controls Sidebar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                    {/* High Score Box */}
                    <div style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid var(--danger)',
                        borderRadius: '16px',
                        padding: '2rem',
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <Trophy size={32} color="var(--danger)" style={{ marginBottom: '0.5rem', filter: 'drop-shadow(0 0 5px rgba(239, 68, 68, 0.5))' }} />
                        <h2 style={{ fontSize: '2.5rem', marginBottom: '0.2rem', color: 'var(--danger)' }}>{score}</h2>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Score</div>
                    </div>

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
                                <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.2rem' }}>{hits}</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Hits</div>
                            </div>
                            <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
                                <Zap size={16} color="var(--accent)" style={{ margin: '0 auto 0.5rem auto' }} />
                                <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.2rem' }}>{maxCombo}x</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Max Combo</div>
                            </div>
                            <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
                                <Award size={16} color="#f59e0b" style={{ margin: '0 auto 0.5rem auto' }} />
                                <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.2rem' }}>{accuracy}%</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Accuracy</div>
                            </div>
                        </div>
                    </Card>

                    {/* Difficulties */}
                    <Card>
                        <h4 style={{ marginBottom: '1rem', fontSize: '0.95rem' }}>Difficulty</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                            {[
                                { name: 'Easy', desc: 'Slower Targets, Easier To Hit' },
                                { name: 'Medium', desc: 'Balanced Challenge' },
                                { name: 'Hard', desc: 'Fast Targets, More Spawns' }
                            ].map((diff, idx) => {
                                const isActive = difficulty === idx;
                                return (
                                    <div key={idx}
                                        onClick={() => { setDifficulty(idx); handleReset(); }}
                                        style={{
                                            padding: '0.8rem 1.2rem', borderRadius: '12px', cursor: 'pointer',
                                            background: isActive ? 'var(--primary)' : 'var(--bg-primary)',
                                            border: isActive ? '1px solid rgba(0,136,255,0.5)' : '1px solid var(--border-color)',
                                            boxShadow: isActive ? '0 0 10px rgba(0,136,255,0.2)' : 'none',
                                            transition: 'all 0.2s'
                                        }}>
                                        <div style={{ fontWeight: '600', color: isActive ? 'white' : 'var(--text-main)', fontSize: '0.95rem', marginBottom: '0.2rem' }}>{diff.name}</div>
                                        <div style={{ color: isActive ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)', fontSize: '0.75rem' }}>{diff.desc}</div>
                                    </div>
                                )
                            })}
                        </div>
                    </Card>

                    {/* Sticky Actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: 'auto' }}>
                        <button
                            onClick={handleReset}
                            style={{
                                background: 'var(--bg-primary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '12px',
                                padding: '1rem', fontSize: '1rem', fontWeight: '600', cursor: 'pointer',
                                display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem'
                            }}>
                            <RefreshCw size={18} /> Reset Game
                        </button>
                    </div>

                </div>

            </div>
        </div>
    );
};

export default TargetGame;

