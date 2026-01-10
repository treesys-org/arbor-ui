

import { store } from '../../store.js';
import { aiService } from '../../services/ai.js';

class ArborSage extends HTMLElement {
    constructor() {
        super();
        this.isVisible = false;
        this.mode = 'chat'; // 'chat' | 'settings' | 'menu'
        
        // UI State for Settings
        this.settingsTab = this.determineInitialTab();
        this.ollamaModels = [];
        this.pullStatus = '';
        this.webllmStatus = '';
        this.chromeStatus = 'Checking...';
        this.hasTriedLoadingModels = false; 
        this.lastRenderKey = null;
    }
    
    determineInitialTab() {
        if (aiService.config.provider === 'ollama') return 'ollama';
        if (aiService.config.provider === 'webllm') return 'webllm';
        if (aiService.config.provider === 'chrome') return 'chrome';
        return 'gemini';
    }

    connectedCallback() {
        store.addEventListener('state-change', () => this.checkState());
    }

    checkState() {
        const modal = store.value.modal;
        const isSageReq = modal && (modal === 'sage' || modal.type === 'sage');

        if (isSageReq) {
            if (!this.isVisible) {
                this.isVisible = true;
                this.mode = modal.mode || (aiService.isSmartMode() ? 'chat' : 'menu');
                this.settingsTab = this.determineInitialTab();
            } 
            else if (modal.mode && modal.mode !== this.mode) {
                this.mode = modal.mode;
            }
            this.render();
        } else {
            if (this.isVisible) {
                this.close();
            }
        }
    }
    
    close() {
        this.isVisible = false;
        this.lastRenderKey = null;
        this.innerHTML = '';
        this.className = '';
        store.setModal(null);
    }

    saveConfig() {
        if (this.settingsTab === 'gemini') {
            const key = this.querySelector('#inp-api-key').value.trim();
            if (key) {
                aiService.setConfig({ provider: 'gemini', apiKey: key });
                this.finishConfig();
            }
        } else if (this.settingsTab === 'ollama') {
            const model = this.querySelector('#inp-ollama-model').value.trim();
            if (model) {
                aiService.setConfig({ provider: 'ollama', ollamaModel: model });
                this.finishConfig();
            }
        } else if (this.settingsTab === 'webllm') {
            const model = this.querySelector('#inp-webllm-model').value;
            aiService.setConfig({ provider: 'webllm', webllmModel: model });
            if (aiService.webllmEngine) {
                 this.finishConfig();
            } else {
                alert("Load the model into memory first.");
            }
        } else if (this.settingsTab === 'chrome') {
            if (this.chromeStatus.includes("available")) {
                aiService.setConfig({ provider: 'chrome' });
                this.finishConfig();
            } else {
                alert("Chrome Built-in AI is not ready. Please enable flags.");
            }
        }
    }
    
    finishConfig() {
        store.initSage();
        this.mode = 'chat';
        this.render();
    }

    clearConfig() {
        aiService.setConfig({ provider: 'none', apiKey: null });
        this.mode = 'settings';
        this.render();
    }

    async loadOllamaModels() {
        this.hasTriedLoadingModels = true;
        this.ollamaModels = await aiService.listOllamaModels();
        this.render();
    }
    
    async checkChromeStatus() {
        if (!window.ai || !window.ai.languageModel) {
            this.chromeStatus = "Not detected (Use Chrome Canary)";
        } else {
            try {
                const caps = await window.ai.languageModel.capabilities();
                if (caps.available === 'no') this.chromeStatus = "Not available (Check flags)";
                else if (caps.available === 'after-download') this.chromeStatus = "Available (Needs download)";
                else this.chromeStatus = "Fully available ✅";
            } catch(e) {
                this.chromeStatus = "Error checking capabilities";
            }
        }
        const statusEl = this.querySelector('#chrome-status-text');
        if(statusEl) statusEl.textContent = this.chromeStatus;
    }
    
    async loadWebLLM() {
        const model = this.querySelector('#inp-webllm-model').value;
        aiService.setConfig({ provider: 'webllm', webllmModel: model });
        
        this.webllmStatus = store.ui.sageDownloading || 'Downloading...';
        this.render();
        
        const success = await aiService.loadWebLLM((progressText) => {
            this.webllmStatus = progressText;
            const el = this.querySelector('#webllm-status-text');
            if(el) el.textContent = progressText;
        });
        
        if(success) {
            this.webllmStatus = "Model loaded and ready.";
            this.finishConfig();
        } else {
            this.webllmStatus = "Error loading model. Check console.";
            this.render();
        }
    }

    async pullModel() {
        const name = this.querySelector('#inp-pull-model').value.trim();
        if(!name) return;

        this.pullStatus = store.ui.sageDownloading || 'Downloading...';
        this.render();

        const success = await aiService.pullOllamaModel(name, (status) => {
            this.pullStatus = status;
            const statusEl = this.querySelector('#pull-status');
            if(statusEl) statusEl.textContent = status;
        });

        this.pullStatus = success ? 'Done!' : 'Error.';
        await this.loadOllamaModels();
        if(success) {
            aiService.setConfig({ provider: 'ollama', ollamaModel: name });
            this.render();
        }
    }

    async deleteModel(name) {
        if(confirm(`Delete model ${name}?`)) {
            await aiService.deleteOllamaModel(name);
            await this.loadOllamaModels();
        }
    }
    
    async runQuickAction(action) {
        if (!aiService.isSmartMode()) return;
        
        let prompt = '';
        if (action === 'summarize') prompt = "Summarize this lesson in 3 bullet points.";
        if (action === 'explain') prompt = "Explain the main concept simply.";
        if (action === 'quiz') prompt = "Give me a test question about this.";
        if (prompt) store.chatWithSage(prompt);
    }

    render() {
        if (!this.isVisible) {
            if (this.innerHTML !== '') {
                this.innerHTML = '';
                this.className = '';
                this.lastRenderKey = null;
            }
            return;
        }

        const { ai } = store.value;
        const stateKey = JSON.stringify({
             visible: this.isVisible,
             mode: this.mode,
             settingsTab: this.settingsTab,
             ollamaModels: this.ollamaModels,
             pullStatus: this.pullStatus,
             webllmStatus: this.webllmStatus,
             aiStatus: ai.status,
             msgCount: ai.messages.length
        });

        if (stateKey === this.lastRenderKey) return;
        this.lastRenderKey = stateKey;

        const isSmart = aiService.isSmartMode();

        if (this.mode === 'settings') {
            this.renderSettings(isSmart);
        } else if (this.mode === 'menu') {
            this.renderMenu();
        } else {
            this.renderChat(isSmart);
        }
    }

    renderMenu() {
        const ui = store.ui;
        this.className = "fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4";

        this.innerHTML = `
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-sm w-full relative overflow-hidden flex flex-col animate-in zoom-in duration-200 border border-slate-200 dark:border-slate-800">
                <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
                    <div class="flex items-center gap-3">
                        <span class="text-3xl">🦉</span>
                        <h3 class="font-black text-xl text-slate-800 dark:text-white">${ui.sageMenuTitle}</h3>
                    </div>
                    <button class="btn-close w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">✕</button>
                </div>
                
                <div class="p-6 space-y-4">
                    <button id="btn-menu-help" class="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group">
                         <div class="flex items-center gap-4">
                            <div class="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 flex items-center justify-center text-xl">🗺️</div>
                            <div>
                                <h4 class="font-bold text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">${ui.sageMenuHelp}</h4>
                                <p class="text-xs text-slate-500 dark:text-slate-400">${ui.sageMenuHelpDesc}</p>
                            </div>
                         </div>
                    </button>

                    <button id="btn-menu-ai" class="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all group">
                         <div class="flex items-center gap-4">
                            <div class="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-600 flex items-center justify-center text-xl">✨</div>
                            <div>
                                <h4 class="font-bold text-slate-800 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">${ui.sageMenuAi}</h4>
                                <p class="text-xs text-slate-500 dark:text-slate-400">${ui.sageMenuAiDesc}</p>
                            </div>
                         </div>
                    </button>
                </div>
            </div>
        `;

        this.querySelector('.btn-close').onclick = () => this.close();
        this.querySelector('#btn-menu-help').onclick = () => {
            this.close();
            setTimeout(() => store.setModal('welcome'), 100);
        };
        this.querySelector('#btn-menu-ai').onclick = () => {
            this.mode = 'settings';
            this.render();
        };
    }

    renderSettings(isSmart) {
        const ui = store.ui;
        this.className = "fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4";
        
        const tab = this.settingsTab;
        const isGemini = tab === 'gemini';
        const isOllama = tab === 'ollama';
        const isWebLLM = tab === 'webllm';
        const isChrome = tab === 'chrome';

        let modelsListHtml = '';
        if (isOllama) {
            if (this.ollamaModels.length === 0 && !this.hasTriedLoadingModels && this.pullStatus === '') {
                 setTimeout(() => this.loadOllamaModels(), 0);
                 modelsListHtml = `<div class="text-center p-4 text-slate-400 text-xs animate-pulse">${ui.sageSearchingModels}</div>`;
            } else if (this.ollamaModels.length === 0) {
                 modelsListHtml = `
                 <div class="text-center p-4 text-slate-400 text-xs border border-dashed border-slate-300 dark:border-slate-700 rounded-lg">
                    <p class="mb-2">${ui.sageNoModels}</p>
                    <p class="mb-2">${ui.sageEnsureOllama}</p>
                    <button id="btn-retry-models" class="text-blue-500 hover:text-blue-600 font-bold underline">${ui.sageRetryConnection}</button>
                 </div>`;
            } else {
                 modelsListHtml = this.ollamaModels.map(m => {
                     const isSelected = aiService.config.ollamaModel === m.name;
                     const sizeGB = m.size ? Math.round(m.size / 1024 / 1024 / 1024 * 10) / 10 : 0;
                     return `
                     <div class="flex items-center justify-between p-2 rounded-lg border ${isSelected ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20' : 'border-slate-100 dark:border-slate-700'}">
                        <button class="flex-1 text-left btn-select-model truncate font-mono text-xs text-slate-700 dark:text-slate-300" data-name="${m.name}">
                            ${isSelected ? '✅ ' : ''}${m.name} <span class="text-[9px] text-slate-400">(${sizeGB}GB)</span>
                        </button>
                        <button class="btn-delete-model p-1.5 text-slate-400 hover:text-red-500" data-name="${m.name}" title="Delete">🗑</button>
                     </div>`;
                 }).join('');
            }
        }

        const webLlmOptions = [
            { id: "SmolLM2-135M-Instruct-q0f16-MLC", name: "SmolLM2 135M (Fast - 100MB)" },
            { id: "SmolLM2-360M-Instruct-q0f16-MLC", name: "SmolLM2 360M (Balanced)" },
            { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", name: "Llama 3.2 1B (Recommended)" },
            { id: "Llama-3.1-8B-Instruct-q4f32_1-MLC", name: "Llama 3.1 8B (Heavy)" },
            { id: "gemma-2-2b-it-q4f16_1-MLC", name: "Gemma 2 2B (Google)" }
        ];

        this.innerHTML = `
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full relative overflow-hidden flex flex-col animate-in zoom-in duration-200 border border-slate-200 dark:border-slate-800 max-h-[85vh]">
                <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950 shrink-0">
                    <div class="flex items-center gap-3">
                        <span class="text-3xl">⚙️</span>
                        <div>
                            <h3 class="font-black text-xl text-slate-800 dark:text-white">${ui.sageConfigTitle}</h3>
                            <p class="text-xs text-slate-500">${ui.sageConfigDesc}</p>
                        </div>
                    </div>
                    <button class="btn-close w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">✕</button>
                </div>
                
                <div class="flex border-b border-slate-100 dark:border-slate-800 shrink-0 overflow-x-auto no-scrollbar">
                    <button class="flex-1 whitespace-nowrap px-4 py-3 text-sm font-bold border-b-2 transition-colors ${isGemini ? 'border-purple-500 text-purple-600 dark:text-purple-400' : 'border-transparent text-slate-400 hover:text-slate-600'}" id="tab-gemini">
                        ☁️ ${ui.sageModeCloud}
                    </button>
                    <button class="flex-1 whitespace-nowrap px-4 py-3 text-sm font-bold border-b-2 transition-colors ${isOllama ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-slate-400 hover:text-slate-600'}" id="tab-ollama">
                        💻 ${ui.sageModeLocal}
                    </button>
                    <button class="flex-1 whitespace-nowrap px-4 py-3 text-sm font-bold border-b-2 transition-colors ${isWebLLM ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-600'}" id="tab-webllm">
                        🌐 WebGPU
                    </button>
                    <button class="flex-1 whitespace-nowrap px-4 py-3 text-sm font-bold border-b-2 transition-colors ${isChrome ? 'border-green-500 text-green-600 dark:text-green-400' : 'border-transparent text-slate-400 hover:text-slate-600'}" id="tab-chrome">
                        ✨ Chrome
                    </button>
                </div>
                
                <div class="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                    
                    ${isGemini ? `
                    <div class="bg-purple-50 dark:bg-purple-900/10 p-4 rounded-xl border border-purple-100 dark:border-purple-800/30 animate-in fade-in">
                        <p class="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase mb-2">${ui.sageApiKeyLabel}</p>
                        <input id="inp-api-key" type="password" placeholder="AIz..." class="w-full text-sm p-3 border-2 border-purple-200 dark:border-purple-800 rounded-xl bg-white dark:bg-slate-900 focus:ring-4 focus:ring-purple-200 outline-none transition-all font-mono text-slate-800 dark:text-white" value="${aiService.config.apiKey || ''}">
                        <div class="text-center pt-2">
                             <a href="https://aistudio.google.com/app/apikey" target="_blank" class="text-xs text-blue-500 hover:underline font-bold">${ui.sageGetKey} ↗</a>
                        </div>
                    </div>
                    ` : ''}

                    ${isOllama ? `
                    <div class="bg-orange-50 dark:bg-orange-900/10 p-4 rounded-xl border border-orange-100 dark:border-orange-800/30 animate-in fade-in">
                        <p class="text-xs font-bold text-orange-600 dark:text-orange-400 uppercase mb-2">${ui.sageOllamaLabel}</p>
                        <input id="inp-ollama-model" type="text" placeholder="llama3" class="w-full text-sm p-3 border-2 border-orange-200 dark:border-orange-800 rounded-xl bg-white dark:bg-slate-900 focus:ring-4 focus:ring-orange-200 outline-none transition-all font-mono text-slate-800 dark:text-white mb-2" value="${aiService.config.ollamaModel}">
                        <p class="text-[10px] text-slate-500 mb-4">${ui.sageOllamaHint}</p>
                        
                        <div class="border-t border-orange-200 dark:border-orange-800 pt-4">
                            <p class="text-xs font-bold text-slate-500 uppercase mb-2">${ui.sageDownloadModel}</p>
                            <div class="flex gap-2 mb-2">
                                <input id="inp-pull-model" type="text" placeholder="e.g. mistral" class="flex-1 text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                                <button id="btn-pull" class="px-3 py-1 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-black">${ui.sagePull}</button>
                            </div>
                            <p id="pull-status" class="text-[10px] font-mono text-blue-500 h-4 mb-4">${this.pullStatus}</p>

                            <p class="text-xs font-bold text-slate-500 uppercase mb-2">${ui.sageAvailableModels}</p>
                            <div class="space-y-2 max-h-32 overflow-y-auto custom-scrollbar bg-white/50 dark:bg-slate-900/50 rounded-lg p-1">
                                ${modelsListHtml}
                            </div>
                        </div>
                    </div>
                    ` : ''}

                    ${isWebLLM ? `
                    <div class="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-800/30 animate-in fade-in">
                         <div class="flex items-center gap-2 mb-2">
                            <p class="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase">${ui.sageWebLlmModel}</p>
                         </div>
                         <select id="inp-webllm-model" class="w-full text-sm p-3 border-2 border-blue-200 dark:border-blue-800 rounded-xl bg-white dark:bg-slate-900 focus:ring-4 focus:ring-blue-200 outline-none transition-all font-mono text-slate-800 dark:text-white mb-4">
                             ${webLlmOptions.map(m => `<option value="${m.id}" ${aiService.config.webllmModel === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}
                         </select>

                         <p class="text-[11px] text-slate-500 leading-tight mb-4">
                            ${ui.sageWebLlmInfo}
                         </p>

                         <div class="bg-white dark:bg-slate-900 p-3 rounded-lg border border-blue-200 dark:border-blue-800/50 mb-4">
                            <p class="text-[10px] font-bold text-slate-400 uppercase mb-1">${ui.sageModelStatus}</p>
                            <p id="webllm-status-text" class="text-xs font-mono text-slate-700 dark:text-slate-300 break-words">
                                ${this.webllmStatus || (aiService.webllmEngine ? "Loaded." : "Not loaded.")}
                            </p>
                         </div>
                         
                         <button id="btn-load-webllm" class="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-sm transition-colors shadow-md">
                            ${ui.sageLoadModel} (Download)
                         </button>
                    </div>
                    ` : ''}
                    
                    ${isChrome ? `
                    <div class="bg-green-50 dark:bg-green-900/10 p-4 rounded-xl border border-green-100 dark:border-green-800/30 animate-in fade-in">
                         <div class="flex items-center gap-2 mb-2">
                            <p class="text-xs font-bold text-green-600 dark:text-green-400 uppercase">${ui.sageChromeStatus}</p>
                         </div>
                         
                         <div class="bg-white dark:bg-slate-900 p-3 rounded-lg border border-green-200 dark:border-green-800/50 mb-4">
                            <p id="chrome-status-text" class="text-xs font-mono text-slate-700 dark:text-slate-300 break-words">
                                ${this.chromeStatus}
                            </p>
                         </div>
                         
                         <p class="text-[11px] text-slate-500 leading-tight mb-4">
                            ${ui.sageChromeFlags || "Requires Chrome Dev/Canary. Enable: chrome://flags/#optimization-guide-on-device-model"}
                         </p>
                         
                         <div class="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-900 p-2 rounded">
                            <strong class="block mb-1">Zero Cost / Zero Setup</strong>
                            Uses the Gemini Nano model embedded directly in Chrome. No downloads, no API keys.
                         </div>
                    </div>
                    ` : ''}

                    <div class="space-y-3 pt-2">
                        <button id="btn-save-config" class="w-full py-4 ${isGemini ? 'bg-purple-600 hover:bg-purple-500' : (isOllama ? 'bg-orange-600 hover:bg-orange-500' : (isChrome ? 'bg-green-600 hover:bg-green-500' : 'bg-blue-600 hover:bg-blue-500'))} text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2">
                            <span>💾</span> ${ui.sageSaveKey}
                        </button>
                        
                        ${isSmart ? `
                        <button id="btn-clear-config" class="w-full py-3 border border-red-200 dark:border-red-900/30 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 font-bold rounded-xl transition-transform active:scale-95 text-xs">
                            ${ui.sageClearConfig}
                        </button>` : ''}
                    </div>
                </div>
            </div>
        `;

        this.querySelector('.btn-close').onclick = () => this.close();
        this.querySelector('#tab-gemini').onclick = () => { this.settingsTab = 'gemini'; this.render(); };
        this.querySelector('#tab-ollama').onclick = () => { this.settingsTab = 'ollama'; this.render(); };
        this.querySelector('#tab-webllm').onclick = () => { this.settingsTab = 'webllm'; this.render(); };
        this.querySelector('#tab-chrome').onclick = () => { this.settingsTab = 'chrome'; this.render(); };
        
        this.querySelector('#btn-save-config').onclick = () => this.saveConfig();
        const btnClear = this.querySelector('#btn-clear-config');
        if(btnClear) btnClear.onclick = () => this.clearConfig();

        if (isOllama) {
            this.querySelector('#btn-pull').onclick = () => this.pullModel();
            const btnRetry = this.querySelector('#btn-retry-models');
            if(btnRetry) btnRetry.onclick = () => this.loadOllamaModels();
            this.querySelectorAll('.btn-delete-model').forEach(b => b.onclick = (e) => this.deleteModel(e.currentTarget.dataset.name));
            this.querySelectorAll('.btn-select-model').forEach(b => {
                 b.onclick = (e) => {
                     this.querySelector('#inp-ollama-model').value = e.currentTarget.dataset.name;
                     this.saveConfig();
                 };
            });
        }
        
        if (isWebLLM) {
            this.querySelector('#btn-load-webllm').onclick = () => this.loadWebLLM();
        }
        
        if (isChrome) {
            // Trigger status check
            setTimeout(() => this.checkChromeStatus(), 0);
        }
    }

    renderChat(isSmart) {
        const ui = store.ui;
        
        // --- KEY CHANGE: Preserve Structure to prevent Flicker ---
        // If chat area exists, we only update the inner contents list, not the whole wrapper.
        const chatArea = this.querySelector('#sage-chat-area');
        
        // Calculate static parts
        const aiState = store.value.ai;
        const displayMessages = aiState.messages.length > 0 ? aiState.messages : [{ role: 'assistant', content: "🦉 Hello. Ask me anything." }];
        const displayStatus = aiState.status;
        const isOllama = aiService.config.provider === 'ollama';
        const isWebLLM = aiService.config.provider === 'webllm';
        const isChrome = aiService.config.provider === 'chrome';
        const isThinking = displayStatus === 'thinking';
        let sendBtnColor = 'bg-purple-600';
        if (isOllama) sendBtnColor = 'bg-orange-600';
        else if (isWebLLM) sendBtnColor = 'bg-blue-600';
        else if (isChrome) sendBtnColor = 'bg-green-600';

        // Helper to generate just the messages HTML
        const getMessagesHTML = () => {
             return displayMessages.map(m => `
                <div class="flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 fade-in duration-300">
                    <div class="max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm relative group text-left
                        ${m.role === 'user' 
                            ? (sendBtnColor + ' text-white rounded-br-none') 
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-bl-none'
                        }">
                        ${this.formatMessage(m.content)}
                    </div>
                </div>
             `).join('') + (isThinking ? `
                <div class="flex justify-start">
                    <div class="bg-white dark:bg-slate-800 p-3 rounded-2xl rounded-bl-none border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-1.5 w-16 justify-center">
                        <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                        <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay:0.1s"></div>
                        <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay:0.2s"></div>
                    </div>
                </div>` : '');
        };

        // If structure exists, just update chat list
        if (chatArea) {
            chatArea.innerHTML = getMessagesHTML();
            chatArea.scrollTop = chatArea.scrollHeight;
            return;
        }

        // ... Otherwise Full Render (Initial Open) ...
        this.className = "fixed inset-x-0 bottom-0 z-[100] flex flex-col items-end md:bottom-6 md:right-6 md:w-auto pointer-events-none";
        
        let headerGradient = 'from-purple-600 to-indigo-600';
        let providerName = ui.sageProviderCloud;
        
        if (isOllama) {
            headerGradient = 'from-orange-500 to-red-500';
            providerName = ui.sageProviderLocal;
        } else if (isWebLLM) {
            headerGradient = 'from-blue-500 to-cyan-500';
            providerName = ui.sageProviderBrowser;
        } else if (isChrome) {
            headerGradient = 'from-green-500 to-emerald-500';
            providerName = ui.sageModeChrome || 'Chrome Built-in';
        }

        this.innerHTML = `
            <div id="sage-backdrop" class="md:hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm pointer-events-auto transition-opacity"></div>
            <div class="pointer-events-auto transition-all duration-300 origin-bottom md:origin-bottom-right shadow-2xl md:rounded-2xl w-full md:w-[380px] h-[80dvh] md:h-[600px] bg-white dark:bg-slate-900 flex flex-col border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom-10 fade-in rounded-t-2xl">
                
                <div class="p-4 bg-gradient-to-r ${headerGradient} text-white flex justify-between items-center shadow-md z-10 shrink-0 rounded-t-2xl">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl backdrop-blur-sm shadow-inner">🦉</div>
                        <div>
                            <h3 class="font-black text-sm leading-none">Arbor Sage</h3>
                            <div class="flex items-center gap-1 mt-0.5">
                                <span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                                <p class="text-[10px] opacity-80 font-medium">${providerName}</p>
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="btn-clear" class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors" title="${ui.sageClearChat}">🗑️</button>
                        <button id="btn-settings" class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors" title="${ui.sageSettings}">⚙️</button>
                        <button class="btn-close w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors">✕</button>
                    </div>
                </div>
                
                <div id="sage-chat-area" class="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-950/30 custom-scrollbar scroll-smooth">
                     ${getMessagesHTML()}
                </div>

                <div class="px-3 py-2 flex gap-2 overflow-x-auto custom-scrollbar bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shrink-0">
                    <button class="btn-qa whitespace-nowrap px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-lg text-xs font-bold hover:bg-purple-100 transition-colors border border-purple-100 dark:border-purple-800" data-action="summarize">📝 ${ui.sageBtnSummarize}</button>
                    <button class="btn-qa whitespace-nowrap px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors border border-blue-100 dark:border-blue-800" data-action="explain">🎓 ${ui.sageBtnExplain}</button>
                    <button class="btn-qa whitespace-nowrap px-3 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg text-xs font-bold hover:bg-green-100 transition-colors border border-green-100 dark:border-green-800" data-action="quiz">❓ ${ui.sageBtnQuiz}</button>
                </div>

                <form id="sage-form" class="p-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex gap-2 shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom,20px))] md:pb-3">
                    <input id="sage-input" type="text" class="flex-1 bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 ${isOllama ? 'focus:ring-orange-500' : (isWebLLM ? 'focus:ring-blue-500' : (isChrome ? 'focus:ring-green-500' : 'focus:ring-purple-500'))} dark:text-white placeholder:text-slate-400 disabled:opacity-50" placeholder="${ui.sageInputPlaceholder}" autocomplete="off">
                    <button type="submit" class="w-11 h-11 ${sendBtnColor} text-white rounded-xl hover:opacity-90 transition-all flex items-center justify-center shadow-lg active:scale-95">
                        <svg class="w-5 h-5 translate-x-0.5 -translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
                    </button>
                </form>
            </div>
        `;

        this.querySelector('.btn-close').onclick = () => this.close();
        this.querySelector('#btn-settings').onclick = () => {
            this.mode = 'settings';
            this.render();
        };
        this.querySelector('#btn-clear').onclick = () => store.clearSageChat();

        const form = this.querySelector('#sage-form');
        form.onsubmit = (e) => {
             e.preventDefault();
             const inp = this.querySelector('#sage-input');
             if (inp.value.trim()) {
                 store.chatWithSage(inp.value.trim());
                 inp.value = '';
             }
        };

        this.querySelectorAll('.btn-qa').forEach(btn => {
            btn.onclick = () => this.runQuickAction(btn.dataset.action);
        });

        const area = this.querySelector('#sage-chat-area');
        if(area) area.scrollTop = area.scrollHeight;
    }

    formatMessage(text) {
        let formatted = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
        
        formatted = formatted.replace(
            /\[(.*?)\]\((.*?)\)/g, 
            '<a href="$2" target="_blank" class="text-blue-500 hover:underline inline-flex items-center gap-1 font-bold"><svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>$1</a>'
        );
        return formatted;
    }
}
customElements.define('arbor-sage', ArborSage);