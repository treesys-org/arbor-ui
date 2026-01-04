
import { store } from '../store.js';
import { parseContent } from '../utils/parser.js';

class ArborContent extends HTMLElement {
    constructor() { super(); }

    connectedCallback() {
        this.render();
        store.addEventListener('state-change', () => this.render());
    }

    render() {
        const { selectedNode, completedNodes } = store.value;
        
        if (!selectedNode) {
            this.innerHTML = '';
            this.classList.remove('active');
            return;
        }

        const blocks = parseContent(selectedNode.content || "No content.");
        const isComplete = completedNodes.has(selectedNode.id);

        this.innerHTML = `
        <div class="fixed inset-y-0 right-0 w-full md:w-[600px] bg-white dark:bg-slate-900 shadow-2xl z-40 transform transition-transform duration-300 flex flex-col border-l dark:border-slate-800">
            <div class="p-6 border-b dark:border-slate-800 flex justify-between items-center">
                <h2 class="text-xl font-bold dark:text-white">${selectedNode.name}</h2>
                <button id="btn-close" class="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">✕</button>
            </div>
            
            <div class="flex-1 overflow-y-auto p-8 prose dark:prose-invert">
                ${blocks.map(b => this.renderBlock(b)).join('')}
            </div>

            <div class="p-6 border-t dark:border-slate-800">
                <button id="btn-complete" class="w-full py-4 rounded-xl font-bold text-white transition-colors ${isComplete ? 'bg-green-600' : 'bg-slate-800 hover:bg-slate-700'}">
                    ${isComplete ? 'COMPLETADO ✓' : 'MARCAR COMO LEÍDO'}
                </button>
            </div>
        </div>
        `;
        
        this.querySelector('#btn-close').onclick = () => store.update({ selectedNode: null });
        this.querySelector('#btn-complete').onclick = () => store.markComplete(selectedNode.id);
    }

    renderBlock(block) {
        switch(block.type) {
            case 'h1': return `<h1 class="text-3xl font-bold mb-4">${block.content}</h1>`;
            case 'h2': return `<h2 class="text-2xl font-bold mt-6 mb-3 text-sky-600">${block.content}</h2>`;
            case 'image': return `<img src="${block.src}" class="rounded-xl shadow-lg my-4 w-full" />`;
            case 'quiz': return `<div class="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl my-4 font-bold border-l-4 border-purple-500">❓ ${block.question}</div>`;
            default: return `<p class="mb-4 text-slate-600 dark:text-slate-300 leading-relaxed">${block.content}</p>`;
        }
    }
}
customElements.define('arbor-content', ArborContent);
