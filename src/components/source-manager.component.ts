

import { Component, inject, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../services/data.service';
import { KnowledgeSource } from '../models/arbor.model';

@Component({
  selector: 'app-source-manager',
  imports: [CommonModule, FormsModule],
  template: `
    @if (isOpen()) {
      <div class="fixed inset-0 z-[70] flex items-start justify-center pt-[10vh] md:pt-[15vh] bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" (click)="closeModal.emit()">
        <div class="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col max-h-[80vh]" (click)="$event.stopPropagation()">
            
            <!-- Header -->
            <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between bg-white dark:bg-slate-900 z-10">
                <div>
                    <h2 class="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                       <span class="text-purple-500">📚</span> {{ dataService.ui().sourceManagerTitle }}
                    </h2>
                    <p class="text-slate-500 dark:text-slate-400 mt-1 text-sm">{{ dataService.ui().sourceManagerDesc }}</p>
                </div>
                <button (click)="closeModal.emit()" class="p-2 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors flex-shrink-0">
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-6 h-6 text-slate-500">
                     <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                   </svg>
               </button>
            </div>

            <!-- Toast / Status Message -->
            @if(dataService.lastActionMessage()) {
                <div class="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 px-6 py-3 text-sm font-bold flex items-center gap-2 animate-in slide-in-from-top-2 flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {{ dataService.lastActionMessage() }}
                </div>
            }
            
            <!-- Search Filter -->
            <div class="px-6 py-3 border-b border-slate-50 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 flex-shrink-0">
                <div class="relative">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    <input 
                        type="text" 
                        [(ngModel)]="searchTerm"
                        [placeholder]="dataService.ui().filterPlaceholder" 
                        class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg py-2 pl-9 pr-4 text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-purple-500 transition-shadow"
                    >
                </div>
            </div>

            <!-- List of Sources -->
            <div class="flex-1 overflow-y-auto p-4 space-y-3">
                @if (filteredSources().length === 0) {
                    <div class="text-center py-8 text-slate-400 text-sm">
                        {{ dataService.ui().noSourcesFound }}
                    </div>
                }

                @for(source of filteredSources(); track source.id) {
                    <div class="p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between transition-colors gap-4"
                         [class.bg-sky-50]="dataService.activeSource()?.id === source.id"
                         [class.dark:bg-sky-900/20]="dataService.activeSource()?.id === source.id"
                         [class.bg-slate-50]="dataService.activeSource()?.id !== source.id"
                         [class.dark:bg-slate-800/50]="dataService.activeSource()?.id !== source.id"
                    >
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-2 mb-1">
                                <p class="font-bold text-slate-800 dark:text-slate-100 truncate">{{ source.name }}</p>
                                @if(dataService.activeSource()?.id === source.id) {
                                    <span class="px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded text-[10px] uppercase font-bold tracking-wider">{{ dataService.ui().sourceActive }}</span>
                                }
                                
                                <!-- Trusted Badge -->
                                @if(source.isTrusted) {
                                     <div title="{{ dataService.ui().secVerified }}" class="flex items-center gap-1 px-1.5 py-0.5 bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 rounded text-[10px] uppercase font-bold tracking-wider border border-sky-200 dark:border-sky-800">
                                         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3 h-3"><path fill-rule="evenodd" d="M16.403 12.652a3 3 0 000-5.304 3 3 0 00-3.75-3.751 3 3 0 00-5.305 0 3 3 0 00-3.751 3.75 3 3 0 000 5.305 3 3 0 003.75 3.751 3 3 0 005.305 0 3 3 0 003.751-3.75zm-2.546-4.46a.75.75 0 00-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" /></svg>
                                         <span>Verified</span>
                                     </div>
                                } @else {
                                     <div title="{{ dataService.ui().secUnverified }}" class="flex items-center gap-1 px-1.5 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 rounded text-[10px] uppercase font-bold tracking-wider border border-orange-200 dark:border-orange-800 cursor-help">
                                         <span>⚠️ Unverified</span>
                                     </div>
                                }
                            </div>
                            
                            @if(source.isDefault) {
                                <p class="text-xs text-slate-500 dark:text-slate-400 italic">{{ dataService.ui().officialRepoDesc }}</p>
                            } @else {
                                <p class="text-xs text-slate-400 dark:text-slate-500 font-mono truncate">{{ source.description || source.url }}</p>
                            }
                        </div>

                        <div class="flex items-center gap-2 flex-shrink-0 self-end md:self-auto">
                            @if (dataService.activeSource()?.id !== source.id) {
                                <!-- Single Smart Action Button -->
                                 <button (click)="loadSource(source.id)" [disabled]="dataService.isLoading()" class="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-sky-500 hover:text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-2">
                                    @if(dataService.isLoading()) {
                                        <div class="w-3 h-3 border-2 border-slate-400 border-t-white rounded-full animate-spin"></div>
                                    }
                                    {{ dataService.ui().sourceLoad }}
                                 </button>
                            }

                            @if (!source.isDefault) {
                                <button (click)="removeSource(source.id)" title="{{ dataService.ui().sourceRemove }}" class="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                                </button>
                            }
                        </div>
                    </div>
                }
            </div>

            <!-- Add New Source Form -->
            <div class="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex-shrink-0">
                <div class="flex flex-col gap-3">
                    <input type="url" [(ngModel)]="newSourceUrl" [placeholder]="dataService.ui().sourceUrlPlaceholder" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-purple-500 outline-none">
                    <button (click)="initiateAddSource()" class="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg shadow-lg shadow-purple-600/20 transition-all active:scale-95 disabled:opacity-50" [disabled]="!newSourceUrl">
                        {{ dataService.ui().sourceAdd }}
                    </button>
                </div>
            </div>
        </div>
      </div>

      <!-- SECURITY WARNING MODAL (Nested) -->
      @if(showSecurityWarning()) {
        <div class="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-6 animate-in fade-in duration-200">
            <div class="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 border border-red-200 dark:border-red-900 animate-in zoom-in-95 duration-200">
                <div class="flex flex-col items-center text-center">
                    <div class="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-full flex items-center justify-center text-3xl mb-4">
                        🛡️
                    </div>
                    <h3 class="text-xl font-black text-slate-800 dark:text-white mb-2">{{ dataService.ui().secWarningTitle }}</h3>
                    <p class="text-slate-600 dark:text-slate-300 mb-6 text-sm leading-relaxed">
                        {{ dataService.ui().secWarningBody }}
                    </p>
                    
                    <div class="w-full bg-slate-100 dark:bg-slate-800 p-3 rounded-lg mb-6 border border-slate-200 dark:border-slate-700">
                        <p class="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">URL</p>
                        <p class="text-xs font-mono break-all text-slate-700 dark:text-slate-200">{{ newSourceUrl }}</p>
                    </div>

                    <div class="flex flex-col w-full gap-3">
                        <button (click)="confirmAddSource()" class="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg shadow-red-600/20 transition-all">
                             {{ dataService.ui().secConfirm }}
                        </button>
                        <button (click)="cancelAddSource()" class="w-full py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                             {{ dataService.ui().secCancel }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      }
    }
  `
})
export class SourceManagerComponent {
  dataService = inject(DataService);
  isOpen = input.required<boolean>();
  closeModal = output<void>();

  newSourceUrl: string = '';
  showSecurityWarning = signal(false);
  searchTerm = signal('');

  filteredSources = computed(() => {
      const term = this.searchTerm().toLowerCase();
      const allSources = this.dataService.sources();
      
      if (!term) return allSources;

      return allSources.filter(s => 
          s.name.toLowerCase().includes(term) || 
          s.url.toLowerCase().includes(term)
      );
  });

  initiateAddSource() {
      if (!this.newSourceUrl) return;

      // 1. Check if trusted
      const isTrusted = this.dataService.isUrlTrusted(this.newSourceUrl);
      
      if (isTrusted) {
          // Add immediately if trusted
          this.confirmAddSource();
      } else {
          // Show Warning
          this.showSecurityWarning.set(true);
      }
  }

  confirmAddSource() {
      this.dataService.addSource(this.newSourceUrl);
      this.resetForm();
  }

  cancelAddSource() {
      this.showSecurityWarning.set(false);
  }

  private resetForm() {
      this.newSourceUrl = '';
      this.showSecurityWarning.set(false);
  }

  removeSource(id: string) {
    if (confirm('Are you sure you want to remove this tree?')) {
        this.dataService.removeSource(id);
    }
  }

  loadSource(id: string) {
    this.dataService.loadAndSmartMerge(id);
  }
}
