
import { store } from '../store.js';

class ArborModals extends HTMLElement {
    constructor() { super(); }
    
    connectedCallback() {
        store.addEventListener('state-change', () => this.render());
    }

    render() {
        // Handle Preview Modal (Small)
        if (store.value.previewNode) {
            this.renderPreview(store.value.previewNode);
            return;
        }

        // Handle Main Modals
        const type = store.value.modal;
        if (!type && store.value.viewMode !== 'certificates') {
            this.innerHTML = '';
            return;
        }

        if (store.value.viewMode === 'certificates') {
            this.renderCertificates();
            return;
        }

        const ui = store.ui;
        let content = '';

        if (type === 'tutorial') {
            content = this.renderTutorial(ui);
        } else if (type === 'sources') {
            content = this.renderSources(ui);
        } else if (type === 'about') {
            content = this.renderAbout(ui);
        } else if (type === 'language') {
            content = this.renderLanguage(ui);
        }

        this.innerHTML = `
            <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
                <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full relative overflow-hidden flex flex-col max-h-[90vh]">
                    <button class="btn-close absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">✕</button>
                    ${content}
                </div>
            </div>
        `;

        this.querySelectorAll('.btn-close').forEach(b => b.onclick = () => store.setModal(null));
        
        // Dynamic Bindings
        if (type === 'sources') this.bindSourceEvents();
        if (type === 'language') this.bindLanguageEvents();
    }

    renderPreview(node) {
        const ui = store.ui;
        const isDone = store.isCompleted(node.id);
        
        this.innerHTML = `
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onclick="store.closePreview()">
            <div class="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-sm w-full shadow-2xl relative text-center" onclick="event.stopPropagation()">
                 <div class="absolute -top-10 left-1/2 -translate-x-1/2 w-20 h-20 bg-white dark:bg-slate-800 rounded-2xl shadow-xl flex items-center justify-center text-4xl border-4 border-slate-50 dark:border-slate-700">
                     ${node.icon || '📄'}
                 </div>
                 <h2 class="mt-10 text-2xl font-black mb-2">${node.name}</h2>
                 <p class="text-slate-500 mb-6 text-sm">${node.description || ui.noDescription}</p>
                 
                 <div class="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 mb-6">
                    <div class="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div class="h-full bg-green-500" style="width: ${isDone ? '100%' : '0%'}"></div>
                    </div>
                    <p class="mt-2 text-xs text-slate-500">${isDone ? ui.lessonCompleted : ui.lessonNotStarted}</p>
                 </div>

                 <div class="flex gap-3">
                     <button onclick="store.closePreview()" class="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-slate-500">${ui.cancel}</button>
                     <button onclick="store.enterLesson()" class="flex-1 py-3 bg-sky-500 text-white rounded-xl font-bold shadow-lg shadow-sky-500/30">${ui.enter}</button>
                 </div>
            </div>
        </div>`;
    }

    renderCertificates() {
        const ui = store.ui;
        const modules = store.getModulesStatus();
        
        this.innerHTML = `
        <div class="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md overflow-y-auto p-4 md:p-10">
            <div class="max-w-6xl mx-auto bg-white dark:bg-slate-950 min-h-full rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
                <div class="p-8 border-b dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-950 sticky top-0 z-10">
                    <div>
                        <h2 class="text-3xl font-black dark:text-white">🏆 ${ui.navCertificates}</h2>
                        <p class="text-slate-500">${ui.modulesProgress}</p>
                    </div>
                    <button onclick="store.setViewMode('explore')" class="p-3 bg-slate-100 dark:bg-slate-800 rounded-full">✕</button>
                </div>
                
                <div class="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                    ${modules.map(m => `
                        <div class="p-6 rounded-2xl border-2 ${m.isComplete ? 'border-green-500 bg-white dark:bg-slate-900 shadow-xl' : 'border-slate-200 dark:border-slate-800 opacity-70'} transition-all relative overflow-hidden">
                             <div class="flex justify-between mb-4">
                                <div class="text-4xl">${m.icon || '📦'}</div>
                                ${m.isComplete ? `<span class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold h-fit">${ui.lessonFinished}</span>` : ''}
                             </div>
                             <h3 class="text-xl font-black mb-2 dark:text-white">${m.name}</h3>
                             
                             <div class="mt-4">
                                <div class="flex justify-between text-xs font-bold text-slate-400 mb-1">
                                    <span>${m.completedLeaves}/${m.totalLeaves}</span>
                                    <span>${Math.round((m.completedLeaves/m.totalLeaves)*100)}%</span>
                                </div>
                                <div class="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div class="h-full bg-green-500" style="width: ${(m.completedLeaves/m.totalLeaves)*100}%"></div>
                                </div>
                             </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>`;
    }

    renderTutorial(ui) {
        return `
            <div class="p-10 text-center">
                <div class="text-6xl mb-6">🚀</div>
                <h2 class="text-3xl font-black mb-4 dark:text-white">${ui.tutorialTitle}</h2>
                <p class="text-slate-600 dark:text-slate-300 mb-8 leading-relaxed">
                    ${ui.tutorialSteps[0].text}
                </p>
                <button class="btn-close w-full py-4 bg-sky-500 text-white font-bold rounded-xl shadow-lg shadow-sky-500/30">
                    ${ui.tutorialFinish}
                </button>
            </div>
        `;
    }

    renderSources(ui) {
        return `
            <div class="p-6 border-b dark:border-slate-800 flex justify-between items-center">
                <h2 class="text-2xl font-black dark:text-white">📚 ${ui.sourceManagerTitle}</h2>
            </div>
            <div class="flex-1 overflow-y-auto p-6 space-y-4">
                ${store.value.sources.map(s => `
                    <div class="p-4 rounded-xl flex items-center justify-between ${store.value.activeSource.id === s.id ? 'bg-sky-50 dark:bg-sky-900/20' : 'bg-slate-50 dark:bg-slate-800'}">
                        <div>
                            <p class="font-bold dark:text-white">${s.name}</p>
                            <p class="text-xs text-slate-400 truncate max-w-[200px]">${s.url}</p>
                        </div>
                        ${store.value.activeSource.id !== s.id ? `
                            <button class="btn-load-source px-3 py-2 bg-slate-200 dark:bg-slate-700 text-xs font-bold rounded-lg" data-id="${s.id}">${ui.sourceLoad}</button>
                        ` : '<span class="text-xs font-bold text-green-500">Active</span>'}
                    </div>
                `).join('')}
            </div>
            <div class="p-6 bg-slate-50 dark:bg-slate-900/50 border-t dark:border-slate-800">
                <input type="url" id="source-url" placeholder="${ui.sourceUrlPlaceholder}" class="w-full p-3 rounded-lg border dark:border-slate-700 dark:bg-slate-800 mb-3 text-sm">
                <button id="btn-add-source" class="w-full py-3 bg-purple-600 text-white font-bold rounded-lg shadow-lg shadow-purple-600/20">${ui.sourceAdd}</button>
            </div>
        `;
    }

    renderAbout(ui) {
         return `
            <div class="p-8 text-center overflow-y-auto">
                <div class="text-6xl mb-4">ℹ️</div>
                <h2 class="text-2xl font-black mb-4 dark:text-white">${ui.aboutTitle}</h2>
                <div class="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl text-left text-sm text-slate-600 dark:text-slate-300 mb-4">
                    <p class="font-bold mb-2">🎯 ${ui.missionTitle}</p>
                    <p>${ui.missionText}</p>
                </div>
                <p class="text-xs text-slate-400 font-mono mb-6">${ui.lastUpdated} ${new Date().toLocaleDateString()}</p>
                <a href="https://github.com/treesys-org/arbor-knowledge" target="_blank" class="block w-full py-3 bg-slate-800 text-white font-bold rounded-xl">${ui.viewOnGithub}</a>
            </div>
        `;
    }

    renderLanguage(ui) {
        return `
             <div class="p-8 text-center">
                 <div class="text-6xl mb-4">🌍</div>
                 <h2 class="text-2xl font-black mb-6 dark:text-white">${ui.languageTitle}</h2>
                 <div class="space-y-3">
                     ${store.availableLanguages.map(l => `
                        <button class="btn-lang w-full p-4 rounded-xl border-2 flex items-center justify-between ${store.value.lang === l.code ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-800'}" data-code="${l.code}">
                             <span class="text-xl">${l.flag} ${l.nativeName}</span>
                             ${store.value.lang === l.code ? '✅' : ''}
                        </button>
                     `).join('')}
                 </div>
             </div>
        `;
    }

    bindSourceEvents() {
        this.querySelector('#btn-add-source').onclick = () => {
            const url = this.querySelector('#source-url').value;
            store.addSource(url);
        };
        this.querySelectorAll('.btn-load-source').forEach(b => {
            b.onclick = (e) => store.loadAndSmartMerge(e.target.dataset.id);
        });
    }

    bindLanguageEvents() {
        this.querySelectorAll('.btn-lang').forEach(b => {
            b.onclick = (e) => {
                store.setLanguage(e.currentTarget.dataset.code);
                store.setModal(null);
            };
        });
    }
}
customElements.define('arbor-modals', ArborModals);
