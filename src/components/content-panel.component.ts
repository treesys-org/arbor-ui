
import { Component, inject, signal, effect, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { DataService } from '../services/data.service';
import { parseArborFormat, ContentBlock, Question } from '../utils/parser.util';

interface QuizState {
    started: boolean;
    finished: boolean;
    currentIdx: number;
    score: number;
    userAnswers: boolean[]; 
}

interface TocItem {
  text: string;
  level: number;
  id: string;
  numbering: string;
  isQuiz: boolean;
}

@Component({
  selector: 'app-content-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './content-panel.component.html',
  styles: [`
    ::ng-deep .highlight {
        color: #0284c7;
        font-weight: 800;
        background: rgba(14, 165, 233, 0.1);
        padding: 0 4px;
        border-radius: 4px;
    }
    .confetti {
      position: absolute;
      width: 10px;
      height: 10px;
      background-color: #f00;
      animation: confetti-fall 2s linear forwards;
      opacity: 0;
      z-index: 9999;
    }
    @keyframes confetti-fall {
      0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
      100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
    }
  `]
})
export class ContentPanelComponent {
  dataService = inject(DataService);
  sanitizer = inject(DomSanitizer);
  
  node = this.dataService.selectedLeaf;
  @ViewChild('scrollContainer') scrollContainer!: ElementRef;
  
  // UI State
  isExpanded = signal(true);
  isTocVisible = signal(true); 
  activeSectionIndex = signal(0);
  visitedSections = signal<Set<number>>(new Set([0]));
  
  showCertificate = signal(false);
  nextModuleId = signal<string | null>(null);
  
  // Quiz State
  quizStates = signal<Record<string, QuizState>>({});
  showExitWarning = signal(false);
  pendingNavigationFn: (() => void) | null = null;
  isShareSupported = false;

  // --- COMPUTED CONTENT ---

  certificateData = computed(() => {
      const n = this.node();
      const user = this.dataService.googleDriveSyncService.userProfile();
      const courseName = n ? this.dataService.getParentName(n.id) : 'Course';
      return {
          userName: user ? user.name : 'Student',
          courseName: courseName,
          date: new Date().toLocaleDateString()
      };
  });
  
  parsedContent = computed(() => {
     const n = this.node();
     if (!n || !n.content) return { blocks: [] as ContentBlock[] };
     // Delegated to Utility
     return parseArborFormat(n.content, this.sanitizer);
  });

  toc = computed<TocItem[]>(() => {
      const blocks = this.parsedContent().blocks;
      const items: TocItem[] = [];

      let h1Count = 0;
      let h2Count = 0;

      const introText = this.dataService.ui().introLabel;
      items.push({ text: introText, level: 1, id: 'intro', numbering: '', isQuiz: false });

      blocks.forEach((b) => {
          let numbering = '';
          if (b.type === 'h1') {
              h1Count++; h2Count = 0;
              numbering = `${h1Count}.`;
              items.push({ text: b.text || '', level: 1, id: b.id || '', numbering, isQuiz: false });
          } else if (b.type === 'h2') {
              h2Count++;
              numbering = `${h1Count}.${h2Count}`;
              items.push({ text: b.text || '', level: 2, id: b.id || '', numbering, isQuiz: false });
          } else if (b.type === 'quiz') {
              const label = this.dataService.ui().quizLabel;
              items.push({ 
                  text: label, 
                  level: 1, 
                  id: b.id || '', 
                  numbering: '★', 
                  isQuiz: true 
              });
          }
      });
      return items;
  });

  lessonProgress = computed(() => {
      const tocItems = this.toc();
      if (tocItems.length <= 1) return 100;
      const visited = this.visitedSections().size;
      const total = tocItems.length;
      return Math.round((visited / total) * 100);
  });
  
  /**
   * Returns only the blocks for the currently active section (Virtual Scrolling logic)
   */
  activeSectionBlocks = computed(() => {
    const allBlocks = this.parsedContent().blocks;
    const tocItems = this.toc();
    const activeIndex = this.activeSectionIndex();

    if (activeIndex < 0 || activeIndex >= tocItems.length || !allBlocks.length) return [];
    
    const activeTocItem = tocItems[activeIndex];
    
    let startIndex = 0;
    if (activeTocItem.id !== 'intro') {
        startIndex = allBlocks.findIndex(b => b.id === activeTocItem.id);
        if(startIndex === -1) startIndex = 0;
    }

    let endIndex = allBlocks.length;
    const nextTocItem = activeIndex + 1 < tocItems.length ? tocItems[activeIndex + 1] : null;
    
    if (nextTocItem) {
        const nextStart = allBlocks.findIndex(b => b.id === nextTocItem.id);
        if (nextStart !== -1) endIndex = nextStart;
    }
    
    if (activeTocItem.id === 'intro') {
        const firstHeader = allBlocks.findIndex(b => b.type.startsWith('h') || b.type === 'quiz');
        if (firstHeader !== -1) endIndex = firstHeader;
    }
    
    return allBlocks.slice(startIndex, endIndex);
  });

  constructor() {
      this.isShareSupported = typeof navigator !== 'undefined' && !!navigator.share;
      
      // Reset state when node changes
      effect(() => {
          this.node();
          this.isExpanded.set(true); 
          this.isTocVisible.set(true); 
          this.activeSectionIndex.set(0);
          this.visitedSections.set(new Set([0]));
          this.quizStates.set({}); 
          this.showExitWarning.set(false);
          this.pendingNavigationFn = null;
          this.showCertificate.set(false);
          this.nextModuleId.set(null);
          
          if (this.scrollContainer?.nativeElement) this.scrollContainer.nativeElement.scrollTop = 0;
      }, { allowSignalWrites: true });
  }

  // --- ACTIONS ---

  close() { this.dataService.selectedLeaf.set(null); }
  closeCertificate() { this.showCertificate.set(false); this.close(); }
  toggleExpanded() { this.isExpanded.update(v => !v); }
  toggleToc() { this.isTocVisible.update(v => !v); }
  toggleComplete(id: string) { this.dataService.toggleCompletion(id); }
  isCompleted(id: string) { return this.dataService.isCompleted(id); }
  printCertificate() { window.print(); }
  async shareCertificate() { /* placeholder */ }
  triggerConfetti() { /* placeholder */ }

  // --- NAVIGATION GUARDS ---

  requestNavigation(action: (() => void) | null) {
      if (!action) return;
      const currentBlocks = this.activeSectionBlocks();
      const activeQuizBlock = currentBlocks.find(b => b.type === 'quiz');

      if (activeQuizBlock && activeQuizBlock.id) {
          const state = this.quizStates()[activeQuizBlock.id];
          if (state && state.started && !state.finished) {
              this.pendingNavigationFn = action;
              this.showExitWarning.set(true);
              return;
          }
      }
      action();
  }
  
  confirmNavigation() { if (this.pendingNavigationFn) this.pendingNavigationFn(); this.showExitWarning.set(false); this.pendingNavigationFn = null; }
  cancelNavigation() { this.showExitWarning.set(false); this.pendingNavigationFn = null; }

  onTocItemClick(index: number) {
    this.requestNavigation(() => {
      this.navigateToSection(index);
      if (window.innerWidth < 768) this.isTocVisible.set(false);
    });
  }

  navigateToSection(index: number) {
    if (index >= 0 && index < this.toc().length) {
        this.activeSectionIndex.set(index);
        this.markSectionAsVisited(index);
        const contentArea = document.getElementById('content-area');
        if(contentArea) contentArea.scrollTop = 0;
    }
  }

  markSectionAsVisited(index: number) {
      this.visitedSections.update(set => { const newSet = new Set(set); newSet.add(index); return newSet; });
  }

  completeAndNext() {
      this.requestNavigation(() => {
          const currentIndex = this.activeSectionIndex();
          const totalSections = this.toc().length;

          if (currentIndex < totalSections - 1) {
              this.navigateToSection(currentIndex + 1);
              return;
          }

          const node = this.node();
          if (!node) return;

          if (!this.isCompleted(node.id)) {
              this.toggleComplete(node.id);
          }
          
          this.dataService.graphVersion.update(v => v + 1);

          setTimeout(() => {
              const parentId = node.parentId;
              const isModuleDone = parentId ? this.dataService.isModuleCompleted(parentId) : false;

              if (isModuleDone) {
                  this.triggerConfetti();
                  const nextMod = this.dataService.getNextModuleId(node.id);
                  this.nextModuleId.set(nextMod);
                  this.showCertificate.set(true);
              } else {
                  this.dataService.navigateToNextLeaf();
              }
          }, 50);
      });
  }

  goToNextModule() {
      const nextId = this.nextModuleId();
      if (nextId) { this.dataService.navigateTo(nextId); this.close(); }
  }

  readLater() {
      this.requestNavigation(() => {
          const currentIndex = this.activeSectionIndex();
          const totalSections = this.toc().length;
          if (currentIndex < totalSections - 1) { this.navigateToSection(currentIndex + 1); return; }
          this.dataService.navigateToNextLeaf();
      });
  }

  previousSection() {
    this.requestNavigation(() => {
        const currentIndex = this.activeSectionIndex();
        if (currentIndex > 0) this.navigateToSection(currentIndex - 1);
    });
  }
  
  // --- QUIZ LOGIC ---

  getQuizState(blockId: string, totalQuestions: number): QuizState {
      const current = this.quizStates();
      if (!current[blockId]) {
          return { started: false, finished: false, currentIdx: 0, score: 0, userAnswers: [] };
      }
      return current[blockId];
  }

  startQuiz(blockId: string) {
      this.quizStates.update(s => ({ ...s, [blockId]: { started: true, finished: false, currentIdx: 0, score: 0, userAnswers: [] } }));
  }

  retryQuiz(blockId: string) { this.startQuiz(blockId); }

  answerQuiz(blockId: string, isCorrect: boolean, totalQuestions: number) {
      this.quizStates.update(s => {
          const state = s[blockId] || { started: true, finished: false, currentIdx: 0, score: 0, userAnswers: [] };
          const newScore = state.score + (isCorrect ? 1 : 0);
          const newAnswers = [...state.userAnswers, isCorrect];
          let newIdx = state.currentIdx;
          let finished = state.finished;

          if (state.currentIdx + 1 < totalQuestions) { newIdx++; } else { finished = true; }

          return { ...s, [blockId]: { ...state, score: newScore, currentIdx: newIdx, finished: finished, userAnswers: newAnswers } };
      });
  }

  getScoreColor(score: number, total: number) {
      const pct = score / total;
      if (pct === 1) return 'bg-green-100 text-green-600';
      if (pct >= 0.7) return 'bg-blue-100 text-blue-600';
      return 'bg-red-100 text-red-600';
  }

  getScoreEmoji(score: number, total: number) {
      const pct = score / total;
      if (pct === 1) return '🏆';
      if (pct >= 0.7) return '👏';
      return '📚';
  }
}
