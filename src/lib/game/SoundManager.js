class SoundManager {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.buffers = {};
        this.bgm = null;
        this.bgmNode = null;
        this.initialized = false;

        // File Paths
        this.files = {
            bgm_main: '/audio/bgm_main.mp3',
            se_shoot: '/audio/se_shoot.mp3',
            se_hit: '/audio/se_hit.mp3', // Enemy hit
            se_powerup: '/audio/se_powerup.mp3',
            se_damage: '/audio/se_damage.mp3', // Player hit
            se_gameover: '/audio/se_gameover.mp3',
            se_clear: '/audio/se_clear.mp3', // Victory clear jingle
            se_bomb: '/audio/se_bomb.mp3', // Smart bomb launch
            se_countdown: '/audio/se_countdown.mp3', // 3, 2, 1 countdown
            se_go: '/audio/se_go.mp3' // GO! sound
        };
    }

    init() {
        if (this.initialized) return;

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.3; // Default volume
            this.masterGain.connect(this.ctx.destination);

            this.initialized = true;

            // Preload SE files (Fire & Forget)
            Object.keys(this.files).forEach(key => {
                if (key.startsWith('se_')) {
                    this.loadBuffer(key, this.files[key]);
                }
            });

        } catch (e) {
            console.error("Audio init failed", e);
        }
    }

    async loadBuffer(key, url) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(res.statusText);
            const arrayBuffer = await res.arrayBuffer();
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            this.buffers[key] = audioBuffer;
        } catch (e) {
            // console.warn(`Sound file not found: ${url}, falling back to synth.`);
            // Silent fail - will use synth
        }
    }

    playBGM() {
        this.init();
        if (!this.ctx) return;

        // If file exists, play it
        // BGM is streamed usually, but for simple loop we can use Audio element or buffer
        // Let's use Audio element for BGM to avoid huge buffer decode
        if (!this.bgm) {
            this.bgm = new Audio(this.files.bgm_main);
            this.bgm.loop = true;
            this.bgm.volume = 0.4;
        }

        this.bgm.play().catch(e => {
            // Autoplay policy or file not found
            console.log("BGM play failed (missing file or policy)", e);
        });
    }

    stopBGM() {
        if (this.bgm) {
            this.bgm.pause();
            this.bgm.currentTime = 0;
        }
    }

    play(key) {
        this.init();
        if (!this.ctx) return;

        // Resume context on user interaction if suspended
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        // 1. Try playing loaded buffer
        if (this.buffers['se_' + key]) {
            const source = this.ctx.createBufferSource();
            source.buffer = this.buffers['se_' + key];
            source.connect(this.masterGain);
            source.start(0);
            return;
        }

        // 2. Fallback to Synth
        this.synth(key);
    }

    synth(key) {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.masterGain);

        switch (key) {
            case 'shoot':
                // Pew pew (Square wave, pitch slide down)
                osc.type = 'square';
                osc.frequency.setValueAtTime(880, t);
                osc.frequency.exponentialRampToValueAtTime(110, t + 0.1);
                gain.gain.setValueAtTime(0.3, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
                osc.start(t);
                osc.stop(t + 0.1);
                break;

            case 'hit':
                // Noise-like (Sawtooth low pitch or random)
                // Web Audio doesn't have Noise node easily without buffer. Use Sawtooth.
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(150, t);
                osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.1);
                gain.gain.setValueAtTime(0.5, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
                osc.start(t);
                osc.stop(t + 0.1);
                break;

            case 'powerup':
                // Ding! (Sine wave, pitch slide up)
                osc.type = 'sine';
                osc.frequency.setValueAtTime(660, t);
                osc.frequency.exponentialRampToValueAtTime(1320, t + 0.1); // Quick major 6th/octave
                gain.gain.setValueAtTime(0.3, t);
                gain.gain.linearRampToValueAtTime(0, t + 0.3);
                osc.start(t);
                osc.stop(t + 0.3);
                break;

            case 'damage':
                // Ouch (Triangle, unstable)
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(200, t);
                osc.frequency.linearRampToValueAtTime(100, t + 0.2);
                gain.gain.setValueAtTime(0.5, t);
                gain.gain.linearRampToValueAtTime(0, t + 0.2);
                osc.start(t);
                osc.stop(t + 0.2);
                break;

            case 'gameover':
                // Sad slide
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(440, t);
                osc.frequency.linearRampToValueAtTime(220, t + 1.0);
                gain.gain.setValueAtTime(0.5, t);
                gain.gain.linearRampToValueAtTime(0, t + 1.0);
                osc.start(t);
                osc.stop(t + 1.0);
                break;
        }
    }
}

// Singleton
export const soundManager = new SoundManager();
