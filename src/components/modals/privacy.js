
import { store } from '../../store.js';

class ArborModalPrivacy extends HTMLElement {
    connectedCallback() {
        this.render();
        store.addEventListener('state-change', () => this.render());
    }

    close() {
        store.setModal(null);
    }

    openImpressum() {
        // Redirect to the About Modal, specifically the Legal tab
        store.setModal({ type: 'about', tab: 'legal' });
    }

    render() {
        const ui = store.ui;
        
        let privacyHtml = ui.privacyText || "Legal text not loaded.";
        
        // REPLACEMENT LOGIC:
        // Instead of showing the full address here, we provide a link to the Impressum.
        const controllerReference = `
            <div class="mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                <p class="text-sm text-slate-600 dark:text-slate-300 mb-2 font-medium">
                    ${ui.impressumText || "The data controller is the publisher of this application."}
                </p>
                <button id="btn-link-impressum" class="text-blue-600 dark:text-blue-400 hover:underline text-xs font-bold flex items-center gap-2 transition-colors">
                    <span>⚖️</span> <span>Go to Legal Notice (Impressum)</span> ➜
                </button>
            </div>
        `;

        // Replace the placeholder {impressum} with the link button
        privacyHtml = privacyHtml.replace('{impressum}', controllerReference);

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in">
            <!-- Increased width to max-w-3xl -->
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-3xl w-full relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto" style="height: 600px; max-height: 85vh;">
                
                <!-- Header -->
                <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950 shrink-0">
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">🛡️</span>
                        <h3 class="font-black text-xl text-slate-800 dark:text-white">${ui.privacyTitle || "Privacy & Data Protection"}</h3>
                    </div>
                    <button class="btn-close w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 transition-colors">✕</button>
                </div>

                <!-- Content -->
                <div class="p-8 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                    <div class="prose prose-sm prose-slate dark:prose-invert max-w-none">
                        
                        <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 mb-6 not-prose">
                            <p class="text-xs text-blue-800 dark:text-blue-300 font-bold leading-relaxed">
                                <strong>Data Sovereignty:</strong> This application runs "Local-First". Your educational progress is stored in your browser's LocalStorage. No data is sent to our servers because we do not have servers.
                            </p>
                        </div>

                        ${privacyHtml}
                        
                        <hr class="my-6 border-slate-200 dark:border-slate-700">
                        
                        <h3>Children's Privacy (Age Limit)</h3>
                        <div class="bg-red-50 dark:bg-red-900/10 p-4 rounded-xl border border-red-100 dark:border-red-900/30 text-xs">
                            <p class="font-bold text-red-700 dark:text-red-400 mb-2">Age Restriction (16+)</p>
                            <p class="text-slate-600 dark:text-slate-300 mb-2">
                                The optional cloud services provided by <strong>Puter.com</strong> (AI and Sync) are restricted to users who meet the minimum age of digital consent in their country (typically 16+ in the EU).
                            </p>
                            <p class="text-slate-600 dark:text-slate-300">
                                We do not knowingly collect personal information from minors.
                            </p>
                        </div>

                        <hr class="my-6 border-slate-200 dark:border-slate-700">
                        
                        <h3>Technical Stack (Transparency)</h3>
                        <ul class="text-xs font-mono bg-slate-100 dark:bg-slate-800 p-4 rounded-lg list-none space-y-2">
                            <li><strong>Hosting:</strong> GitHub Pages (Static Hosting)</li>
                            <li><strong>Cloud/AI (Optional):</strong> Puter.com (USA - Only if connected)</li>
                            <li><strong>Fonts:</strong> System Fonts (Privacy-Safe / No Google Fonts)</li>
                            <li><strong>Visualization:</strong> Custom Engine (No external trackers)</li>
                            <li><strong>Styling:</strong> Internal CSS Engine (No external CDNs)</li>
                        </ul>

                    </div>
                </div>
                
                <div class="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-center shrink-0">
                    <button class="btn-close w-full py-3 bg-slate-900 dark:bg-slate-700 text-white font-bold rounded-xl hover:opacity-90 transition-opacity">
                        ${ui.close || "Close"}
                    </button>
                </div>
            </div>
        </div>`;

        this.querySelectorAll('.btn-close').forEach(b => b.onclick = () => this.close());
        
        const btnLink = this.querySelector('#btn-link-impressum');
        if (btnLink) btnLink.onclick = () => this.openImpressum();
    }
}
customElements.define('arbor-modal-privacy', ArborModalPrivacy);
