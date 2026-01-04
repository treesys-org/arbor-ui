
export function processInlineStyles(text) {
    let parsed = text;
    parsed = parsed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    parsed = parsed.replace(/(^|[^\*])\*([^\*]+)\*/g, '$1<em>$2</em>');
    parsed = parsed.replace(/`(.*?)`/g, '<code class="bg-slate-200 dark:bg-slate-700 px-1 rounded font-mono text-sm text-pink-600 dark:text-pink-400">$1</code>');
    return parsed;
}

function slugify(text) {
    return text.toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function parseContent(text) {
    if (!text) return [];
    const lines = text.split('\n');
    const blocks = [];
    
    let currentQuizQuestions = [];
    let currentQuizId = '';
    let currentTextBuffer = [];

    const flushText = () => {
        if (currentTextBuffer.length > 0) {
            blocks.push({ type: 'p', text: processInlineStyles(currentTextBuffer.join('<br>')) });
            currentTextBuffer = [];
        }
    };

    const finalizeQuiz = () => {
        if (currentQuizQuestions.length > 0) {
            blocks.push({ 
                type: 'quiz', 
                id: currentQuizId || 'quiz-' + blocks.length, 
                questions: [...currentQuizQuestions] 
            });
            currentQuizQuestions = [];
            currentQuizId = '';
        }
    };

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) { flushText(); continue; }

        // Headers
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

        // Images
        if (line.startsWith('@image:') || line.startsWith('@img:')) {
            flushText();
            const src = line.substring(line.indexOf(':')+1).trim();
            blocks.push({ type: 'image', src });
            continue;
        }

        // Video
        if (line.startsWith('@video:')) {
            flushText();
            const src = line.substring(7).trim();
            let safeSrc = src;
            // Convert simple YT links to embed
            if (src.includes('watch?v=')) safeSrc = src.replace('watch?v=', 'embed/');
            if (src.includes('youtu.be/')) safeSrc = src.replace('youtu.be/', 'youtube.com/embed/');
            blocks.push({ type: 'video', src: safeSrc });
            continue;
        }
        
        // Audio
        if (line.startsWith('@audio:')) {
            flushText();
            const src = line.substring(7).trim();
            blocks.push({ type: 'audio', src });
            continue;
        }

        // Quiz
        if (line.startsWith('@quiz:')) {
            flushText();
            if (currentQuizQuestions.length === 0) currentQuizId = 'q-' + i;
            
            const qText = line.substring(6).trim();
            const options = [];
            
            // Look ahead for options
            while(i + 1 < lines.length) {
                const next = lines[i+1].trim();
                if (next.startsWith('@correct:')) {
                    options.push({ text: next.substring(9).trim(), correct: true });
                    i++;
                } else if (next.startsWith('@option:')) {
                    options.push({ text: next.substring(8).trim(), correct: false });
                    i++;
                } else if (next === '') { i++; } 
                else { break; }
            }
            if (options.length) currentQuizQuestions.push({ question: qText, options });
            continue;
        }
        
        // Code Block
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
        
        // List
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

        finalizeQuiz();

        // Ignore metadata lines in body
        if (!line.startsWith('@')) {
            currentTextBuffer.push(line);
        }
    }
    
    flushText();
    finalizeQuiz();
    return blocks;
}
