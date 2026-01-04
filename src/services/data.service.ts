

import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { GoogleDriveSyncService } from './google-drive-sync.service';
import { KnowledgeSource, TreeNode, SearchNode, ModuleStatus, Language, Theme, ViewMode, LanguageDefinition } from '../models/arbor.model';
import { UI_LABELS } from './i18n.const';

const OFFICIAL_DOMAINS = [
    'treesys-org.github.io',
    'localhost'
];

const DEFAULT_SOURCES: KnowledgeSource[] = [
    {
        id: 'default-arbor',
        name: 'Arbor Official',
        url: 'https://treesys-org.github.io/arbor-knowledge/data.json',
        isDefault: true,
        isTrusted: true
    }
];

// To add a new language, just add it here and ensure translations exist in i18n.const.ts
export const AVAILABLE_LANGUAGES: LanguageDefinition[] = [
    { code: 'ES', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
    { code: 'EN', name: 'English', nativeName: 'English', flag: '🇺🇸' }
];

@Injectable({
  providedIn: 'root'
})
export class DataService {
  
  public googleDriveSyncService = inject(GoogleDriveSyncService);
  private saveDebounceTimer: any = null;

  // --- STATE SIGNALS ---
  readonly sources = signal<KnowledgeSource[]>([]);
  readonly activeSource = signal<KnowledgeSource | null>(null);
  readonly currentUniverseId = signal<string | null>(null);

  readonly availableLanguages = AVAILABLE_LANGUAGES;
  readonly currentLang = signal<Language>('ES');
  readonly currentLangInfo = computed(() => this.availableLanguages.find(l => l.code === this.currentLang()) || this.availableLanguages[0]);

  readonly theme = signal<Theme>('light');
  
  // Computed UI labels based on current language
  readonly ui = computed(() => UI_LABELS[this.currentLang()]);
  readonly viewMode = signal<ViewMode>('explore');

  // Internal Data Stores
  private readonly trees = signal<Record<string, TreeNode>>({});
  private readonly searchIndex = signal<SearchNode[]>([]);
  
  // UI Status
  readonly isLoading = signal<boolean>(true);
  readonly loadError = signal<string | null>(null);
  readonly lastUpdatedTimestamp = signal<string | null>(null);
  readonly lastActionMessage = signal<string | null>(null);

  readonly data = computed(() => this.trees()[this.currentLang()]);
  
  // Navigation State
  readonly currentPath = signal<TreeNode[]>([]);
  readonly previewLeaf = signal<TreeNode | null>(null); 
  readonly selectedLeaf = signal<TreeNode | null>(null); 
  
  readonly graphVersion = signal<number>(0);
  readonly nodeToFocus = signal<string | null>(null);

  // Progress State
  readonly completedNodes = signal<Set<string>>(new Set());

  // --- COMPUTED HELPERS ---

  readonly orderedLeaves = computed(() => {
    return this.searchIndex().filter(n => n.lang === this.currentLang() && n.type === 'leaf');
  });

  /**
   * Computes the status of all modules (branches) to generate the Certificates view.
   */
  readonly modulesStatus = computed<ModuleStatus[]>(() => {
      const root = this.data();
      if (!root) return [];
      
      const modules: ModuleStatus[] = [];
      const completedSet = this.completedNodes();
      
      const traverse = (node: TreeNode, pathName: string) => {
          if (!node) return { total: 0, completed: 0 };
          
          let total = 0;
          let completed = 0;

          if (node.type === 'leaf') {
              total = 1;
              completed = completedSet.has(node.id) ? 1 : 0;
          } else if (node.children) {
              for (const child of node.children) {
                 const res = traverse(child, pathName ? `${pathName} > ${node.name}` : node.name);
                 total += res.total;
                 completed += res.completed;
              }
              
              if (total > 0 && node.type === 'branch') {
                  modules.push({
                      id: node.id,
                      name: node.name,
                      description: node.description,
                      icon: node.icon,
                      totalLeaves: total,
                      completedLeaves: completed,
                      isComplete: total === completed,
                      path: pathName,
                      parentId: node.parentId
                  });
              }
          }
          return { total, completed };
      };

      traverse(root, '');
      return modules.sort((a,b) => b.isComplete === a.isComplete ? 0 : (b.isComplete ? 1 : -1));
  });
  
  readonly completedModulesMap = computed(() => {
     const map = new Set<string>();
     this.modulesStatus().forEach(m => {
         if (m.isComplete) map.add(m.id);
     });
     return map;
  });
  
  readonly totalLeaves = computed(() => this.orderedLeaves().length);
  readonly completedModulesCount = computed(() => this.modulesStatus().filter(m => m.isComplete).length);
  readonly overallProgressPercentage = computed(() => {
      const total = this.totalLeaves();
      if (total === 0) return 0;
      return Math.round((this.completedNodes().size / total) * 100);
  });

  constructor() {
    this.loadSources();
    this.loadData();

    const savedTheme = localStorage.getItem('arbor-theme') as Theme;
    if (savedTheme) this.theme.set(savedTheme);

    const savedLang = localStorage.getItem('arbor-lang') as Language;
    if (savedLang && this.availableLanguages.find(l => l.code === savedLang)) {
        this.currentLang.set(savedLang);
    }

    this.loadLocalProgress();

    // Effect: Apply Theme class to Body
    effect(() => {
      const t = this.theme();
      localStorage.setItem('arbor-theme', t);
      document.documentElement.classList.toggle('dark', t === 'dark');
    });

    // Effect: Save Progress on change
    effect(() => {
      const currentProgress = this.completedNodes();
      
      const ids = Array.from(currentProgress);
      localStorage.setItem('arbor-progress', JSON.stringify(ids));

      if (this.googleDriveSyncService.isLoggedIn()) {
          clearTimeout(this.saveDebounceTimer);
          this.saveDebounceTimer = setTimeout(() => {
              this.googleDriveSyncService.saveProgress(currentProgress);
          }, 2000);
      }
    });
    
    // Effect: Reset path on Language change
    effect(() => {
        this.currentLang();
        if (this.isLoading()) return;
        setTimeout(() => this.updatePathForNewRoot(), 0);
    });

    // Effect: Sync on Login
    effect(async () => {
        if (this.googleDriveSyncService.isLoggedIn()) {
            const remoteProgress = await this.googleDriveSyncService.loadProgress();
            if (remoteProgress.size > 0) {
                this.mergeAndSetProgress(remoteProgress);
            }
        }
    });
  }

  // --- SOURCE MANAGEMENT ---

  private loadSources() {
    const savedSources = localStorage.getItem('arbor-sources');
    let sources: KnowledgeSource[] = [];
    if (savedSources) {
      try {
        sources = JSON.parse(savedSources);
        if (!Array.isArray(sources) || sources.length === 0) {
            sources = DEFAULT_SOURCES;
        }
      } catch {
        sources = DEFAULT_SOURCES;
      }
    } else {
        sources = DEFAULT_SOURCES;
    }
    this.sources.set(sources);

    const activeSourceId = localStorage.getItem('arbor-active-source-id');
    let activeSource = sources.find(s => s.id === activeSourceId);
    if (!activeSource) {
      activeSource = sources[0];
    }
    this.activeSource.set(activeSource);
  }

  private persistSources() {
    localStorage.setItem('arbor-sources', JSON.stringify(this.sources()));
    localStorage.setItem('arbor-active-source-id', this.activeSource()?.id || '');
  }

  isUrlTrusted(urlStr: string): boolean {
      try {
          const url = new URL(urlStr);
          return OFFICIAL_DOMAINS.includes(url.hostname);
      } catch {
          return false;
      }
  }

  private getNameFromUrl(urlStr: string): string {
      try {
          const url = new URL(urlStr);
          // Try to extract a meaningful name from the path segments
          const parts = url.pathname.split('/').filter(p => p && p !== 'data.json' && p !== 'dist' && p !== 'arbor-build');
          if (parts.length > 0) {
              // Convert kebab-case to Title Case
              return parts[parts.length - 1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          }
          return url.hostname;
      } catch {
          return 'New Tree';
      }
  }

  addSource(url: string) {
    if (!url) return;
    const isTrusted = this.isUrlTrusted(url);
    const tempName = this.getNameFromUrl(url); // Auto-generate temp name
    const newSource: KnowledgeSource = { id: crypto.randomUUID(), name: tempName, url, isTrusted };
    
    this.sources.update(s => [...s, newSource]);
    this.persistSources();
  }

  removeSource(id: string) {
    const sourceToRemove = this.sources().find(s => s.id === id);
    if (sourceToRemove?.isDefault) return;

    this.sources.update(s => s.filter(source => source.id !== id));
    if (this.activeSource()?.id === id) {
        this.loadAndSmartMerge(this.sources()[0].id);
    } else {
        this.persistSources();
    }
  }

  // --- DATA LOADING & MERGING ---

  /**
   * Loads a source. If it shares the same Universe ID as the current one, it merges the trees.
   * Otherwise, it replaces the current tree.
   */
  async loadAndSmartMerge(id: string) {
      const sourceToLoad = this.sources().find(s => s.id === id);
      if (!sourceToLoad) return;

      this.isLoading.set(true);
      this.lastActionMessage.set(null);
      this.loadError.set(null); // Clear previous errors

      try {
          const dataUrl = new URL(sourceToLoad.url, window.location.href);
          const searchUrl = new URL(sourceToLoad.url.replace('data.json', 'search-index.json'), window.location.href);

          const [treeResponse, searchResponse] = await Promise.all([
            fetch(dataUrl.href),
            fetch(searchUrl.href)
          ]);

          if (!treeResponse.ok) throw new Error("Failed to fetch source");
          
          const incomingData = await treeResponse.json();
          const incomingSearch = searchResponse.ok ? await searchResponse.json() : [];

          // AUTO-UPDATE NAME: If the JSON contains a Universe Name, update the source name in our list
          if (incomingData.universeName && incomingData.universeName !== sourceToLoad.name) {
              this.sources.update(currentSources => 
                  currentSources.map(s => s.id === id ? { ...s, name: incomingData.universeName } : s)
              );
              this.persistSources();
          }

          const currentTrees = this.trees();
          const currentLang = this.currentLang();
          
          const incomingUniverseId = incomingData.universeId || null;
          const currentUniverseId = this.currentUniverseId();
          
          let isCompatible = false;
          
          if (incomingUniverseId && currentUniverseId) {
              isCompatible = (incomingUniverseId === currentUniverseId);
          } else {
              const currentRoot = currentTrees[currentLang];
              const incomingRoot = incomingData.languages?.[currentLang];
              isCompatible = currentRoot && incomingRoot && (currentRoot.id === incomingRoot.id);
          }

          const isEmpty = Object.keys(currentTrees).length === 0;

          if (isEmpty || !isCompatible) {
              // Full Switch
              this.trees.set(incomingData.languages);
              this.searchIndex.set(incomingSearch);
              this.lastUpdatedTimestamp.set(incomingData.generatedAt);
              this.currentUniverseId.set(incomingData.universeId || null);
              
              // Refresh active source ref in case name changed
              this.activeSource.set(this.sources().find(s => s.id === id) || sourceToLoad);
              this.updatePathForNewRoot();
              
              if (!isEmpty) this.lastActionMessage.set(this.ui().sourceSwitchSuccess);
          } else {
              // Merge
              this.trees.update(current => {
                  const newTrees = { ...current };
                  Object.keys(incomingData.languages).forEach(lang => {
                      if (newTrees[lang]) {
                          newTrees[lang] = this.recursivelyMergeNodes(newTrees[lang], incomingData.languages[lang]);
                      } else {
                          newTrees[lang] = incomingData.languages[lang];
                      }
                  });
                  return newTrees;
              });
              
              this.searchIndex.update(current => {
                  const existingIds = new Set(current.map(n => n.id));
                  const newNodes = incomingSearch.filter((n: any) => !existingIds.has(n.id));
                  return [...current, ...newNodes];
              });
              
              this.graphVersion.update(v => v + 1);
              // Refresh active source ref in case name changed
              this.activeSource.set(this.sources().find(s => s.id === id) || sourceToLoad);
              this.lastActionMessage.set(this.ui().sourceMergeSuccess);
          }
          
      } catch (e) {
          console.error("Smart Load failed", e);
          this.loadError.set("Failed to load trees: " + (e as Error).message);
      } finally {
          this.isLoading.set(false);
          setTimeout(() => this.lastActionMessage.set(null), 4000);
      }
  }

  private recursivelyMergeNodes(base: TreeNode, incoming: TreeNode): TreeNode {
      if (base.id === incoming.id) {
           return {
               ...base,
               children: this.mergeChildren(base.children || [], incoming.children || []),
               isMerged: true,
               namespace: base.namespace || incoming.namespace 
           };
      }
      return base;
  }

  private mergeChildren(baseChildren: TreeNode[], incomingChildren: TreeNode[]): TreeNode[] {
      const merged = [...baseChildren];
      const baseIds = new Map(baseChildren.map((c, i) => [c.id, i]));

      incomingChildren.forEach(incomingNode => {
          if (baseIds.has(incomingNode.id)) {
              const idx = baseIds.get(incomingNode.id)!;
              merged[idx] = this.recursivelyMergeNodes(merged[idx], incomingNode);
              merged[idx].isMerged = true;
          } else {
              const newNode = { ...incomingNode, isMerged: true };
              merged.push(newNode);
          }
      });
      
      return merged.sort((a, b) => {
         const orderA = (a as any).order || 999;
         const orderB = (b as any).order || 999;
         return orderA - orderB;
      });
  }

  // --- UI ACTIONS ---

  setViewMode(mode: ViewMode) {
    this.viewMode.set(mode);
    if (mode === 'explore') {
        this.updatePathForNewRoot();
    }
  }
  
  setLanguage(lang: Language) {
      if (this.currentLang() !== lang) {
          this.currentLang.set(lang);
          localStorage.setItem('arbor-lang', lang);
      }
  }

  toggleTheme() {
    this.theme.update(t => t === 'light' ? 'dark' : 'light');
  }

  // --- PROGRESS LOGIC ---

  private loadLocalProgress() {
    const savedProgress = localStorage.getItem('arbor-progress');
    if (savedProgress) {
        try {
            const ids = JSON.parse(savedProgress);
            if (Array.isArray(ids)) this.completedNodes.set(new Set(ids));
        } catch (e) {
            console.error('Failed to load local progress', e);
        }
    }
  }
  
  private mergeAndSetProgress(remoteProgress: Set<string>) {
      this.completedNodes.update(localProgress => {
          const merged = new Set([...localProgress, ...remoteProgress]);
          return merged;
      });
  }

  toggleCompletion(nodeId: string) {
    this.completedNodes.update(set => {
      const newSet = new Set(set);
      if (newSet.has(nodeId)) newSet.delete(nodeId);
      else newSet.add(nodeId);
      return newSet;
    });
    this.graphVersion.update(v => v + 1);
  }

  isCompleted(nodeId: string): boolean {
    return this.completedNodes().has(nodeId);
  }

  isModuleCompleted(moduleId: string): boolean {
      return this.completedModulesMap().has(moduleId);
  }

  // --- SEARCH & NAVIGATION ---

  async loadData() {
    const source = this.activeSource();
    if (source) {
        this.isLoading.set(true);
        this.loadError.set(null);
        try {
             const dataUrl = new URL(source.url, window.location.href);
             const searchUrl = new URL(source.url.replace('data.json', 'search-index.json'), window.location.href);
             const [treeResponse, searchResponse] = await Promise.all([fetch(dataUrl.href), fetch(searchUrl.href)]);
             if(!treeResponse.ok) throw new Error("Could not reach the Arbor content repository.");
             
             const data = await treeResponse.json();
             this.trees.set(data.languages);
             this.searchIndex.set(await searchResponse.json());
             this.currentUniverseId.set(data.universeId || null);
             
             this.updatePathForNewRoot();
        } catch(e) {
            console.error(e);
            this.loadError.set("Failed to load knowledge trees. Please check your internet connection or the source URL.");
        } finally {
            this.isLoading.set(false);
        }
    }
  }

  private updatePathForNewRoot() {
      const root = this.data();
      if (!root) {
        this.currentPath.set([]);
      } else {
        this.currentPath.set([root]);
      }
      this.selectedLeaf.set(null);
      this.previewLeaf.set(null);
      this.graphVersion.update(v => v + 1);
  }

  findNode(id: string, node: TreeNode | undefined = this.data()): TreeNode | null {
    if (!node) return null;
    if (node.id === id) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = this.findNode(id, child);
        if (found) return found;
      }
    }
    return null;
  }

  search(query: string): SearchNode[] {
    if (!query) return [];
    
    const q = query.toLowerCase();
    const currentLang = this.currentLang();

    return this.searchIndex().filter(node => 
      node.lang === currentLang && (
        node.name.toLowerCase().includes(q) || 
        (node.description && node.description.toLowerCase().includes(q))
      )
    );
  }
  
  /**
   * Fetches children nodes from JSON file if they are lazily loaded.
   */
  private async loadNodeChildren(node: TreeNode): Promise<void> {
    if (!node.hasUnloadedChildren) return;
    const source = this.activeSource();
    if (!source) return;

    if (!node.apiPath) {
        console.warn("Node missing apiPath, cannot load children:", node);
        node.hasUnloadedChildren = false;
        return;
    }

    node.status = 'loading';
    this.graphVersion.update(v => v + 1);

    try {
        const nodeUrl = new URL(source.url.replace('data.json', `nodes/${node.apiPath}.json`), window.location.href);

        const response = await fetch(nodeUrl.href);
        if (!response.ok) throw new Error(`Failed to fetch children for ${node.id}`);

        const children: TreeNode[] = await response.json();
        node.children = children;
        node.hasUnloadedChildren = false;
        node.status = 'available';

    } catch (error) {
        console.error("Failed to load node children:", error);
        node.status = 'available'; 
    } finally {
        this.graphVersion.update(v => v + 1);
    }
  }

  private collapseRecursively(node: TreeNode) {
    if (!node) return;
    node.expanded = false;
    if (node.children) {
      node.children.forEach(child => this.collapseRecursively(child));
    }
  }

  async toggleNode(nodeId: string) {
    const node = this.findNode(nodeId);
    if (!node) return;

    if (!node.expanded && node.parentId) {
        const parent = this.findNode(node.parentId);
        if (parent && parent.children) {
            for (const sibling of parent.children) {
                if (sibling.id !== nodeId && sibling.expanded) {
                    this.collapseRecursively(sibling);
                }
            }
        }
    }

    const path: TreeNode[] = [];
    let curr: TreeNode | null = node;
    while (curr) {
      path.unshift(curr);
      curr = curr.parentId ? this.findNode(curr.parentId) : null;
    }
    this.currentPath.set(path);

    if (node.type === 'leaf') {
      this.previewLeaf.set(node);
      this.selectedLeaf.set(null);
    } else {
      if (!node.expanded) {
          if (node.hasUnloadedChildren) {
              await this.loadNodeChildren(node);
          }
          node.expanded = true;
      } else {
          this.collapseRecursively(node);
      }
      this.selectedLeaf.set(null);
      this.previewLeaf.set(null);
      this.graphVersion.update(v => v + 1);
    }
  }
  
  enterLesson() {
      const node = this.previewLeaf();
      if(node) {
          this.selectedLeaf.set(node);
          this.previewLeaf.set(null); 
      }
  }
  
  closePreview() {
      this.previewLeaf.set(null);
  }

  async navigateTo(nodeId: string) {
    let node = this.findNode(nodeId);
    if (!node) {
        // Path reconstruction for deep links/search results not currently in RAM
        const pathIdsToUnfold: string[] = [];
        let currentId: string | undefined = nodeId;
        let highestAncestorInMemory: TreeNode | null = null;

        while (currentId) {
            const foundNode = this.findNode(currentId);
            if(foundNode){
                highestAncestorInMemory = foundNode;
                break;
            }
            pathIdsToUnfold.unshift(currentId);
            
            // Heuristic parent lookup via ID convention
            const searchItem = this.searchIndex().find(n => n.id === currentId);
            const parentId = currentId.substring(0, currentId.lastIndexOf('__'));
             if (!parentId || !parentId.includes('-root')) {
                highestAncestorInMemory = this.data()!;
                break;
            }
            currentId = parentId;
        }

        let parentToExpand: TreeNode | null = highestAncestorInMemory;
        while (pathIdsToUnfold.length > 0 && parentToExpand) {
            if(parentToExpand.type !== 'leaf' && !parentToExpand.expanded) {
                if (parentToExpand.hasUnloadedChildren) await this.loadNodeChildren(parentToExpand);
                parentToExpand.expanded = true;
            }
            const nextIdToFind = pathIdsToUnfold.shift();
            parentToExpand = parentToExpand.children?.find(c => c.id === nextIdToFind) || null;
        }
    }

    node = this.findNode(nodeId);
    if (!node) return;

    const path: TreeNode[] = [];
    let curr: TreeNode | null = node;
    while (curr) {
      path.unshift(curr);
      curr = curr.parentId ? this.findNode(curr.parentId) : null;
    }
    const pathIds = new Set(path.map(p => p.id));
    
    // Auto-collapse siblings to keep tree clean
    const prune = (n: TreeNode) => {
        if (n.expanded && n.children) {
            n.children.forEach(child => {
                if(pathIds.has(child.id)) {
                    prune(child);
                } else {
                    this.collapseRecursively(child);
                }
            });
        }
    };
    prune(this.data()!);

    path.forEach(p => { if (p.type !== 'leaf') p.expanded = true; });
    this.currentPath.set(path);

    if (node.type === 'leaf') {
        this.previewLeaf.set(node); 
        this.selectedLeaf.set(null);
    } else {
        this.selectedLeaf.set(null);
        this.previewLeaf.set(null);
    }
    
    this.graphVersion.update(v => v + 1);
    this.nodeToFocus.set(nodeId);
  }

  getNextLeafId(currentId: string): string | null {
      const leaves = this.orderedLeaves();
      const idx = leaves.findIndex(l => l.id === currentId);
      
      if (idx !== -1 && idx < leaves.length - 1) {
          return leaves[idx + 1].id;
      }
      return null;
  }
  
  getNextModuleId(currentLeafId: string): string | null {
      const node = this.findNode(currentLeafId);
      if (!node || !node.parentId) return null;

      const parent = this.findNode(node.parentId);
      if (!parent || !parent.parentId) return null;

      const grandparent = this.findNode(parent.parentId);
      if (!grandparent || !grandparent.children) return null;

      const currentModuleIndex = grandparent.children.findIndex(c => c.id === parent.id);
      
      if (currentModuleIndex !== -1 && currentModuleIndex < grandparent.children.length - 1) {
          const nextModule = grandparent.children[currentModuleIndex + 1];
          return nextModule.id;
      }

      return null;
  }
  
  getParentName(nodeId: string): string {
      const node = this.findNode(nodeId);
      if (node && node.parentId) {
          const parent = this.findNode(node.parentId);
          return parent ? parent.name : 'Curso Arbor';
      }
      return 'Curso Arbor';
  }

  navigateToNextLeaf() {
      const current = this.selectedLeaf();
      if (!current) return;
      const nextId = this.getNextLeafId(current.id);
      if (nextId) {
          this.navigateTo(nextId);
          const nextNode = this.findNode(nextId);
          if(nextNode) {
              this.previewLeaf.set(null);
              this.selectedLeaf.set(nextNode);
          }
      }
  }
}