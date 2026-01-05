

import { store } from '../store.js';
import { parseContent } from '../utils/parser.js';

class ArborContent extends HTMLElement {
    constructor() {
        super();
        this.currentNode = null;
        // Estado interno de UI
        this.isExpanded = true;
        this.isTocVisible = window.innerWidth >= 768;
        
        this.resetState();
    }

    connectedCallback() {
        store.addEventListener('state-change', (e) => {
            const newNode = e.detail.selectedNode;
            
            // Si cambiamos de nodo, reseteamos el scroll y estado de quiz
            if (newNode && (!this.currentNode || newNode.id !== this.currentNode.id)) {
                this.currentNode = newNode;
                this.resetState();
                // Por defecto abrimos expandido
                this.isExpanded = true;
                this.isTocVisible = window.innerWidth >= 768;
            }
            
            // Si se deselecciona, limpiamos
            if (!newNode) {
                this.currentNode = null;
            }
            
            this.render();
        });
        
        // Carga inicial
        this.currentNode = store.value.selectedNode;
        this.render();
    }

    resetState() {
        this.quizStates = {};
        this.activeSectionIndex = 0;
        this.visitedSections = new Set([0]);
        this.tocFilter = '';
    }

    // --- Lógica de Negocio ---
    
    toggleExpanded() {
        this.isExpanded = !this.isExpanded;
        this.render();
    }

    toggleToc() {
        this.isTocVisible = !this.isTocVisible;
        this.render();
    }

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
            // Terminar lección
            if (this.currentNode) store.markComplete(this.currentNode.id);
            
            // Chequear certificado del módulo padre
            if (this.currentNode.parentId) {
                const modules = store.getModulesStatus();
                const mod = modules.find(m => m.id === this.currentNode.parentId);
                if (mod && mod.isComplete) {
                     store.setModal({ type: 'certificate', moduleId: mod.id });
                } else {
                    store.navigateToNextLeaf(); // Navegar a la siguiente lección automáticamente
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
        
        let h1Count = 0;
        let h2Count = 0;

        blocks.forEach((b) => {
            if (b.type === 'h1') {
                h1Count++; h2Count = 0;
                items.push({ text: b.text, level: 1, id: b.id, isQuiz: false });
            }
            if (b.type === 'h2') {
                h2Count++;
                items.push({ text: b.text, level: 2, id: b.id, isQuiz: false });
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
            startIndex = blocks.findIndex(b => b.id === activeItem.id);
            if (startIndex === -1) startIndex = 0;
        }

        let endIndex = blocks.length;
        if (nextItem) {
            const nextIndex = blocks.findIndex(b => b.id === nextItem.id);
            if (nextIndex !== -1) endIndex = nextIndex;
        } else {
             // Si es la intro, termina en el primer header o quiz
             if (activeItem.id === 'intro') {
                 const firstH = blocks.findIndex(b => b.type.startsWith('h') || b.type === 'quiz');
                 if (firstH !== -1) endIndex = firstH;
             }
        }
        
        return blocks.slice(startIndex, endIndex);
    }

    // --- Renderizado ---

    render() {
        if (!this.currentNode) {
            this.innerHTML = '';
            this.className = '';
            return;
        }

        const ui = store.ui;
        const allBlocks = parseContent(this.currentNode.content);
        const toc = this.getToc();
        const filteredToc = this.tocFilter
            ? toc.filter(item => item.text.toLowerCase().includes(this.tocFilter.toLowerCase()))
            : toc;

        const activeBlocks = this.getActiveBlocks(allBlocks, toc);
        
        // Cálculo de progreso
        const progress = Math.round(((this.activeSectionIndex + 1) / toc.length) * 100);

        // Clases dinámicas para el contenedor principal (Efecto Modal vs Panel Lateral)
        const containerClasses = [
            "fixed", "z-40", "bg-white", "dark:bg-slate-900", "shadow-2xl", "flex", "flex-col",
            "transition-all", "duration-500", "ease-[cubic-bezier(0.25,0.8,0.25,1)]",
            "border-l", "border-transparent", "dark:border-slate-800", "no-print",
            "top-0", "bottom-0", "right-0", "w-full", "max-w-full"
        ];

        if (!this.isExpanded) {
            // Modo Panel Lateral
            containerClasses.push("md:w-[80vw]", "md:max-w-[900px]", "md:top-4", "md:bottom-4", "md:rounded-l-3xl");
        } else {
            // Modo Pantalla Completa
            containerClasses.push("md:w-full", "md:max-w-full");
        }

        // --- TEMPLATE ---
        this.className = ""; // Limpiamos clases del host element para usar el inner wrapper
        this.innerHTML = `
        <!-- Backdrop para modo panel (click fuera cierra) -->
        ${!this.isExpanded ? `<div id="backdrop-overlay" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-30 animate-in fade-in duration-200"></div>` : ''}

        <!-- Panel Principal -->
        <aside class="${containerClasses.join(' ')} transform translate-x-0">
            
            <!-- Header -->
            <div class="sticky top-0 flex-none px-4 md:px-6 py-4 md:py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm transition-colors z-20 ${!this.isExpanded ? 'md:rounded-tl-3xl' : ''}">
                
                <div class="flex items-center gap-3 md:gap-4 overflow-hidden">
                    <!-- TOC Toggle Button -->
                    ${toc.length > 1 ? `
                        <button id="btn-toggle-toc" class="flex items-center gap-2 px-3 py-2 rounded-lg font-bold transition-colors
                            ${this.isTocVisible
                                ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                                : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-5 h-5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                            </svg>
                            <span class="text-sm md:hidden">${ui.lessonTopics}</span>
                            <span class="text-sm hidden md:inline">${ui.lessonTopics}</span>
                        </button>
                    ` : ''}

                    <div class="w-px h-8 bg-slate-200 dark:bg-slate-700 hidden md:block"></div>

                    <div class="flex items-center gap-3 min-w-0">
                        <span class="text-xl">${this.currentNode.icon || '📄'}</span>
                        <div class="flex flex-col min-w-0">
                            <h1 class="text-base md:text-xl font-black text-slate-800 dark:text-slate-100 leading-tight tracking-tight truncate">
                                ${this.currentNode.name}
                            </h1>
                            ${this.currentNode.path ? `<p class="text-[10px] md:text-xs font-medium text-slate-400 dark:text-slate-500 truncate mt-1">${this.currentNode.path.split(' / ').slice(0, -1).join(' / ')}</p>` : ''}
                        </div>
                    </div>
                </div>

                <div class="flex items-center gap-2 flex-shrink-0">
                   <!-- Botón Cerrar -->
                   <button id="btn-close-content" class="p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                   </button>
                </div>
            </div>

            <!-- Barra de Progreso -->
            ${toc.length > 1 ? `
                <div class="px-4 md:px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm flex-none">
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-xs font-bold text-slate-500 dark:text-slate-400">${ui.lessonProgress}</span>
                        <span class="text-xs font-bold text-green-600 dark:text-green-400">${progress}%</span>
                    </div>
                    <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                        <div class="bg-green-500 h-2 rounded-full transition-all duration-500" style="width: ${progress}%"></div>
                    </div>
                </div>
            ` : ''}

            <!-- Cuerpo Principal -->
            <div class="flex-1 flex overflow-hidden bg-slate-50/50 dark:bg-slate-950/30 relative">
                
                <!-- SIDEBAR TOC -->
                ${toc.length > 1 ? `
                    <!-- Mobile Backdrop -->
                    <div id="toc-mobile-backdrop" class="md:hidden absolute inset-0 bg-slate-900/50 z-20 transition-opacity duration-300 ${!this.isTocVisible ? 'opacity-0 pointer-events-none' : 'opacity-100'}"></div>

                    <!-- Sidebar Container -->
                    <div class="absolute inset-y-0 left-0 z-30 w-3/4 max-w-xs md:static md:w-auto md:max-w-none flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto custom-scrollbar transition-all duration-300 ease-in-out shadow-xl md:shadow-none transform
                        ${!this.isTocVisible ? '-translate-x-full md:w-0 md:p-0 md:overflow-hidden md:translate-x-0' : 'translate-x-0 md:w-1/4 md:lg:w-1/5 p-6'}">
                        
                        <div class="relative mb-4 whitespace-nowrap">
                            <svg class="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                            <input id="toc-filter" type="text" placeholder="Filter topics..." class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-sky-500 outline-none transition">
                        </div>

                        <nav class="flex flex-col gap-2 md:gap-1 w-full pb-20 md:pb-0">
                             ${filteredToc.length > 0
                                ? filteredToc.map((item, idx) => `
                                <button class="btn-toc text-left py-3 md:py-2 px-3 rounded-lg text-sm font-bold transition-colors w-full flex items-start gap-3 whitespace-normal
                                    ${this.activeSectionIndex === toc.findIndex(t => t.id === item.id)
                                        ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
                                    data-idx="${toc.findIndex(t => t.id === item.id)}" style="padding-left: ${12 + (item.level - 1) * 16}px">
                                    
                                    <div class="mt-0.5 flex-shrink-0 w-5 h-5 flex items-center justify-center">
                                        ${this.visitedSections.has(toc.findIndex(t => t.id === item.id)) && this.activeSectionIndex !== toc.findIndex(t => t.id === item.id)
                                            ? '<span class="text-green-500 font-bold">✓</span>'
                                            : `<span class="w-2 h-2 rounded-full ${this.activeSectionIndex === toc.findIndex(t => t.id === item.id) ? 'bg-sky-500' : 'border border-slate-300'}"></span>`}
                                    </div>
                                    <span class="leading-tight break-words">${item.text}</span>
                                </button>
                             `).join('')
                             : `<div class="text-center py-8 text-sm text-slate-400">${ui.noResults}</div>`
                             }
                        </nav>
                    </div>

                ` : ''}

                <!-- Content Area -->
                <div id="content-area" class="flex-1 overflow-y-auto custom-scrollbar p-5 md:p-12 scroll-smooth pb-24 md:pb-12">
                    <div class="max-w-3xl mx-auto w-full pb-32 animate-in fade-in duration-300">
                        
                        <!-- Bloques de Contenido -->
                        <div class="prose prose-slate dark:prose-invert prose-lg max-w-none">
                            ${activeBlocks.map(b => this.renderBlock(b, ui)).join('')}
                        </div>

                        <!-- Footer Navegación (Desktop) -->
                        ${toc.length > 0 ? `
                        <div class="mt-8 pt-8 border-t border-slate-200 dark:border-slate-800 hidden md:flex flex-col-reverse md:flex-row gap-4 justify-between items-center">
                            <button id="btn-prev" class="w-full md:w-auto px-5 py-4 md:py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300" ${this.activeSectionIndex === 0 ? 'disabled' : ''}>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                                <span>${ui.previousSection}</span>
                            </button>
                            
                            <span class="text-sm font-medium text-slate-500 dark:text-slate-400">${this.activeSectionIndex + 1} / ${toc.length}</span>
                            
                            <div class="flex items-center gap-2 w-full md:w-auto">
                                <button id="btn-later" class="group relative px-4 py-3 rounded-xl font-bold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm">
                                    <span>${ui.readLater}</span>
                                </button>
                                <button id="btn-complete" class="px-5 py-4 md:py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all bg-green-500 text-white hover:bg-green-600 shadow-lg shadow-green-500/20">
                                    <span>${this.activeSectionIndex < toc.length - 1 ? ui.nextSection : ui.completeAndNext}</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                                </button>
                            </div>
                        </div>
                        ` : ''}

                    </div>
                </div>
            </div>

            <!-- MOBILE FOOTER -->
            ${toc.length > 0 ? `
            <div class="md:hidden flex-none bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border-t border-slate-200 dark:border-slate-800 p-3 z-20">
                <div class="flex items-center justify-between gap-3 max-w-3xl mx-auto">
                    <button id="btn-prev-mobile" class="w-1/4 justify-center px-4 py-3 rounded-xl font-bold flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 active:scale-95" ${this.activeSectionIndex === 0 ? 'disabled' : ''}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                    </button>
                    
                    <div class="text-center">
                        <span class="text-sm font-bold text-slate-500 dark:text-slate-400">${this.activeSectionIndex + 1} / ${toc.length}</span>
                    </div>
                    
                    <button id="btn-complete-mobile" class="w-2/4 justify-center text-center px-4 py-3 rounded-xl font-bold flex items-center gap-2 transition-all bg-green-500 text-white hover:bg-green-600 shadow-lg shadow-green-500/20 active:scale-95">
                        <span class="truncate">${this.activeSectionIndex < toc.length - 1 ? ui.nextSection : ui.completeAndNext}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-4 h-4 flex-shrink-0"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                    </button>
                </div>
            </div>
            ` : ''}
        </aside>
        `;

        // --- Bindings de Eventos ---
        
        const safeBind = (selector, fn) => {
            const el = this.querySelector(selector);
            if(el) el.onclick = fn;
        };

        safeBind('#backdrop-overlay', () => store.closeContent());
        safeBind('#btn-close-content', () => store.closeContent());
        
        safeBind('#btn-toggle-toc', () => this.toggleToc());
        safeBind('#btn-toggle-toc-mobile', () => this.toggleToc());
        safeBind('#toc-mobile-backdrop', () => this.toggleToc());

        safeBind('#btn-prev', () => this.scrollToSection(this.activeSectionIndex - 1));
        safeBind('#btn-prev-mobile', () => this.scrollToSection(this.activeSectionIndex - 1));
        safeBind('#btn-complete', () => this.completeAndNext());
        safeBind('#btn-complete-mobile', () => this.completeAndNext());
        safeBind('#btn-later', () => store.closeContent());

        const tocFilterInput = this.querySelector('#toc-filter');
        if (tocFilterInput) {
            tocFilterInput.value = this.tocFilter;
            tocFilterInput.oninput = (e) => {
                this.tocFilter = e.target.value;
                this.render();
                this.querySelector('#toc-filter')?.focus();
            };
        }

        this.querySelectorAll('.btn-toc').forEach(b => {
            b.onclick = (e) => {
                this.scrollToSection(parseInt(e.currentTarget.dataset.idx));
                if (window.innerWidth < 768) this.isTocVisible = false; // Auto close mobile
            };
        });

        // Quiz bindings
        this.querySelectorAll('.btn-quiz-start').forEach(b => {
            b.onclick = (e) => this.startQuiz(e.currentTarget.dataset.id);
        });
        
        this.querySelectorAll('.btn-quiz-ans').forEach(b => {
            b.onclick = (e) => {
                const { id, correct, total } = e.currentTarget.dataset;
                this.answerQuiz(id, correct === 'true', parseInt(total));
            };
        });
        
        this.querySelectorAll('.btn-quiz-retry').forEach(b => {
             b.onclick = (e) => this.startQuiz(e.currentTarget.dataset.id);
        });
    }

    // --- Renderizado de Bloques ---
    
    renderBlock(b, ui) {
        if (b.type === 'h1') return `<h1 id="${b.id}" class="text-3xl md:text-5xl font-black text-slate-900 dark:text-white mb-6 md:mb-8 pb-4 border-b border-slate-200 dark:border-slate-800 tracking-tight">${b.text}</h1>`;
        if (b.type === 'h2') return `<h2 id="${b.id}" class="text-2xl md:text-3xl font-bold text-slate-800 dark:text-sky-100 mt-10 md:mt-12 mb-6 group flex items-center gap-3">${b.text}</h2>`;
        if (b.type === 'h3') return `<h3 id="${b.id}" class="text-xl font-bold text-slate-700 dark:text-slate-200 mt-8 mb-4 flex items-center gap-2"><span class="w-2 h-2 bg-sky-500 rounded-full"></span><span>${b.text}</span></h3>`;
        if (b.type === 'p') return `<p class="mb-6 text-slate-600 dark:text-slate-300 leading-8 text-base md:text-lg">${b.text}</p>`;
        
        if (b.type === 'blockquote') return `<blockquote class="bg-yellow-50 dark:bg-yellow-900/10 border-l-4 border-yellow-400 p-6 my-8 rounded-r-xl italic text-slate-700 dark:text-yellow-100/80">"${b.text}"</blockquote>`;

        if (b.type === 'code') return `
            <div class="my-6 rounded-2xl bg-[#1e1e1e] border border-slate-700 overflow-hidden shadow-xl text-sm group not-prose">
                <div class="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-black/20">
                    <div class="flex gap-1.5"><div class="w-3 h-3 rounded-full bg-red-500/20"></div><div class="w-3 h-3 rounded-full bg-yellow-500/20"></div><div class="w-3 h-3 rounded-full bg-green-500/20"></div></div>
                    <span class="text-xs text-slate-500 font-mono uppercase">TERMINAL</span>
                </div><pre class="p-6 overflow-x-auto text-slate-300 font-mono leading-relaxed bg-[#1e1e1e] m-0">${b.text}</pre>
            </div>
        `;

        if (b.type === 'image') return `
            <figure class="my-10">
                <img src="${b.src}" class="rounded-xl shadow-lg w-full h-auto" loading="lazy">
                ${b.caption ? `<figcaption class="text-center text-sm text-slate-500 mt-2">${b.caption}</figcaption>` : ''}
            </figure>`;
            
        if (b.type === 'video') return `
            <div class="my-10">
                <div class="relative w-full pb-[56.25%] h-0 rounded-xl overflow-hidden shadow-lg bg-black">
                    <iframe src="${b.src}" class="absolute top-0 left-0 w-full h-full" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                </div>
            </div>`;
            
        if (b.type === 'audio') return `
            <div class="my-6 p-4 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center gap-4 shadow-sm">
                <div class="w-10 h-10 bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300 rounded-full flex items-center justify-center text-xl">🎵</div>
                <audio controls class="w-full" src="${b.src}"></audio>
            </div>`;
        
        if (b.type === 'quiz') {
            const state = this.getQuizState(b.id);
            const total = b.questions.length;
            
            // Render Quiz UI
            if (state.finished) {
                 return `
                 <div id="${b.id}" class="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 p-6 md:p-8 relative overflow-hidden transition-all">
                    <div class="absolute top-0 right-0 p-4 opacity-10 text-9xl">📝</div>
                    <div class="relative z-10 text-center py-4 animate-in fade-in zoom-in duration-300">
                        <div class="w-20 h-20 mx-auto rounded-full flex items-center justify-center text-4xl mb-4 shadow-xl ${state.score === total ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}">
                            ${state.score === total ? '🏆' : '👏'}
                        </div>
                        <h3 class="text-xl font-black text-slate-800 dark:text-white mb-1">${ui.quizCompleted}</h3>
                        <p class="text-slate-500 dark:text-slate-400 mb-6">${ui.quizScore} <strong class="text-slate-900 dark:text-white">${state.score} / ${total}</strong></p>
                        <button class="btn-quiz-retry w-full md:w-auto px-6 py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-200 font-bold rounded-lg text-sm transition-colors" data-id="${b.id}">${ui.quizRetry}</button>
                    </div>
                 </div>`;
            }

            if (!state.started) {
                return `
                <div id="${b.id}" class="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 p-6 md:p-8 relative overflow-hidden transition-all text-center">
                    <div class="absolute top-0 right-0 p-4 opacity-10 text-9xl">📝</div>
                    <div class="relative z-10 py-4">
                        <h3 class="text-xl font-bold text-slate-800 dark:text-white mb-2">${ui.quizTitle}</h3>
                        <p class="text-slate-500 dark:text-slate-400 mb-6 text-sm">${total} ${ui.quizIntro}</p>
                        <button class="btn-quiz-start w-full md:w-auto px-8 py-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-lg shadow-purple-600/20 transition-transform hover:scale-105 active:scale-95" data-id="${b.id}">${ui.quizStart}</button>
                    </div>
                </div>`;
            }
            
            const q = b.questions[state.currentIdx];
            return `
            <div id="${b.id}" class="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 p-6 md:p-8 relative overflow-hidden transition-all">
                <div class="animate-in slide-in-from-right-8 duration-300 relative z-10">
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