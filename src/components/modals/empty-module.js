
import { store } from '../../store.js';

class ArborModalEmptyModule extends HTMLElement {
    connectedCallback() {
        this.render();
    }

    close() {
        store.setModal(null);
    }

    render() {
        const ui = store.ui;
        const node = store.value.modal.node;

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in">
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full relative overflow-hidden flex flex-col max-h-[95vh] border border-slate-200 dark:border-slate-800 cursor-auto transition-all duration-300">
                <button class="btn-close absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 z-20 transition-colors">✕</button>

                <div class="p-8 text-center">
                    <div class="text-4xl mb-4">🍂</div>
                    <h3 class="font-bold text-xl mb-2">${ui.emptyModuleTitle}</h3>
                    <p class="text-slate-500 mb-6">${ui.emptyModuleDesc}</p>
                    ${store.value.githubUser 
                        ? `<button class="btn-create-lesson bg-green-600 text-white px-4 py-2 rounded font-bold">Crear Primera Lección</button>` 
                        : `<p class="text-xs text-slate-400">Inicia sesión en modo editor para contribuir.</p>`}
                </div>
            </div>
        </div>`;

        this.querySelector('.btn-close').onclick = () => this.close();
        const btnCreate = this.querySelector('.btn-create-lesson');
        if(btnCreate) {
            btnCreate.onclick = () => {
                this.close();
                if(window.editFile) window.editFile(`${node.sourcePath}/01_Intro.md`);
            };
        }
    }
}
customElements.define('arbor-modal-empty-module', ArborModalEmptyModule);
