import { Component, inject, signal, effect, ElementRef, ViewChild } from '@angular/core';
import { DataService } from '../services/data.service';

@Component({
  selector: 'app-breadcrumbs',
  standalone: true,
  template: `
    <nav #nav class="flex items-center space-x-2 overflow-x-auto whitespace-nowrap py-2 w-full pr-4">
      @if (!isCollapsed() || path().length <= collapseThreshold) {
        @for (node of path(); track node.id; let last = $last; let i = $index) {
          <div class="flex items-center animate-in fade-in slide-in-from-left-2 duration-300 flex-shrink-0">
            @if (i > 0) {
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-4 h-4 text-slate-300 dark:text-slate-600 mx-1 flex-shrink-0">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            }
            <button 
              (click)="navigate(node.id)"
              [title]="node.name"
              class="px-3 py-1.5 rounded-lg transition-all text-sm font-bold flex items-center gap-2 border-b-2 active:border-b-0 active:translate-y-[2px] max-w-full"
              [class]="last 
                  ? 'bg-sky-500 border-sky-700 text-white shadow-sm' 
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-sky-600 dark:hover:text-sky-400'"
            >
              <span class="flex-shrink-0">{{ node.icon }}</span>
              <span class="truncate max-w-[120px] sm:max-w-[150px] md:max-w-[200px]">{{ node.name }}</span>
            </button>
          </div>
        }
      } @else {
        @if(path().length > 0) {
            @let first = path()[0];
            @let last = path()[path().length - 1];
            
            <div class="flex items-center animate-in fade-in duration-300 flex-shrink-0">
                <button 
                (click)="navigate(first.id)"
                [title]="first.name"
                class="px-3 py-1.5 rounded-lg transition-all text-sm font-bold flex items-center gap-2 border-b-2 active:border-b-0 active:translate-y-[2px] bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-sky-600 dark:hover:text-sky-400"
                >
                <span class="flex-shrink-0">{{ first.icon }}</span>
                <span class="truncate max-w-[100px] md:max-w-[150px]">{{ first.name }}</span>
                </button>
            </div>

            <div class="flex items-center animate-in fade-in duration-300 flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-4 h-4 text-slate-300 dark:text-slate-600 mx-1 flex-shrink-0">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
                <button (click)="toggleCollapse()"
                    title="Show full path"
                    class="px-3 py-1.5 rounded-lg transition-all text-sm font-bold flex items-center gap-2 border-b-2 active:border-b-0 active:translate-y-[2px] bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-sky-600 dark:hover:text-sky-400"
                >
                    ...
                </button>
            </div>
            
            <div class="flex items-center animate-in fade-in duration-300 flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-4 h-4 text-slate-300 dark:text-slate-600 mx-1 flex-shrink-0">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
                <button 
                    (click)="navigate(last.id)"
                    [title]="last.name"
                    class="px-3 py-1.5 rounded-lg transition-all text-sm font-bold flex items-center gap-2 border-b-2 active:border-b-0 active:translate-y-[2px] bg-sky-500 border-sky-700 text-white shadow-sm"
                >
                    <span class="flex-shrink-0">{{ last.icon }}</span>
                    <span class="truncate max-w-[120px] sm:max-w-[150px] md:max-w-[200px]">{{ last.name }}</span>
                </button>
            </div>
        }
      }
    </nav>
  `,
  styles: [`
    nav::-webkit-scrollbar {
      height: 4px;
    }
    nav::-webkit-scrollbar-track {
      background: transparent;
    }
    nav::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 4px;
    }
    nav::-webkit-scrollbar-thumb:hover {
      background: #94a3b8;
    }
    :host-context(.dark) nav::-webkit-scrollbar-thumb {
      background: #475569;
    }
    :host-context(.dark) nav::-webkit-scrollbar-thumb:hover {
      background: #64748b;
    }
  `]
})
export class BreadcrumbsComponent {
  private dataService = inject(DataService);
  @ViewChild('nav') navEl!: ElementRef;

  path = this.dataService.currentPath;
  isCollapsed = signal(true);
  readonly collapseThreshold = 3;

  constructor() {
    effect(() => {
        this.path();
        this.isCollapsed.set(true);
        setTimeout(() => {
            if(this.navEl?.nativeElement) {
                this.navEl.nativeElement.scrollLeft = this.navEl.nativeElement.scrollWidth;
            }
        }, 50);
    }, { allowSignalWrites: true });
  }
  
  toggleCollapse() {
    this.isCollapsed.update(v => !v);
  }

  navigate(id: string) {
    this.dataService.navigateTo(id);
  }
}