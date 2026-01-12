/**
 * GAME.JS
 * Core Logic for Memory Garden: Overgrowth
 */
import { FX } from './fx.js';

class MemoryGame {
    constructor() {
        this.state = {
            cards: [],
            flipped: [],
            matchedCount: 0,
            locked: false,
            score: 0,
            highScore: 0,
            combo: 0,
            comboTimer: 0
        };

        this.els = {
            grid: document.getElementById('card-grid'),
            score: document.getElementById('score-display'),
            comboBar: document.getElementById('combo-bar'),
            startScreen: document.getElementById('start-screen'),
            victoryScreen: document.getElementById('victory-screen'),
            finalScore: document.getElementById('final-score'),
            highScore: document.getElementById('high-score'),
            btnStart: document.getElementById('btn-start'),
            loadState: document.getElementById('loading-state'),
            loadText: document.getElementById('loading-text'),
            topic: document.getElementById('lesson-topic')
        };
        
        // Load high score from Arbor Storage
        if (window.Arbor && window.Arbor.storage) {
            this.state.highScore = window.Arbor.storage.load('high_score') || 0;
        }

        this.fx = new FX();
        this.initListeners();
        this.gameLoop();
    }

    initListeners() {
        this.els.btnStart.addEventListener('click', () => this.startSequence());
    }

    // --- GAME LOOP for UI Updates ---
    gameLoop() {
        if (this.state.combo > 0) {
            this.state.comboTimer -= 0.5; // Drain combo
            if (this.state.comboTimer <= 0) {
                this.state.combo = 0;
                this.state.comboTimer = 0;
            }
        }
        
        // Update UI
        const percent = Math.min(100, (this.state.comboTimer / 100) * 100);
        this.els.comboBar.style.width = `${percent}%`;
        
        requestAnimationFrame(() => this.gameLoop());
    }

    // --- INITIALIZATION ---
    async startSequence() {
        this.els.btnStart.classList.add('hidden');
        this.els.loadState.classList.remove('hidden');
        
        // 1. Initialize Audio (Must be done on user gesture)
        await this.fx.initAudio();

        try {
            // 2. Fetch Content
            const content = await this.fetchContent();
            
            this.els.topic.innerText = content.title;
            this.els.topic.classList.remove('opacity-0');

            // 3. Generate Cards via AI (with 60s safety timeout)
            const pairs = await this.generatePairs(content.text);
            
            if (pairs && pairs.length > 0) {
                this.buildGrid(pairs);
                this.startGame();
            } else {
                throw new Error("Synthesis failed. No data returned from AI.");
            }
        } catch (e) {
            this.handleError(e.message || "Initialization Failed. Check Arbor Context.");
        }
    }

    async fetchContent() {
        // Bridge to Arbor
        if (window.Arbor && window.Arbor.content) {
            try {
                const lesson = await window.Arbor.content.getNext();
                if (lesson) return { title: lesson.title, text: lesson.text };
            } catch (e) { console.warn("Arbor Bridge Error", e); }
        }
        // No Fallback
        throw new Error("No Context Source Found (Arbor Bridge Offline)");
    }

    async generatePairs(text) {
        this.els.loadText.innerText = "Synthesizing Crystals...";
        
        const prompt = `
        Analyze this text: "${text.substring(0, 1000)}".
        Create 6 pairs of "Term" vs "Definition".
        Output ONLY valid JSON array: [{"t": "Term", "d": "Definition (max 6 words)"}, ...]
        Do NOT wrap in markdown code blocks.
        `;

        // 1. The Actual AI Request
        const aiRequest = async () => {
            try {
                if (window.Arbor && window.Arbor.ai) {
                    console.log("Sending prompt to AI...");
                    const response = await window.Arbor.ai.chat([{ role: "user", content: prompt }]);
                    console.log("AI Raw Response:", response);
                    
                    if (!response) return null;

                    // Robust JSON Extraction (Matching Classroom implementation)
                    const cleanResponse = response.replace(/```json/g, '').replace(/```/g, '');
                    const match = cleanResponse.match(/\[[\s\S]*\]/);
                    
                    if (match) {
                        return JSON.parse(match[0]);
                    }
                    // Try parsing the whole thing if regex fails
                    return JSON.parse(cleanResponse);
                } 
                return null;
            } catch (e) {
                console.error("AI Generation Error:", e);
                return null;
            }
        };

        // 2. The Safety Timeout (60 Seconds)
        const timeout = new Promise((resolve) => setTimeout(() => {
            console.warn("AI Response Timed Out (60s).");
            resolve(null); 
        }, 60000));

        // 3. Race: Whichever finishes first wins
        return Promise.race([aiRequest(), timeout]);
    }

    handleError(msg) {
        this.els.loadText.innerText = msg;
        this.els.loadText.classList.add('text-red-500');
    }

    startGame() {
        this.els.startScreen.classList.add('hidden-fade');
        document.getElementById('game-ui').classList.remove('hidden');
    }

    // --- GRID LOGIC ---
    buildGrid(pairs) {
        // Ensure we only take 6 pairs
        const selectedPairs = pairs.slice(0, 6);
        let cards = [];
        
        selectedPairs.forEach((p, i) => {
            cards.push({ id: i, text: p.t, type: 'TERM' });
            cards.push({ id: i, text: p.d, type: 'DEF' });
        });
        
        // Shuffle
        cards.sort(() => Math.random() - 0.5);

        this.els.grid.innerHTML = '';
        cards.forEach((card, index) => {
            const el = document.createElement('div');
            el.className = 'card-container w-full h-20 md:h-32';
            el.innerHTML = `
                <div class="card" data-index="${index}" data-id="${card.id}">
                    <div class="card-face face-front">
                        <span class="text-4xl opacity-50">🌿</span>
                    </div>
                    <div class="card-face face-back border-b-4 ${card.type === 'TERM' ? 'border-emerald-500' : 'border-yellow-500'}">
                        <span>${card.text}</span>
                    </div>
                </div>
            `;
            el.querySelector('.card').addEventListener('click', (e) => this.onCardClick(e.currentTarget, index));
            this.els.grid.appendChild(el);
            this.state.cards.push({ ...card, matched: false });
        });
    }

    onCardClick(el, index) {
        if (this.state.locked || this.state.flipped.includes(index) || this.state.cards[index].matched) return;

        // Flip Visual
        el.classList.add('flipped');
        this.fx.playFlipSound();
        this.state.flipped.push(index);

        if (this.state.flipped.length === 2) {
            this.checkMatch();
        }
    }

    checkMatch() {
        this.state.locked = true;
        const [i1, i2] = this.state.flipped;
        
        if (i1 === undefined || i2 === undefined) {
             this.state.flipped = [];
             this.state.locked = false;
             return;
        }

        const c1 = this.state.cards[i1];
        const c2 = this.state.cards[i2];
        const el1 = document.querySelector(`.card[data-index="${i1}"]`);
        const el2 = document.querySelector(`.card[data-index="${i2}"]`);

        if (c1.id === c2.id) {
            this.state.cards[i1].matched = true;
            this.state.cards[i2].matched = true;
            this.state.matchedCount += 2;
            
            this.state.combo++;
            this.state.comboTimer = 100;
            
            const points = 100 * this.state.combo;
            this.state.score += points;

            if (window.Arbor && window.Arbor.game) {
                window.Arbor.game.addXP(points);
            }
            this.els.score.innerText = this.state.score;

            setTimeout(() => {
                if(el1) el1.classList.add('matched');
                if(el2) el2.classList.add('matched');
                
                if(el1 && el2) {
                    const rect = el1.getBoundingClientRect();
                    const rect2 = el2.getBoundingClientRect();
                    this.fx.spawnBloom(rect.left + rect.width/2, rect.top + rect.height/2);
                    this.fx.spawnBloom(rect2.left + rect2.width/2, rect2.top + rect2.height/2);
                }
                
                this.fx.growPlant();
                this.fx.playMatchSound(this.state.combo);
                
                this.state.flipped = [];
                this.state.locked = false;

                if (this.state.matchedCount === this.state.cards.length) {
                    this.triggerVictory();
                }
            }, 300);

        } else {
            this.state.combo = 0;
            this.fx.playErrorSound();
            
            setTimeout(() => {
                if(el1) el1.classList.remove('flipped');
                if(el2) el2.classList.remove('flipped');
                this.state.flipped = [];
                this.state.locked = false;
            }, 700);
        }
    }

    triggerVictory() {
        setTimeout(() => {
            this.fx.playVictorySound();
            
            if (this.state.score > this.state.highScore) {
                this.state.highScore = this.state.score;
                if (window.Arbor && window.Arbor.storage) {
                    window.Arbor.storage.save('high_score', this.state.highScore);
                }
            }
            
            this.els.finalScore.innerText = this.state.score;
            this.els.highScore.innerText = this.state.highScore;
            
            this.els.victoryScreen.classList.remove('hidden-fade');
            
            for(let i=0; i<10; i++) setTimeout(() => this.fx.growPlant(), i*200);
        }, 800);
    }
}

new MemoryGame();
