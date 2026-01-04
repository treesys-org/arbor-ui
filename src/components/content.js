
import { store } from '../store.js';
import { parseContent } from '../utils/parser.js';

class ArborContent extends HTMLElement {
    constructor() {
        super();
        this.currentNode = null;
        this.resetState();
    }

    connectedCallback() {
        store.addEventListener('state-change', (e) => {
            const newNode = e.detail.selectedNode;
            if (newNode !== this.currentNode) {
                this.resetState();
                this.currentNode = newNode;
            }
            this.render();
        });
        this.currentNode = store.value.selectedNode;
    }

    resetState() {
        this.quizStates = {};
        this.activeSectionIndex = 0;
        this.visitedSections = new Set([0]);
        this.isTocVisible = true;
        this.showExitWarning = false;
        this.pendingNavigationFn = null;
    }

    // --- Navigation & Guards ---
    requestNavigation(action) {
        const activeQuizBlock = this.getActiveSectionBlocks().find(b => b.type === 'quiz');
        if (activeQuizBlock?.id) {
            const state = this.quizStates[activeQuizBlock.id];
            if (state && state.started && !state.finished) {
                this.pendingNavigationFn = action;
                this.showExitWarning = true;
                this.render();
                return;
            }
        }
        action();
    }

    confirmNavigation() {
        if (this.pendingNavigationFn) this.pendingNavigationFn();
        this.showExitWarning = false;
    }

    cancelNavigation() {
        this.showExitWarning = false;
        this.pendingNavigationFn = null;
        this.render();
    }

    navigateToSection(index) {
        this.activeSectionIndex = index;
        this.visitedSections.add(index);
        this.render();
        const contentArea = this.querySelector('#content-area');
        if (contentArea) contentArea.scrollTop = 0;
    }

    onTocItemClick(index) {
        this.requestNavigation(() => {
            this.navigateToSection(index);
            if (window.innerWidth < 768) {
                this.isTocVisible = false;
                this.render();
            }
        });
    }

    previousSection() {
        this.requestNavigation(() => {
            if (this.activeSectionIndex > 0) this.navigateToSection(this.activeSectionIndex - 1);
        });
    }

    completeAndNext() {
        this.requestNavigation(() => {
            const totalSections = this.getToc().length;
            if (this.activeSectionIndex < totalSections - 1) {
                this.navigateToSection(this.activeSectionIndex + 1);
                return;
            }
            const node = store.value.selectedNode;
            if (!node) return;

            const wasCompleted = store.isCompleted(node.id);
            if (!wasCompleted) store.markComplete(node.id);

            // Check for module completion
            const parentId = node.parentId;
            const allModules = store.getModulesStatus();
            const parentModule = parentId ? allModules.find(m => m.id === parentId) : null;
            
            if (parentModule && parentModule.isComplete && !wasCompleted) {
                store.setModal({ type: 'certificate', moduleId: parentId });
            } else {
                 store.closeContent();
                 // Optionally, navigate to next leaf in sequence
            }
        });
    }
    
    readLater() {
        this.requestNavigation(() => {
             const totalSections = this.getToc().length;
             if (this.activeSectionIndex < totalSections - 1) {
                this.navigateToSection(this.activeSectionIndex + 1);
             } else {
                store.closeContent();
             }
        });
    }

    // --- Quiz ---
    getQuizState(id, total) { return this.quizStates[id] || { started: false, finished: false, currentIdx: 0, score: 0 }; }
    startQuiz(id) { this.quizStates[id] = { started: true, finished: false, currentIdx: 0, score: 0 }; this.render(); }
    retryQuiz(id) { this.startQuiz(id); }
    answerQuiz(id, isCorrect, total) {
        const state = this.getQuizState(id, total);
        state.score += isCorrect ? 1 : 0;
        if (state.currentIdx + 1 < total) { state.currentIdx++; } 
        else { state.finished = true; }
        this.render();
    }

    // --- Data Getters ---
    getToc() {
        const node = store.value.selectedNode;
        if (!node?.content) return [];
        const blocks = parseContent(node.content);
        const items = [{ text: store.ui.introLabel, level: 1, id: 'intro', isQuiz: false }];
        blocks.forEach(b => {
            if (b.type === 'h1' || b.type === 'h2') items.push({ text: b.text, level: b.type === 'h1' ? 1 : 2, id: b.text.toLowerCase(), isQuiz: false });
            if (b.type === 'quiz') items.push({ text: store.ui.quizLabel, level: 1, id: b.id, isQuiz: true });
        });
        return items;
    }

    getActiveSectionBlocks() {
        const node = store.value.selectedNode;
        if (!node?.content) return [];
        const allBlocks = parseContent(node.content);
        const tocItems = this.getToc();
        if (this.activeSectionIndex >= tocItems.length) return [];

        const activeTocItem = tocItems[this.activeSectionIndex];
        let startIndex = (activeTocItem.id === 'intro') ? 0 : allBlocks.findIndex(b => (b.text && b.text.toLowerCase() === activeTocItem.id) || b.id === activeTocItem.id);
        if (startIndex === -1) startIndex = 0;

        let endIndex = allBlocks.length;
        const nextTocItem = (this.activeSectionIndex + 1 < tocItems.length) ? tocItems[this.activeSectionIndex + 1] : null;
        if (nextTocItem) {
            const nextStart = allBlocks.findIndex(b => (b.text && b.text.toLowerCase() === nextTocItem.id) || b.id === nextTocItem.id);
            if (nextStart !== -1) endIndex = nextStart;
        }

        if (activeTocItem.id === 'intro') {
            const firstHeader = allBlocks.findIndex(b => b.type.startsWith('h') || b.type === 'quiz');
            if (firstHeader !== -1) endIndex = firstHeader;
        }
        return allBlocks.slice(startIndex, endIndex);
    }
    
    // --- RENDER ---
    render() {
        const { selectedNode } = store.value;
        const ui = store.ui;

        if (!selectedNode) { this.innerHTML = ''; this.className = ''; return; }
        this.className = "fixed inset-0 z-40 pointer-events-none flex justify-end";
        
        const toc = this.getToc();
        const activeBlocks = this.getActiveSectionBlocks();
        const progress = toc.length <= 1 ? 100 : Math.round((this.visitedSections.size / toc.length) * 100);

        this.innerHTML = `
        <div class="absolute inset-0 bg-slate-900/50 backdrop-blur-sm pointer-events-auto" onclick="document.querySelector('arbor-content').requestClose()"></div>
        <div class="relative w-full md:w-[900px] bg-white dark:bg-slate-900 shadow-2xl h-full flex flex-col pointer-events-auto animate-slide-in">
            <!-- Header -->
            <header class="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                <div class="flex items-center gap-4 min-w-0">
                    <div class="w-12 h-12 bg-sky-100 dark:bg-sky-900/30 text-sky-600 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">${selectedNode.icon || '📄'}</div>
                    <div class="min-w-0">
                        <h2 class="text-xl font-black text-slate-800 dark:text-white truncate">${selectedNode.name}</h2>
                        ${selectedNode.discussionUrl ? `<a href="${selectedNode.discussionUrl}" target="_blank" class="text-xs font-bold text-sky-600 hover:underline">${ui.lessonDiscussion}</a>` : `<p class="text-xs font-bold text-slate-400 uppercase tracking-widest">${ui.leafLabel}</p>`}
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    ${toc.length > 1 ? `<button id="btn-toc-toggle" class="md:hidden p-2 rounded-lg bg-slate-50 dark:bg-slate-800"><svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg></button>`: ''}
                    <button id="btn-close-panel" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">✕</button>
                </div>
            </header>

            <div class="flex flex-1 overflow-hidden">
                <!-- TOC -->
                ${toc.length > 1 ? `<div id="toc-panel" class="absolute md:static w-64 h-full z-20 md:z-auto bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 overflow-y-auto p-4 custom-scrollbar transition-transform ${this.isTocVisible ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} ${this.isTocVisible ? '' : 'md:w-0 md:p-0'}">
                     <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">${ui.lessonTopics}</h3>
                     <nav class="space-y-1">${toc.map((item, i) => this.renderTocItem(item, i)).join('')}</nav>
                </div>` : ''}

                <!-- Content Body -->
                <div id="content-area" class="flex-1 overflow-y-auto p-8 md:p-12 custom-scrollbar">
                    <div class="prose dark:prose-invert max-w-3xl mx-auto">${activeBlocks.map((b, i) => this.renderBlock(b, i)).join('')}</div>
                    
                    <div class="mt-16"><div class="flex justify-between items-center mb-2"><span class="text-sm font-bold text-slate-600 dark:text-slate-400">${ui.lessonProgress}</span><span class="text-sm font-bold text-green-600 dark:text-green-400">${progress}%</span></div><div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5"><div class="bg-green-500 h-2.5 rounded-full" style="width:${progress}%"></div></div></div>
                    
                    <footer class="mt-8 pt-8 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
                        <button id="btn-prev" class="px-5 py-3 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-40" ${this.activeSectionIndex === 0 ? 'disabled' : ''}>${ui.previousSection}</button>
                        <div class="flex items-center gap-2">
                             <button id="btn-read-later" class="px-4 py-3 rounded-xl font-bold text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm">${ui.readLater}</button>
                             <button id="btn-next" class="px-5 py-3 rounded-xl font-bold bg-green-500 text-white hover:bg-green-600 shadow-lg shadow-green-500/20">${ui.completeAndNext}</button>
                        </div>
                    </footer>
                </div>
            </div>
            ${this.showExitWarning ? this.renderExitWarning(ui) : ''}
        </div>`;

        // Bind events
        this.bindEvents();
    }
    
    bindEvents() {
        this.querySelector('#btn-close-panel').onclick = () => this.requestClose();
        this.querySelectorAll('.btn-toc').forEach(b => b.onclick = (e) => this.onTocItemClick(parseInt(e.currentTarget.dataset.index)));
        this.querySelector('#btn-prev').onclick = () => this.previousSection();
        this.querySelector('#btn-next').onclick = () => this.completeAndNext();
        this.querySelector('#btn-read-later').onclick = () => this.readLater();

        const tocToggle = this.querySelector('#btn-toc-toggle');
        if (tocToggle) tocToggle.onclick = () => { this.isTocVisible = !this.isTocVisible; this.render(); };

        this.querySelectorAll('.btn-quiz-start').forEach(b => b.onclick = (e) => this.startQuiz(e.currentTarget.dataset.id));
        this.querySelectorAll('.btn-quiz-retry').forEach(b => b.onclick = (e) => this.retryQuiz(e.currentTarget.dataset.id));
        this.querySelectorAll('.btn-quiz-answer').forEach(b => b.onclick = (e) => {
            const { id, correct, total } = e.currentTarget.dataset;
            this.answerQuiz(id, correct === 'true', parseInt(total));
        });

        if(this.showExitWarning) {
            this.querySelector('#btn-stay').onclick = () => this.cancelNavigation();
            this.querySelector('#btn-leave').onclick = () => this.confirmNavigation();
        }
    }

    requestClose() { this.requestNavigation(() => store.closeContent()); }

    renderTocItem(item, i) { /* Same as before, omitted */ }
    
    renderBlock(b, index) {
        const ui = store.ui;
        if (b.type.startsWith('h')) return `<${b.type}>${b.text}</${b.type}>`;
        if (b.type === 'image') return `<img src="${b.src}" class="rounded-xl shadow-lg my-6 w-full" loading="lazy">`;
        if (b.type === 'video') return `<iframe src="${b.src}" class="w-full aspect-video rounded-xl shadow-lg my-6" frameborder="0" allowfullscreen></iframe>`;
        
        if (b.type === 'quiz') {
            const state = this.getQuizState(b.id, b.questions.length);
            
            if (!state.started) {
                return `<div class="not-prose my-8 p-8 bg-purple-50 dark:bg-purple-900/20 rounded-2xl text-center border border-purple-200 dark:border-purple-900">
                    <h3 class="text-xl font-bold text-purple-800 dark:text-purple-300">${ui.quizTitle}</h3>
                    <p class="text-purple-600 dark:text-purple-400 mb-4">${b.questions.length} ${ui.quizIntro}</p>
                    <button class="btn-quiz-start" data-id="${b.id}">${ui.quizStart}</button>
                </div>`;
            }

            if (state.finished) {
                return `<div class="not-prose my-8 p-8 bg-green-50 dark:bg-green-900/20 rounded-2xl text-center border border-green-200 dark:border-green-900">
                    <div class="text-4xl mb-2">🏆</div>
                    <h3 class="text-xl font-bold text-green-800 dark:text-green-300">${ui.quizCompleted}</h3>
                    <p class="text-green-600 dark:text-green-400">${ui.quizScore} ${state.score}/${b.questions.length}</p>
                    <button class="btn-quiz-retry mt-4" data-id="${b.id}">${ui.quizRetry}</button>
                </div>`;
            }

            const q = b.questions[state.currentIdx];
            return `<div class="not-prose my-8 p-6 bg-slate-100 dark:bg-slate-800 rounded-2xl border">
                <p class="text-xs font-bold text-slate-400 uppercase">${ui.quizQuestionPrefix} ${state.currentIdx + 1}</p>
                <h3 class="text-lg font-bold mb-6">${q.question}</h3>
                <div class="space-y-2">
                    ${q.options.map(opt => `<button class="btn-quiz-answer" data-id="${b.id}" data-correct="${opt.correct}" data-total="${b.questions.length}">${opt.text}</button>`).join('')}
                </div>
            </div>`;
        }
        return `<p class="mb-4 text-lg">${b.text}</p>`;
    }
    
    renderExitWarning(ui) { /* Same as before, omitted */ }
}
customElements.define('arbor-content', ArborContent);
