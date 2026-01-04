
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

        // Full screen overlay style
        this.className = "fixed inset-0 z-40 flex justify-center bg-slate-900/50 backdrop-blur-sm transition-opacity";
        const ui = store.ui;
        // Parsing content
        const allBlocks = parseContent(this.currentNode.content);
        const toc = this.getToc();
        const activeBlocks = this.getActiveBlocks(allBlocks, toc);
        
        // Progress
        const progress = Math.round(((this.activeSectionIndex + 1) / toc.length) * 100);

        this.innerHTML = `
        <div id="content-backdrop" class="absolute inset-0 z-0"></div>
        
        <!-- Content Container: Full Width/Height with Animations -->
        <div class="relative w-full h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col animate-slide-in overflow-hidden">
            
            <!-- Header -->
            <header class="flex-none px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 z-10">
                <div class="flex items-center gap-4 min-w-0">
                    <div class="w-12 h-12 rounded-lg bg-sky-100 dark:bg-sky-900 text-sky-600 flex items-center justify-center text-2xl shrink-0 shadow-sm">
                        ${this.currentNode.icon || '📄'}
                    </div>
                    <div class="min-w-0">
                         <h2 class="text-xl md:text-2xl font-black text-slate-800 dark:text-white truncate tracking-tight">${this.currentNode.name}</h2>
                         ${this.currentNode.path ? `<p class="text-xs font-bold text-slate-500 uppercase tracking-wider truncate">${this.currentNode.path}</p>` : ''}
                    </div>
                </div>
                <button id="btn-close-content" class="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-8 h-8">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </header>

            <div class="flex-1 flex overflow-hidden relative">
                <!-- Sidebar TOC (Desktop Only) -->
                ${toc.length > 1 ? `
                <div class="hidden md:block w-72 border-r border-slate-200 dark:border-slate-800 overflow-y-auto custom-scrollbar p-6 bg-slate-50/50 dark:bg-slate-950/30 flex-shrink-0">
                    <h3 class="text-xs font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h7" /></svg>
                        ${ui.lessonTopics}
                    </h3>
                    <nav class="flex flex-col gap-2">
                        ${toc.map((item, idx) => `
                            <button class="btn-toc text-left py-3 px-3 rounded-lg text-sm font-bold transition-colors w-full flex items-start gap-3 whitespace-normal
                                ${this.activeSectionIndex === idx ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
                                data-idx="${idx}" style="padding-left: ${12 + (item.level - 1) * 16}px">
                                <div class="mt-0.5 flex-shrink-0 w-5 h-5 flex items-center justify-center">
                                    ${this.visitedSections.has(idx) && this.activeSectionIndex !== idx 
                                        ? '<span class="text-green-500 font-bold">✓</span>' 
                                        : `<span class="w-2 h-2 rounded-full ${this.activeSectionIndex === idx ? 'bg-sky-500' : 'border border-slate-300'}"></span>`}
                                </div>
                                <span class="leading-tight">${item.text}</span>
                            </button>
                        `).join('')}
                    </nav>
                </div>
                ` : ''}

                <!-- Content Area -->
                <div class="flex-1 overflow-y-auto p-5 md:p-12 custom-scrollbar scroll-smooth bg-slate-50/30 dark:bg-slate-900" id="content-area">
                    <div class="prose dark:prose-invert prose-lg max-w-4xl mx-auto pb-32">
                        ${activeBlocks.map(b => this.renderBlock(b, ui)).join('')}
                        
                        <!-- Lesson Progress Bar (Visible inside content) -->
                        ${toc.length > 1 ? `
                            <div class="mt-16 not-prose">
                                <div class="flex justify-between items-center mb-2">
                                    <span class="text-sm font-bold text-slate-600 dark:text-slate-400">${ui.lessonProgress}</span>
                                    <span class="text-sm font-bold text-green-600 dark:text-green-400">${progress}%</span>
                                </div>
                                <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
                                    <div class="bg-green-500 h-2.5 rounded-full transition-all duration-500" style="width: ${progress}%"></div>
                                </div>
                            </div>
                        ` : ''}

                        <!-- Navigation Footer -->
                         <div class="mt-8 pt-8 border-t border-slate-200 dark:border-slate-800 flex flex-col-reverse md:flex-row gap-4 justify-between items-center no-prose">
                             <button id="btn-prev" class="w-full md:w-auto px-5 py-3 rounded-xl font-bold flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed" ${this.activeSectionIndex === 0 ? 'disabled' : ''}>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                                <span>${ui.previousSection}</span>
                             </button>
                             
                             <div class="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto">
                                 <button id="btn-complete" class="w-full md:w-auto px-5 py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl shadow-lg shadow-green-500/20 transition-all active:scale-95 flex items-center justify-center gap-2">
                                    <span>${this.activeSectionIndex < toc.length - 1 ? ui.nextSection : ui.completeAndNext}</span>
                                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                                 </button>
                             </div>
                         </div>
                    </div>
                </div>
            </div>
        </div>
        `;

        // Bind events
        this.querySelector('#content-backdrop').onclick = () => store.closeContent();
        this.querySelector('#btn-close-content').onclick = () => store.closeContent();

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
        if (b.type === 'h1') return `<h1 class="text-3xl md:text-5xl font-black mb-8 border-b border-slate-200 dark:border-slate-800 pb-4 tracking-tight text-slate-900 dark:text-white">${b.text}</h1>`;
        if (b.type === 'h2') return `<h2 class="text-2xl md:text-3xl font-bold mt-12 mb-6 text-slate-800 dark:text-sky-100 flex items-center gap-3">${b.text}</h2>`;
        if (b.type === 'h3') return `<h3 class="text-xl font-bold mt-8 mb-4 text-slate-700 dark:text-slate-200 flex items-center gap-2"><span class="w-2 h-2 bg-sky-500 rounded-full"></span><span>${b.text}</span></h3>`;
        if (b.type === 'p') return `<p class="mb-6 leading-8 text-lg text-slate-700 dark:text-slate-300">${b.text}</p>`;
        
        if (b.type === 'blockquote') return `<blockquote class="bg-yellow-50 dark:bg-yellow-900/10 border-l-4 border-yellow-400 p-6 my-8 rounded-r-xl italic text-slate-700 dark:text-yellow-100/80">"${b.text}"</blockquote>`;

        if (b.type === 'code') return `
            <div class="my-6 rounded-2xl bg-[#1e1e1e] border border-slate-700 overflow-hidden shadow-xl text-sm group not-prose">
                <div class="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-black/20">
                    <div class="flex gap-1.5"><div class="w-3 h-3 rounded-full bg-red-500/20"></div><div class="w-3 h-3 rounded-full bg-yellow-500/20"></div><div class="w-3 h-3 rounded-full bg-green-500/20"></div></div>
                    <span class="text-xs text-slate-500 font-mono uppercase">TERMINAL</span>
                </div><pre class="p-6 overflow-x-auto text-slate-300 font-mono leading-relaxed bg-[#1e1e1e] m-0">${b.text}</pre>
            </div>
        `;

        if (b.type === 'image') return `<figure class="my-10"><img src="${b.src}" class="rounded-xl shadow-lg w-full h-auto" loading="lazy"></figure>`;
        if (b.type === 'video') return `<div class="my-10 aspect-video rounded-xl overflow-hidden shadow-lg bg-black"><iframe src="${b.src}" class="w-full h-full" frameborder="0" allowfullscreen></iframe></div>`;
        if (b.type === 'audio') return `<div class="my-6 p-4 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center gap-4 shadow-sm"><div class="w-10 h-10 bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300 rounded-full flex items-center justify-center text-xl">🎵</div><audio controls class="w-full" src="${b.src}"></audio></div>`;
        
        if (b.type === 'quiz') {
            const state = this.getQuizState(b.id);
            const total = b.questions.length;
            
            if (state.finished) {
                 return `
                 <div class="not-prose my-12 p-8 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 text-center animate-in shadow-xl relative overflow-hidden">
                    <div class="absolute top-0 right-0 p-4 opacity-10 text-9xl">📝</div>
                    <div class="relative z-10">
                        <div class="w-20 h-20 mx-auto rounded-full flex items-center justify-center text-4xl mb-4 shadow-xl ${state.score === total ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}">
                            ${state.score === total ? '🏆' : '👏'}
                        </div>
                        <h3 class="text-xl font-black text-slate-800 dark:text-white mb-1">${ui.quizCompleted}</h3>
                        <p class="text-slate-500 dark:text-slate-400 mb-6">${ui.quizScore} <strong class="text-slate-900 dark:text-white">${state.score} / ${total}</strong></p>
                        <button class="btn-quiz-retry px-6 py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-200 font-bold rounded-lg text-sm transition-colors" data-id="${b.id}">${ui.quizRetry}</button>
                    </div>
                 </div>`;
            }

            if (!state.started) {
                return `
                <div class="not-prose my-12 p-8 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 text-center shadow-xl relative overflow-hidden">
                    <div class="absolute top-0 right-0 p-4 opacity-10 text-9xl">📝</div>
                    <div class="relative z-10">
                        <h3 class="text-xl font-bold text-slate-800 dark:text-white mb-2">${ui.quizTitle}</h3>
                        <p class="text-slate-500 dark:text-slate-400 mb-6 text-sm">${total} ${ui.quizIntro}</p>
                        <button class="btn-quiz-start px-8 py-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-lg shadow-purple-600/20 transition-transform hover:scale-105 active:scale-95" data-id="${b.id}">${ui.quizStart}</button>
                    </div>
                </div>`;
            }
            
            const q = b.questions[state.currentIdx];
            return `
            <div class="not-prose my-12 p-8 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-xl animate-in slide-in-from-right-8 duration-300">
                <!-- Progress Bar -->
                <div class="flex gap-1 mb-6">
                    ${Array(total).fill(0).map((_, i) => `<div class="h-1.5 flex-1 rounded-full transition-colors ${i <= state.currentIdx ? 'bg-purple-500' : 'bg-slate-200 dark:bg-slate-700'}"></div>`).join('')}
                </div>

                <span class="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 block">${ui.quizQuestionPrefix} ${state.currentIdx + 1}</span>
                <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-6 leading-snug">${q.question}</h3>
                
                <div class="space-y-3">
                    ${q.options.map((opt, i) => `
                        <button class="btn-quiz-ans w-full text-left p-4 rounded-xl border-2 font-bold transition-all duration-200 flex items-center gap-3 group bg-white dark:bg-slate-900/50 border-slate-100 dark:border-slate-700 hover:border-purple-500 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm"
                         data-id="${b.id}" data-correct="${opt.correct}" data-total="${total}">
                            <span class="w-6 h-6 rounded-full border-2 border-slate-300 dark:border-slate-500 flex items-center justify-center text-[10px] group-hover:border-purple-500 group-hover:bg-purple-500 group-hover:text-white transition-colors flex-shrink-0">${['A','B','C','D'][i]}</span>
                            <span>${opt.text}</span>
                        </button>
                    `).join('')}
                </div>
            </div>`;
        }

        if (b.type === 'list') {
            return `<ul class="space-y-2 my-6 pl-4">${b.items.map(i => `<li class="flex items-start gap-3 text-slate-700 dark:text-slate-300 leading-relaxed"><span class="mt-2 w-1.5 h-1.5 bg-sky-500 rounded-full flex-shrink-0"></span><span>${i}</span></li>`).join('')}</ul>`;
        }

        return '';
    }
}
customElements.define('arbor-content', ArborContent);
