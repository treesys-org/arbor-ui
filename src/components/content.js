
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
        // "Read Later" logic: 
        // 1. Remove the visual tick from the current section (Syllabus)
        this.visitedSections.delete(this.activeSectionIndex);

        // 2. Ensure the node is NOT marked complete globally
        if (this.currentNode && store.isCompleted(this.currentNode.id)) {
            store.markComplete(this.currentNode.id, false);
        }

        // 3. Update bookmark to reflect incomplete state
        if (this.currentNode) {
            store.saveBookmark(
                this.currentNode.id,
                this.currentNode.content,
                this.activeSectionIndex,
                this.visitedSections
            );
        }

        const toc = this.getToc();
        // If not the last section, go to next
        if (this.activeSectionIndex < toc.length - 1) {
            this.scrollToSection(this.activeSectionIndex + 1);
        } else {
            // Close if it's the last one
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
    
    // Toggle the bookmark status via UI button
    toggleBookmark() {
        if (!this.currentNode) return;
        const isBookmarked = !!store.getBookmark(this.currentNode.id, this.currentNode.content);
        
        if (isBookmarked) {
            store.removeBookmark(this.currentNode.id);
        } else {
            store.saveBookmark(
                this.currentNode.id,
                this.currentNode.content,
                this.activeSectionIndex,
                this.visitedSections
            );
        }
        this.render();
    }

    getToc() {
        if (!this.currentNode?.content) return [];
        const blocks = parseContent(this.currentNode.content);
        const items = [];
        
        if (blocks.length > 0 && !['h1', 'section'].includes(blocks[0].type)) {
             items.push({ text: store.ui.introLabel, level: 1, id: 'intro', isQuiz: false });
        }
        
        blocks.forEach((b) => {
            // Level 1: Page Breakers
            if (b.type === 'h1' || b.type === 'section') {
                items.push({ text: b.text, level: 1, id: b.id, isQuiz: false });
            }
            // Level 2: Sub-topics
            if (b.type === 'h2' || b.type === 'subsection') {
                items.push({ text: b.text, level: 2, id: b.id, isQuiz: false });
            }
            // Level 3: Micro-topics (ADDED for granularity)
            if (b.type === 'h3') {
                items.push({ text: b.text, level: 3, id: b.id, isQuiz: false });
            }
            // Quiz
            if (b.type === 'quiz') {
                items.push({ text: store.ui.quizLabel, level: 1, id: b.id, isQuiz: true });
            }
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
             // Handle case where we are at Intro but next item exists
             if (activeItem.id === 'intro') {
                 // Stop at first structural block (h1, section, quiz)
                 const firstH = blocks.findIndex(b => ['h1', 'section', 'h2', 'subsection', 'h3', 'quiz'].includes(b.type));
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

        const title = `Change Suggestion: ${this.currentNode.name}`;
        const bodyTemplate = `
### 📝 Description of Change
<!-- Please describe the change you are proposing here. Be as specific as possible. -->


### 📍 Location
- **File:** \`${this.currentNode.sourcePath}\`
- **Lesson:** ${this.currentNode.name}

---
*This issue was generated automatically from the Arbor interface.*
        `;

        const encodedTitle = encodeURIComponent(title);
        const encodedBody = encodeURIComponent(bodyTemplate.trim());

        const url = `https://github.com/${repoInfo.owner}/${repoInfo.repo}/issues/new?title=${encodedTitle}&body=${encodedBody}`;
        window.open(url, '_blank');
    }

    // --- Render ---

    render() {
        const isBookmarked = this.currentNode ? !!store.getBookmark(this.currentNode.id, this.currentNode.content) : false;
        
        const stateKey = JSON.stringify({
            id: this.currentNode ? this.currentNode.id : null,
            expanded: this.isExpanded,
            tocVisible: this.isTocVisible,
            section: this.activeSectionIndex,
            filter: this.tocFilter,
            quizzes: this.quizStates,
            completed: this.currentNode ? store.isCompleted(this.currentNode.id) : false,
            visitedCount: this.visitedSections ? this.visitedSections.size : 0,
            bookmarked: isBookmarked
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
        
        // Progress based on actual visited sections (ticks)
        const progress = toc.length > 0 ? Math.round((this.visitedSections.size / toc.length) * 100) : 0;
        
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

        // Mobile Footer Logic
        const isFirstSection = this.activeSectionIndex === 0;
        const leftMobileBtn = isFirstSection
            ? `<button id="btn-exit-mobile" class="w-1/4 justify-center px-4 py-3 rounded-xl font-bold flex items-center gap-2 transition-all bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 active:scale-95" title="${ui.close}">
                 <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
               </button>`
            : `<button id="btn-prev-mobile" class="w-1/4 justify-center px-4 py-3 rounded-xl font-bold flex items-center gap-2 transition-all bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 active:scale-95">
                 <span>←</span>
               </button>`;

        // Helper components for the header
        const closeBtnHtml = (suffix) => `
           <button id="btn-close-content-${suffix}" class="w-10 h-10 flex items-center justify-center rounded-full hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
           </button>`;
           
        const bookmarkIcon = isBookmarked
            ? `<svg class="w-5 h-5 text-yellow-500 fill-current" viewBox="0 0 24 24"><path fill-rule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clip-rule="evenodd" /></svg>`
            : `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.563.045.797.777.371 1.141l-4.203 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.203-3.602a.563.563 0 01.371-1.141l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>`;

        const actionButtonsHtml = `
           <button id="btn-ask-sage" class="px-3 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 text-purple-600 dark:text-purple-300 font-bold text-xs flex items-center gap-2 border border-purple-100 dark:border-purple-800 transition-colors whitespace-nowrap">
              🦉 <span class="hidden sm:inline">${ui.navSage}</span>
           </button>
           
           <button id="btn-propose-change" class="flex w-9 h-9 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors flex-shrink-0" title="${ui.proposeChange}">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.76 9.76 0 01-2.53-.388m-5.383-.948a.75.75 0 00.017.027l.005.003.003.002l.002.001l.001.001L3 21l2.905-2.719A9.75 9.75 0 0112 3c4.97 0 9 3.694 9 8.25z" /></svg>
           </button>
           
           <button id="btn-toggle-bookmark" class="flex w-9 h-9 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-500 hover:text-yellow-500 dark:hover:text-yellow-400 transition-colors flex-shrink-0" title="${isBookmarked ? 'Remove Bookmark' : 'Bookmark'}">
                ${bookmarkIcon}
           </button>

           <button id="btn-export-pdf" class="flex px-3 py-1.5 items-center justify-center gap-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white transition-colors flex-shrink-0" title="${ui.exportTitle}">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <span class="font-bold text-xs hidden sm:inline">PDF</span>
           </button>
        `;

        this.className = ""; 
        this.innerHTML = `
        ${!this.isExpanded ? `<div id="backdrop-overlay" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[55] animate-in fade-in duration-200"></div>` : ''}

        <aside class="${containerClasses.join(' ')} transform translate-x-0">
            <div class="sticky top-0 flex-none px-4 md:px-6 py-4 md:py-5 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm transition-colors z-20 ${!this.isExpanded ? 'md:rounded-tl-3xl' : ''}">
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
                    
                    <!-- Top Section: Title & Mobile Close -->
                    <div class="flex items-start justify-between w-full md:w-auto min-w-0 md:flex-1">
                        <div class="flex items-center gap-3 md:gap-4 overflow-hidden pr-2">
                            ${toc.length > 1 && !isExam ? `
                                <button id="btn-toggle-toc" class="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg font-bold transition-colors
                                    ${this.isTocVisible
                                        ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                                        : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
                                    <span class="text-sm hidden md:inline">${ui.lessonTopics}</span>
                                </button>
                            ` : ''}
                            <div class="w-px h-8 bg-slate-200 dark:bg-slate-700 hidden md:block"></div>
                            <div class="flex items-center gap-3 min-w-0">
                                <span class="text-xl flex-shrink-0">${this.currentNode.icon || '📄'}</span>
                                <div class="flex flex-col min-w-0">
                                    <h1 class="text-base md:text-xl font-black text-slate-800 dark:text-slate-100 leading-tight tracking-tight break-words md:truncate line-clamp-2 md:line-clamp-1">
                                        ${this.currentNode.name}
                                        ${isExam ? '<span class="ml-2 text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full border border-red-200 align-middle">EXAM</span>' : ''}
                                    </h1>
                                    ${this.currentNode.path ? `<p class="text-[10px] md:text-xs font-medium text-slate-400 dark:text-slate-500 truncate mt-1">${this.currentNode.path.split(' / ').slice(0, -1).join(' / ')}</p>` : ''}
                                </div>
                            </div>
                        </div>
                        
                        <!-- Mobile Close -->
                        <div class="md:hidden -mr-2 -mt-1">
                            ${closeBtnHtml('mobile')}
                        </div>
                    </div>

                    <!-- Bottom Section: Actions & Desktop Close -->
                    <div class="flex items-center gap-2 overflow-x-auto md:overflow-visible pb-1 md:pb-0 no-scrollbar w-full md:w-auto justify-start md:justify-end">
                        ${actionButtonsHtml}
                        <div class="hidden md:block ml-2">
                            ${closeBtnHtml('desktop')}
                        </div>
                    </div>
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
                             ${filteredToc.map((item, idx) => {
                                 // INDENTATION LOGIC: Base indent + (Level-1)*Scale
                                 // Level 1: 12px, Level 2: 28px, Level 3: 44px
                                 const paddingLeft = 12 + (item.level - 1) * 16;
                                 
                                 // VISUAL HIERARCHY
                                 const fontSize = item.level === 3 ? 'text-xs font-medium' : 'text-sm font-bold';
                                 const iconSize = item.level === 3 ? 'w-5 h-5' : 'w-6 h-6';
                                 
                                 return `
                                <button class="btn-toc text-left py-3 md:py-2 px-3 rounded-lg ${fontSize} transition-colors w-full flex items-start gap-3 whitespace-normal
                                    ${this.activeSectionIndex === toc.findIndex(t => t.id === item.id)
                                        ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
                                    data-idx="${toc.findIndex(t => t.id === item.id)}" style="padding-left: ${paddingLeft}px">
                                    
                                    <div class="js-toc-tick mt-0.5 flex-shrink-0 ${iconSize} flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                                        ${this.visitedSections.has(toc.findIndex(t => t.id === item.id)) 
                                            ? '<span class="text-green-500 font-bold">✓</span>' 
                                            : `<span class="w-2 h-2 rounded-full ${this.activeSectionIndex === toc.findIndex(t => t.id === item.id) ? 'bg-sky-500' : 'border border-slate-300'}"></span>` 
                                         }
                                    </div>
                                    <span class="leading-tight break-words pt-0.5">${item.text}</span>
                                </button>
                             `;
                             }).join('')}
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
                             <button id="btn-start-exam" class="px-8 py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all bg-red-600 text-white hover:bg-red-50 shadow-lg shadow-red-500/20 active:scale-95">
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
                    ${leftMobileBtn}
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
                 <button id="btn-start-exam-mobile" class="w-full justify-center text-center px-4 py-3 rounded-xl font-bold flex items-center gap-2 transition-all bg-red-600 text-white hover:bg-red-50 shadow-lg shadow-red-500/20 active:scale-95">
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

        // Close handlers for both mobile and desktop instances
        safeBind('#btn-close-content-mobile', () => this.handleClose());
        safeBind('#btn-close-content-desktop', () => this.handleClose());
        
        // Removed btn-edit-content binding as button was removed
        safeBind('#btn-ask-sage', () => { store.setModal({ type: 'sage', mode: 'chat' }); });
        safeBind('#btn-export-pdf', () => { store.setModal({ type: 'export-pdf', node: this.currentNode }); });
        safeBind('#btn-toggle-bookmark', () => this.toggleBookmark()); // Bind Bookmark Toggle
        safeBind('#btn-propose-change', () => this.proposeChange());
        safeBind('#btn-toggle-toc', () => this.toggleToc());
        safeBind('#toc-mobile-backdrop', () => this.toggleToc());
        safeBind('#btn-prev', () => this.scrollToSection(this.activeSectionIndex - 1));
        
        // Bind Mobile Exit or Prev
        if (isFirstSection) {
            safeBind('#btn-exit-mobile', () => this.handleClose());
        } else {
            safeBind('#btn-prev-mobile', () => this.scrollToSection(this.activeSectionIndex - 1));
        }

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

        // New Logic: Handle TOC Click separately for Tick vs Text
        this.querySelectorAll('.btn-toc').forEach(b => {
            b.onclick = (e) => {
                const idx = parseInt(e.currentTarget.dataset.idx);

                // 1. Tick Interaction (Toggle Status)
                if (e.target.closest('.js-toc-tick')) {
                    e.stopPropagation(); // Don't scroll/navigate

                    if (this.visitedSections.has(idx)) {
                        this.visitedSections.delete(idx);
                        // If current node was marked complete, unmark it globally
                        if (this.currentNode && store.isCompleted(this.currentNode.id)) {
                            store.markComplete(this.currentNode.id, false);
                        }
                    } else {
                        this.visitedSections.add(idx);
                    }

                    // Save state without moving cursor
                    if (this.currentNode) {
                        store.saveBookmark(
                            this.currentNode.id,
                            this.currentNode.content,
                            this.activeSectionIndex,
                            this.visitedSections
                        );
                    }
                    this.render();
                    return;
                }

                // 2. Normal Navigation
                this.scrollToSection(idx);
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
