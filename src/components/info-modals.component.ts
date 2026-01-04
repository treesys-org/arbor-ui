

import { Component, inject, input, output, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../services/data.service';

@Component({
  selector: 'app-info-modals',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isOpen()) {
    <div class="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      
      <div class="bg-white dark:bg-slate-900 rounded-3xl p-0 max-w-lg w-full shadow-2xl relative text-center border border-slate-200 dark:border-slate-800 transition-colors max-h-[90vh] overflow-hidden flex flex-col">
        
        <!-- CLOSE BUTTON (Absolute) -->
        <button (click)="close.emit()" class="absolute top-4 right-4 z-20 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        @if (type() === 'tutorial') {
             <!-- TUTORIAL / WIZARD MODE -->
             <div class="flex flex-col h-full">
                 
                 <!-- Carousel Content -->
                 <div class="flex-1 p-8 md:p-10 flex flex-col items-center justify-center min-h-[400px]">
                      @let step = dataService.ui().tutorialSteps[currentStep()];
                      
                      <!-- Step Indicator -->
                      <div class="flex gap-2 mb-8">
                          @for (s of dataService.ui().tutorialSteps; track $index) {
                              <div class="h-1.5 rounded-full transition-all duration-300"
                                   [class.w-8]="$index === currentStep()"
                                   [class.bg-sky-500]="$index === currentStep()"
                                   [class.w-2]="$index !== currentStep()"
                                   [class.bg-slate-200]="$index !== currentStep()"
                                   [class.dark:bg-slate-700]="$index !== currentStep()"
                              ></div>
                          }
                      </div>

                      <!-- Icon -->
                      <div class="w-24 h-24 bg-gradient-to-br from-sky-100 to-white dark:from-slate-800 dark:to-slate-900 rounded-3xl flex items-center justify-center text-6xl shadow-inner border border-white dark:border-slate-700 mb-8 animate-in zoom-in duration-500 key-{{currentStep()}}">
                          {{ step.icon }}
                      </div>

                      <!-- Text -->
                      <h2 class="text-2xl font-black text-slate-800 dark:text-white mb-4 animate-in slide-in-from-bottom-2 duration-500 key-title-{{currentStep()}}">
                          {{ step.title }}
                      </h2>
                      <p class="text-slate-500 dark:text-slate-400 font-medium leading-relaxed text-sm md:text-base animate-in slide-in-from-bottom-4 duration-500 key-text-{{currentStep()}}">
                          {{ step.text }}
                      </p>
                 </div>

                 <!-- Controls -->
                 <div class="p-6 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950/50">
                      <button (click)="close.emit()" class="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 uppercase tracking-wider px-4 py-2">
                          {{ dataService.ui().tutorialSkip }}
                      </button>

                      <div class="flex gap-3">
                          @if (currentStep() > 0) {
                              <button (click)="prevStep()" class="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-white dark:hover:bg-slate-800 text-slate-500 transition-colors">
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                              </button>
                          }
                          
                          @if (currentStep() < totalSteps() - 1) {
                              <button (click)="nextStep()" class="px-6 h-10 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl shadow-lg shadow-sky-500/20 active:scale-95 transition-all flex items-center gap-2">
                                  {{ dataService.ui().tutorialNext }}
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                              </button>
                          } @else {
                              <button (click)="close.emit()" class="px-6 h-10 bg-green-500 hover:bg-green-400 text-white font-bold rounded-xl shadow-lg shadow-green-500/20 active:scale-95 transition-all flex items-center gap-2 animate-pulse">
                                  {{ dataService.ui().tutorialFinish }}
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                              </button>
                          }
                      </div>
                 </div>
             </div>

        } @else {
            <!-- STANDARD INFO MODALS (About, Impressum, Language) -->
            <div class="p-6 md:p-8 overflow-y-auto custom-scrollbar max-h-[80vh]">
                
                @if (type() === 'about') {
                    <div class="mb-6">
                        <div class="w-20 h-20 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl">
                        ℹ️
                        </div>
                        <h2 class="text-2xl font-black text-slate-800 dark:text-white mb-2">{{ dataService.ui().aboutTitle }}</h2>
                        
                        <div class="text-left space-y-4 text-slate-500 dark:text-slate-400 font-medium text-sm leading-relaxed mt-4 bg-slate-50 dark:bg-slate-800 p-4 rounded-xl">
                            <div>
                                <h3 class="font-bold text-slate-700 dark:text-slate-200 mb-1">🎯 {{ dataService.ui().missionTitle }}</h3>
                                <p>{{ dataService.ui().missionText }}</p>
                            </div>
                            @if(dataService.lastUpdatedTimestamp()) {
                            <div class="border-t border-slate-200 dark:border-slate-700 pt-3 mt-3">
                                <p class="text-xs uppercase font-bold text-slate-400">{{ dataService.ui().lastUpdated }}</p>
                                <p class="font-mono text-xs text-slate-600 dark:text-slate-300">{{ dataService.lastUpdatedTimestamp() }}</p>
                            </div>
                            }
                        </div>
                        <a href="https://github.com" target="_blank" rel="noopener noreferrer" class="mt-6 w-full flex items-center justify-center gap-3 py-3 px-4 bg-slate-800 hover:bg-slate-700 dark:bg-slate-200 dark:hover:bg-slate-300 text-white dark:text-slate-800 font-bold text-sm rounded-xl transition-all">
                            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd"></path></svg>
                            {{ dataService.ui().viewOnGithub }}
                        </a>
                    </div>
                } @else if (type() === 'impressum') {
                    <div class="mb-6">
                        <h2 class="text-xl font-black text-slate-800 dark:text-white mb-4">{{ dataService.ui().impressumTitle }}</h2>
                        <div class="text-left bg-slate-50 dark:bg-slate-800 p-6 rounded-xl text-sm text-slate-600 dark:text-slate-300 space-y-4">
                            <p>{{ dataService.ui().impressumText }}</p>

                            @if (!isImpressumDetailsVisible()) {
                                <button (click)="isImpressumDetailsVisible.set(true)" class="text-sky-600 dark:text-sky-400 font-bold text-xs hover:underline">
                                    {{ dataService.ui().showImpressumDetails }}
                                </button>
                            } @else {
                                <div class="font-mono pt-4 border-t border-slate-200 dark:border-slate-700 whitespace-pre-wrap animate-in fade-in duration-300 text-xs">
                                    {{ dataService.ui().impressumDetails }}
                                </div>
                            }
                        </div>
                    </div>
                } @else if (type() === 'language') {
                    <div class="mb-6">
                        <div class="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl">
                        🌍
                        </div>
                        <h2 class="text-2xl font-black text-slate-800 dark:text-white mb-2">{{ dataService.ui().languageTitle }}</h2>
                        <p class="text-slate-500 dark:text-slate-400 mb-6 text-sm">{{ dataService.ui().languageSelect }}</p>

                        <div class="grid grid-cols-1 gap-3">
                            @for(lang of dataService.availableLanguages; track lang.code) {
                                <button (click)="dataService.setLanguage(lang.code); close.emit()" 
                                    class="w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all duration-200 group"
                                    [class.border-blue-500]="dataService.currentLang() === lang.code"
                                    [class.bg-blue-50]="dataService.currentLang() === lang.code"
                                    [class.dark:bg-blue-900/20]="dataService.currentLang() === lang.code"
                                    [class.border-slate-100]="dataService.currentLang() !== lang.code"
                                    [class.dark:border-slate-800]="dataService.currentLang() !== lang.code"
                                    [class.hover:border-blue-300]="dataService.currentLang() !== lang.code"
                                >
                                    <div class="flex items-center gap-4">
                                        <span class="text-3xl">{{ lang.flag }}</span>
                                        <div class="text-left">
                                            <p class="font-bold text-slate-800 dark:text-white">{{ lang.nativeName }}</p>
                                            <p class="text-xs text-slate-400">{{ lang.name }}</p>
                                        </div>
                                    </div>
                                    
                                    @if(dataService.currentLang() === lang.code) {
                                        <div class="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-3.5 h-3.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                                        </div>
                                    }
                                </button>
                            }
                        </div>
                    </div>
                }
            </div>
        }

      </div>
    </div>
    }
  `
})
export class InfoModalsComponent {
  dataService = inject(DataService);
  
  type = input.required<'tutorial' | 'about' | 'impressum' | 'language'>();
  isOpen = input.required<boolean>();
  close = output<void>();

  currentStep = signal(0);
  totalSteps = computed(() => this.dataService.ui().tutorialSteps.length);
  isImpressumDetailsVisible = signal(false);

  constructor() {
      // Reset state when modal opens
      effect(() => {
          if (this.isOpen()) {
              if (this.type() === 'tutorial') {
                  this.currentStep.set(0);
              }
              if (this.type() === 'impressum') {
                  this.isImpressumDetailsVisible.set(false);
              }
          }
      }, { allowSignalWrites: true });
  }

  nextStep() {
      if (this.currentStep() < this.totalSteps() - 1) {
          this.currentStep.update(v => v + 1);
      }
  }

  prevStep() {
      if (this.currentStep() > 0) {
          this.currentStep.update(v => v - 1);
      }
  }
}