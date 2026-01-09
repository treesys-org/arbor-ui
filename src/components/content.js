
import { store } from '../store.js';
import { parseContent } from '../utils/parser.js';
import { github } from '../services/github.js';
import { ContentRenderer } from '../utils/renderer.js';

class ArborContent extends HTMLElement {
    constructor() {
        super();
        this.currentNode = null;
        // Internal UI State
        this.isExpanded = true;
        this.isTocVisible = window.innerWidth >= 768;
        this.lastRenderKey = null; 
        
        this.resetState();
    }

    connectedCallback() {
        store.addEventListener('state-change', (e) => {
            const newNode = e.detail.selectedNode;
            const newId = newNode ? newNode.id : null;
            const currentId = this.currentNode ? this.currentNode.id : null;
            
            // 1. Detect Navigation Change
            if (newId !== currentId) {
                this.currentNode = newNode;
                if (newNode) {
                    this.resetState();
                    // Load Bookmark (Partial Progress)
                    const bookmark = store.getBookmark(newNode.id, newNode.content);
                    if (bookmark) {
                         this.activeSectionIndex = bookmark.index || 0;
                         this.visitedSections = new Set(bookmark.visited || []);
                    }
                    
                    // Default to expanded on open
                    this.isExpanded = true;
                    this.isTocVisible = window.innerWidth >= 768;
                }
                this.render();
                return;
            }

            // 2. Detect Completion Status Change (for Button update)
            if (this.currentNode) {
                this.render();
            } else {
                 if (this.innerHTML !== '') this.render();
            }
        });
        
        // Initial Load
        this.currentNode = store.value.selectedNode;
        if (this.currentNode) {
             const bookmark = store.getBookmark(this.currentNode.id, this.currentNode.content);
             if (bookmark) {
                 this.activeSectionIndex = bookmark.index || 0;
                 this.visitedSections = new Set(bookmark.visited || []);
             }
        }
        this.render();
    }

    resetState() {
        this.quizStates = {};
        this.activeSectionIndex = 0;
        this.visitedSections = new Set(); 
        this.tocFilter = '';
        this.lastRenderKey = null;
    }

    // --- Business Logic ---
    
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
    
    _commitExamPass(showCertificate = false) {
        const passedNode = this.currentNode;
        if (!passedNode) return;

        const parentModuleId = passedNode.parentId;
        if (!parentModuleId) {
            store.closeContent();
            return;
        }

        // --- ORCHESTRATE ALL COMPLETION EVENTS ---
        store.addXP(100);
        store.markComplete(passedNode.id, true);
        store.markBranchComplete(parentModuleId);
        store.harvestSeed(parentModuleId);

        if (showCertificate) {
            setTimeout(() => {
                store.closeContent();
                setTimeout(() => {
                    store.setModal({ type: 'certificate', moduleId: passedNode.id });
                }, 300);
            }, 100);
        } else {
            store.closeContent();
        }
    }

    handleExamPass() {
        this._commitExamPass(true);
    }

    handleClose() {
        if (this.currentNode?.type === 'exam') {
            const allBlocks = parseContent(this.currentNode.content);
            const quizBlock = allBlocks.find(b => b.type === 'quiz');
            if (quizBlock) {
                const state = this.getQuizState(quizBlock.id);
                if (state.finished) {
                    const total = quizBlock.questions.length;
                    const passingScore = Math.ceil(total * 0.8);
                    const didPass = state.score >= passingScore;
                    const isAlreadyCommitted = store.isCompleted(this.currentNode.id);

                    if (didPass && !isAlreadyCommitted) {
                        this._commitExamPass(false); // Silently commit and close
                        return;
                    }
                }
            }
        }
        store.closeContent();
    }

    async completeAndNext() {
        this.visitedSections.add(this.activeSectionIndex);

        const toc = this.getToc();
        if (this.activeSectionIndex < toc.length - 1) {
            this.scrollToSection(this.activeSectionIndex + 1);
        } else {
            if (this.currentNode) {
                store.markComplete(this.currentNode.id, true);
            }
            this.handleClose();
        }
    }

    skipSection() {
        const toc = this.getToc();
        if (this.activeSectionIndex < toc.length - 1) {
            this.scrollToSection(this.activeSectionIndex + 1);
        } else {
            this.handleClose();
        }
    }
    
    startTheExam() {
        const toc = this.getToc();
        const quizSectionIndex = toc.findIndex(item => item.isQuiz);
        if (quizSectionIndex > -1) {
            this.scrollToSection(quizSectionIndex);
        }
    }

    scrollToSection(idx) {
        this.activeSectionIndex = idx;
        if (this.currentNode) {
             store.saveBookmark(
                 this.currentNode.id, 
                 this.currentNode.content, 
                 this.activeSectionIndex, 
                 this.visitedSections
             );
        }

        this.render();
        const el = this.querySelector('#content-area');
        if(el) el.scrollTop = 0;
    }

    getToc() {
        if (!this.currentNode?.content) return [];
        const blocks = parseContent(this.currentNode.content);
        const items = [];
        
        if (blocks.length > 0 && blocks[0].type !== 'h1' && blocks[0].type !== 'h2') {
             items.push({ text: store.ui.introLabel, level: 1, id: 'intro', isQuiz: false });
        }
        
        blocks.forEach((b) => {
            if (b.type === 'h1') items.push({ text: b.text, level: 1, id: b.id, isQuiz: false });
            if (b.type === 'h2') items.push({ text: b.text, level: 2, id: b.id, isQuiz: false });
            if (b.type === 'quiz') items.push({ text: store.ui.quizLabel, level: 1, id: b.id, isQuiz: true });
        });
        
        if (items.length === 0) {
             items.push({ text: store.ui.introLabel, level: 1, id: 'intro', isQuiz: false });
        }

        return items;
    }

    getActiveBlocks(blocks, toc) {
        if (!blocks.length) return [];
        const activeItem = toc[this.activeSectionIndex];
        
        if (toc.length === 1) return blocks;

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
             if (activeItem.id === 'intro') {
                 const firstH = blocks.findIndex(b => b.type.startsWith('h') || b.type === 'quiz');
                 if (firstH !== -1) endIndex = firstH;
             }
        }
        
        return blocks.slice(startIndex, endIndex);
    }

    proposeChange() {
        const repoInfo = github.getRepositoryInfo();
        if (!repoInfo || !this.currentNode) {
            alert('Cannot determine the source repository.');
            return;
        }

        const title = `Sugerencia de Cambio: ${this.currentNode.name}`;
        const bodyTemplate = `
### 📝 Descripción del Cambio
<!-- Por favor, describe aquí el cambio que propones. Sé lo más específico posible. -->


### 📍 Ubicación
- **Archivo:** \`${this.currentNode.sourcePath}\`
- **Lección:** ${this.currentNode.name}

---
*Este issue fue generado automáticamente desde la interfaz de Arbor.*
        `;

        const encodedTitle = encodeURIComponent(title);
        const encodedBody = encodeURIComponent(bodyTemplate.trim());

        const url = `https://github.com/${repoInfo.owner}/${repoInfo.repo}/issues/new?title=${encodedTitle}&body=${encodedBody}`;
        window.open(url, '_blank');
    }

    // --- Render ---

    render() {
        const stateKey = JSON.stringify({
            id: this.currentNode ? this.currentNode.id : null,
            expanded: this.isExpanded,
            tocVisible: this.isTocVisible,
            section: this.activeSectionIndex,
            filter: this.tocFilter,
            quizzes: this.quizStates,
            completed: this.currentNode ? store.isCompleted(this.currentNode.id) : false,
            visitedCount: this.visitedSections ? this.visitedSections.size : 0
        });

        if (stateKey === this.lastRenderKey) return;
        this.lastRenderKey = stateKey;

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
        const progress = Math.round(((this.activeSectionIndex + 1) / toc.length) * 100);
        const canEdit = store.value.githubUser && this.currentNode.sourcePath;

        const isExam = this.currentNode.type === 'exam';
        const quizSectionIndex = isExam ? toc.findIndex(item => item.isQuiz) : -1;
        const onExamIntro = isExam && quizSectionIndex > -1 && this.activeSectionIndex < quizSectionIndex;

        const containerClasses = [
            "fixed", "z-[60]", "bg-white", "dark:bg-slate-900", "shadow-2xl", "flex", "flex-col",
            "transition-all", "duration-500", "ease-[cubic-bezier(0.25,0.8,0.25,1)]",
            "border-l", "border-transparent", "dark:border-slate-800", "no-print",
            "top-0", "right-0", "w-full", "max-w-full",
            "h-[100dvh]"
        ];

        if (!this.isExpanded) {
            containerClasses.push("md:w-[80vw]", "md:max-w-[900px]", "md:top-4", "md:h-[calc(100vh-2rem)]", "md:rounded-l-3xl");
        } else {
            containerClasses.push("md:w-full", "md:max-w-full");
        }

        this.className = ""; 
        this.innerHTML = `
        ${!this.isExpanded ? `<div id="backdrop-overlay" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[55] animate-in fade-in duration-200"></div>` : ''}

        <aside class="${containerClasses.join(' ')} transform translate-x-0">
            <div class="sticky top-0 flex-none px-4 md:px-6 py-4 md:py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm transition-colors z-20 ${!this.isExpanded ? 'md:rounded-tl-3xl' : ''}">
                <div class="flex items-center gap-3 md:gap-4 overflow-hidden">
                    ${toc.length > 1 && !isExam ? `
                        <button id="btn-toggle-toc" class="flex items-center gap-2 px-3 py-2 rounded-lg font-bold transition-colors
                            ${this.isTocVisible
                                ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                                : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
                            <span class="text-sm hidden md:inline">${ui.lessonTopics}</span>
                        </button>
                    ` : ''}
                    <div class="w-px h-8 bg-slate-200 dark:bg-slate-700 hidden md:block"></div>
                    <div class="flex items-center gap-3 min-w-0">
                        <span class="text-xl">${this.currentNode.icon || '📄'}</span>
                        <div class="flex flex-col min-w-0">
                            <h1 class="text-base md:text-xl font-black text-slate-800 dark:text-slate-100 leading-tight tracking-tight truncate">
                                ${this.currentNode.name}
                                ${isExam ? '<span class="ml-2 text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full border border-red-200 align-middle">EXAM</span>' : ''}
                            </h1>
                            ${this.currentNode.path ? `<p class="text-[10px] md:text-xs font-medium text-slate-400 dark:text-slate-500 truncate mt-1">${this.currentNode.path.split(' / ').slice(0, -1).join(' / ')}</p>` : ''}
                        </div>
                    </div>
                </div>

                <div class="flex items-center gap-2 flex-shrink-0">
                   <button id="btn-ask-sage" class="px-3 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 text-purple-600 dark:text-purple-300 font-bold text-xs flex items-center gap-2 border border-purple-100 dark:border-purple-800 transition-colors">
                      🦉 <span class="hidden sm:inline">${ui.navSage}</span>
                   </button>
                   
                   <button id="btn-propose-change" class="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors" title="${ui.proposeChange}">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" /></svg>
                   </button>

                   <button id="btn-export-pdf" class="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors" title="${ui.exportTitle}">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 9.75l-3 3m0 0l3 3m-3-3h7.5M3 16.5v2.25" /></svg>
                   </button>

                   <div class="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>

                   ${canEdit ? `
                   <button id="btn-edit-content" class="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs flex items-center gap-2">
                      ✏️ <span class="hidden sm:inline">${ui.editButton}</span>
                   </button>
                   <div class="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>
                   ` : ''}

                   <button id="btn-close-content" class="w-10 h-10 flex items-center justify-center rounded-full hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                   </button>
                </div>
            </div>

            ${toc.length > 1 && !isExam ? `
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

            <div class="flex-1 flex overflow-hidden bg-slate-50/50 dark:bg-slate-950/30 relative">
                ${toc.length > 1 && !isExam ? `
                    <div id="toc-mobile-backdrop" class="md:hidden absolute inset-0 bg-slate-900/50 z-20 transition-opacity duration-300 ${!this.isTocVisible ? 'opacity-0 pointer-events-none' : 'opacity-100'}"></div>
                    <div class="absolute inset-y-0 left-0 z-30 w-3/4 max-w-xs md:static md:w-auto md:max-w-none flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto custom-scrollbar transition-all duration-300 ease-in-out shadow-xl md:shadow-none transform
                        ${!this.isTocVisible ? '-translate-x-full md:w-0 md:p-0 md:overflow-hidden md:translate-x-0' : 'translate-x-0 md:w-1/4 md:lg:w-1/5 p-6'}">
                        <div class="relative mb-4 whitespace-nowrap">
                            <input id="toc-filter" type="text" placeholder="Filter..." class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-4 py-2 text-sm font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-sky-500 outline-none transition">
                        </div>
                        <nav class="flex flex-col gap-2 md:gap-1 w-full pb-20 md:pb-0">
                             ${filteredToc.map((item, idx) => `
                                <button class="btn-toc text-left py-3 md:py-2 px-3 rounded-lg text-sm font-bold transition-colors w-full flex items-start gap-3 whitespace-normal
                                    ${this.activeSectionIndex === toc.findIndex(t => t.id === item.id)
                                        ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
                                    data-idx="${toc.findIndex(t => t.id === item.id)}" style="padding-left: ${12 + (item.level - 1) * 16}px">
                                    <div class="mt-0.5 flex-shrink-0 w-5 h-5 flex items-center justify-center">
                                        ${this.visitedSections.has(toc.findIndex(t => t.id === item.id)) 
                                            ? '<span class="text-green-500 font-bold">✓</span>' 
                                            : `<span class="w-2 h-2 rounded-full ${this.activeSectionIndex === toc.findIndex(t => t.id === item.id) ? 'bg-sky-500' : 'border border-slate-300'}"></span>` 
                                         }
                                    </div>
                                    <span class="leading-tight break-words">${item.text}</span>
                                </button>
                             `).join('')}
                        </nav>
                    </div>
                ` : ''}

                <div id="content-area" class="flex-1 overflow-y-auto custom-scrollbar p-5 md:p-12 scroll-smooth pb-24 md:pb-12">
                    <div class="max-w-3xl mx-auto w-full pb-32 animate-in fade-in duration-300">
                        <div class="prose prose-slate dark:prose-invert prose-lg max-w-none">
                            ${activeBlocks.map(b => ContentRenderer.renderBlock(b, ui, { 
                                getQuizState: this.getQuizState.bind(this),
                                isCompleted: (id) => store.isCompleted(id),
                                isExam: isExam 
                            })).join('')}
                        </div>

                        ${toc.length > 0 && !isExam ? `
                        <div class="mt-8 pt-8 border-t border-slate-200 dark:border-slate-800 hidden md:flex flex-col-reverse md:flex-row gap-4 justify-between items-center">
                            <button id="btn-prev" class="w-full md:w-auto px-5 py-4 md:py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300" ${this.activeSectionIndex === 0 ? 'disabled' : ''}>
                                <span>${ui.previousSection}</span>
                            </button>
                            <span class="text-sm font-medium text-slate-500 dark:text-slate-400">${this.activeSectionIndex + 1} / ${toc.length}</span>
                            <div class="flex items-center gap-2 w-full md:w-auto">
                                <button id="btn-later" class="group relative px-4 py-3 rounded-xl font-bold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm">
                                    <span>${ui.readLater}</span>
                                </button>
                                <button id="btn-complete" class="px-5 py-4 md:py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all bg-green-500 text-white hover:bg-green-600 shadow-lg shadow-green-500/20">
                                    <span>${this.activeSectionIndex < toc.length - 1 ? ui.nextSection : ui.completeAndNext}</span>
                                </button>
                            </div>
                        </div>
                        ` : ''}
                        
                        ${onExamIntro ? `
                         <div class="mt-8 pt-8 border-t border-slate-200 dark:border-slate-800 flex justify-center">
                             <button id="btn-start-exam" class="px-8 py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-500/20 active:scale-95">
                                 <span>${ui.quizStart} ${ui.quizLabel}</span>
                             </button>
                         </div>
                        ` : ''}

                    </div>
                </div>
            </div>

            <!-- MOBILE FOOTER -->
            ${toc.length > 0 && !isExam ? `
            <div class="md:hidden flex-none bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border-t border-slate-200 dark:border-slate-800 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,20px))] z-20">
                <div class="flex items-center justify-between gap-3 max-w-3xl mx-auto">
                    <button id="btn-prev-mobile" class="w-1/4 justify-center px-4 py-3 rounded-xl font-bold flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 active:scale-95" ${this.activeSectionIndex === 0 ? 'disabled' : ''}>
                        <span>←</span>
                    </button>
                    <div class="text-center">
                        <span class="text-sm font-bold text-slate-500 dark:text-slate-400">${this.activeSectionIndex + 1} / ${toc.length}</span>
                    </div>
                    <button id="btn-complete-mobile" class="w-2/4 justify-center text-center px-4 py-3 rounded-xl font-bold flex items-center gap-2 transition-all bg-green-500 text-white hover:bg-green-600 shadow-lg shadow-green-500/20 active:scale-95">
                        <span class="truncate">${this.activeSectionIndex < toc.length - 1 ? ui.nextSection : ui.completeAndNext}</span>
                    </button>
                </div>
            </div>
            ` : ''}
            
            ${onExamIntro ? `
            <div class="md:hidden flex-none bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border-t border-slate-200 dark:border-slate-800 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,20px))] z-20">
                 <button id="btn-start-exam-mobile" class="w-full justify-center text-center px-4 py-3 rounded-xl font-bold flex items-center gap-2 transition-all bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-500/20 active:scale-95">
                     <span>${ui.quizStart} ${ui.quizLabel}</span>
                 </button>
            </div>
            ` : ''}
        </aside>
        `;

        const safeBind = (selector, fn) => {
            const el = this.querySelector(selector);
            if(el) el.onclick = fn;
        };

        safeBind('#btn-close-content', () => this.handleClose());
        safeBind('#btn-edit-content', () => store.openEditor(this.currentNode));
        safeBind('#btn-ask-sage', () => { store.setModal({ type: 'sage', mode: 'chat' }); });
        safeBind('#btn-export-pdf', () => { store.setModal({ type: 'export-pdf', node: this.currentNode }); });
        safeBind('#btn-propose-change', () => this.proposeChange());
        safeBind('#btn-toggle-toc', () => this.toggleToc());
        safeBind('#toc-mobile-backdrop', () => this.toggleToc());
        safeBind('#btn-prev', () => this.scrollToSection(this.activeSectionIndex - 1));
        safeBind('#btn-prev-mobile', () => this.scrollToSection(this.activeSectionIndex - 1));
        safeBind('#btn-complete', () => this.completeAndNext());
        safeBind('#btn-complete-mobile', () => this.completeAndNext());
        safeBind('#btn-start-exam', () => this.startTheExam());
        safeBind('#btn-start-exam-mobile', () => this.startTheExam());
        safeBind('#btn-later', () => this.skipSection());
        safeBind('#btn-view-certificate', () => this.handleExamPass());

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
                if (window.innerWidth < 768) this.isTocVisible = false;
            };
        });

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
}
customElements.define('arbor-content', ArborContent);
