
import { store } from '../store.js';

class ArborModals extends HTMLElement {
    constructor() { super(); }
    connectedCallback() {
        store.addEventListener('state-change', () => this.render());
    }
    render() {
        const type = store.value.modal;
        if (!type) {
            this.innerHTML = '';
            return;
        }

        let content = '';
        if (type === 'tutorial') {
            content = `
                <h2 class="text-2xl font-bold mb-4">Bienvenido a Arbor</h2>
                <p class="mb-6 text-slate-600">Arbor es una plataforma de aprendizaje descentralizada. Navega el grafo para explorar temas.</p>
                <button class="btn-close-modal bg-sky-500 text-white px-6 py-2 rounded-lg font-bold">Entendido</button>
            `;
        } else if (type === 'sources') {
             content = `
                <h2 class="text-2xl font-bold mb-4">Fuentes</h2>
                <input type="text" placeholder="URL data.json" class="w-full border p-2 rounded mb-4">
                <button class="bg-purple-600 text-white px-4 py-2 rounded font-bold">Cargar</button>
                <button class="btn-close-modal ml-2 text-slate-500">Cerrar</button>
             `;
        }

        this.innerHTML = `
            <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div class="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-2xl max-w-md w-full">
                    ${content}
                </div>
            </div>
        `;
        
        this.querySelectorAll('.btn-close-modal').forEach(b => b.onclick = () => store.setModal(null));
    }
}
customElements.define('arbor-modals', ArborModals);
     