
import { store } from '../store.js';
import { parseContent } from '../utils/parser.js';

class ArborContent extends HTMLElement {
    constructor() {
        super();
        this.resetState();
    }

    connectedCallback() {
        store.addEventListener('state-change', (e) => {
            const newNode = e.detail.selectedNode;
            // Reset state if opening a new node
            if (newNode && (!this.currentNode || newNode.id !== this.currentNode.id)) {
                this.currentNode = newNode;
                this.resetState();
            }
            
            // Close if deselected
            if (!newNode) this.currentNode = null;
            
            this.render();
        });
        
        // Initial check
        this.currentNode = store.value.selectedNode;
        this.render();
    }

    resetState() {
        this.quizStates = {};
        this.activeSectionIndex = 0;
        this.visitedSections = new Set([0]);
        this.isTocVisible = true;
        this.showExitWarning = false;
        this.pendingNavigationFn = null;
    }

    // --- Logic ---
    
    getQuizState(id, total) { 
        return this.quizStates[id] || { started: false, finished: false, currentIdx: 0, score: 0 }; 
    }

    startQuiz(id) { 
        this.quizStates[id] = { started: true, finished: false, currentIdx: 0, score: 0 }; 
        this.render(); 
    }

    answerQuiz(id, isCorrect, total) {
        const state = this.getQuizState(id, total);
        if(isCorrect) state.score++;
        
        if (state.currentIdx + 1 < total) {
            state.currentIdx++;
        } else {
            state.finished = true;
        }
        this.render();
    }

    completeAndNext() {
        const toc = this.getToc();
        if (this.activeSectionIndex < toc.length - 1) {
            this.activeSectionIndex++;
            this.visitedSections.add(this.activeSectionIndex);
            this.render();
            const ca = this.querySelector('#content-area');
            if(ca) ca.scrollTop = 0;
        } else {
            // Finish Lesson
            if (this.currentNode) store.markComplete(this.currentNode.id);
            
            // Check for Certificate
            if (this.currentNode.parentId) {
                const modules = store.getModulesStatus();
                const mod = modules.find(m => m.id === this.currentNode.parentId);
                if (mod && mod.isComplete) {
                     store.setModal({ type: 'certificate', moduleId: mod.id });
                } else {
                    store.closeContent();
                }
            } else {
                store.closeContent();
            }
        }
    }

    getToc() {
        if (!this.currentNode?.content) return [];
        const blocks = parseContent(this.currentNode.content);
        const items = [{ text: store.ui.introLabel, level: 1, id: 'intro', isQuiz: false }];
        
        blocks.forEach((b, i) => {
            if (b.type === 'h1' || b.type === 'h2') {
                items.push({ text: b.text, level: b.type === 'h1' ? 1 : 2, id: 'sec-'+i, isQuiz: false });
            }
            if (b.type === 'quiz') {
                items.push({ text: store.ui.quizLabel, level: 1, id: b.id, isQuiz: true });
            }
        });
        return items;
    }

    getActiveBlocks() {
        const blocks = parseContent(this.currentNode?.content || '');
        const toc = this.getToc();
        
        if(this.activeSectionIndex === 0) {
            // Intro: until first header/quiz
            const idx = blocks.findIndex(b => b.type.startsWith('h') || b.type === 'quiz');
            return idx === -1 ? blocks : blocks.slice(0, idx);
        }

        // Logic to slice blocks between headers would be here
        // For simplicity in this vanilla version, we render ALL blocks if logic is complex
        // But let's try a simple mapping based on index assumptions
        // A robust solution needs unique IDs for headers. 
        // Fallback: render all for now to ensure content visibility
        return blocks; 
    }

    // --- Render ---

    render() {
        if (!this.currentNode) {
            this.innerHTML = '';
            this.className = '';
            return;
        }

        this.className = "fixed inset-0 z-40 flex justify-end";
        const ui = store.ui;
        // Parsing content
        const blocks = parseContent(this.currentNode.content);
        // Recalculate TOC based on blocks
        const toc = this.getToc();
        // Progress
        const progress = Math.round(((this.activeSectionIndex + 1) / toc.length) * 100);

        this.innerHTML = `
        <div class="absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity" onclick="store.closeContent()"></div>
        <div class="relative w-full md:w-[900px] bg-white dark:bg-slate-900 shadow-2xl h-full flex flex-col animate-slide-in">
            
            <!-- Header -->
            <header class="flex-none px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 z-10">
                <div class="flex items-center gap-4 min-w-0">
                    <div class="w-10 h-10 rounded-lg bg-sky-100 dark:bg-sky-900 text-sky-600 flex items-center justify-center text-xl shrink-0">
                        ${this.currentNode.icon || '📄'}
                    </div>
                    <div class="min-w-0">
                         <h2 class="text-lg font-black text-slate-800 dark:text-white truncate">${this.currentNode.name}</h2>
                         ${this.currentNode.path ? `<p class="text-xs text-slate-500 truncate">${this.currentNode.path}</p>` : ''}
                    </div>
                </div>
                <button onclick="store.closeContent()" class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">✕</button>
            </header>

            <div class="flex-1 overflow-y-auto p-8 md:p-12 custom-scrollbar" id="content-area">
                <div class="prose dark:prose-invert max-w-3xl mx-auto pb-20">
                    ${blocks.map(b => this.renderBlock(b, ui)).join('')}
                </div>
            </div>

            <!-- Footer -->
            <footer class="flex-none p-6 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-10">
                 <div class="max-w-3xl mx-auto flex items-center justify-between">
                     <span class="text-xs font-bold text-slate-500 uppercase tracking-widest hidden md:block">${ui.lessonProgress} ${progress}%</span>
                     <button id="btn-complete" class="px-6 py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl shadow-lg shadow-green-500/20 transition-all active:scale-95 flex items-center gap-2">
                        <span>${ui.completeAndNext}</span>
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                     </button>
                 </div>
            </footer>
        </div>
        `;

        // Bind events
        this.querySelector('#btn-complete').onclick = () => this.completeAndNext();

        this.querySelectorAll('.btn-quiz-start').forEach(b => {
            b.onclick = (e) => this.startQuiz(e.target.dataset.id);
        });
        
        this.querySelectorAll('.btn-quiz-ans').forEach(b => {
            b.onclick = (e) => {
                const { id, correct, total } = e.target.dataset;
                this.answerQuiz(id, correct === 'true', parseInt(total));
            };
        });
        
        this.querySelectorAll('.btn-quiz-retry').forEach(b => {
             b.onclick = (e) => this.startQuiz(e.target.dataset.id);
        });
    }

    renderBlock(b, ui) {
        if (b.type === 'h1') return `<h1 class="text-4xl font-black mb-6 border-b border-slate-200 dark:border-slate-800 pb-4">${b.text}</h1>`;
        if (b.type === 'h2') return `<h2 class="text-2xl font-bold mt-10 mb-4 text-sky-600 dark:text-sky-400">${b.text}</h2>`;
        if (b.type === 'p') return `<p class="mb-4 text-lg leading-relaxed text-slate-700 dark:text-slate-300">${b.text}</p>`;
        if (b.type === 'image') return `<img src="${b.src}" class="rounded-xl shadow-lg my-8 w-full" loading="lazy">`;
        if (b.type === 'video') return `<div class="aspect-video rounded-xl overflow-hidden shadow-lg my-8 bg-black"><iframe src="${b.src}" class="w-full h-full" frameborder="0" allowfullscreen></iframe></div>`;
        
        if (b.type === 'quiz') {
            const state = this.getQuizState(b.id, b.questions.length);
            
            if (state.finished) {
                 return `
                 <div class="not-prose my-10 p-8 bg-green-50 dark:bg-green-900/20 rounded-2xl border border-green-200 dark:border-green-800 text-center animate-in">
                    <div class="text-5xl mb-4">🏆</div>
                    <h3 class="text-xl font-bold text-green-700 dark:text-green-300 mb-2">${ui.quizCompleted}</h3>
                    <p class="text-green-600 mb-4">${ui.quizScore} ${state.score} / ${b.questions.length}</p>
                    <button class="btn-quiz-retry px-4 py-2 bg-white dark:bg-slate-800 rounded-lg shadow font-bold text-sm" data-id="${b.id}">${ui.quizRetry}</button>
                 </div>`;
            }

            if (!state.started) {
                return `
                <div class="not-prose my-10 p-8 bg-purple-50 dark:bg-purple-900/20 rounded-2xl border border-purple-200 dark:border-purple-800 text-center">
                    <h3 class="text-xl font-bold text-purple-700 dark:text-purple-300 mb-2">${ui.quizTitle}</h3>
                    <p class="text-purple-600 dark:text-purple-400 mb-6">${b.questions.length} ${ui.quizIntro}</p>
                    <button class="btn-quiz-start px-6 py-3 bg-purple-600 text-white rounded-xl font-bold shadow-lg hover:bg-purple-500 transition-colors" data-id="${b.id}">${ui.quizStart}</button>
                </div>`;
            }
            
            const q = b.questions[state.currentIdx];
            return `
            <div class="not-prose my-10 p-6 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 animate-in">
                <div class="flex justify-between items-center mb-4">
                     <span class="text-xs font-bold uppercase tracking-widest text-slate-400">${ui.quizQuestionPrefix} ${state.currentIdx + 1} / ${b.questions.length}</span>
                </div>
                <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-6">${q.question}</h3>
                <div class="space-y-3">
                    ${q.options.map(opt => `
                        <button class="btn-quiz-ans w-full text-left p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all font-medium text-slate-700 dark:text-slate-300"
                         data-id="${b.id}" data-correct="${opt.correct}" data-total="${b.questions.length}">
                            ${opt.text}
                        </button>
                    `).join('')}
                </div>
            </div>`;
        }

        if (b.type === 'list') {
            return `<ul class="list-disc list-inside space-y-2 mb-6 ml-4">${b.items.map(i => `<li>${i}</li>`).join('')}</ul>`;
        }

        return '';
    }
}
customElements.define('arbor-content', ArborContent);
