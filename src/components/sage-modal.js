
import { store } from '../store.js';
import { aiService } from '../services/ai.js';

class ArborSage extends HTMLElement {
    constructor() {
        super();
        this.isVisible = false;
        this.isExpanded = false;
        this.showSettings = false;
        
        // Historial de chat local (efímero, se borra al recargar)
        this.localMessages = []; 
    }

    connectedCallback() {
        store.addEventListener('state-change', () => this.checkState());
    }

    checkState() {
        const modal = store.value.modal;
        
        // Detectar si el modal activo es el Sage
        if (modal === 'sage' || (modal && modal.type === 'sage')) {
            if (!this.isVisible) {
                this.isVisible = true;
                this.isExpanded = true;
                store.setModal(null); // Limpiar el estado global para evitar bucles
                
                // Si estamos en modo local, iniciamos con un consejo o saludo
                if (!aiService.isSmartMode()) {
                     // Añadir mensaje de bienvenida si el chat está vacío
                     if (this.localMessages.length === 0) {
                         this.localMessages.push({ role: 'assistant', content: "🦉 ¡Huu huu! Soy el Búho Local. Estoy en modo desconectado (Gratis). Puedo darte datos básicos o ubicación." });
                     }
                }
            } else {
                // Si ya estaba visible y se llama de nuevo, lo ocultamos (toggle)
                this.isVisible = false;
                store.setModal(null);
            }
        }
        
        if (this.isVisible) {
            this.render();
        } else {
            this.innerHTML = '';
        }
    }

    toggleExpand() {
        this.isExpanded = !this.isExpanded;
        this.render();
    }

    toggleSettings() {
        this.showSettings = !this.showSettings;
        this.render();
    }

    saveApiKey() {
        const inp = this.querySelector('#inp-api-key');
        if (inp && inp.value.trim()) {
            aiService.setApiKey(inp.value.trim());
            this.showSettings = false;
            store.initSage(); // Reinicializar el servicio AI en el store
        }
    }

    clearApiKey() {
        aiService.setApiKey(null);
        this.showSettings = false;
        this.localMessages = [{ role: 'assistant', content: "🦉 He vuelto al modo Local (Sin Internet)." }];
        this.render();
    }
    
    async runQuickAction(action) {
        if (aiService.isSmartMode()) {
            // Lógica Modo Gemini (Smart)
            let prompt = '';
            if (action === 'summarize') prompt = "Summarize this lesson in 3 bullet points.";
            if (action === 'explain') prompt = "Explain the main concept simply.";
            if (action === 'quiz') prompt = "Give me a test question about this.";
            if (prompt) store.chatWithSage(prompt);
        } else {
            // Lógica Modo Local (Offline)
            let cmd = '';
            if (action === 'summarize') cmd = "LOCAL_ACTION:SUMMARIZE";
            if (action === 'stats') cmd = "LOCAL_ACTION:STATS";
            if (action === 'nav') cmd = "LOCAL_ACTION:NAV";
            
            if (cmd) {
                // Simular mensaje del usuario
                let userLabel = action === 'summarize' ? "Resumir" : (action === 'stats' ? "Estadísticas" : "Ubicación");
                this.localMessages.push({ role: 'user', content: userLabel });
                this.render();

                // Simular pequeña espera para realismo
                await new Promise(r => setTimeout(r, 500));

                // Obtener respuesta del servicio local
                const reply = await aiService.chat([{ role: 'user', content: cmd }]);
                this.localMessages.push({ role: 'assistant', content: reply });
                this.render();
            }
        }
    }

    render() {
        if (!this.isVisible) {
            this.innerHTML = '';
            return;
        }

        const ui = store.ui;
        const aiState = store.value.ai;
        const isSmart = aiService.isSmartMode();
        
        // Decidir qué historial mostrar (Store/Nube o Local/Efímero)
        const displayMessages = isSmart ? aiState.messages : this.localMessages;
        const displayStatus = isSmart ? aiState.status : 'idle';

        let bubbleContent = '';

        if (this.showSettings) {
            // --- PANTALLA DE CONFIGURACIÓN ---
            bubbleContent = `
                <div class="p-6 bg-white dark:bg-slate-900 rounded-2xl border-2 border-slate-200 dark:border-slate-800 w-[340px] shadow-2xl animate-in zoom-in duration-200">
                    <div class="flex justify-between items-start mb-6">
                        <div>
                            <h3 class="font-black text-xl text-slate-800 dark:text-white">🧠 Configuración del Búho</h3>
                            <p class="text-xs text-slate-500 mt-1">Elige: Local o Gemini (Nube)</p>
                        </div>
                        <button class="btn-close-settings text-slate-400 hover:text-slate-800 bg-slate-100 dark:bg-slate-800 rounded-full w-8 h-8 font-bold">✕</button>
                    </div>
                    
                    <div class="space-y-6">
                        <div class="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                            <p class="text-xs font-bold text-slate-400 uppercase mb-2">Google Gemini API Key</p>
                            <input id="inp-api-key" type="password" placeholder="Pega tu API Key aquí..." class="w-full text-sm p-3 border-2 border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 focus:ring-4 focus:ring-purple-200 outline-none transition-all font-mono text-slate-800 dark:text-white" value="${isSmart ? '****************' : ''}">
                            <p class="text-[10px] text-slate-400 mt-2">
                                Si está vacío, se usará el <strong>Modo Local</strong> (Offline).<br>
                                Si pones una llave, se usará el <strong>Modo Gemini</strong>.
                            </p>
                        </div>

                        ${!isSmart ? `
                            <button id="btn-save-key" class="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2">
                                <span>☁️</span> CONECTAR A GEMINI
                            </button>
                            <div class="text-center"><a href="https://aistudio.google.com/app/apikey" target="_blank" class="text-xs text-blue-500 hover:underline">¿Conseguir llave gratis?</a></div>
                        ` : `
                            <button id="btn-save-key" class="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95">
                                💾 ACTUALIZAR LLAVE
                            </button>
                            <button id="btn-clear-key" class="w-full py-3 border border-red-200 dark:border-red-900/30 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 font-bold rounded-xl transition-transform active:scale-95">
                                🔌 VOLVER A MODO LOCAL
                            </button>
                        `}
                    </div>
                </div>
            `;
        } else {
            // --- INTERFAZ DE CHAT ---
            bubbleContent = `
                <div class="flex flex-col h-[500px] w-[350px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden ring-4 ring-slate-100 dark:ring-slate-800">
                    <!-- Header -->
                    <div class="p-4 ${isSmart ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white'} flex justify-between items-center shadow-md z-10 shrink-0">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl backdrop-blur-sm shadow-inner">
                                ${isSmart ? '🤖' : '🦉'}
                            </div>
                            <div>
                                <h3 class="font-black text-sm leading-none">${isSmart ? 'Gemini Activo' : 'Modo Local'}</h3>
                                <div class="flex items-center gap-1 mt-0.5">
                                    <span class="w-1.5 h-1.5 rounded-full ${isSmart ? 'bg-green-400 animate-pulse' : 'bg-slate-400'}"></span>
                                    <p class="text-[10px] opacity-80 font-medium">${isSmart ? 'Online' : 'Offline'}</p>
                                </div>
                            </div>
                        </div>
                        <div class="flex gap-1">
                             <button id="btn-settings-chat" class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors" title="Cambiar Modo">⚙️</button>
                             <button class="btn-minimize w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors" title="Minimizar">_</button>
                        </div>
                    </div>
                    
                    <!-- Área de Mensajes -->
                    <div id="sage-chat-area" class="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-950/30 custom-scrollbar scroll-smooth">
                         ${displayMessages.map(m => `
                            <div class="flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 fade-in duration-300">
                                <div class="max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm relative group text-left
                                    ${m.role === 'user' 
                                        ? 'bg-purple-600 text-white rounded-br-none' 
                                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-bl-none'
                                    }">
                                    ${this.formatMessage(m.content)}
                                </div>
                            </div>
                         `).join('')}
                         
                         ${displayStatus === 'thinking' ? `
                            <div class="flex justify-start">
                                <div class="bg-white dark:bg-slate-800 p-3 rounded-2xl rounded-bl-none border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-1.5 w-16 justify-center">
                                    <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                                    <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay:0.1s"></div>
                                    <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay:0.2s"></div>
                                </div>
                            </div>
                         ` : ''}
                    </div>

                    <!-- Botones de Acción Rápida -->
                    <div class="px-3 py-2 flex gap-2 overflow-x-auto custom-scrollbar bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shrink-0">
                        ${isSmart ? `
                            <button class="btn-qa whitespace-nowrap px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-lg text-xs font-bold hover:bg-purple-100 transition-colors border border-purple-100 dark:border-purple-800" data-action="summarize">📝 Resumir</button>
                            <button class="btn-qa whitespace-nowrap px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors border border-blue-100 dark:border-blue-800" data-action="explain">🎓 Explicar</button>
                            <button class="btn-qa whitespace-nowrap px-3 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg text-xs font-bold hover:bg-green-100 transition-colors border border-green-100 dark:border-green-800" data-action="quiz">❓ Preguntar</button>
                        ` : `
                            <button class="btn-qa whitespace-nowrap px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors border border-slate-200 dark:border-slate-700" data-action="summarize">📄 Resumir</button>
                            <button class="btn-qa whitespace-nowrap px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors border border-slate-200 dark:border-slate-700" data-action="stats">📊 Datos</button>
                            <button class="btn-qa whitespace-nowrap px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors border border-slate-200 dark:border-slate-700" data-action="nav">📍 Ubicación</button>
                        `}
                    </div>

                    <!-- Input de Chat (Solo visible en modo Smart) -->
                    ${isSmart ? `
                    <form id="sage-form" class="p-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex gap-2 shrink-0">
                        <input id="sage-input" type="text" class="flex-1 bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-purple-500 dark:text-white placeholder:text-slate-400" placeholder="Pregunta al modelo..." autocomplete="off">
                        <button type="submit" class="w-11 h-11 bg-purple-600 text-white rounded-xl hover:bg-purple-500 transition-all flex items-center justify-center shadow-lg active:scale-95">
                            <svg class="w-5 h-5 translate-x-0.5 -translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
                        </button>
                    </form>
                    ` : `
                    <div class="p-3 bg-slate-50 dark:bg-slate-950/30 text-center border-t border-slate-100 dark:border-slate-800 shrink-0">
                        <p class="text-[10px] text-slate-400 mb-2">Para chatear libremente, activa el modo Gemini.</p>
                        <button id="btn-upgrade-local" class="w-full py-2 bg-slate-200 dark:bg-slate-800 hover:bg-purple-100 hover:text-purple-600 dark:hover:text-purple-300 text-slate-500 font-bold rounded-xl text-xs transition-all active:scale-95 flex items-center justify-center gap-2">
                            <span>⚡</span> CONFIGURAR GEMINI
                        </button>
                    </div>
                    `}
                </div>
            `;
        }

        this.className = "fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-4 pointer-events-none"; 
        this.innerHTML = `
            <!-- Chat Window -->
            <div class="pointer-events-auto transition-all duration-300 origin-bottom-right shadow-2xl rounded-2xl ${this.isExpanded ? 'scale-100 opacity-100' : 'scale-0 opacity-0 absolute bottom-0 right-0'}">
                ${bubbleContent}
            </div>

            <!-- Avatar Button -->
            <button id="btn-sage-toggle" class="pointer-events-auto w-16 h-16 rounded-full bg-white dark:bg-slate-800 border-4 border-slate-50 dark:border-slate-700 shadow-2xl flex items-center justify-center text-4xl hover:scale-110 active:scale-95 transition-transform group relative z-[101]">
                ${isSmart ? '🤖' : '🦉'}
                ${this.isExpanded ? 
                    `<div class="absolute -top-1 -right-1 w-6 h-6 bg-slate-200 dark:bg-slate-600 rounded-full flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300 shadow-sm border border-white dark:border-slate-800">✕</div>` 
                    : ''}
            </button>
        `;

        this.bindEvents(isSmart);
        
        // Auto-scroll al final
        if(this.isExpanded) {
            const area = this.querySelector('#sage-chat-area');
            if(area) area.scrollTop = area.scrollHeight;
        }
    }

    formatMessage(text) {
        // Formato básico markdown para chat
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
    }

    bindEvents(isSmart) {
        this.querySelector('#btn-sage-toggle').onclick = () => this.toggleExpand();

        if (this.showSettings) {
            this.querySelector('.btn-close-settings').onclick = () => this.toggleSettings();
            this.querySelector('#btn-save-key').onclick = () => this.saveApiKey();
            
            const btnClear = this.querySelector('#btn-clear-key');
            if (btnClear) btnClear.onclick = () => this.clearApiKey();
            
            // Feedback visual al escribir la key
            const inp = this.querySelector('#inp-api-key');
            if(inp) {
                inp.oninput = (e) => {
                    const val = e.target.value.trim();
                    if(val.length > 5) {
                        inp.classList.add('border-purple-500', 'bg-purple-50');
                        inp.classList.remove('border-slate-300', 'bg-white');
                    }
                };
            }
            return;
        }

        this.querySelector('.btn-minimize').onclick = () => this.toggleExpand();
        this.querySelector('#btn-settings-chat').onclick = () => this.toggleSettings();
        
        // Acciones Rápidas
        this.querySelectorAll('.btn-qa').forEach(btn => {
            btn.onclick = () => this.runQuickAction(btn.dataset.action);
        });

        if (isSmart) {
             const form = this.querySelector('#sage-form');
             if (form) {
                 form.onsubmit = (e) => {
                     e.preventDefault();
                     const inp = this.querySelector('#sage-input');
                     if (inp.value.trim()) {
                         store.chatWithSage(inp.value.trim());
                         inp.value = '';
                     }
                 };
             }
        } else {
             const btnUp = this.querySelector('#btn-upgrade-local');
             if(btnUp) btnUp.onclick = () => this.toggleSettings();
        }
    }
}
customElements.define('arbor-sage', ArborSage);
