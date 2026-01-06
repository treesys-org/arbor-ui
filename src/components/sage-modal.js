
import { store } from '../store.js';
import { aiService } from '../services/ai.js';

class ArborSage extends HTMLElement {
    constructor() {
        super();
        this.showUpgradeUI = false;
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
            this.showUpgradeUI = false;
        }
    }

    toggleUpgradeUI() {
        this.showUpgradeUI = !this.showUpgradeUI;
        this.render();
    }

    saveApiKey() {
        const inp = this.querySelector('#inp-api-key');
        if (inp && inp.value.trim()) {
            aiService.setApiKey(inp.value.trim());
            this.showUpgradeUI = false;
            store.initSage(); // Re-init to use new key
        }
    }

    clearApiKey() {
        aiService.setApiKey(null);
        this.showUpgradeUI = false;
        store.initSage();
    }

    render() {
        const ui = store.ui;
        const aiState = store.value.ai;
        const isSmart = aiService.isSmartMode();

        let content = '';

        if (this.showUpgradeUI) {
            // SCREEN: UPGRADE / API KEY
            content = `
            <div class="flex flex-col h-full p-8 bg-slate-50 dark:bg-slate-900">
                <div class="flex items-center justify-between mb-8">
                    <h2 class="text-xl font-black text-slate-800 dark:text-white">🧠 Super Brain Setup</h2>
                    <button class="btn-cancel-upgrade text-slate-400 hover:text-slate-600">✕</button>
                </div>
                
                <div class="flex-1 flex flex-col items-center justify-center text-center">
                    <div class="text-6xl mb-6">💎</div>
                    <p class="text-slate-600 dark:text-slate-300 mb-6 font-medium leading-relaxed">${ui.sageUpgradeDesc}</p>
                    
                    <div class="w-full max-w-sm">
                        <label class="block text-left text-xs font-bold text-slate-400 uppercase mb-2">${ui.sageApiKeyLabel}</label>
                        <input id="inp-api-key" type="password" placeholder="AIzaSy..." class="w-full bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-mono text-sm outline-none focus:border-purple-500 transition-colors mb-4">
                        
                        <button id="btn-save-key" class="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 mb-4">
                            ${ui.sageSaveKey}
                        </button>
                        
                        ${isSmart ? `
                        <button id="btn-clear-key" class="text-xs text-red-500 hover:text-red-600 font-bold underline">
                            ${ui.sageBackToLocal}
                        </button>
                        ` : ''}
                    </div>
                </div>
                
                <p class="text-[10px] text-slate-400 text-center mt-4">
                    The key is stored in your browser's LocalStorage. It is never sent to our servers.
                </p>
            </div>
            `;
        } else if (aiState.status === 'idle') {
            // SCREEN: IDLE / WAKE
            content = `
            <div class="flex flex-col items-center justify-center text-center p-8 h-full relative">
                <div class="w-32 h-32 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-7xl mb-6 shadow-xl animate-bounce cursor-pointer hover:scale-110 transition-transform" id="btn-wake-icon" style="animation-duration: 3s">
                    ${isSmart ? '🤖' : '🦉'}
                </div>
                <h2 class="text-2xl font-black text-slate-800 dark:text-white mb-4">${ui.sageWakeTitle}</h2>
                <p class="text-slate-600 dark:text-slate-300 mb-8 max-w-sm leading-relaxed">${ui.sageWakeDesc}</p>
                
                <button id="btn-wake" class="px-8 py-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-lg shadow-purple-600/30 transition-transform active:scale-95 flex items-center gap-3">
                    <span>⚡</span> ${ui.sageWakeBtn}
                </button>

                <div class="absolute bottom-6 left-0 right-0 flex justify-center">
                    <button id="btn-upgrade-toggle" class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-500 hover:bg-purple-100 hover:text-purple-600 transition-colors">
                        <span>${isSmart ? '🧠 Smart Mode Active' : '✨ ' + ui.sageUpgrade}</span>
                    </button>
                </div>
            </div>
            `;
        } else if (aiState.status === 'loading') {
            // SCREEN: LOADING
            content = `
            <div class="flex flex-col items-center justify-center text-center p-8 h-full">
                <div class="w-24 h-24 border-4 border-slate-200 dark:border-slate-700 border-t-purple-500 rounded-full animate-spin mb-6"></div>
                <h2 class="text-xl font-bold text-slate-800 dark:text-white mb-2 animate-pulse">${ui.sageDownloading}</h2>
                <p class="text-slate-500 font-mono text-xs max-w-xs break-words">${aiState.progress}</p>
            </div>
            `;
        } else if (aiState.status === 'error') {
             // SCREEN: ERROR
             content = `
            <div class="flex flex-col items-center justify-center text-center p-8 h-full">
                <div class="text-6xl mb-4">😵‍💫</div>
                <h2 class="text-xl font-bold text-red-600 mb-2">${ui.sageError}</h2>
                <p class="text-slate-500 text-sm mb-4">${aiState.progress}</p>
                <button onclick="store.setModal(null)" class="text-slate-400 underline hover:text-slate-600">Close</button>
            </div>
            `;
        } else {
            // SCREEN: CHAT
            content = `
            <div class="flex flex-col h-full bg-slate-50 dark:bg-slate-950/50">
                <!-- Header -->
                <div class="flex-shrink-0 p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shadow-sm z-10">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center text-2xl cursor-pointer" id="btn-upgrade-toggle-header">
                            ${isSmart ? '🤖' : '🦉'}
                        </div>
                        <div>
                            <h3 class="font-black text-slate-800 dark:text-white text-sm">The Sage</h3>
                            <div class="flex items-center gap-1.5">
                                <span class="w-2 h-2 rounded-full ${isSmart ? 'bg-blue-500' : 'bg-green-500'} animate-pulse"></span>
                                <span class="text-[10px] font-bold ${isSmart ? 'text-blue-600' : 'text-green-600'} uppercase tracking-wider">
                                    ${isSmart ? 'Gemini AI' : 'Local Logic'}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button class="btn-close p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">✕</button>
                </div>

                <!-- Messages Area -->
                <div id="chat-messages" class="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                    ${aiState.messages.map(msg => `
                        <div class="flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}">
                            <div class="max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed shadow-sm animate-in fade-in slide-in-from-bottom-2
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
                ${!this.showUpgradeUI && aiState.status !== 'ready' && aiState.status !== 'thinking' ? `<button class="btn-close absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors z-20">✕</button>` : ''}
                ${content}
            </div>
        </div>`;

        this.bindEvents();
        
        // Auto scroll
        if (aiState.status === 'ready' || aiState.status === 'thinking') {
             const chatContainer = this.querySelector('#chat-messages');
             if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
             if (aiState.status === 'ready') setTimeout(() => this.querySelector('#chat-input')?.focus(), 100);
        }
    }

    bindEvents() {
        this.querySelectorAll('.btn-close').forEach(b => b.onclick = () => store.setModal(null));
        
        const btnWake = this.querySelector('#btn-wake');
        if (btnWake) btnWake.onclick = () => store.initSage();
        
        const btnWakeIcon = this.querySelector('#btn-wake-icon');
        if (btnWakeIcon) btnWakeIcon.onclick = () => store.initSage();

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

        // Upgrade UI Handlers
        const btnUpgrade = this.querySelector('#btn-upgrade-toggle');
        if (btnUpgrade) btnUpgrade.onclick = () => this.toggleUpgradeUI();
        
        const btnUpgradeHeader = this.querySelector('#btn-upgrade-toggle-header');
        if (btnUpgradeHeader) btnUpgradeHeader.onclick = () => this.toggleUpgradeUI();

        const btnCancelUpgrade = this.querySelector('.btn-cancel-upgrade');
        if (btnCancelUpgrade) btnCancelUpgrade.onclick = () => this.toggleUpgradeUI();

        const btnSaveKey = this.querySelector('#btn-save-key');
        if (btnSaveKey) btnSaveKey.onclick = () => this.saveApiKey();

        const btnClearKey = this.querySelector('#btn-clear-key');
        if (btnClearKey) btnClearKey.onclick = () => this.clearApiKey();
    }
}
customElements.define('arbor-sage', ArborSage);
