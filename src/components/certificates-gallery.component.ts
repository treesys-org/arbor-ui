

import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../services/data.service';
import { ModuleStatus } from '../models/arbor.model';

@Component({
  selector: 'app-certificates-gallery',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-0 md:p-10 animate-in fade-in duration-300">
      
      <div class="bg-white dark:bg-slate-950 rounded-none md:rounded-3xl w-full max-w-6xl h-full md:max-h-[90vh] shadow-2xl relative border-0 md:border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        
        <!-- Header -->
        <div class="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-white dark:bg-slate-950 z-10 pt-16 md:pt-6">
           <div>
               <h2 class="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                   <span class="text-green-600">🏆</span> {{ dataService.ui().navCertificates }}
               </h2>
               <p class="text-slate-500 dark:text-slate-400 mt-1">{{ dataService.ui().modulesProgress }}</p>
           </div>
           
           <div class="flex items-center gap-4 w-full md:w-auto">
               <!-- Search Bar -->
               <div class="relative flex-1 md:w-64">
                   <input 
                    type="text" 
                    [(ngModel)]="searchTerm" 
                    [placeholder]="dataService.ui().searchCert"
                    class="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-xl px-4 py-2 pl-10 text-sm font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-green-600 outline-none"
                   >
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                     <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                   </svg>
               </div>

               <!-- Filter Toggle -->
               <button (click)="toggleShowAll()" class="whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                   [class.bg-green-100]="!showAll()"
                   [class.text-green-700]="!showAll()"
                   [class.dark:bg-green-900/30]="!showAll()"
                   [class.dark:text-green-400]="!showAll()"
                   [class.bg-slate-100]="showAll()"
                   [class.text-slate-500]="showAll()"
                   [class.dark:bg-slate-800]="showAll()"
               >
                   {{ showAll() ? dataService.ui().showAll : dataService.ui().showEarned }}
               </button>

               <button (click)="close()" class="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors flex-shrink-0">
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-6 h-6 text-slate-500">
                     <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                   </svg>
               </button>
           </div>
        </div>

        <!-- Scrollable Grid -->
        <div class="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-50 dark:bg-slate-900/50">
            @if (filteredModules().length === 0) {
                <div class="flex flex-col items-center justify-center h-full text-slate-400">
                    <div class="text-4xl mb-4">🔍</div>
                    <p>{{ dataService.ui().noResults }}</p>
                </div>
            }
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20 md:pb-0">
                @for (module of filteredModules(); track module.id) {
                    <div class="relative group overflow-hidden rounded-2xl border-2 transition-all duration-300 bg-white dark:bg-slate-900"
                         [class.border-green-600]="module.isComplete"
                         [class.shadow-xl]="module.isComplete"
                         [class.shadow-green-600/20]="module.isComplete"
                         [class.border-slate-200]="!module.isComplete"
                         [class.dark:border-slate-800]="!module.isComplete"
                         [class.opacity-75]="!module.isComplete"
                    >
                        <!-- Card Content -->
                        <div class="p-6 flex flex-col h-full relative z-10">
                            <!-- Icon -->
                            <div class="flex justify-between items-start mb-4">
                                <div class="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shadow-inner border border-white dark:border-slate-700"
                                     [class.bg-gradient-to-br]="true"
                                     [class.from-green-100]="module.isComplete"
                                     [class.to-white]="module.isComplete"
                                     [class.dark:from-green-900/20]="module.isComplete"
                                     [class.dark:to-slate-900]="module.isComplete"
                                     [class.bg-slate-100]="!module.isComplete"
                                     [class.dark:bg-slate-800]="!module.isComplete"
                                     [class.grayscale]="!module.isComplete"
                                >
                                    {{ module.icon || '📦' }}
                                </div>
                                @if (module.isComplete) {
                                    <div class="bg-green-600 text-white text-[10px] font-black px-2 py-1 rounded uppercase tracking-wider shadow-sm">
                                        {{ dataService.ui().lessonFinished }}
                                    </div>
                                } @else {
                                    <div class="text-slate-400">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                                    </div>
                                }
                            </div>

                            <!-- Title -->
                            <h3 class="text-xl font-black text-slate-800 dark:text-white mb-2 leading-tight">
                                {{ module.name }}
                            </h3>
                            <p class="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-2 min-h-[2.5em]">
                                {{ module.description || module.path }}
                            </p>

                            <!-- Progress Bar -->
                            <div class="mt-auto">
                                <div class="flex justify-between text-xs font-bold text-slate-400 mb-1">
                                    <span>{{ module.completedLeaves }} / {{ module.totalLeaves }}</span>
                                    <span>{{ getPct(module) }}%</span>
                                </div>
                                <div class="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div class="h-full bg-green-600 transition-all duration-500" [style.width.%]="getPct(module)"></div>
                                </div>
                            </div>

                            <!-- Actions -->
                            <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                                @if(module.isComplete) {
                                    <button (click)="viewCertificate(module)" class="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl shadow-lg shadow-green-600/30 transition-all active:scale-95 flex items-center justify-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        {{ dataService.ui().viewCert }}
                                    </button>
                                } @else {
                                    <button disabled class="w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-400 font-bold rounded-xl cursor-not-allowed border border-transparent">
                                        {{ dataService.ui().lockedCert }}
                                    </button>
                                }
                            </div>
                        </div>

                        <!-- BG Decoration -->
                         <div class="absolute -bottom-10 -right-10 opacity-5 dark:opacity-10 pointer-events-none text-9xl">
                             {{ module.icon }}
                         </div>
                    </div>
                }
            </div>
        </div>
      </div>

      <!-- DIPLOMA OVERLAY (Nested) -->
      @if(selectedModule(); as sm) {
        <div class="absolute inset-0 z-[60] flex items-center justify-center bg-white dark:bg-slate-950 animate-in zoom-in-95 duration-300 p-0 md:p-6 overflow-y-auto">
              <button (click)="closeCertificate()" class="absolute top-4 right-4 z-[70] p-3 bg-white/50 dark:bg-slate-900/50 rounded-full hover:bg-red-500 hover:text-white transition-colors no-print">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>

              <div class="max-w-4xl w-full border-8 border-double border-stone-800 dark:border-stone-600 p-6 md:p-12 bg-stone-50 dark:bg-[#1a2e22] text-center shadow-2xl relative min-h-full md:min-h-0 flex flex-col justify-center">
                  
                  <div class="absolute top-4 left-4 w-12 md:w-24 h-12 md:h-24 border-t-4 border-l-4 border-stone-800 dark:border-stone-600"></div>
                  <div class="absolute top-4 right-4 w-12 md:w-24 h-12 md:h-24 border-t-4 border-r-4 border-stone-800 dark:border-stone-600"></div>
                  <div class="absolute bottom-4 left-4 w-12 md:w-24 h-12 md:h-24 border-b-4 border-l-4 border-stone-800 dark:border-stone-600"></div>
                  <div class="absolute bottom-4 right-4 w-12 md:w-24 h-12 md:h-24 border-b-4 border-r-4 border-stone-800 dark:border-stone-600"></div>

                  <div class="py-8 md:py-16 px-4 md:px-8 border-2 border-stone-800/20 dark:border-stone-600/20 h-full flex flex-col items-center justify-center">
                      <div class="w-20 h-20 md:w-28 md:h-28 mb-8 bg-green-700 text-white rounded-full flex items-center justify-center text-5xl md:text-6xl shadow-xl">🎓</div>

                      <h1 class="text-3xl md:text-6xl font-black text-slate-800 dark:text-green-400 mb-4 uppercase tracking-widest font-serif">{{ dataService.ui().certTitle }}</h1>
                      <div class="w-32 md:w-40 h-1 bg-stone-700 dark:bg-stone-500 mx-auto mb-10"></div>

                      <p class="text-lg md:text-2xl text-slate-500 dark:text-slate-400 italic font-serif mb-8">{{ dataService.ui().certBody }}</p>

                      <h2 class="text-2xl md:text-5xl font-bold text-slate-900 dark:text-white mb-16 font-serif border-b-2 border-slate-300 dark:border-slate-700 pb-4 px-4 md:px-12 inline-block min-w-[200px] md:min-w-[300px]">
                          {{ sm.name }}
                      </h2>

                      <div class="flex flex-col md:flex-row justify-between w-full max-w-2xl mt-4 md:mt-12 px-4 md:px-12 gap-8 md:gap-0">
                           <div class="text-center">
                                <div class="w-full md:w-48 border-b border-slate-400 mb-2"></div>
                                <p class="text-sm font-bold text-slate-600 dark:text-slate-300">{{ dataService.ui().certSign }}</p>
                           </div>
                           <div class="text-center">
                                <p class="text-lg font-mono text-slate-800 dark:text-slate-200 border-b border-slate-400 mb-2 px-4">{{ dateStr() }}</p>
                                <p class="text-sm font-bold text-slate-600 dark:text-slate-300">{{ dataService.ui().certDate }}</p>
                           </div>
                      </div>

                      <div class="mt-16 no-print w-full md:w-auto">
                           <button (click)="print()" class="w-full md:w-auto px-8 py-4 bg-stone-800 hover:bg-stone-700 text-white font-bold rounded-xl shadow-lg shadow-stone-800/30 transition-transform hover:scale-105 active:scale-95 flex items-center justify-center gap-3">
                               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" /></svg>
                               {{ dataService.ui().printCert }}
                           </button>
                      </div>
                  </div>
              </div>
        </div>
      }

    </div>
  `
})
export class CertificatesGalleryComponent {
  dataService = inject(DataService);
  
  modules = this.dataService.modulesStatus;
  selectedModule = signal<ModuleStatus | null>(null);
  dateStr = signal(new Date().toLocaleDateString());
  
  searchTerm = signal('');
  showAll = signal(false); // Default false: Only Show Earned

  filteredModules = computed(() => {
      const q = this.searchTerm().toLowerCase();
      const all = this.showAll();
      return this.modules().filter(m => {
          // Filter by logic (Completed vs All)
          if (!all && !m.isComplete) return false;
          
          // Filter by Search
          if (!q) return true;
          return m.name.toLowerCase().includes(q) || (m.description && m.description.toLowerCase().includes(q));
      });
  });

  close() {
      // Close overlay (handled by parent logic via viewMode or simple boolean in App)
      // For now, we reuse viewMode but toggle back to 'explore'
      this.dataService.setViewMode('explore');
  }

  toggleShowAll() {
      this.showAll.update(v => !v);
  }

  getPct(m: ModuleStatus) {
      if(m.totalLeaves === 0) return 0;
      return Math.round((m.completedLeaves / m.totalLeaves) * 100);
  }

  viewCertificate(m: ModuleStatus) {
      this.selectedModule.set(m);
  }

  closeCertificate() {
      this.selectedModule.set(null);
  }

  print() {
      window.print();
  }
}
