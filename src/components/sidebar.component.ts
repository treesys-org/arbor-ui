

import { Component, inject, output, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../services/data.service';
import { GoogleDriveSyncService } from '../services/google-drive-sync.service';

@Component({
  selector: 'app-sidebar',
  imports: [CommonModule],
  template: `
  <aside class="hidden md:flex flex-col w-[80px] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-30 transition-all duration-300 items-center py-6 shadow-xl relative group justify-between overflow-visible h-full">
    
    <!-- TOP SECTION: Logo & Nav -->
    <div class="flex flex-col items-center w-full gap-6">
        <div class="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-green-400 to-green-600 rounded-xl shadow-lg shadow-green-500/30 text-2xl mb-4">
            🌳
        </div>

        <!-- Nav Icons -->
        <nav class="flex flex-col gap-6 w-full items-center">
            
            <button (click)="openSearch.emit()" class="relative w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all hover:bg-sky-500 hover:text-white group/btn">
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-5 h-5">
                   <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                 </svg>
                <span class="absolute left-14 bg-slate-800 text-white text-xs font-bold px-2 py-1 rounded opacity-0 group-hover/btn:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                    {{ dataService.ui().navSearch }}
                </span>
            </button>
            
            <button (click)="openCertificates.emit()"
                [class.bg-yellow-500]="dataService.viewMode() === 'certificates'" 
                [class.text-white]="dataService.viewMode() === 'certificates'"
                [class.bg-yellow-100]="dataService.viewMode() !== 'certificates'"
                [class.dark:bg-yellow-900/30]="dataService.viewMode() !== 'certificates'"
                [class.text-yellow-600]="dataService.viewMode() !== 'certificates'"
                [class.dark:text-yellow-400]="dataService.viewMode() !== 'certificates'"
                class="relative w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-yellow-500 hover:text-white group/btn">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0V5.625a2.25 2.25 0 00-2.25-2.25h-1.5a2.25 2.25 0 00-2.25 2.25v7.875" />
                </svg>
                <span class="absolute left-14 bg-slate-800 text-white text-xs font-bold px-2 py-1 rounded opacity-0 group-hover/btn:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                    {{ dataService.ui().navCertificates }}
                </span>
            </button>

            <button (click)="openSources.emit()" class="relative w-10 h-10 rounded-xl text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center transition-all hover:bg-purple-500 hover:text-white group/btn">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h6M9 11.25h6M9 15.75h6" /></svg>
                <span class="absolute left-14 bg-slate-800 text-white text-xs font-bold px-2 py-1 rounded opacity-0 group-hover/btn:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                    {{ dataService.ui().navSources }}
                </span>
            </button>

        </nav>
    </div>

    <!-- BOTTOM SECTION: Actions & Profile -->
    <div class="flex flex-col gap-3 w-full items-center">
        
        <!-- About / Mission (Moved to bottom) -->
        <button (click)="openAbout.emit()" class="relative w-10 h-10 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-all group/btn">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 15" />
            </svg>
                <span class="absolute left-14 bg-slate-800 text-white text-xs font-bold px-2 py-1 rounded opacity-0 group-hover/btn:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                {{ dataService.ui().navAbout }}
            </span>
        </button>

        <div class="w-8 h-px bg-slate-200 dark:bg-slate-700 my-1"></div>

        <button (click)="openLanguage.emit()" class="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-xl flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800" title="{{dataService.ui().languageTitle}}">
            {{ dataService.currentLangInfo().flag }}
        </button>
        <button (click)="dataService.toggleTheme()" class="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-xl flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800">
             @if (dataService.theme() === 'light') { 🌙 } @else { ☀️ }
        </button>

        <!-- User Profile -->
        <div class="relative group/user">
            @if (googleDriveSyncService.isLoggedIn() && googleDriveSyncService.userProfile(); as user) {
                <button class="w-10 h-10 rounded-full border-2 border-slate-200 dark:border-slate-700 p-0.5 overflow-hidden focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 relative">
                    <img [src]="user.picture" [alt]="user.name" class="w-full h-full rounded-full">
                    @if(googleDriveSyncService.isSyncing()) {
                        <div class="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <div class="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                        </div>
                    }
                </button>
                <div class="absolute bottom-12 left-1/2 -translate-x-1/2 mb-2 w-52 bg-white dark:bg-slate-800 rounded-lg shadow-xl border dark:border-slate-700 opacity-0 group-hover/user:opacity-100 transition-opacity pointer-events-none group-hover/user:pointer-events-auto z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div class="p-3 border-b dark:border-slate-700">
                        <p class="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{{ user.name }}</p>
                        <p class="text-xs text-slate-500 dark:text-slate-400 truncate">{{ user.email }}</p>
                    </div>
                    <div class="p-2">
                        <button (click)="signOut.emit()" class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
                             <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                           </svg>
                           {{ dataService.ui().signOut }}
                        </button>
                    </div>
                </div>
            } @else {
                <button (click)="signIn.emit()" title="{{ dataService.ui().syncButton }}" class="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632" />
                    </svg>
                </button>
            }
        </div>

        <button (click)="openTutorial.emit()" class="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 font-bold hover:text-sky-500 hover:bg-sky-50 transition-colors">
            ?
        </button>
        
        <div class="text-[9px] text-slate-400 font-bold opacity-60 hover:opacity-100 transition-opacity cursor-pointer mt-2 text-center" (click)="openImpressum.emit()">
             {{ dataService.ui().createdBy }}<br><span class="text-sky-500">Treesys</span>
        </div>
    </div>
  </aside>
  `
})
export class SidebarComponent {
  dataService = inject(DataService);
  googleDriveSyncService = inject(GoogleDriveSyncService);

  openSearch = output<void>();
  openCertificates = output<void>();
  openSources = output<void>();
  openAbout = output<void>();
  openTutorial = output<void>(); // Renamed from openHelp
  openImpressum = output<void>();
  openLanguage = output<void>();
  signIn = output<void>();
  signOut = output<void>();
}