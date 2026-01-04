
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../services/data.service';

@Component({
  selector: 'app-lesson-preview',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (dataService.previewLeaf(); as node) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-300" (click)="close()">
        
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-sm w-full shadow-2xl relative border border-slate-200 dark:border-slate-800 transition-all transform scale-100" (click)="$event.stopPropagation()">
          
          <!-- Icon Header -->
          <div class="absolute -top-10 left-1/2 -translate-x-1/2 w-20 h-20 bg-white dark:bg-slate-800 rounded-2xl shadow-xl flex items-center justify-center text-4xl border-4 border-slate-50 dark:border-slate-700">
             {{ node.icon }}
          </div>

          <div class="mt-10 text-center">
             <h2 class="text-2xl font-black text-slate-800 dark:text-white mb-2 leading-tight">{{ node.name }}</h2>
             <p class="text-slate-500 dark:text-slate-400 font-medium mb-6 text-sm">{{ node.description || dataService.ui().noDescription }}</p>
             
             <!-- Progress -->
             <div class="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 mb-6">
                <div class="flex justify-between text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">
                    <span>{{ dataService.ui().status }}</span>
                    <span>{{ isCompleted(node.id) ? '100%' : '0%' }}</span>
                </div>
                <div class="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div class="h-full bg-green-500 transition-all duration-500" [style.width.%]="isCompleted(node.id) ? 100 : 0"></div>
                </div>
                <p class="mt-2 text-xs text-slate-500">
                    {{ isCompleted(node.id) ? dataService.ui().lessonCompleted : dataService.ui().lessonNotStarted }}
                </p>
             </div>

             <div class="flex gap-3">
                 <button (click)="close()" class="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                     {{ dataService.ui().cancel }}
                 </button>
                 <button (click)="enter()" class="flex-1 py-3 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl shadow-lg shadow-sky-500/30 transition-transform active:scale-95 flex items-center justify-center gap-2">
                     <span>{{ dataService.ui().enter }}</span> 
                     <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                 </button>
             </div>
          </div>

        </div>
      </div>
    }
  `
})
export class LessonPreviewComponent {
  dataService = inject(DataService);

  close() {
    this.dataService.closePreview();
  }

  enter() {
    this.dataService.enterLesson();
  }

  isCompleted(id: string) {
      return this.dataService.isCompleted(id);
  }
}
