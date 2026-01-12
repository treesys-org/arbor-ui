/**
 * FX.JS
 * Visuals and Audio Engine
 */

export class FX {
    constructor() {
        this.canvas = document.getElementById('bg-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        this.particles = [];
        this.plants = [];
        
        this.audioCtx = null;
        
        this.renderLoop();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    async initAudio() {
        if (!window.AudioContext) return;
        this.audioCtx = new window.AudioContext();
        if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();
    }

    playTone(freq, type, duration, vol = 0.1) {
        if (!this.audioCtx) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
        
        gain.gain.setValueAtTime(vol, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);
        
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        
        osc.start();
        osc.stop(this.audioCtx.currentTime + duration);
    }

    playFlipSound() {
        this.playTone(400 + Math.random()*200, 'sine', 0.1, 0.05);
    }

    playMatchSound(combo) {
        const base = 220 * (1 + (combo * 0.1));
        setTimeout(() => this.playTone(base, 'triangle', 0.3, 0.1), 0);
        setTimeout(() => this.playTone(base * 1.25, 'triangle', 0.3, 0.1), 100);
        setTimeout(() => this.playTone(base * 1.5, 'triangle', 0.4, 0.1), 200);
    }

    playErrorSound() {
        this.playTone(150, 'sawtooth', 0.3, 0.05);
        this.playTone(140, 'sawtooth', 0.3, 0.05);
    }

    playVictorySound() {
        [0, 200, 400, 600].forEach((t, i) => {
            setTimeout(() => this.playMatchSound(i+2), t);
        });
    }

    spawnBloom(x, y) {
        const count = 15;
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                life: 1.0,
                color: `hsl(${120 + Math.random()*60}, 100%, 70%)`,
                size: Math.random() * 6 + 2
            });
        }
    }

    growPlant() {
        const startX = Math.random() * this.canvas.width;
        this.plants.push({
            x: startX,
            y: this.canvas.height,
            angle: -Math.PI / 2 + (Math.random() - 0.5),
            depth: 0,
            maxDepth: 5 + Math.floor(Math.random() * 4),
            width: 10 + Math.random() * 10
        });
    }

    renderLoop() {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.2)'; 
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.02;
            p.vy += 0.1;

            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();

            if (p.life <= 0) this.particles.splice(i, 1);
        }

        ctx.strokeStyle = '#10b981';
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.6;
        
        for (let i = this.plants.length - 1; i >= 0; i--) {
            const p = this.plants[i];
            
            const speed = 5;
            const targetX = p.x + Math.cos(p.angle) * speed;
            const targetY = p.y + Math.sin(p.angle) * speed;

            ctx.lineWidth = Math.max(1, p.width - p.depth);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(targetX, targetY);
            ctx.stroke();

            p.x = targetX;
            p.y = targetY;

            if (Math.random() < 0.05 && p.depth < p.maxDepth) {
                this.plants.push({
                    x: p.x, y: p.y,
                    angle: p.angle + (Math.random() - 0.5),
                    depth: p.depth + 1,
                    maxDepth: p.maxDepth,
                    width: p.width
                });
            }
            
            if (Math.random() < 0.02) {
                this.spawnBloom(p.x, p.y);
                this.plants.splice(i, 1);
            }
            else if (p.y < 0 || p.x < 0 || p.x > this.canvas.width) {
                 this.plants.splice(i, 1);
            }
        }

        ctx.globalAlpha = 1;
        requestAnimationFrame(() => this.renderLoop());
    }
}
