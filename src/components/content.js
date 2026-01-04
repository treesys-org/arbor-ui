
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
    }

    // --- Logic ---
    
    getQuizState(id) { 
        return this.quizStates[id] || { started: false, finished: false, currentIdx: 0, score: 0 }; 
    }

    startQuiz(id) { 
        this.quizStates[id] = { started: true, finished: false, currentIdx: 0, score: 0 }; 
        this.render(); 
    }

    answerQuiz(id, isCorrect, total) {
        const state = this.getQuizState(id);
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
            this.scrollToSection(this.activeSectionIndex + 1);
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
    
    scrollToSection(idx) {
        this.activeSectionIndex = idx;
        this.visitedSections.add(idx);
        this.render();
        const el = this.querySelector('#content-area');
        if(el) el.scrollTop = 0;
    }

    getToc() {
        if (!this.currentNode?.content) return [];
        const blocks = parseContent(this.currentNode.content);
        const items = [{ text: store.ui.introLabel, level: 1, id: 'intro', isQuiz: false }];
        
        blocks.forEach((b) => {
            if (b.type === 'h1' || b.type === 'h2') {
                items.push({ text: b.text, level: b.type === 'h1' ? 1 : 2, id: b.id, isQuiz: false });
            }
            if (b.type === 'quiz') {
                items.push({ text: store.ui.quizLabel, level: 1, id: b.id, isQuiz: true });
            }
        });
        return items;
    }

    getActiveBlocks(blocks, toc) {
        if (!blocks.length) return [];
        const activeItem = toc[this.activeSectionIndex];
        const nextItem = toc[this.activeSectionIndex + 1];

        let startIndex = 0;
        if (activeItem.id !== 'intro') {
            startIndex = blocks.findIndex(b => b.id === activeItem.id || b.id === activeItem.id);
            if (startIndex === -1) startIndex = 0;
        }

        let endIndex = blocks.length;
        if (nextItem) {
            const nextIndex = blocks.findIndex(b => b.id === nextItem.id);
            if (nextIndex !== -1) endIndex = nextIndex;
        } else {
             // If intro is active, end at first header/quiz
             if (activeItem.id === 'intro') {
                 const firstH = blocks.findIndex(b => b.type.startsWith('h') || b.type === 'quiz');
                 if (firstH !== -1) endIndex = firstH;
             }
        }
        
        return blocks.slice(startIndex, endIndex);
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
        const allBlocks = parseContent(this.currentNode.content);
        const toc = this.getToc();
        const activeBlocks = this.getActiveBlocks(allBlocks, toc);
        
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

            <div class="flex-1 flex overflow-hidden relative">
                <!-- Sidebar TOC (Desktop Only) -->
                ${toc.length > 1 ? `
                <div class="hidden md:block w-64 border-r border-slate-200 dark:border-slate-800 overflow-y-auto custom-scrollbar p-6 bg-slate-50/50 dark:bg-slate-950/30">
                    <h3 class="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h7" /></svg>
                        ${ui.lessonTopics}
                    </h3>
                    <nav class="flex flex-col gap-1">
                        ${toc.map((item, idx) => `
                            <button class="btn-toc text-left py-2 px-3 rounded-lg text-sm font-bold transition-colors w-full flex items-start gap-3
                                ${this.activeSectionIndex === idx ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
                                data-idx="${idx}">
                                <div class="mt-1 flex-shrink-0 w-4 h-4 flex items-center justify-center">
                                    ${this.visitedSections.has(idx) && this.activeSectionIndex !== idx 
                                        ? '<span class="text-green-500">✓</span>' 
                                        : `<span class="w-2 h-2 rounded-full ${this.activeSectionIndex === idx ? 'bg-sky-500' : 'border border-slate-300'}"></span>`}
                                </div>
                                <span class="leading-tight">${item.text}</span>
                            </button>
                        `).join('')}
                    </nav>
                </div>
                ` : ''}

                <!-- Content Area -->
                <div class="flex-1 overflow-y-auto p-8 md:p-12 custom-scrollbar scroll-smooth" id="content-area">
                    <div class="prose dark:prose-invert max-w-3xl mx-auto pb-20">
                        ${activeBlocks.map(b => this.renderBlock(b, ui)).join('')}
                        
                        <!-- Navigation Footer -->
                         <div class="mt-16 pt-8 border-t border-slate-200 dark:border-slate-800 flex flex-col-reverse md:flex-row gap-4 justify-between items-center no-prose">
                             ${this.activeSectionIndex > 0 ? `
                                <button id="btn-prev" class="px-5 py-3 rounded-xl font-bold flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">
                                    <span>← ${ui.previousSection}</span>
                                </button>
                             ` : '<div></div>'}
                             
                             <div class="flex gap-2">
                                 <button id="btn-complete" class="px-6 py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl shadow-lg shadow-green-500/20 transition-all active:scale-95 flex items-center gap-2">
                                    <span>${this.activeSectionIndex < toc.length - 1 ? ui.nextSection : ui.completeAndNext}</span>
                                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                                 </button>
                             </div>
                         </div>
                    </div>
                </div>
            </div>

            <!-- Footer Progress -->
            <footer class="flex-none p-6 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-10">
                 <div class="max-w-3xl mx-auto">
                     <div class="flex justify-between items-center mb-2">
                        <span class="text-xs font-bold text-slate-500 uppercase tracking-widest">${ui.lessonProgress}</span>
                        <span class="text-xs font-bold text-green-500">${progress}%</span>
                     </div>
                     <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                        <div class="bg-green-500 h-full transition-all duration-300" style="width: ${progress}%"></div>
                     </div>
                 </div>
            </footer>
        </div>
        `;

        // Bind events
        const btnPrev = this.querySelector('#btn-prev');
        if(btnPrev) btnPrev.onclick = () => this.scrollToSection(this.activeSectionIndex - 1);

        this.querySelector('#btn-complete').onclick = () => this.completeAndNext();

        this.querySelectorAll('.btn-toc').forEach(b => {
            b.onclick = (e) => this.scrollToSection(parseInt(e.currentTarget.dataset.idx));
        });

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
        
        if (b.type === 'code') return `
            <div class="my-6 rounded-2xl bg-[#1e1e1e] border border-slate-700 overflow-hidden shadow-xl text-sm group not-prose">
                <div class="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-black/20">
                    <div class="flex gap-1.5"><div class="w-3 h-3 rounded-full bg-red-500/20"></div><div class="w-3 h-3 rounded-full bg-yellow-500/20"></div><div class="w-3 h-3 rounded-full bg-green-500/20"></div></div>
                    <span class="text-xs text-slate-500 font-mono uppercase">CODE</span>
                </div><pre class="p-6 overflow-x-auto text-slate-300 font-mono leading-relaxed bg-[#1e1e1e] m-0">${b.text}</pre>
            </div>
        `;

        if (b.type === 'image') return `<img src="${b.src}" class="rounded-xl shadow-lg my-8 w-full" loading="lazy">`;
        if (b.type === 'video') return `<div class="aspect-video rounded-xl overflow-hidden shadow-lg my-8 bg-black"><iframe src="${b.src}" class="w-full h-full" frameborder="0" allowfullscreen></iframe></div>`;
        if (b.type === 'audio') return `<div class="my-6 p-4 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center gap-4 shadow-sm"><div class="text-2xl">🎵</div><audio controls class="w-full" src="${b.src}"></audio></div>`;
        
        if (b.type === 'quiz') {
            const state = this.getQuizState(b.id);
            
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
