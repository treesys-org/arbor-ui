
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

export interface Option {
    text: string;
    correct: boolean;
    feedback?: string; 
}

export interface Question {
    id: string;
    question: string;
    options: Option[];
}

export interface ContentBlock {
    type: 'h1' | 'h2' | 'h3' | 'p' | 'code' | 'blockquote' | 'list' | 'image' | 'video' | 'audio' | 'quiz';
    text?: string;
    id?: string;
    items?: string[];
    src?: string;
    safeSrc?: SafeResourceUrl; 
    alt?: string;
    caption?: string;
    lang?: string;
    questions?: Question[];
}

/**
 * Helper to slugify headings for ID generation
 */
function slugify(text: string): string {
    return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Basic inline style processor for bold, italic, and inline code.
 */
function processInlineStyles(text: string): string {
    let parsed = text;
    parsed = parsed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    parsed = parsed.replace(/(^|[^\*])\*([^\*]+)\*/g, '$1<em>$2</em>');
    parsed = parsed.replace(/`(.*?)`/g, '<code class="bg-slate-200 dark:bg-slate-700 px-1 rounded font-mono text-sm text-pink-600 dark:text-pink-400">$1</code>');
    return parsed;
}

/**
 * Extracts YouTube embed ID from various URL formats.
 */
function getYouTubeEmbedUrl(url: string): string | null {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}` : null;
}

/**
 * Parses the custom Arbor format (Markdown-like with @ directives) into structured ContentBlocks.
 * @param text Raw content string
 * @param sanitizer Angular DomSanitizer for safe video embedding
 * @returns Object containing array of blocks
 */
export function parseArborFormat(text: string, sanitizer: DomSanitizer): { blocks: ContentBlock[] } {
    const lines = text.split('\n');
    const blocks: ContentBlock[] = [];
    
    let currentQuizQuestions: Question[] = [];
    let currentQuizId = '';
    
    let currentTextBuffer: string[] = [];

    const flushText = () => {
        if (currentTextBuffer.length > 0) {
            const fullText = currentTextBuffer.join('<br>');
            blocks.push({ type: 'p', text: processInlineStyles(fullText) });
            currentTextBuffer = [];
        }
    };

    const finalizeQuiz = () => {
        if (currentQuizQuestions.length > 0) {
            blocks.push({ type: 'quiz', id: currentQuizId || 'quiz-' + blocks.length, questions: [...currentQuizQuestions] });
            currentQuizQuestions = [];
            currentQuizId = '';
        }
    };

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) {
          flushText();
          continue; 
      }

      // QUIZ Parsing
      if (line.toLowerCase().startsWith('@quiz:')) {
          flushText();
          if (currentQuizQuestions.length === 0) currentQuizId = 'quiz-' + i;
          
          const questionText = line.substring(6).trim();
          const options: Option[] = [];
          
          while (i + 1 < lines.length) {
              const nextLine = lines[i+1].trim();
              if (nextLine.toLowerCase().startsWith('@correct:')) {
                  options.push({ text: nextLine.substring(9).trim(), correct: true });
                  i++;
              } else if (nextLine.toLowerCase().startsWith('@option:')) {
                  options.push({ text: nextLine.substring(8).trim(), correct: false });
                  i++;
              } else if (nextLine === '') {
                  i++; 
              } else {
                  break; 
              }
          }
          if (options.length > 0) {
              currentQuizQuestions.push({ id: `q-${i}`, question: questionText, options });
          }
          continue;
      }
      
      finalizeQuiz();

      // IMAGE Parsing
      if (line.toLowerCase().startsWith('@image:') || line.toLowerCase().startsWith('@img:')) {
          flushText();
          const parts = line.split(':', 2);
          const url = line.substring(parts[0].length + 1).trim();
          blocks.push({ type: 'image', src: url, alt: 'Image' });
          continue;
      }

      // VIDEO Parsing
      if (line.toLowerCase().startsWith('@video:')) {
          flushText();
          const url = line.substring(7).trim();
          const ytEmbed = getYouTubeEmbedUrl(url);
          if (ytEmbed) {
              blocks.push({ type: 'video', safeSrc: sanitizer.bypassSecurityTrustResourceUrl(ytEmbed) });
          } else {
              blocks.push({ type: 'video', src: url });
          }
          continue;
      }

      // AUDIO Parsing
      if (line.toLowerCase().startsWith('@audio:')) {
          flushText();
          const url = line.substring(7).trim();
          blocks.push({ type: 'audio', src: url });
          continue;
      }

      // HEADERS Parsing
      if (line.startsWith('# ')) {
          flushText();
          const t = line.substring(2);
          blocks.push({ type: 'h1', text: t, id: slugify(t) });
          continue;
      }
      if (line.startsWith('## ')) {
          flushText();
          const t = line.substring(3);
          blocks.push({ type: 'h2', text: t, id: slugify(t) });
          continue;
      }
      
      // LIST Parsing
      if (line.startsWith('- ')) {
         flushText();
         const items = [];
         items.push(processInlineStyles(line.substring(2)));
         
         while(i + 1 < lines.length && lines[i+1].trim().startsWith('- ')) {
             i++;
             items.push(processInlineStyles(lines[i].trim().substring(2)));
         }
         blocks.push({ type: 'list', items });
         continue;
      }

      // CODE BLOCK Parsing
      if (line.startsWith('```')) {
         flushText();
         let codeContent = '';
         i++;
         while(i < lines.length && !lines[i].trim().startsWith('```')) {
             codeContent += lines[i] + '\n';
             i++;
         }
         blocks.push({ type: 'code', text: codeContent.trim() });
         continue;
      }
      
      // Ignore Meta directives inside content body
      if (line.startsWith('@title:') || line.startsWith('@icon:')) continue;

      currentTextBuffer.push(line);
    }
    
    flushText();
    finalizeQuiz();
    return { blocks };
}
