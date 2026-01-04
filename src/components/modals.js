
import { store } from '../store.js';

class ArborModals extends HTMLElement {
    constructor() { 
        super(); 
        this.tutorialStep = 0;
    }
    
    connectedCallback() {
        store.addEventListener('state-change', () => this.render());
    }

    // --- Tutorial Logic ---
    nextStep() {
        if (this.tutorialStep < store.ui.tutorialSteps.length - 1) {
            this.tutorialStep++;
            this.render();
        }
    }

    prevStep() {
        if (this.tutorialStep > 0) {
            this.tutorialStep--;
            this.render();
        }
    }

    // --- Main Render Logic ---
    render() {
        if (store.value.previewNode) {
            this.renderPreview(store.value.previewNode);
            return;
        }

        const modal = store.value.modal;
        if (!modal && store.value.viewMode !== 'certificates') {
            this.innerHTML = '';
            this.tutorialStep = 0;
            return;
        }

        if (store.value.viewMode === 'certificates') {
            this.renderCertificates();
            return;
        }

        const type = typeof modal === 'string' ? modal : modal?.type;
        const ui = store.ui;
        let content = '';

        if (type === 'tutorial') content = this.renderTutorial(ui);
        else if (type === 'sources') content = this.renderSources(ui);
        else if (type === 'about') content = this.renderAbout(ui);
        else if (type === 'language') content = this.renderLanguage(ui);
        else if (type === 'certificate') content = this.renderSingleCertificate(ui, modal.moduleId);

        if (type === 'certificate') { // Full screen overlay
            this.innerHTML = content;
        } else {
            this.innerHTML = `
                <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full relative overflow-hidden flex flex-col max-h-[90vh]">
                        <button class="btn-close absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 z-20">✕</button>
                        ${content}
                    </div>
                </div>
            `;
        }

        this.querySelectorAll('.btn-close').forEach(b => b.onclick = () => store.setModal(null));
        this.bindDynamicEvents(type);
    }
    
    bindDynamicEvents(type) {
        if (type === 'tutorial') this.bindTutorialEvents();
        if (type === 'sources') this.bindSourceEvents();
        if (type === 'language') this.bindLanguageEvents();
        if (type === 'certificate') {
            this.querySelector('#btn-next-module')?.addEventListener('click', () => {
                 const nextId = this.querySelector('#btn-next-module').dataset.nextId;
                 if (nextId) store.navigateTo(nextId);
                 store.setModal(null);
                 store.closeContent();
            });
        }
    }

    renderPreview(node) { /* Same as before, omitted */ }

    renderCertificates() { /* Same as before, omitted */ }

    renderTutorial(ui) { /* Same as before, omitted */ }

    renderSources(ui) { /* Same as before, omitted */ }

    renderAbout(ui) { /* Same as before, omitted */ }
    
    renderLanguage(ui) { /* Same as before, omitted */ }

    renderSingleCertificate(ui, moduleId) {
        const module = store.getModulesStatus().find(m => m.id === moduleId);
        if (!module) return '<div>Certificate not found.</div>';
        
        // Simplified next module logic for demo
        const nextModuleId = null;

        return `
        <div class="absolute inset-0 z-[100] flex items-center justify-center bg-white dark:bg-slate-950 p-6 overflow-y-auto">
          <button class="btn-close absolute top-4 right-4 z-[110] p-3 bg-white/50 dark:bg-slate-900/50 rounded-full hover:bg-red-500 hover:text-white transition-colors">✕</button>
          <div class="max-w-3xl w-full border-8 border-double border-stone-800 dark:border-stone-600 p-8 bg-stone-50 dark:bg-[#1a2e22] text-center shadow-2xl relative">
              <div class="py-12 px-6 border-2 border-stone-800/20 dark:border-stone-600/20">
                  <div class="w-24 h-24 mb-6 bg-green-700 text-white rounded-full flex items-center justify-center text-5xl shadow-lg mx-auto">🎓</div>
                  <h1 class="text-5xl font-black text-slate-800 dark:text-green-400 mb-2 uppercase tracking-widest font-serif">${ui.certTitle}</h1>
                  <div class="w-32 h-1 bg-stone-700 dark:bg-stone-500 mx-auto mb-8"></div>
                  <p class="text-xl text-slate-500 dark:text-slate-400 italic font-serif mb-6">${ui.certBody}</p>
                  <h2 class="text-4xl font-bold text-slate-900 dark:text-white mb-12 font-serif border-b-2 pb-2 px-12 inline-block">${module.name}</h2>
                  <p class="text-md text-slate-600 dark:text-slate-300 mb-1">${ui.certSign}</p>
                  <p class="text-sm text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-12">${new Date().toLocaleDateString()}</p>

                  <div class="flex flex-col md:flex-row gap-4 w-full justify-center">
                     <button class="px-8 py-3 bg-stone-800 text-white font-bold rounded-xl">${ui.printCert}</button>
                     ${nextModuleId ? `<button id="btn-next-module" data-next-id="${nextModuleId}" class="px-8 py-3 bg-green-600 text-white font-bold rounded-xl">${ui.nextModule}</button>` : ''}
                  </div>
              </div>
          </div>
        </div>`;
    }

    bindTutorialEvents() {
        const btnNext = this.querySelector('#btn-tut-next');
        if (btnNext) btnNext.onclick = () => this.nextStep();
        const btnPrev = this.querySelector('#btn-tut-prev');
        if (btnPrev) btnPrev.onclick = () => this.prevStep();
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
