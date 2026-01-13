/**
 * ENGINE.JS
 * The core logic for Arbor Classroom.
 * Logic: Professor asks questions, Students answer, Player judges correctness.
 */
import { SpriteGen, Colors } from './assets.js';

// --- I18N & INITIALIZATION ---
const translations = {
    EN: {
        START_CLASS: "START CLASS",
        START_DESC: "Evaluate your classmates.\nWrite your answers.\nWin the ranking.",
        LOADING: "Loading New Curriculum from Arbor Bridge...",
        NEW_TOPIC: "Alright class, new topic: ",
        ASK_PLAYER: "You! {question} Answer me.",
        CORRECT: "CORRECT!",
        GOOD_JOB: `Exactly. "{answer}". Good job.`,
        WRONG: "WRONG!",
        INCORRECT: `Incorrect. I was looking for "{answer}".`,
        ACCEPTED: "ACCEPTED!",
        WELL_SPOTTED: "Well spotted. Correct.",
        OBJECTION: "OBJECTION!",
        STUDENT_WAS_CORRECT: `No! {name} was correct.`,
        PAY_ATTENTION: `Pay attention! That was wrong.`,
        DISMISSED: "CLASS DISMISSED",
        FINAL_TALLY: `Final tally. You scored {score} points. We will review another topic next.`,
        SYSTEM_FAILURE: "SYSTEM FAILURE. AI IS UNRESPONSIVE OR CONTENT IS MISSING.",
        RANK: "CLASS RANK",
        TOPICS: "CLASS TOPICS:",
        TYPE_ANSWER: "TYPE ANSWER...",
        SUBMIT: "SUBMIT",
        JUDGE_CORRECT: "✅ CORRECT",
        JUDGE_WRONG: "❌ WRONG",
        UNKNOWN_SPEAKER: "???"
    },
    ES: {
        START_CLASS: "EMPEZAR CLASE",
        START_DESC: "Evalúa a tus compañeros.\nEscribe tus respuestas.\nGana el ranking.",
        LOADING: "Cargando nuevo currículo desde Arbor...",
        NEW_TOPIC: "Bien clase, nuevo tema: ",
        ASK_PLAYER: "¡Tú! {question} Contesta.",
        CORRECT: "¡CORRECTO!",
        GOOD_JOB: `Exacto. "{answer}". Buen trabajo.`,
        WRONG: "¡INCORRECTO!",
        INCORRECT: `Incorrecto. La respuesta era "{answer}".`,
        ACCEPTED: "¡ACEPTADO!",
        WELL_SPOTTED: "Bien visto. Correcto.",
        OBJECTION: "¡PROTESTO!",
        STUDENT_WAS_CORRECT: `¡No! {name} tenía razón.`,
        PAY_ATTENTION: `¡Presta atención! Eso era incorrecto.`,
        DISMISSED: "CLASE TERMINADA",
        FINAL_TALLY: `Recuento final. Tienes {score} puntos. Repasaremos otro tema la próxima vez.`,
        SYSTEM_FAILURE: "FALLO DEL SISTEMA. LA IA NO RESPONDE O FALTA CONTENIDO.",
        RANK: "RANKING",
        TOPICS: "TEMAS DE CLASE:",
        TYPE_ANSWER: "ESCRIBE RESPUESTA...",
        SUBMIT: "ENVIAR",
        JUDGE_CORRECT: "✅ CORRECTO",
        JUDGE_WRONG: "❌ INCORRECTO",
        UNKNOWN_SPEAKER: "???"
    }
};

const lang = (window.Arbor && window.Arbor.user && translations[window.Arbor.user.lang.toUpperCase()]) ? window.Arbor.user.lang.toUpperCase() : 'EN';
document.getElementById('btn-start').textContent = translations[lang].START_CLASS;
document.getElementById('start-desc').innerHTML = translations[lang].START_DESC.replace(/\n/g, '<br>');


class GameEngine {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = 800;
        this.height = 600;
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        this.lang = lang;
        this.state = 'INIT'; 
        this.frame = 0;
        
        this.assets = {
            prof: SpriteGen.generateProfessor(),
            bg: SpriteGen.generateBackground(this.width, this.height),
            desk: SpriteGen.generateDesk(),
            studentLola: SpriteGen.generateStudent(Colors.lola),
            studentTimmy: SpriteGen.generateStudent(Colors.timmy),
            studentPlayer: SpriteGen.generateStudent(Colors.player)
        };
        
        let playerName = 'You';
        if (window.Arbor && window.Arbor.user) {
            playerName = window.Arbor.user.username || 'You';
        }

        this.students = [
            { id: 'lola', name: 'Lola', color: Colors.lola, score: 0, x: 200, y: 380, sprite: this.assets.studentLola },
            { id: 'timmy', name: 'Timmy', color: Colors.timmy, score: 0, x: 400, y: 380, sprite: this.assets.studentTimmy },
            { id: 'you', name: playerName, color: Colors.player, score: 0, x: 600, y: 380, sprite: this.assets.studentPlayer }
        ];

        // NEW: Load persistent score for the player
        if (window.Arbor && window.Arbor.storage) {
            const savedScore = window.Arbor.storage.load('career_score');
            if (savedScore) {
                this.students[2].score = savedScore;
            }
        }

        this.professor = { x: 700, y: 350, sprite: this.assets.prof };
        this.particles = [];
        
        this.lessonData = { text: "Loading...", concepts: [] };
        this.currentRound = 0;
        this.currentQ = null;
        this.answeringStudentIndex = 0;
        this.lastJudgmentCorrect = null;

        this.ui = {
            dialogueBox: document.getElementById('dialogue-box'),
            speakerName: document.getElementById('speaker-name'),
            dialogueText: document.getElementById('dialogue-text'),
            shoutBubble: document.getElementById('shout-bubble'),
            overlay: document.getElementById('input-overlay'),
            btnTrue: document.getElementById('btn-judge-true'),
            btnFalse: document.getElementById('btn-judge-false'),
            textOverlay: document.getElementById('text-overlay'),
            inputField: document.getElementById('player-input'),
            btnSubmit: document.getElementById('btn-submit')
        };
        
        this.ui.inputField.placeholder = this.getLine('TYPE_ANSWER');
        this.ui.btnSubmit.textContent = this.getLine('SUBMIT');
        this.ui.btnTrue.textContent = this.getLine('JUDGE_CORRECT');
        this.ui.btnFalse.textContent = this.getLine('JUDGE_WRONG');
        this.ui.speakerName.textContent = this.getLine('UNKNOWN_SPEAKER');

        this.inputResolver = null;
        this.textResolver = null;
        this.setupInput();
    }

    getLine(key, replacements = {}) {
        let line = translations[this.lang][key] || translations['EN'][key] || `[${key}]`;
        for(const [k, v] of Object.entries(replacements)) {
            line = line.replace(`{${k}}`, v);
        }
        return line;
    }

    setupInput() {
        const dialogueStates = ['DIALOGUE', 'DIALOGUE_STUDENT', 'VICTORY'];
        
        document.addEventListener('keydown', (e) => {
            if ((e.key === ' ' || e.key === 'Enter') && dialogueStates.includes(this.state)) {
                this.advanceDialogue();
            }
            if (e.key === 'Enter' && this.state === 'INPUT_TEXT') {
                this.submitText();
            }
        });

        this.ui.dialogueBox.addEventListener('click', () => {
             if (dialogueStates.includes(this.state)) {
                 this.advanceDialogue();
             }
        });

        this.ui.btnTrue.addEventListener('click', () => this.resolveInput(true));
        this.ui.btnFalse.addEventListener('click', () => this.resolveInput(false));
        this.ui.btnSubmit.addEventListener('click', () => this.submitText());
    }

    resolveInput(val) {
        if (this.state === 'INPUT' && this.inputResolver) {
            this.inputResolver(val);
            this.ui.overlay.style.display = 'none';
        }
    }

    submitText() {
        if (this.state === 'INPUT_TEXT' && this.textResolver) {
            const val = this.ui.inputField.value.trim();
            if (val.length === 0) return;
            this.textResolver(val);
            this.ui.textOverlay.style.display = 'none';
            this.ui.inputField.value = '';
            this.ui.inputField.blur();
        }
    }

    start() {
        this.loop();
        this.loadContent();
    }

    loop() {
        this.update();
        this.draw();
        this.frame++;
        requestAnimationFrame(() => this.loop());
    }

    update() {
        const bob = Math.sin(this.frame / 15) * 2;
        this.professor.yDraw = this.professor.y + bob;

        this.students.forEach((s, i) => {
            if ((this.state === 'DIALOGUE_STUDENT' && this.answeringStudentIndex === i) || (this.state === 'PLAYER_TURN' && i === 2)) {
                s.yDraw = s.y + Math.sin(this.frame / 5) * 5;
            } else {
                s.yDraw = s.y + Math.sin((this.frame + i*100) / 30);
            }
        });

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life--;
            p.x += p.vx;
            p.y += p.vy;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    }

    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);
        ctx.drawImage(this.assets.bg, 0, 0);
        this.drawBoardContent(ctx);
        this.drawRank(ctx);

        ctx.save();
        ctx.translate(this.professor.x, this.professor.yDraw);

        if (this.state === 'GENERATING') {
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 4;
            
            const bubbleX = -80;
            const bubbleY = -100;
            
            ctx.beginPath();
            ctx.moveTo(bubbleX + 20, bubbleY + 40);
            ctx.quadraticCurveTo(bubbleX, bubbleY + 20, bubbleX + 20, bubbleY);
            ctx.quadraticCurveTo(bubbleX + 40, bubbleY - 20, bubbleX + 60, bubbleY);
            ctx.quadraticCurveTo(bubbleX + 80, bubbleY + 20, bubbleX + 60, bubbleY + 40);
            ctx.quadraticCurveTo(bubbleX + 40, bubbleY + 60, bubbleX + 20, bubbleY + 40);
            ctx.stroke();
            ctx.fill();

            ctx.fillStyle = '#000';
            ctx.font = '30px VT323';
            const dots = '.'.repeat((Math.floor(this.frame / 20) % 3) + 1);
            ctx.fillText(dots, bubbleX + 25, bubbleY + 30);
        }

        ctx.scale(2, 2);
        ctx.drawImage(this.assets.prof, -32, -64);
        ctx.restore();

        this.students.forEach(s => {
            ctx.save();
            ctx.translate(s.x, s.yDraw);
            const isActing = (this.state === 'DIALOGUE_STUDENT' && this.students.indexOf(s) === this.answeringStudentIndex) || 
                             (this.state === 'PLAYER_TURN' && s.id === 'you');
            if (isActing) {
                 ctx.filter = "brightness(1.2)";
                 this.drawArrow(ctx, 0, -80);
            }
            ctx.scale(2, 2);
            ctx.drawImage(s.sprite, -32, -40);
            ctx.restore();
            ctx.drawImage(this.assets.desk, s.x - 60, s.y - 10, 120, 90);
        });

        this.particles.forEach(p => {
            ctx.fillStyle = p.color || '#fff';
            ctx.fillRect(p.x, p.y, p.size, p.size);
        });
    }

    drawBoardContent(ctx) {
        ctx.fillStyle = Colors.term_green;
        ctx.font = '20px VT323';
        ctx.textAlign = 'left';
        ctx.fillText(this.getLine('TOPICS'), 180, 85);
        if (!this.lessonData.concepts) return;
        let y = 120;
        this.lessonData.concepts.forEach((c, i) => {
            ctx.fillStyle = (i === this.currentRound) ? '#fbbf24' : '#fff';
            ctx.fillText(`- ${c.topic}`, 180, y);
            if (c.status === 'correct') {
                ctx.fillStyle = '#4ade80';
                ctx.fillText("✔", 500, y);
            } else if (c.status === 'wrong') {
                ctx.fillStyle = '#ef4444';
                ctx.fillText("✘", 500, y);
            }
            y += 35;
        });
    }

    drawRank(ctx) {
        const x = 20, y = 20, w = 140, h = 120;
        ctx.fillStyle = '#111';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = '#fbbf24';
        ctx.font = '16px VT323';
        ctx.textAlign = 'left';
        ctx.fillText(this.getLine('RANK'), x + 10, y + 25);
        ctx.beginPath(); ctx.moveTo(x, y+35); ctx.lineTo(x+w, y+35); ctx.stroke();
        let rowY = y + 55;
        [...this.students].sort((a,b) => b.score - a.score).forEach(s => {
            ctx.fillStyle = s.color;
            ctx.fillText(s.name, x + 10, rowY);
            ctx.fillStyle = '#fff';
            ctx.fillText(s.score + " ★", x + 100, rowY);
            rowY += 25;
        });
    }

    drawArrow(ctx, x, y) {
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(x - 10, y);
        ctx.lineTo(x + 10, y);
        ctx.lineTo(x, y + 10);
        ctx.fill();
    }

    clearBoard() {
        this.lessonData = { text: "...", concepts: [] };
        this.currentRound = 0;
        this.ui.dialogueBox.style.display = 'none';
        this.ui.overlay.style.display = 'none';
        this.ui.textOverlay.style.display = 'none';
    }

    addPlayerScore(amount) {
        const player = this.students[2];
        player.score += amount;
    
        if (window.Arbor.game) {
            window.Arbor.game.addXP(amount);
        }
        if (window.Arbor.storage) {
            window.Arbor.storage.save('career_score', player.score);
        }
    }

    async loadContent() {
        this.clearBoard();
        this.state = 'DIALOGUE';
        await this.showDialogue("SYSTEM", this.getLine('LOADING'), true);
        this.state = 'GENERATING';
        
        try {
            if (!window.Arbor || !window.Arbor.ai || !window.Arbor.content) {
                throw new Error("Arbor Bridge is incomplete.");
            }

            const lesson = await window.Arbor.content.getNext();
            if (!lesson || !lesson.text) {
                throw new Error("No lesson content returned from bridge.");
            }
            
            await this.showDialogue("PROFESSOR", `${this.getLine('NEW_TOPIC')} ${lesson.title}`, true);

            const langName = this.lang === 'ES' ? 'Spanish' : 'English';
            const prompt = `
            Context: "${lesson.text.substring(0, 800)}".
            The user's language is ${langName}.
            Generate 3 distinct topics based on the context. For each topic, create a short question, a CORRECT answer (max 3 words), and a PLAUSIBLE WRONG answer (max 3 words).
            ALL output (topics, questions, answers) MUST be in ${langName}.
            Return ONLY a valid JSON array matching this schema, without any other text or markdown:
            [
                { "topic": "Short Topic Name", "q": "Question text", "correct": "Correct Answer", "wrong": "Wrong Answer" }
            ]
            `;
            
            console.log("Requesting questions from Arbor bridge...");
            const aiRes = await window.Arbor.ai.chat([{role: "user", content: prompt}]);
            const jsonText = aiRes.text;
            
            // ROBUST PARSING LOGIC (from Memory Garden)
            let json = null;
            try {
                const cleanResponse = jsonText.replace(/```json/g, '').replace(/```/g, '');
                const match = cleanResponse.match(/\[[\s\S]*\]/);
                if (match) {
                    json = JSON.parse(match[0]);
                } else {
                    json = JSON.parse(cleanResponse);
                }
            } catch (e) {
                console.error("Failed to parse AI JSON for Classroom Sim:", e, "Raw response:", jsonText);
                throw new Error("AI returned invalid data format.");
            }


            if (json && Array.isArray(json) && json.length > 0) {
                this.lessonData.concepts = json.map(j => ({ ...j, status: 'pending' }));
                await this.runRound();
            } else {
                throw new Error("Invalid or empty data from AI.");
            }

        } catch(e) {
            console.error("Game AI/Content Error: " + e.message);
            await this.showDialogue("SYSTEM", this.getLine('SYSTEM_FAILURE'), true);
        }
    }

    async runRound() {
        if (this.currentRound >= this.lessonData.concepts.length) {
            this.victory();
            return;
        }

        const concept = this.lessonData.concepts[this.currentRound];
        this.currentQ = concept;
        this.answeringStudentIndex = Math.floor(Math.random() * 3);
        const student = this.students[this.answeringStudentIndex];

        if (this.answeringStudentIndex === 2) { // Player's turn
            this.state = 'PLAYER_TURN';
            await this.showDialogue("PROFESSOR", this.getLine('ASK_PLAYER', {question: concept.q}));
            this.state = 'INPUT_TEXT';
            const playerText = await this.waitForText(); 
            const cleanPlayer = playerText.toLowerCase();
            const cleanCorrect = concept.correct.toLowerCase();
            const isCorrect = cleanPlayer.includes(cleanCorrect) || cleanCorrect.includes(cleanPlayer);

            if (isCorrect) {
                this.shout(this.getLine('CORRECT'));
                this.spawnParticles(student.x, student.y, '#4ade80');
                this.addPlayerScore(20);
                concept.status = 'correct';
                await this.showDialogue("PROFESSOR", this.getLine('GOOD_JOB', { answer: concept.correct }));
            } else {
                this.shout(this.getLine('WRONG'));
                this.shakeScreen();
                concept.status = 'wrong';
                await this.showDialogue("PROFESSOR", this.getLine('INCORRECT', { answer: concept.correct }));
            }
        } else { // AI Student's turn
            this.state = 'DIALOGUE';
            await this.showDialogue("PROFESSOR", `${concept.topic}: ${concept.q}`, true); // Auto-advance
            const isRight = Math.random() > 0.4;
            const answerText = isRight ? concept.correct : concept.wrong;
            this.state = 'DIALOGUE_STUDENT';
            await this.showDialogue(student.name.toUpperCase(), answerText);
            this.state = 'INPUT';
            const playerJudge = await this.waitForInput();
            const judgmentCorrect = (isRight && playerJudge) || (!isRight && !playerJudge);

            if (judgmentCorrect) {
                this.shout(this.getLine('ACCEPTED'));
                this.spawnParticles(this.students[2].x, this.students[2].y, '#4ade80');
                this.addPlayerScore(10);
                concept.status = 'correct';
                await this.showDialogue("PROFESSOR", this.getLine('WELL_SPOTTED'));
            } else {
                this.shout(this.getLine('OBJECTION'));
                this.shakeScreen();
                if (isRight) {
                    student.score += 10;
                    await this.showDialogue("PROFESSOR", this.getLine('STUDENT_WAS_CORRECT', { name: student.name }));
                } else {
                    await this.showDialogue("PROFESSOR", this.getLine('PAY_ATTENTION'));
                }
                concept.status = 'wrong';
            }
        }
        this.currentRound++;
        setTimeout(() => this.runRound(), 500);
    }

    victory() {
        this.state = 'VICTORY';
        const pScore = this.students[2].score;
        this.shout(this.getLine('DISMISSED'));
        this.showDialogue("PROFESSOR", this.getLine('FINAL_TALLY', { score: pScore }));
        this.advanceCallback = () => this.loadContent(); // Loop to next lesson
    }

    waitForInput() {
        this.ui.overlay.style.display = 'flex';
        return new Promise(resolve => this.inputResolver = resolve);
    }

    waitForText() {
        this.ui.textOverlay.style.display = 'flex';
        this.ui.inputField.focus();
        return new Promise(resolve => this.textResolver = resolve);
    }

    showDialogue(speaker, text, auto = false) {
        return new Promise(resolve => {
            this.ui.dialogueBox.style.display = 'block';
            this.ui.speakerName.innerText = speaker;
            this.ui.dialogueText.style.color = (speaker === 'PROFESSOR') ? '#000' : '#444'; 
            if (speaker === 'SYSTEM') this.ui.dialogueText.style.color = '#666';
            this.ui.dialogueText.innerHTML = ''; 
            let i = 0;
            if (this.currentTyping) clearInterval(this.currentTyping);
            this.currentTyping = setInterval(() => {
                this.ui.dialogueText.textContent += text.charAt(i);
                i++;
                if (i >= text.length) {
                    clearInterval(this.currentTyping);
                    this.currentTyping = null;
                    if (auto) setTimeout(() => resolve(), 1500);
                    else this.advanceCallback = resolve;
                }
            }, 30);
        });
    }

    advanceDialogue() {
        if (this.advanceCallback) {
            const cb = this.advanceCallback;
            this.advanceCallback = null;
            cb();
        }
    }

    shout(text) {
        const el = this.ui.shoutBubble;
        el.innerText = text;
        el.style.display = 'block';
        el.classList.add('shake');
        setTimeout(() => {
            el.style.display = 'none';
            el.classList.remove('shake');
        }, 1500);
    }

    shakeScreen() {
        this.canvas.style.transform = `translate(${Math.random()*10-5}px, ${Math.random()*10-5}px)`;
        setTimeout(() => this.canvas.style.transform = 'none', 100);
    }

    spawnParticles(x, y, color) {
        for(let i=0; i<20; i++) {
            this.particles.push({
                x: x, y: y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 60,
                size: 4,
                color: color
            });
        }
    }
}


// --- INITIALIZATION ---
// Resize canvas to fit window with aspect ratio
const canvas = document.getElementById('game-canvas');

function resize() {
    const aspect = 4/3;
    let w = window.innerWidth;
    let h = window.innerHeight;
    
    if (w / h > aspect) { 
        w = h * aspect; 
    } else { 
        h = w / aspect; 
    }
    
    if (h > window.innerHeight) {
         h = window.innerHeight;
         w = h * aspect;
    }

    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
}

window.addEventListener('resize', resize);
resize();

// Start Game
document.getElementById('btn-start').addEventListener('click', () => {
    document.getElementById('start-screen').style.display = 'none';
    const engine = new GameEngine(canvas);
    engine.start();
});