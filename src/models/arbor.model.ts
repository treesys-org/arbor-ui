
export interface KnowledgeSource {
  id: string;
  name: string;
  url: string;
  isDefault?: boolean;
  isTrusted?: boolean;
  type?: 'universe' | 'module';
  description?: string;
}

export interface TreeNode {
  id: string;
  name: string;
  type: 'root' | 'branch' | 'leaf';
  children?: TreeNode[];
  content?: string;
  parentId?: string;
  description?: string;
  icon?: string;
  status?: 'locked' | 'available' | 'completed' | 'loading';
  expanded?: boolean;
  hasUnloadedChildren?: boolean;
  x?: number;
  y?: number;
  lastUpdated?: string;
  version?: string;
  year?: string;
  discussionUrl?: string;
  path?: string;
  apiPath?: string;
  namespace?: string;
  isMerged?: boolean;
}

export interface SearchNode {
  id: string;
  name: string;
  type: 'root' | 'branch' | 'leaf';
  description?: string;
  icon?: string;
  lang: Language;
  path?: string;
  namespace?: string;
}

export interface ModuleStatus {
    id: string;
    name: string;
    description?: string;
    icon?: string;
    totalLeaves: number;
    completedLeaves: number;
    isComplete: boolean;
    path: string;
    parentId?: string;
}

export interface LanguageDefinition {
    code: Language;
    name: string;
    nativeName: string;
    flag: string;
}

// Add more language codes here in the future (e.g. | 'FR' | 'PT')
export type Language = 'ES' | 'EN';

export type Theme = 'light' | 'dark';
export type ViewMode = 'explore' | 'certificates';
