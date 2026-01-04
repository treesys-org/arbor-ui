
import { store } from '../store.js';
import { parseContent } from '../utils/parser.js';

class ArborContent extends HTMLElement {
    constructor() {
        super();
        this.quizStates = {};
        this.currentBlockIndex = 0;
    }

    connectedCallback() {
        this.render();
        store.addEventListener('state-change', () => this.render());
    }

    // Quiz Logic
    answerQuiz(id, isCorrect, total) {
        if (!this.quizStates[id]) this.quizStates[id] = { score: 0, currentIdx: 0, finished: false };
        const state = this.quizStates[id];
        
        if (isCorrect) state.score++;
        
        if (state.currentIdx + 1 < total) {
            state.currentIdx++;
        } else {
            state.finished = true;
        }
        this.render(); // Re-render to show next question or result
    }

    render() {
        const { selectedNode, completedNodes } = store.value;
        const ui = store.ui;

        if (!selectedNode) {
            this.innerHTML = '';
            this.className = '';
            return;
        }

        this.className = "fixed inset-0 z-40 pointer-events-none flex justify-end";
        const blocks = parseContent(selectedNode.content || "No content.");
        const isComplete = completedNodes.has(selectedNode.id);

        this.innerHTML = `
        <!-- Overlay -->
        <div class="absolute inset-0 bg-slate-900/50 backdrop-blur-sm pointer-events-auto transition-opacity" onclick="document.querySelector('arbor-content').close()"></div>

        <!-- Panel -->
        <div class="relative w-full md:w-[900px] bg-white dark:bg-slate-900 shadow-2xl h-full flex flex-col pointer-events-auto animate-slide-in">
            
            <!-- Header -->
            <div class="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 bg-sky-100 dark:bg-sky-900/30 text-sky-600 rounded-xl flex items-center justify-center text-2xl">
                        ${selectedNode.icon || '📄'}
                    </div>
                    <div>
                        <h2 class="text-xl font-black text-slate-800 dark:text-white">${selectedNode.name}</h2>
                        <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">${ui.leafLabel}</p>
                    </div>
                </div>
                <button onclick="document.querySelector('arbor-content').close()" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
                    ✕
                </button>
            </div>

            <div class="flex flex-1 overflow-hidden">
                <!-- TOC (Desktop) -->
                <div class="hidden md:block w-64 border-r border-slate-200 dark:border-slate-800 overflow-y-auto p-4 bg-slate-50 dark:bg-slate-950">
                    <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">${ui.lessonTopics}</h3>
                    <nav class="space-y-1">
                        ${blocks.filter(b => b.type === 'h1' || b.type === 'h2').map(b => `
                            <button class="w-full text-left text-sm py-2 px-3 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 truncate">
                                ${b.text}
                            </button>
                        `).join('')}
                    </nav>
                </div>

                <!-- Content Body -->
                <div class="flex-1 overflow-y-auto p-8 md:p-12 custom-scrollbar">
                    <div class="prose dark:prose-invert max-w-3xl mx-auto">
                        ${blocks.map((b, i) => this.renderBlock(b, i)).join('')}
                    </div>

                    <!-- Footer Actions -->
                    <div class="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-4">
                        <button class="px-6 py-3 font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                            ${ui.readLater}
                        </button>
                        <button id="btn-finish" class="px-6 py-3 font-bold text-white bg-green-600 hover:bg-green-500 rounded-xl shadow-lg shadow-green-600/30 transition-transform active:scale-95">
                            ${isComplete ? ui.lessonFinished : ui.completeAndNext}
                        </button>
                    </div>
                </div>
            </div>
        </div>
        `;

        const btnFinish = this.querySelector('#btn-finish');
        if (btnFinish) btnFinish.onclick = () => {
             store.markComplete(selectedNode.id);
             store.closeContent();
        };
    }

    close() { store.closeContent(); }

    renderBlock(b, index) {
        if (b.type === 'h1') return `<h1 class="text-4xl font-black mb-6 mt-8">${b.text}</h1>`;
        if (b.type === 'h2') return `<h2 class="text-2xl font-bold mt-8 mb-4 text-sky-600">${b.text}</h2>`;
        if (b.type === 'image') return `<img src="${b.src}" class="rounded-xl shadow-lg my-6 w-full" loading="lazy" />`;
        if (b.type === 'video') return `<iframe src="${b.src}" class="w-full aspect-video rounded-xl shadow-lg my-6" frameborder="0" allowfullscreen></iframe>`;
        
        if (b.type === 'quiz') {
            const state = this.quizStates[b.id] || { score: 0, currentIdx: 0, finished: false };
            const q = b.questions[state.currentIdx];
            const ui = store.ui;

            if (state.finished) {
                return `
                <div class="my-8 p-8 bg-green-50 dark:bg-green-900/20 rounded-2xl text-center border border-green-200 dark:border-green-900">
                    <div class="text-4xl mb-2">🏆</div>
                    <h3 class="text-xl font-bold text-green-800 dark:text-green-300">${ui.quizCompleted}</h3>
                    <p class="text-green-600 dark:text-green-400">${ui.quizScore} ${state.score}/${b.questions.length}</p>
                </div>`;
            }

            return `
            <div class="my-8 p-6 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 relative">
                <span class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">${ui.quizQuestionPrefix} ${state.currentIdx + 1}</span>
                <h3 class="text-lg font-bold mb-6">${q.question}</h3>
                <div class="space-y-2">
                    ${q.options.map((opt, idx) => `
                        <button onclick="document.querySelector('arbor-content').answerQuiz('${b.id}', ${opt.correct}, ${b.questions.length})" 
                            class="w-full text-left p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-purple-500 font-medium transition-colors">
                            ${opt.text}
                        </button>
                    `).join('')}
                </div>
            </div>`;
        }

        return `<p class="mb-4 leading-relaxed text-slate-600 dark:text-slate-300 text-lg">${b.text}</p>`;
    }
}

customElements.define('arbor-content', ArborContent);
