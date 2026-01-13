"use client";
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Play, RotateCcw, Zap, Shield, Trophy, Trash2 } from 'lucide-react';
import { saveGameScore, getLeaderboard, resetLeaderboard } from '@/lib/firebase/firestore';
import { soundManager } from '@/lib/game/SoundManager';

// Game Constants
const FPS = 60;
const GAME_DURATION = 60; // Production: 60 seconds

// Assets (Emojis)
const PLAYER_ICON = '🚀';
const BAD_ENEMIES = ['🍔', '🍟', '🍕', '🍩', '🥤'];
const ELITE_ENEMIES = ['🥩', '🍰', '🍺']; // Stronger bad food
const GOOD_ENEMIES = ['🥦', '🥕', '🍎', '🥑', '🍇'];

const POWERUPS = {
    SPREAD: { icon: '⚡', color: '#FBBF24', duration: 300 },
    SPEED: { icon: '⏩', color: '#3B82F6', duration: 300 },
    SHIELD: { icon: '🛡️', color: '#10B981', duration: 300 }
};

export default function DietShooter({ meals = [], user, userProfile, onClose }) {
    const canvasRef = useRef(null);
    // Touch Logic Ref
    const touchRef = useRef({
        startX: 0,
        startY: 0,
        playerStartX: 0,
        playerStartY: 0,
        active: false
    });
    const [gameState, setGameState] = useState('menu');
    const [score, setScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
    const [stats, setStats] = useState({ greenRatio: 0, redRatio: 0, total: 0 });
    const [leaderboard, setLeaderboard] = useState([]);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);
    const [countdown, setCountdown] = useState(null); // 3, 2, 1
    const [shake, setShake] = useState(false); // For damage effect
    const [victory, setVictory] = useState(false); // Victory state

    // Load Leaderboard on Mount
    useEffect(() => {
        const fetchLeaderboard = async () => {
            setIsLoadingLeaderboard(true);
            const scores = await getLeaderboard();
            setLeaderboard(scores);
            setIsLoadingLeaderboard(false);
        };
        fetchLeaderboard();
    }, []);

    const gameRef = useRef({
        player: { x: 0, y: 0, width: 40, height: 40, hp: 3, powerup: null, powerupTimer: 0 },
        bullets: [],
        enemyBullets: [],
        enemies: [],
        particles: [],
        pickups: [],
        stars: [],
        keys: {},
        lastFired: 0,
        lastEnemySpawn: 0,
        score: 0,
        difficulty: 1,
        multiplier: 1,
        running: false,
        lastTime: 0, // For Delta Time
        fever: 0,    // 0-100
        isFever: false,
        feverTimer: 0,
        victoryPhase: 0, // 0=none, 1=bomb_flying, 2=explosion, 3=clear_screen
        smartBomb: null // Track the bomb entity
    });

    // --- Logic: Diet Calculation ---
    useEffect(() => {
        if (!meals) return;

        let greenCount = 0;
        let redCount = 0;
        const total = meals.length;

        meals.forEach(m => {
            const assessment = m.assessment || '';
            const name = m.foodName || '';

            if (assessment === 'positive' || name.match(/野菜|サラダ|魚|玄米|フルーツ/)) {
                greenCount++;
            } else if (assessment === 'negative' || name.match(/ラーメン|揚げ|菓子|酒|マック|バーガー/)) {
                redCount++;
            }
        });

        const safeTotal = Math.max(1, total);
        setStats({
            greenRatio: greenCount / safeTotal,
            redRatio: redCount / safeTotal,
            total
        });
    }, [meals]);

    // --- Helper Functions ---

    const checkCollision = (r1, r2) => {
        return (r1.x < r2.x + r2.width && r1.x + r1.width > r2.x &&
            r1.y < r2.y + r2.height && r1.y + r1.height > r2.y);
    };

    const createParticles = (x, y, color, count) => {
        for (let i = 0; i < count; i++) {
            gameRef.current.particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                color,
                life: 20 + Math.random() * 10
            });
        }
    };

    const spawnEnemy = (canvas) => {
        const state = gameRef.current;
        const size = 40;

        // Elite Chance: Base 20% + Red Ratio * 30% (Max 50%)
        const isElite = Math.random() < (0.2 + state.redRatio * 0.3);

        const emoji = isElite
            ? ELITE_ENEMIES[Math.floor(Math.random() * ELITE_ENEMIES.length)]
            : BAD_ENEMIES[Math.floor(Math.random() * BAD_ENEMIES.length)];

        state.enemies.push({
            x: Math.random() * (canvas.width - size),
            y: -size,
            width: size,
            height: size,
            speed: isElite ? 3 : 3 + (state.difficulty * 0.8) + Math.random() * 2, // Faster Enemies
            hp: isElite ? Math.ceil(state.difficulty * 3) : Math.ceil(state.difficulty),
            emoji,
            maxHp: isElite ? Math.ceil(state.difficulty * 3) : Math.ceil(state.difficulty),
            isElite,
            lastShot: 0
        });
    };

    const spawnPickup = (x, y) => {
        const rand = Math.random();
        // Drop Chance: Reduced. Base 5% + Green Ratio * 15% (Max 20%)
        const dropChance = 0.05 + (stats.greenRatio * 0.15);

        if (rand < dropChance) {
            const types = ['SPREAD', 'SPEED', 'SHIELD'];
            const type = types[Math.floor(Math.random() * types.length)];
            gameRef.current.pickups.push({
                x, y, width: 30, height: 30,
                type,
                ...POWERUPS[type],
                vy: 2
            });
        }
    };

    const endGame = useCallback(async () => {
        if (!gameRef.current.running) return;
        const finalScore = Math.floor(gameRef.current.score);
        gameRef.current.running = false;
        setGameState('gameover');
        soundManager.stopBGM();
        soundManager.play('gameover');

        // Save Score
        if (user) {
            // Stats to save
            const gameStats = {
                greenRatio: stats.greenRatio,
                redRatio: stats.redRatio,
                multiplier: gameRef.current.multiplier
            };
            // Use display name or email part
            const name = userProfile?.displayName || user.email?.split('@')[0] || 'Player';
            await saveGameScore(user.uid, name, finalScore, gameStats);
        }

        // Fetch Leaderboard
        setIsLoadingLeaderboard(true);
        const scores = await getLeaderboard();
        setLeaderboard(scores);
        setIsLoadingLeaderboard(false);

    }, [user, userProfile, stats]);

    const winGame = useCallback(() => {
        const state = gameRef.current;
        if (!state.running || state.victoryPhase > 0) return;

        // Phase 1: Launch Smart Bomb
        state.victoryPhase = 1;
        state.smartBomb = {
            x: state.player.x + 20,
            y: state.player.y,
            vy: -8, // Speed upward
            size: 25,
            color: '#FCD34D'
        };
        soundManager.play('bomb'); // Bomb launch sound
        // Keep running for animation
    }, []);

    // Phase 2: Explosion triggered when bomb reaches center
    const triggerExplosionPhase = useCallback((canvas) => {
        const state = gameRef.current;
        state.victoryPhase = 2;
        state.smartBomb = null;

        // Create massive explosion particles at center
        createParticles(canvas.width / 2, canvas.height / 3, '#FBBF24', 150);
        soundManager.play('powerup'); // Explosion sound

        // Explode all enemies and calculate bonus
        let enemyBonus = 0;
        state.enemies.forEach(e => {
            createParticles(e.x + e.width / 2, e.y + e.height / 2, '#EF4444', 20);
            enemyBonus += 1000;
        });
        state.enemies = []; // Clear all enemies
        state.enemyBullets = []; // Clear enemy bullets too

        // Add clear bonus
        const clearBonus = 10000;
        const totalBonus = enemyBonus + clearBonus;
        state.score += totalBonus;
        setScore(state.score);

        // After 2 seconds (explosion settling), move to Phase 3 (Clear Screen)
        setTimeout(() => {
            state.victoryPhase = 3;
            state.running = false;
            setVictory(true);
            soundManager.stopBGM();
            soundManager.play('clear'); // Play clear jingle (se_clear.mp3)

            // After 5 seconds (long celebration), show score screen
            setTimeout(async () => {
                setVictory(false);
                setGameState('gameover');
                // Don't play gameover sound after victory

                // Save Score
                if (user) {
                    const gameStats = {
                        greenRatio: stats.greenRatio,
                        redRatio: stats.redRatio,
                        multiplier: state.multiplier
                    };
                    const name = userProfile?.displayName || user.email?.split('@')[0] || 'Player';
                    await saveGameScore(user.uid, name, Math.floor(state.score), gameStats);
                }

                // Refresh Leaderboard
                setIsLoadingLeaderboard(true);
                const scores = await getLeaderboard();
                setLeaderboard(scores);
                setIsLoadingLeaderboard(false);
            }, 5000); // 5 seconds for clear screen
        }, 2000); // 2 seconds for explosion to settle
    }, [user, userProfile, stats]);

    const update = useCallback((canvas) => {
        const state = gameRef.current;

        // Allow updates during victory phases (1=bomb flying, 2=explosion)
        if (!state.running && state.victoryPhase === 0) return;
        if (state.victoryPhase >= 3) return; // Phase 3+ = clear screen, no updates

        // Delta Time Calculation
        const now = performance.now();
        const dt = Math.min(now - state.lastTime, 50); // Cap at 50ms
        state.lastTime = now;

        const timeScale = dt / 16.667; // Normalize to 60FPS

        // 1. Background (always animate)
        state.stars.forEach(s => {
            s.y += s.speed * timeScale;
            if (s.y > canvas.height) s.y = 0;
        });

        // Victory Phase 1: Animate Smart Bomb
        if (state.victoryPhase === 1 && state.smartBomb) {
            const bomb = state.smartBomb;
            bomb.y += bomb.vy * timeScale;
            createParticles(bomb.x, bomb.y, '#FCD34D', 3); // Trail effect

            // When bomb reaches upper third of screen, trigger explosion
            if (bomb.y < canvas.height / 3) {
                triggerExplosionPhase(canvas);
                return; // Stop processing further
            }
        }

        // Victory Phase 2: Just animate particles (no game logic)
        if (state.victoryPhase === 2) {
            // Only update particles
            state.particles.forEach(p => {
                p.x += p.vx * timeScale;
                p.y += p.vy * timeScale;
                p.life -= timeScale;
            });
            state.particles = state.particles.filter(p => p.life > 0);
            return;
        }

        // Normal gameplay below (victoryPhase === 0)

        // 2. Player Powerup Timer & Fever Update
        if (state.player.powerupTimer > 0) {
            state.player.powerupTimer -= dt;
            if (state.player.powerupTimer <= 0) state.player.powerup = null;
        }

        if (state.isFever) {
            state.feverTimer -= dt;
            if (state.feverTimer <= 0) {
                state.isFever = false;
                state.fever = 0;
            }
        }

        // 3. Auto Shoot (only during normal play)
        if (state.victoryPhase === 0) {
            const baseFireRate = state.player.powerup === 'SPEED' || state.isFever ? 100 : 200;
            if (now - state.lastFired > baseFireRate) {
                const isSpread = state.player.powerup === 'SPREAD' || state.isFever;

                state.bullets.push({ x: state.player.x + 20 - 2, y: state.player.y, width: 4, height: 10, speed: 12, vx: 0, color: state.isFever ? '#F472B6' : '#FDE047' });

                if (isSpread) {
                    state.bullets.push(
                        { x: state.player.x, y: state.player.y + 10, width: 4, height: 10, speed: 10, vx: -3, color: state.isFever ? '#F472B6' : '#FDE047' },
                        { x: state.player.x + 40, y: state.player.y + 10, width: 4, height: 10, speed: 10, vx: 3, color: state.isFever ? '#F472B6' : '#FDE047' }
                    );
                }
                state.lastFired = now;
                soundManager.play('shoot');
            }
        }

        // 4. Move Bullets
        state.bullets.forEach(b => {
            b.y -= b.speed * timeScale;
            b.x += b.vx * timeScale;
        });
        state.bullets = state.bullets.filter(b => b.y > -20 && b.x > -20 && b.x < canvas.width + 20 && !b.dead);

        // 5. Spawn Enemies
        // NORMAL MODE: Base 600ms, Min 150ms.
        const baseSpawnInterval = Math.max(150, 600 - (stats.redRatio * 300) - (state.difficulty * 40));
        const spawnInterval = state.isFever ? baseSpawnInterval / 2 : baseSpawnInterval;

        if (now - state.lastEnemySpawn > spawnInterval) {
            spawnEnemy(canvas);
            state.lastEnemySpawn = now;
        }

        // 6. Move Enemies & Shoot
        state.enemies.forEach(e => {
            e.y += e.speed * timeScale;

            // Shooting Logic - NORMAL
            const fireChance = (e.isElite ? 0.03 : 0.01) * timeScale; // Low fire rate
            if (now - e.lastShot > 900 && Math.random() < fireChance) { // Long cooldown
                // Shoot
                const angle = Math.atan2(state.player.y - e.y, state.player.x - e.x);
                const speed = e.isElite ? 6 : 4; // Moderate bullets

                state.enemyBullets.push({
                    x: e.x + e.width / 2,
                    y: e.y + e.height,
                    width: 6, height: 6,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    color: e.isElite ? '#FF0055' : '#FFA500'
                });

                if (e.isElite) {
                    // Spread shot (3-way)
                    [-0.4, 0.4].forEach(offset => {
                        state.enemyBullets.push({
                            x: e.x + e.width / 2,
                            y: e.y + e.height,
                            width: 6, height: 6,
                            vx: Math.cos(angle + offset) * speed,
                            vy: Math.sin(angle + offset) * speed,
                            color: '#FF0055'
                        });
                    });
                }

                e.lastShot = now;
                soundManager.play('hit'); // Enemy shoots
            }
        });

        // 6b. Move Enemy Bullets
        state.enemyBullets.forEach(b => {
            b.x += b.vx * timeScale;
            b.y += b.vy * timeScale;
        });
        state.enemyBullets = state.enemyBullets.filter(b => b.y < canvas.height && b.y > 0 && b.x > 0 && b.x < canvas.width);

        // 7. Pickups
        state.pickups.forEach(p => {
            p.y += p.vy * timeScale;
        });

        // --- Collisions ---

        // Bullets vs Enemies
        state.bullets.forEach(b => {
            if (b.dead) return;
            state.enemies.forEach(e => {
                if (e.dead) return;
                if (checkCollision(b, e)) {
                    b.dead = true;
                    e.hp--;
                    soundManager.play('hit');
                    createParticles(e.x + e.width / 2, e.y + e.height / 2, '#FCA5A5', 3);

                    if (e.hp <= 0) {
                        e.dead = true;

                        // Score Logic
                        let point = 100 * state.multiplier;
                        if (state.isFever) point *= 2;
                        state.score += point;

                        // Fever Logic
                        if (!state.isFever) {
                            state.fever = Math.min(100, state.fever + 5);
                            if (state.fever >= 100) {
                                state.isFever = true;
                                state.feverTimer = 5000; // 5 seconds
                                soundManager.play('powerup'); // Fever start sound
                            }
                        }

                        createParticles(e.x + e.width / 2, e.y + e.height / 2, '#EF4444', 10);
                        spawnPickup(e.x, e.y);
                    }
                }
            });
        });

        // Player vs Pickups
        state.pickups.forEach(p => {
            if (p.dead) return;
            if (checkCollision({ x: p.x, y: p.y, width: p.width, height: p.height }, state.player)) {
                p.dead = true;
                state.player.powerup = p.type;
                state.player.powerupTimer = p.duration * 16.6;

                if (p.type === 'SHIELD') state.player.hp = Math.min(state.player.hp + 1, 10);
                state.score += 500;
                soundManager.play('powerup');
            }
        });

        // Player vs Enemies
        state.enemies.forEach(e => {
            if (e.dead) return;
            if (checkCollision({ x: e.x + 5, y: e.y + 5, width: e.width - 10, height: e.height - 10 }, state.player)) {
                e.dead = true;
                state.player.hp--;

                // SHAKE Effect
                setShake(true);
                setTimeout(() => setShake(false), 200);

                createParticles(state.player.x + 20, state.player.y + 20, '#10B981', 15);
                soundManager.play('damage');
                if (state.player.hp <= 0) {
                    // Death Explosion
                    createParticles(state.player.x + 20, state.player.y + 20, '#EF4444', 50);
                    soundManager.play('damage');
                    endGame();
                }
            }
        });

        // Player vs Enemy Bullets
        state.enemyBullets.forEach(b => {
            if (b.dead) return;
            if (checkCollision({ x: b.x, y: b.y, width: b.width, height: b.height }, state.player)) {
                b.dead = true;
                state.player.hp--;

                // SHAKE Effect
                setShake(true);
                setTimeout(() => setShake(false), 200);

                createParticles(state.player.x + 20, state.player.y + 20, '#EF4444', 5);
                soundManager.play('damage');
                if (state.player.hp <= 0) {
                    // Death Explosion
                    createParticles(state.player.x + 20, state.player.y + 20, '#EF4444', 50);
                    soundManager.play('damage');
                    endGame();
                }
            }
        });

        // Cleanup
        state.bullets = state.bullets.filter(b => !b.dead);
        state.enemies = state.enemies.filter(e => !e.dead && e.y < canvas.height + 50);
        state.pickups = state.pickups.filter(p => !p.dead && p.y < canvas.height + 50);

        // Particles
        state.particles.forEach(p => {
            p.x += p.vx * timeScale;
            p.y += p.vy * timeScale;
            p.life -= timeScale;
        });
        state.particles = state.particles.filter(p => p.life > 0);

        setScore(Math.floor(state.score));
    }, [stats, endGame, triggerExplosionPhase]);

    const draw = useCallback((ctx, canvas) => {
        const state = gameRef.current;
        // Background
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Stars
        ctx.fillStyle = '#FFFFFF';
        state.stars.forEach(s => {
            ctx.globalAlpha = 0.6;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1.0;

        // Player
        ctx.font = '30px "DotGothic16", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(PLAYER_ICON, state.player.x + 20, state.player.y + 20);

        // Shield Effect
        if (state.player.powerup === 'SHIELD' || state.player.powerupTimer > 250) {
            ctx.strokeStyle = '#34D399';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(state.player.x + 20, state.player.y + 20, 25, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Enemies
        state.enemies.forEach(e => {
            ctx.font = '30px "DotGothic16", sans-serif';
            ctx.fillText(e.emoji, e.x + e.width / 2, e.y + e.height / 2);
            if (e.maxHp > 1) {
                const pct = e.hp / e.maxHp;
                ctx.fillStyle = 'red';
                ctx.fillRect(e.x, e.y - 5, e.width, 3);
                ctx.fillStyle = '#10B981';
                ctx.fillRect(e.x, e.y - 5, e.width * pct, 3);
            }
        });

        state.bullets.forEach(b => {
            ctx.fillStyle = b.color;
            ctx.shadowBlur = 10;
            ctx.shadowColor = b.color;
            ctx.beginPath();
            ctx.arc(b.x + (b.width ? b.width / 2 : 0), b.y + (b.height ? b.height / 2 : 0), 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        });

        // Smart Bomb (Victory Phase 1)
        if (state.smartBomb) {
            const bomb = state.smartBomb;
            ctx.fillStyle = bomb.color;
            ctx.shadowBlur = 30;
            ctx.shadowColor = '#FCD34D';
            ctx.beginPath();
            ctx.arc(bomb.x, bomb.y, bomb.size, 0, Math.PI * 2);
            ctx.fill();
            // Inner glow
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(bomb.x, bomb.y, bomb.size * 0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // Enemy Bullets
        state.enemyBullets.forEach(b => {
            ctx.fillStyle = b.color;
            ctx.shadowBlur = 4;
            ctx.shadowColor = b.color;
            ctx.beginPath();
            ctx.arc(b.x + b.width / 2, b.y + b.height / 2, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        });

        // Pickups
        state.pickups.forEach(p => {
            ctx.font = '24px "DotGothic16", sans-serif';
            ctx.fillText(p.icon, p.x + p.width / 2, p.y + p.height / 2);
        });

        // Particles
        state.particles.forEach(p => {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life / 20;
            ctx.fillRect(p.x, p.y, 4, 4);
            ctx.globalAlpha = 1.0;
        });

        // UI Overlay for HP
        ctx.fillStyle = 'white';
        ctx.font = '20px "DotGothic16", sans-serif';
        let hearts = '❤️'.repeat(Math.max(0, state.player.hp));
        ctx.fillText(hearts, 60 + (state.player.hp * 8), canvas.height - 20);

        // FEVER Bar
        const feverPct = state.isFever ? (state.feverTimer / 5000) : (state.fever / 100);
        const feverColor = state.isFever ? `hsl(${Date.now() / 5 % 360}, 100%, 60%)` : '#EC4899';

        ctx.fillStyle = '#374151';
        ctx.fillRect(canvas.width - 120, canvas.height - 25, 100, 10);
        ctx.fillStyle = feverColor;
        ctx.fillRect(canvas.width - 120, canvas.height - 25, 100 * feverPct, 10);
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 1;
        ctx.strokeRect(canvas.width - 120, canvas.height - 25, 100, 10);

        ctx.font = '12px "DotGothic16", sans-serif';
        ctx.fillStyle = 'white';
        ctx.fillText("FEVER", canvas.width - 135, canvas.height - 20);

    }, []);

    // --- Game Logic ---

    const gameLoop = useCallback(() => {
        if (!gameRef.current.running) return;

        const canvas = canvasRef.current;
        if (canvas) {
            update(canvas);
            const ctx = canvas.getContext('2d');
            draw(ctx, canvas);
        }

        requestAnimationFrame(gameLoop);
    }, [update, draw]);

    const initGame = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const baseDiff = 1 + (stats.redRatio * 2);
        const baseMult = 1 + (stats.greenRatio * 2);

        const stars = [];
        for (let i = 0; i < 50; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 2 + 1,
                speed: Math.random() * 2 + 0.5
            });
        }

        gameRef.current = {
            ...gameRef.current,
            player: {
                x: canvas.width / 2 - 20,
                y: canvas.height - 100,
                width: 40, height: 40,
                hp: stats.greenRatio > 0.5 ? 5 : 3,
                powerup: null,
                powerupTimer: 0
            },
            bullets: [],
            enemyBullets: [],
            enemies: [],
            particles: [],
            pickups: [],
            stars,
            fever: 0,
            isFever: false,
            feverTimer: 0,
            score: 0,
            difficulty: baseDiff,
            multiplier: baseMult,
            running: true,
            victoryPhase: 0, // Reset victory state
            smartBomb: null  // Reset bomb
        };

        setScore(0);
        setTimeLeft(GAME_DURATION);
        setGameState('playing');
        // setLeaderboard([]); // Keep existing
        soundManager.playBGM();
        gameRef.current.lastTime = performance.now(); // reset time
        requestAnimationFrame(gameLoop);
    }, [stats, gameLoop]);

    const startCountdown = useCallback(() => {
        setGameState('countdown');
        setCountdown(3);
        soundManager.play('countdown'); // Initial 3 sound
        let count = 3;
        const timer = setInterval(() => {
            count--;
            setCountdown(count);
            if (count > 0) {
                soundManager.play('countdown'); // 2, 1 countdown tick
            } else if (count === 0) {
                soundManager.play('go'); // GO! sound
            } else {
                clearInterval(timer);
                setCountdown(null);
                initGame();
            }
        }, 1000);
    }, [initGame]);

    // Timer Effect
    useEffect(() => {
        let interval;
        if (gameState === 'playing') {
            interval = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        winGame(); // Time Up = Win
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [gameState, winGame]);

    // Reset Logic
    const handleResetClick = () => {
        soundManager.play('select');
        setShowResetConfirm(true);
    };

    const confirmReset = async () => {
        setIsResetting(true);
        try {
            await resetLeaderboard();
            setLeaderboard([]);
            setShowResetConfirm(false);
            soundManager.play('damage');
        } finally {
            setIsResetting(false);
        }
    };

    const handleMouseMove = (e) => {
        if (gameState !== 'playing' || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const scaleX = canvasRef.current.width / rect.width;
        const scaleY = canvasRef.current.height / rect.height;

        let newX = (e.clientX - rect.left) * scaleX - 20;
        let newY = (e.clientY - rect.top) * scaleY - 20;

        // Clamp to boundaries
        newX = Math.max(0, Math.min(canvasRef.current.width - 40, newX));
        newY = Math.max(0, Math.min(canvasRef.current.height - 40, newY));

        gameRef.current.player.x = newX;
        gameRef.current.player.y = newY;
    };

    const handleTouchStart = (e) => {
        if (gameState !== 'playing' || !canvasRef.current) return;
        if (e.cancelable) e.preventDefault();

        const touch = e.touches[0];

        touchRef.current.startX = touch.clientX;
        touchRef.current.startY = touch.clientY;
        touchRef.current.playerStartX = gameRef.current.player.x;
        touchRef.current.playerStartY = gameRef.current.player.y;
        touchRef.current.active = true;
    };

    const handleTouchMove = (e) => {
        if (gameState !== 'playing' || !canvasRef.current || !touchRef.current.active) return;
        if (e.cancelable) e.preventDefault();

        const touch = e.touches[0];
        const rect = canvasRef.current.getBoundingClientRect();
        const scaleX = canvasRef.current.width / rect.width;
        const scaleY = canvasRef.current.height / rect.height;

        // Calculate Delta
        const deltaX = (touch.clientX - touchRef.current.startX) * scaleX;
        const deltaY = (touch.clientY - touchRef.current.startY) * scaleY;

        let newX = touchRef.current.playerStartX + deltaX;
        let newY = touchRef.current.playerStartY + deltaY;

        // Clamp
        newX = Math.max(0, Math.min(canvasRef.current.width - 40, newX));
        newY = Math.max(0, Math.min(canvasRef.current.height - 40, newY));

        gameRef.current.player.x = newX;
        gameRef.current.player.y = newY;
    };

    const handleTouchEnd = () => {
        touchRef.current.active = false;
    };


    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(17, 24, 39, 0.95)', backdropFilter: 'blur(8px)',
            zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
        }}>
            <style>{`
                canvas { cursor: none; }
                @keyframes shake {
                    0% { transform: translate(1px, 1px) rotate(0deg); }
                    10% { transform: translate(-1px, -2px) rotate(-1deg); }
                    20% { transform: translate(-3px, 0px) rotate(1deg); }
                    30% { transform: translate(3px, 2px) rotate(0deg); }
                    40% { transform: translate(1px, -1px) rotate(1deg); }
                    50% { transform: translate(-1px, 2px) rotate(-1deg); }
                    60% { transform: translate(-3px, 1px) rotate(0deg); }
                    70% { transform: translate(3px, 1px) rotate(-1deg); }
                    80% { transform: translate(-1px, -1px) rotate(1deg); }
                    90% { transform: translate(1px, 2px) rotate(0deg); }
                    100% { transform: translate(1px, -2px) rotate(-1deg); }
                }
                .shake {
                    animation: shake 0.5s;
                    animation-iteration-count: 1;
                }
                .title-gradient {
                    background: linear-gradient(to right, #10B981, #FBBF24, #EF4444);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .fade-in { animation: fadeIn 0.5s ease-in; }
                .zoom-in { animation: zoomIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes zoomIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
                @import url('https://fonts.googleapis.com/css2?family=DotGothic16&display=swap');
            `}</style>

            {/* Header / Score */}
            <div style={{
                width: '100%', maxWidth: '400px', display: 'flex', justifyContent: 'space-between', marginBottom: '10px',
                color: 'white', fontWeight: 'bold', fontFamily: '"DotGothic16", sans-serif'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '1.2rem', color: '#FCD34D' }}>SCORE: {Math.floor(score)}</span>
                    <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>倍率: x{gameRef.current.multiplier?.toFixed(1) || 1.0}</span>
                </div>
                <div style={{ fontSize: '1.5rem', fontFamily: '"DotGothic16", sans-serif' }}>{timeLeft}</div>
                <button onClick={() => { soundManager.stopBGM(); onClose(); }} style={{ background: 'none', border: 'none', color: 'white' }}><X /></button>
            </div>

            {/* Diet Status Bar */}
            <div style={{ width: '100%', maxWidth: '400px', height: '6px', background: '#374151', borderRadius: '3px', marginBottom: '10px', overflow: 'hidden', display: 'flex' }}>
                <div style={{ flex: stats.greenRatio, background: '#10B981' }} />
                <div style={{ flex: 1 - (stats.greenRatio + stats.redRatio), background: '#6B7280' }} />
                <div style={{ flex: stats.redRatio, background: '#EF4444' }} />
            </div>

            {/* Game Canvas */}
            <div className={shake ? 'shake' : ''} style={{
                width: '100%', maxWidth: '400px', aspectRatio: '1/2',
                background: '#000', borderRadius: '12px', overflow: 'hidden',
                position: 'relative', border: '2px solid #374151', boxShadow: '0 0 20px rgba(16, 185, 129, 0.2)',
                touchAction: 'none'
            }}>
                <canvas
                    ref={canvasRef}
                    width={400}
                    height={800}
                    style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
                    onMouseMove={handleMouseMove}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                />

                {/* Menu Overlay */}
                {gameState === 'menu' && (
                    <div className="fade-in" style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,0.7)', color: 'white', fontFamily: '"DotGothic16", sans-serif'
                    }}>
                        <div style={{ fontSize: '3rem', marginBottom: '0' }}>🥗 vs 🍔</div>
                        <h2 className="title-gradient" style={{ fontSize: '2rem', fontWeight: 900, marginBottom: '5px', fontFamily: '"DotGothic16", sans-serif' }}>DIET SHOOTER</h2>
                        <div style={{ background: 'rgba(255,255,255,0.1)', padding: '15px', borderRadius: '12px', marginBottom: '20px', fontSize: '0.9rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                                <span style={{ color: '#10B981' }}>Good {Math.round(stats.greenRatio * 100)}%</span>
                                <span>→ パワーアップ率UP!</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ color: '#EF4444' }}>Bad {Math.round(stats.redRatio * 100)}%</span>
                                <span>→ 敵出現・エリート率UP!</span>
                            </div>
                        </div>
                        <button onClick={startCountdown} className="btn-primary" style={{ padding: '16px 48px', fontSize: '1.2rem', background: '#10B981', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)' }}>
                            ゲーム開始
                        </button>

                        {/* Start Screen Leaderboard */}
                        <div style={{ marginTop: '20px', width: '90%', background: 'rgba(0,0,0,0.5)', padding: '15px', borderRadius: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '10px', position: 'relative' }}>
                                <h3 style={{ fontSize: '1rem', color: '#9CA3AF', margin: 0 }}>🏆 ランキング</h3>
                                <button onClick={handleResetClick} style={{ position: 'absolute', right: 0, background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', opacity: 0.6 }} title="Purge Database">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                            {isLoadingLeaderboard ? (
                                <div style={{ textAlign: 'center', color: '#6B7280' }}>読み込み中...</div>
                            ) : leaderboard.length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#6B7280' }}>データなし</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '150px', overflowY: 'auto' }}>
                                    {leaderboard.slice(0, 3).map((entry, i) => (
                                        <div key={entry.id || i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                <span style={{ color: '#FBBF24' }}>{i + 1}.</span>
                                                <span style={{ color: 'white' }}>{entry.userName}</span>
                                            </div>
                                            <span style={{ color: '#FBBF24' }}>{entry.score}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Game Over Overlay */}
                {gameState === 'gameover' && (
                    <div className="zoom-in" style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,0.92)', color: 'white', padding: '20px', overflowY: 'auto',
                        fontFamily: '"DotGothic16", sans-serif'
                    }}>
                        <Trophy size={48} color="#FBBF24" style={{ marginBottom: '10px' }} />
                        <h2 style={{ fontSize: '2rem', marginBottom: '5px', color: '#EF4444' }}>TIME UP!</h2>
                        <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#FBBF24', marginBottom: '20px' }}>{Math.floor(score)}</div>

                        {/* Leaderboard */}
                        <div style={{ width: '100%', marginBottom: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '15px' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '10px', position: 'relative' }}>
                                <h3 style={{ fontSize: '1rem', color: '#9CA3AF', margin: 0 }}>🏆 ランキング</h3>
                                <button onClick={handleResetClick} style={{ position: 'absolute', right: 0, background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', opacity: 0.6 }} title="Purge Database">
                                    <Trash2 size={16} />
                                </button>
                            </div>

                            {isLoadingLeaderboard ? (
                                <div style={{ textAlign: 'center', color: '#6B7280' }}>読み込み中...</div>
                            ) : leaderboard.length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#6B7280' }}>データなし</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {leaderboard.map((entry, i) => (
                                        <div key={entry.id || i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                <span style={{ color: i === 0 ? '#FBBF24' : i === 1 ? '#9CA3AF' : i === 2 ? '#B45309' : '#6B7280', fontWeight: 'bold', width: '20px' }}>{i + 1}</span>
                                                <span style={{ color: 'white' }}>{entry.userName}</span>
                                            </div>
                                            <span style={{ color: '#FBBF24', fontWeight: 'bold' }}>{entry.score}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '15px' }}>
                            <button onClick={() => { soundManager.stopBGM(); onClose(); }} style={{ padding: '12px 24px', borderRadius: '8px', border: '1px solid #4B5563', background: 'transparent', color: '#9CA3AF' }}>閉じる</button>
                            <button onClick={startCountdown} style={{ padding: '12px 24px', borderRadius: '8px', background: '#3B82F6', color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <RotateCcw size={18} /> 再挑戦
                            </button>
                        </div>
                    </div>
                )}

                {/* Countdown Overlay */}
                {gameState === 'countdown' && (
                    <div className="zoom-in" style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,0.7)', color: '#FCD34D', fontSize: '10rem', fontWeight: 900,
                        fontFamily: '"DotGothic16", sans-serif', textShadow: '6px 6px 0 #000, -2px -2px 0 #F59E0B'
                    }}>
                        {countdown === 0 ? 'GO!' : countdown}
                    </div>
                )}

                {/* Victory Overlay */}
                {victory && (
                    <div className="zoom-in" style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
                        background: 'linear-gradient(135deg, rgba(251,191,36,0.95) 0%, rgba(245,158,11,0.95) 100%)',
                        fontFamily: '"DotGothic16", sans-serif'
                    }}>
                        <div style={{ color: '#FFF', fontSize: '5rem', fontWeight: 900, textShadow: '4px 4px 0 #B45309, -2px -2px 0 #FCD34D' }}>CLEAR!</div>
                        <div style={{ fontSize: '1.5rem', color: '#FFF', marginTop: '20px', textShadow: '2px 2px 0 #B45309' }}>🎉 Bomb Bonus! +10000 🎉</div>
                    </div>
                )}

                {/* Reset Confirmation Overlay */}
                {showResetConfirm && (
                    <div className="shake" style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(20, 0, 0, 0.95)', color: '#EF4444', zIndex: 20
                    }}>
                        <div style={{ border: '4px solid #EF4444', padding: '30px', borderRadius: '12px', textAlign: 'center', background: '#000' }}>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '10px', textTransform: 'uppercase' }}>⚠️ 警告 ⚠️</h2>
                            <p style={{ color: 'white', marginBottom: '20px' }}>ランキングを全消去しますか？</p>

                            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
                                <button onClick={() => setShowResetConfirm(false)} disabled={isResetting} style={{ padding: '10px 20px', background: '#374151', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', opacity: isResetting ? 0.5 : 1 }}>
                                    キャンセル
                                </button>
                                <button onClick={confirmReset} disabled={isResetting} style={{ padding: '10px 20px', background: '#EF4444', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', boxShadow: '0 0 15px #EF4444', opacity: isResetting ? 0.5 : 1 }}>
                                    {isResetting ? '処理中...' : '実行'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
