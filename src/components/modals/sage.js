
import { store } from '../../store.js';
import { aiService } from '../../services/ai.js';

class ArborSage extends HTMLElement {
    constructor() {
        super();
        this.isVisible = false;
        this.mode = 'chat'; // 'chat' | 'settings' | 'menu' | 'architect'
        
        // UI State
        this.ollamaModels = [];
        this.pullStatus = '';
        this.hasTriedLoadingModels = false; 
        this.lastRenderKey = null;
        
        // GDPR Consent (Unified Key)
        this.hasConsent = localStorage.getItem('arbor-ai-consent') === 'true';
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
                this.mode = modal.mode || 'chat';
            } 
            else if (modal.mode && modal.mode !== this.mode) {
                this.mode = modal.mode;
            }
            // Re-read consent in case Game Player enabled it
            this.hasConsent = localStorage.getItem('arbor-ai-consent') === 'true';
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

    saveConfig(provider) {
        if (provider === 'puter') {
            aiService.setConfig({ provider: 'puter' });
        } else if (provider === 'ollama') {
            const model = this.querySelector('#inp-ollama-model').value.trim();
            const host = this.querySelector('#inp-ollama-host').value.trim();
            if (model) {
                aiService.setConfig({ 
                    provider: 'ollama', 
                    ollamaModel: model,
                    ollamaHost: host || 'http://127.0.0.1:11434'
                });
            }
        }
        this.mode = 'chat';
        this.render();
    }
    
    acceptConsent() {
        this.hasConsent = true;
        localStorage.setItem('arbor-ai-consent', 'true');
        this.render();
    }

    async loadOllamaModels() {
        this.hasTriedLoadingModels = true;
        this.ollamaModels = await aiService.listOllamaModels();
        this.render();
    }
    
    async pullModel() {
        const ui = store.ui;
        const name = this.querySelector('#inp-pull-model').value.trim();
        if(!name) return;

        this.pullStatus = ui.sageStatusDownload || 'Downloading...';
        this.render();

        const success = await aiService.pullOllamaModel(name, (status) => {
            this.pullStatus = status;
            const statusEl = this.querySelector('#pull-status');
            if(statusEl) statusEl.textContent = status;
        });

        this.pullStatus = success ? (ui.sageOllamaDone || 'Done!') : (ui.sageOllamaError || 'Error.');
        await this.loadOllamaModels();
        if(success) {
            this.querySelector('#inp-ollama-model').value = name;
        }
    }

    async runQuickAction(action) {
        const ui = store.ui;
        let prompt = '';
        if (action === 'summarize') prompt = ui.sagePromptSummarize || "Summarize this lesson.";
        if (action === 'explain') prompt = ui.sagePromptExplain || "Explain the concept.";
        if (action === 'quiz') prompt = ui.sagePromptQuiz || "Give me a quiz question.";
        if (prompt) store.chatWithSage(prompt);
    }
    
    extractBlueprint(text) {
        if (!text) return null;
        
        // 1. Try Markdown Code Block (with or without json tag, case insensitive)
        // Matches ```json { ... } ``` or ``` { ... } ```
        const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        
        if (codeBlockMatch) {
            try {
                const potentialJson = codeBlockMatch[1];
                const json = JSON.parse(potentialJson);
                // Validate structure to ensure it's a blueprint and not random code
                if (json.modules || (json.title && Array.isArray(json.lessons)) || json.languages) {
                    return json;
                }
            } catch (e) {
                // Not valid JSON inside the block
            }
        }
        
        // 2. Try Raw JSON (if the model outputted just the JSON without fences)
        const trimmed = text.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}'))) {
            try {
                const json = JSON.parse(trimmed);
                if (json.modules || json.languages) return json;
            } catch (e) {}
        }
        
        return null;
    }
    
    async handleConstruct(e) {
        const idx = e.currentTarget.dataset.msgIndex;
        const msg = store.value.ai.messages[idx];
        if(!msg) return;

        const json = this.extractBlueprint(msg.content);
        if(json) {
            try {
                const activeSource = store.value.activeSource;
                if(activeSource.type !== 'local') {
                    alert("You can only build in a Local Garden.");
                    return;
                }
                
                store.userStore.applyBlueprintToTree(activeSource.id, json);
                
                // Refresh Graph
                await store.loadData(activeSource, store.value.lang, true);
                
                store.notify("✅ Garden Constructed!");
                this.close(); 
                
            } catch(err) {
                alert("Blueprint Error: " + err.message);
            }
        } else {
            alert("Could not parse blueprint structure.");
        }
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
        const provider = aiService.config.provider;
        
        const stateKey = JSON.stringify({
             visible: this.isVisible,
             mode: this.mode,
             ollamaModels: this.ollamaModels,
             pullStatus: this.pullStatus,
             aiStatus: ai.status,
             msgCount: ai.messages.length,
             provider: provider,
             hasConsent: this.hasConsent
        });

        if (stateKey === this.lastRenderKey) return;
        this.lastRenderKey = stateKey;

        // Check for GDPR consent if using Cloud (Puter)
        if (this.mode !== 'settings' && provider === 'puter' && !this.hasConsent) {
            this.renderConsent();
            return;
        }

        if (this.mode === 'settings') {
            this.renderSettings();
        } else if (this.mode === 'menu') {
            this.renderMenu();
        } else {
            this.renderChat();
        }
    }
    
    renderConsent() {
        const ui = store.ui;
        this.className = "fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4";
        
        this.innerHTML = `
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-sm w-full relative overflow-hidden flex flex-col animate-in zoom-in duration-200 border border-slate-200 dark:border-slate-800">
                <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
                    <div class="flex items-center gap-3">
                        <span class="text-3xl">🛡️</span>
                        <h3 class="font-black text-xl text-slate-800 dark:text-white">${ui.sageGdprTitle || 'Privacy Notice'}</h3>
                    </div>
                    <button class="btn-close w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">✕</button>
                </div>
                
                <div class="p-6">
                    <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 mb-6">
                        <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                            ${ui.sageGdprText || 'This service uses Puter.js to provide Artificial Intelligence. Your messages will be processed by an external service (Puter.com). Arbor does not store your conversation history on any server.'}
                        </p>
                    </div>
                    
                    <div class="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                        <p class="text-xs font-bold text-red-600 dark:text-red-400 leading-tight">
                            ${ui.sageGdprAge || '⚠️ Age Requirement: By using this service, you confirm you are 13+ years old (per Puter.com terms).'}
                        </p>
                    </div>
                    
                    <button id="btn-accept-consent" class="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-transform">
                        ${ui.sageGdprAccept || 'I Understand & Accept'}
                    </button>
                    
                    <div class="mt-4 text-center">
                        <button id="btn-config-local" class="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline">
                            ${ui.sageModeLocal || 'Switch to Local AI (Ollama)'}
                        </button>
                    </div>
                </div>
                
                <div class="p-3 bg-slate-50 dark:bg-slate-950 text-center border-t border-slate-100 dark:border-slate-800">
                    <p class="text-[10px] text-slate-400 uppercase font-bold tracking-widest">${ui.sagePoweredBy || 'Powered by Puter.com'}</p>
                </div>
            </div>
        `;
        
        this.querySelector('.btn-close').onclick = () => this.close();
        this.querySelector('#btn-accept-consent').onclick = () => this.acceptConsent();
        this.querySelector('#btn-config-local').onclick = () => {
            this.mode = 'settings';
            this.render();
        };
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
                    <button id="btn-menu-chat" class="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all group">
                         <div class="flex items-center gap-4">
                            <div class="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-600 flex items-center justify-center text-xl">💬</div>
                            <div>
                                <h4 class="font-bold text-slate-800 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">Chat</h4>
                                <p class="text-xs text-slate-500 dark:text-slate-400">Ask the Sage</p>
                            </div>
                         </div>
                    </button>

                    <button id="btn-menu-settings" class="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all group">
                         <div class="flex items-center gap-4">
                            <div class="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 flex items-center justify-center text-xl">⚙️</div>
                            <div>
                                <h4 class="font-bold text-slate-800 dark:text-white group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">${ui.sageSettings}</h4>
                                <p class="text-xs text-slate-500 dark:text-slate-400">${ui.sageConfigDesc}</p>
                            </div>
                         </div>
                    </button>
                </div>
            </div>
        `;

        this.querySelector('.btn-close').onclick = () => this.close();
        this.querySelector('#btn-menu-chat').onclick = () => { this.mode = 'chat'; this.render(); };
        this.querySelector('#btn-menu-settings').onclick = () => { this.mode = 'settings'; this.render(); };
    }

    renderSettings() {
        const ui = store.ui;
        this.className = "fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4";
        
        const isOllamaActive = aiService.config.provider === 'ollama';

        let modelsListHtml = '';
        if (this.ollamaModels.length === 0 && !this.hasTriedLoadingModels) {
             setTimeout(() => this.loadOllamaModels(), 0);
             modelsListHtml = `<div class="text-center p-4 text-slate-400 text-xs animate-pulse">${ui.sageSearchingModels}</div>`;
        } else {
             modelsListHtml = this.ollamaModels.map(m => `
                 <div class="flex items-center justify-between p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                    <button class="flex-1 text-left btn-select-model truncate font-mono text-xs text-slate-700 dark:text-slate-300" data-name="${m.name}">
                        ${m.name}
                    </button>
                 </div>`).join('');
        }

        this.innerHTML = `
            <!-- Increased width to max-w-lg -->
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full relative overflow-hidden flex flex-col animate-in zoom-in duration-200 border border-slate-200 dark:border-slate-800 max-h-[90vh]">
                <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950 shrink-0">
                    <div class="flex items-center gap-3">
                        <span class="text-3xl">⚙️</span>
                        <h3 class="font-black text-xl text-slate-800 dark:text-white">${ui.sageConfigTitle}</h3>
                    </div>
                    <button class="btn-close w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">✕</button>
                </div>
                
                <div class="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                    
                    <!-- PUTER (Default) -->
                    <div class="bg-teal-50 dark:bg-teal-900/10 p-4 rounded-xl border border-teal-100 dark:border-teal-800/30">
                        <div class="flex items-center justify-between mb-2">
                            <div class="flex items-center gap-2">
                                <span class="text-2xl">☁️</span>
                                <p class="text-sm font-bold text-teal-700 dark:text-teal-300">Puter Cloud (Default)</p>
                            </div>
                            ${!isOllamaActive ? '<span class="text-[10px] font-black bg-teal-200 text-teal-800 px-2 py-1 rounded">ACTIVE</span>' : ''}
                        </div>
                        <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                            Free, secure cloud AI. 
                            <br><strong>Privacy Note:</strong> Data is processed by Puter.com.
                        </p>
                        <button id="btn-use-puter" class="w-full py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-lg text-xs shadow transition-colors">
                            Use Puter Cloud
                        </button>
                    </div>

                    <div class="h-px bg-slate-200 dark:bg-slate-800"></div>

                    <!-- OLLAMA (Advanced) -->
                    <div class="bg-orange-50 dark:bg-orange-900/10 p-4 rounded-xl border border-orange-100 dark:border-orange-800/30">
                        <div class="flex items-center justify-between mb-2">
                            <div class="flex items-center gap-2">
                                <span class="text-2xl">💻</span>
                                <p class="text-sm font-bold text-orange-700 dark:text-orange-400">Local (Ollama)</p>
                            </div>
                            ${isOllamaActive ? '<span class="text-[10px] font-black bg-orange-200 text-orange-800 px-2 py-1 rounded">ACTIVE</span>' : ''}
                        </div>
                        
                        <div class="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-2 rounded text-[10px] mb-4 border border-red-200 dark:border-red-800">
                            <strong>⚠️ ADVANCED ONLY:</strong> Requires a local Ollama instance running on <code>127.0.0.1:11434</code> with <code>OLLAMA_ORIGINS="*"</code> enabled.
                        </div>

                        <label class="text-[10px] font-bold text-slate-400 uppercase">Host</label>
                        <input id="inp-ollama-host" type="text" class="w-full text-xs p-2 border rounded mb-2 bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white" value="${aiService.config.ollamaHost}">

                        <label class="text-[10px] font-bold text-slate-400 uppercase">Model</label>
                        <input id="inp-ollama-model" type="text" class="w-full text-xs p-2 border rounded mb-4 bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white" value="${aiService.config.ollamaModel}">
                        
                        <div class="space-y-2">
                            <div class="flex gap-2">
                                <input id="inp-pull-model" type="text" placeholder="Pull model (e.g. mistral)" class="flex-1 text-xs p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                                <button id="btn-pull" class="px-3 py-1 bg-slate-800 text-white text-xs font-bold rounded hover:bg-black">Pull</button>
                            </div>
                            <p id="pull-status" class="text-[10px] font-mono text-blue-500 h-4">${this.pullStatus}</p>
                            <div class="max-h-24 overflow-y-auto custom-scrollbar bg-white/50 dark:bg-slate-900/50 rounded border border-slate-100 dark:border-slate-800">
                                ${modelsListHtml}
                            </div>
                        </div>

                        <button id="btn-use-ollama" class="w-full mt-4 py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-lg text-xs shadow transition-colors">
                            Connect & Use Ollama
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.querySelector('.btn-close').onclick = () => this.close();
        this.querySelector('#btn-use-puter').onclick = () => this.saveConfig('puter');
        this.querySelector('#btn-use-ollama').onclick = () => this.saveConfig('ollama');
        
        this.querySelector('#btn-pull').onclick = () => this.pullModel();
        this.querySelectorAll('.btn-select-model').forEach(b => {
             b.onclick = (e) => this.querySelector('#inp-ollama-model').value = e.currentTarget.dataset.name;
        });
    }

    renderChat() {
        const ui = store.ui;
        const chatArea = this.querySelector('#sage-chat-area');
        
        const aiState = store.value.ai;
        const isArchitect = this.mode === 'architect';
        
        const displayMessages = aiState.messages.length > 0 ? aiState.messages : [{ 
            role: 'assistant', 
            content: isArchitect ? (ui.sageArchitectIntro || "👷 Ready to build. What shall we plant?") : ui.sageHello 
        }];
        
        const displayStatus = aiState.status;
        const isOllama = aiService.config.provider === 'ollama';
        const isThinking = displayStatus === 'thinking';
        
        // --- BUTTON STATE LOGIC (Send vs Stop) ---
        let sendBtnColor = isArchitect ? 'bg-orange-600' : (isOllama ? 'bg-orange-600' : 'bg-teal-600');
        let btnIcon = `<svg class="w-5 h-5 translate-x-0.5 -translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>`;
        let btnClass = `w-11 h-11 ${sendBtnColor} text-white rounded-xl hover:opacity-90 transition-all flex items-center justify-center shadow-lg active:scale-95`;

        if (isThinking) {
            btnClass = "w-11 h-11 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-all flex items-center justify-center shadow-lg active:scale-95 animate-pulse";
            btnIcon = `<div class="w-4 h-4 bg-white rounded-sm"></div>`; // Stop Square
        }

        const getMessagesHTML = () => {
             return displayMessages.map(m => {
                let displayContent = m.content;
                let blueprintCard = '';
                
                // CRITICAL: REMOVE JSON FROM DISPLAY IF BLUEPRINT DETECTED
                const blueprint = this.extractBlueprint(m.content);
                
                if (blueprint && m.role === 'assistant') {
                    // Strip the JSON block (Markdown or raw) from display
                    displayContent = displayContent.replace(/```(?:json)?\s*[\s\S]*?\s*```/ig, '');
                    
                    // If it was raw JSON (starts with { ends with }), clear text
                    if (displayContent.trim().startsWith('{') && displayContent.trim().endsWith('}')) {
                        displayContent = ""; 
                    }
                    
                    // Fallback friendly text if message is now empty
                    if (!displayContent.trim()) {
                        displayContent = store.value.lang === 'ES' 
                            ? "Aquí está la estructura que pediste." 
                            : "Here is the structure you requested.";
                    }

                    // Build the Card
                    const cardTitle = blueprint.title || 'Custom Course';
                    const msgReady = ui.sageBlueprintReady || "Blueprint Ready";
                    const btnLabel = ui.sageBuildBtn || "Build Structure";

                    blueprintCard = `
                        <div class="mt-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm animate-in fade-in zoom-in duration-300">
                            <div class="bg-slate-50 dark:bg-slate-900 p-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
                                <div class="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-600 flex items-center justify-center text-xl">🏗️</div>
                                <div>
                                    <p class="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider">${msgReady}</p>
                                    <p class="text-[10px] text-slate-500 truncate max-w-[150px]">${cardTitle}</p>
                                </div>
                            </div>
                            <button class="btn-construct-blueprint w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors active:bg-green-700" data-msg-index="${displayMessages.indexOf(m)}">
                                <span>🔨</span> ${btnLabel}
                            </button>
                        </div>
                    `;
                }

                let contentHtml = this.formatMessage(displayContent);

                return `
                <div class="flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 fade-in duration-300">
                    <div class="max-w-[85%] relative group text-left">
                        <div class="p-3 rounded-2xl text-sm leading-relaxed shadow-sm 
                            ${m.role === 'user' 
                                ? (sendBtnColor + ' text-white rounded-br-none') 
                                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-bl-none'
                            }">
                            ${contentHtml}
                        </div>
                        ${blueprintCard}
                    </div>
                </div>
             `;
             }).join('') + (isThinking ? `
                <div class="flex justify-start">
                    <div class="bg-white dark:bg-slate-800 p-3 rounded-2xl rounded-bl-none border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-1.5 w-16 justify-center">
                        <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                        <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay:0.1s"></div>
                        <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay:0.2s"></div>
                    </div>
                </div>` : '');
        };

        if (chatArea) {
            chatArea.innerHTML = getMessagesHTML();
            chatArea.scrollTop = chatArea.scrollHeight;
            this.bindMessageEvents(chatArea);
            
            // Update button directly for existing DOM
            const btnSubmit = this.querySelector('button[type="submit"]');
            if(btnSubmit) {
                btnSubmit.className = btnClass;
                btnSubmit.innerHTML = btnIcon;
            }
            
            // Update input state
            const inp = this.querySelector('#sage-input');
            if(inp) {
                inp.disabled = isThinking;
                inp.style.opacity = isThinking ? '0.5' : '1';
                inp.style.cursor = isThinking ? 'not-allowed' : 'text';
                if(!isThinking) inp.focus();
            }
            return;
        }

        this.className = "fixed inset-x-0 bottom-0 z-[100] flex flex-col items-end md:bottom-6 md:right-6 md:w-auto pointer-events-none";
        
        let headerGradient = isArchitect ? 'from-amber-500 to-orange-600' : (isOllama ? 'from-orange-500 to-red-500' : 'from-teal-500 to-emerald-600');
        let providerName = isOllama ? 'Local (Ollama)' : 'Puter Cloud';
        if (isArchitect) providerName = 'Sage Constructor'; 

        this.innerHTML = `
            <div id="sage-backdrop" class="md:hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm pointer-events-auto transition-opacity"></div>
            <div class="pointer-events-auto transition-all duration-300 origin-bottom md:origin-bottom-right shadow-2xl md:rounded-2xl w-full md:w-[380px] h-[80dvh] md:h-[600px] bg-white dark:bg-slate-900 flex flex-col border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom-10 fade-in rounded-t-2xl">
                
                <div class="p-4 bg-gradient-to-r ${headerGradient} text-white flex justify-between items-center shadow-md z-10 shrink-0 rounded-t-2xl">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl backdrop-blur-sm shadow-inner relative">
                            <span>🦉</span>
                            ${isArchitect ? '<span class="absolute -top-1 -right-1 text-xs">⛑️</span>' : ''}
                        </div>
                        <div>
                            <h3 class="font-black text-sm leading-none">${isArchitect ? (ui.sageArchitectTitle || 'Architect') : ui.sageTitle}</h3>
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
                
                <!-- Puter Badge -->
                ${!isOllama ? `
                <div class="px-4 py-1 text-center bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shrink-0">
                    <p class="text-[9px] text-slate-400 uppercase font-bold tracking-widest opacity-60">${ui.sagePoweredBy || 'Powered by Puter.com'}</p>
                </div>
                ` : ''}

                ${!isArchitect ? `
                <div class="px-3 py-2 flex gap-2 overflow-x-auto custom-scrollbar bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shrink-0">
                    <button class="btn-qa whitespace-nowrap px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors border border-blue-100 dark:border-blue-800" data-action="summarize">📝 ${ui.sageBtnSummarize}</button>
                    <button class="btn-qa whitespace-nowrap px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors border border-blue-100 dark:border-blue-800" data-action="explain">🎓 ${ui.sageBtnExplain}</button>
                    <button class="btn-qa whitespace-nowrap px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors border border-blue-100 dark:border-blue-800" data-action="quiz">❓ ${ui.sageBtnQuiz}</button>
                </div>
                ` : ''}

                <form id="sage-form" class="p-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex gap-2 shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom,20px))] md:pb-3">
                    <input id="sage-input" type="text" class="flex-1 bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 ${isOllama || isArchitect ? 'focus:ring-orange-500' : 'focus:ring-teal-500'} dark:text-white placeholder:text-slate-400 disabled:opacity-50" placeholder="${isArchitect ? (ui.sageArchitectPlaceholder || 'Instruct the Architect...') : ui.sageInputPlaceholder}" autocomplete="off" ${isThinking ? 'disabled style="cursor:not-allowed; opacity:0.5"' : ''}>
                    <button type="submit" class="${btnClass}">
                        ${btnIcon}
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
             
             // INTERCEPT: Stop Generation if Thinking
             if (isThinking) {
                 store.abortSage();
                 return;
             }

             const inp = this.querySelector('#sage-input');
             if (inp.value.trim()) {
                 // Pass context to chat if in architect mode
                 if (isArchitect) {
                     store.update({ ai: { ...store.value.ai, contextMode: 'architect' } }); 
                 } else {
                     store.update({ ai: { ...store.value.ai, contextMode: 'normal' } }); 
                 }
                 store.chatWithSage(inp.value.trim());
                 inp.value = '';
             }
        };

        this.querySelectorAll('.btn-qa').forEach(btn => {
            btn.onclick = () => this.runQuickAction(btn.dataset.action);
        });

        const area = this.querySelector('#sage-chat-area');
        if(area) {
            area.scrollTop = area.scrollHeight;
            this.bindMessageEvents(area);
        }
    }
    
    bindMessageEvents(container) {
        container.querySelectorAll('.btn-sage-privacy').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                store.setModal('privacy');
            }
        });
        
        container.querySelectorAll('.btn-construct-blueprint').forEach(btn => {
            btn.onclick = (e) => this.handleConstruct(e);
        });
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
