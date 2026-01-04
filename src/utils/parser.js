
export function parseContent(text) {
    if (!text) return [];
    const lines = text.split('\n');
    const blocks = [];
    
    lines.forEach(line => {
        line = line.trim();
        if (!line) return;

        if (line.startsWith('# ')) {
            blocks.push({ type: 'h1', content: line.substring(2) });
        } else if (line.startsWith('## ')) {
            blocks.push({ type: 'h2', content: line.substring(3) });
        } else if (line.startsWith('@image:')) {
            blocks.push({ type: 'image', src: line.substring(7).trim() });
        } else if (line.startsWith('@quiz:')) {
             // Simplified quiz logic for demo
            blocks.push({ type: 'quiz', question: line.substring(6).trim() });
        } else if (!line.startsWith('@')) {
            blocks.push({ type: 'p', content: line });
        }
    });
    return blocks;
}
