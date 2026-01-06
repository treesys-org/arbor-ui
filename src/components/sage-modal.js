
import { store } from '../store.js';
import { parseContent } from '../utils/parser.js';

class ArborSage extends HTMLElement {
    constructor() {
        super();
    }

    connectedCallback() {
        store.addEventListener('state-change', () => this.checkState());
    }

    checkState() {
        const modal = store.value.modal;
        if (modal === 'sage' || (modal && modal.type === 'sage')) {
            this.render();
        } else {
            this.innerHTML = '';
        }
    }

    render() {
        const ui = store.ui;
        const aiState = store.value.ai; // { status, progress, messages }

        let content = '';

        if (aiState.status === 'idle') {
            // Screen 1: Wake up / Download
            content = `
            <div class="flex flex-col items-center justify-center text-center p-8 h-full">
                <div class="w-32 h-32 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-7xl mb-6 shadow-xl animate-bounce" style="animation-duration: 3s">🦉</div>
                <h2 class="text-2xl font-black text-slate-800 dark:text-white mb-4">${ui.sageWakeTitle}</h2>
                <p class="text-slate-600 dark:text-slate-300 mb-8 max-w-sm leading-relaxed">${ui.sageWakeDesc}</p>
                <button id="btn-wake" class="px-8 py-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-lg shadow-purple-600/30 transition-transform active:scale-95 flex items-center gap-3">
                    <span>⚡</span> ${ui.sageWakeBtn}
                </button>
                <p class="mt-6 text-[10px] text-slate-400 uppercase tracking-widest font-bold">${ui.sageDisclaimer}</p>
            </div>
            `;
        } else if (aiState.status === 'loading') {
            // Screen 2: Downloading
            content = `
            <div class="flex flex-col items-center justify-center text-center p-8 h-full">
                <div class="w-24 h-24 border-4 border-slate-200 dark:border-slate-700 border-t-purple-500 rounded-full animate-spin mb-6"></div>
                <h2 class="text-xl font-bold text-slate-800 dark:text-white mb-2 animate-pulse">${ui.sageDownloading}</h2>
                <p class="text-slate-500 font-mono text-xs max-w-xs break-words">${aiState.progress}</p>
            </div>
            `;
        } else if (aiState.status === 'error') {
             // Screen Error
             content = `
            <div class="flex flex-col items-center justify-center text-center p-8 h-full">
                <div class="text-6xl mb-4">😵‍💫</div>
                <h2 class="text-xl font-bold text-red-600 mb-2">${ui.sageError}</h2>
                <p class="text-slate-500 text-sm mb-4">${aiState.progress}</p>
                <button onclick="store.setModal(null)" class="text-slate-400 underline hover:text-slate-600">Close</button>
            </div>
            `;
        } else {
            // Screen 3: Chat Interface
            content = `
            <div class="flex flex-col h-full bg-slate-50 dark:bg-slate-950/50">
                <!-- Header -->
                <div class="flex-shrink-0 p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shadow-sm z-10">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center text-2xl">🦉</div>
                        <div>
                            <h3 class="font-black text-slate-800 dark:text-white text-sm">The Sage</h3>
                            <div class="flex items-center gap-1.5">
                                <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                <span class="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase tracking-wider">Online (Local)</span>
                            </div>
                        </div>
                    </div>
                    <button class="btn-close p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">✕</button>
                </div>

                <!-- Messages Area -->
                <div id="chat-messages" class="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                    ${aiState.messages.map(msg => `
                        <div class="flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}">
                            <div class="max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed shadow-sm
                                ${msg.role === 'user' 
                                    ? 'bg-purple-600 text-white rounded-br-none' 
                                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-bl-none border border-slate-200 dark:border-slate-700'}">
                                ${msg.content}
                            </div>
                        </div>
                    `).join('')}
                    ${aiState.status === 'thinking' ? `
                         <div class="flex justify-start">
                            <div class="bg-white dark:bg-slate-800 rounded-2xl rounded-bl-none p-4 border border-slate-200 dark:border-slate-700 shadow-sm flex gap-1">
                                <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                                <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
                                <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
                            </div>
                        </div>
                    ` : ''}
                </div>

                <!-- Input Area -->
                <div class="flex-shrink-0 p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
                    <form id="chat-form" class="relative">
                        <input id="chat-input" type="text" placeholder="${ui.sagePlaceholder}" class="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl py-3 pl-4 pr-12 text-slate-800 dark:text-white font-medium focus:ring-2 focus:ring-purple-500 outline-none transition-all" autocomplete="off" ${aiState.status === 'thinking' ? 'disabled' : ''}>
                        <button type="submit" class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-500 disabled:opacity-50 transition-colors" ${aiState.status === 'thinking' ? 'disabled' : ''}>
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
                        </button>
                    </form>
                </div>
            </div>
            `;
        }

        this.innerHTML = `
        <div class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in">
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full h-[600px] max-h-[90vh] relative overflow-hidden flex flex-col">
                ${aiState.status !== 'ready' && aiState.status !== 'thinking' ? `<button class="btn-close absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors z-20">✕</button>` : ''}
                ${content}
            </div>
        </div>`;

        this.bindEvents();
        
        // Auto scroll to bottom
        const chatContainer = this.querySelector('#chat-messages');
        if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
        
        // Auto focus input
        if (aiState.status === 'ready') {
            setTimeout(() => this.querySelector('#chat-input')?.focus(), 100);
        }
    }

    bindEvents() {
        this.querySelectorAll('.btn-close').forEach(b => b.onclick = () => store.setModal(null));
        
        const btnWake = this.querySelector('#btn-wake');
        if (btnWake) {
            btnWake.onclick = () => store.initSage();
        }

        const form = this.querySelector('#chat-form');
        if (form) {
            form.onsubmit = (e) => {
                e.preventDefault();
                const input = this.querySelector('#chat-input');
                const val = input.value.trim();
                if (val) {
                    store.chatWithSage(val);
                    input.value = '';
                }
            };
        }
    }
}
customElements.define('arbor-sage', ArborSage);
