
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';

// Configure environment for browser
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
// useBrowserCache uses the Cache API to store weights.
// If the user closes the tab, the cache remains.

let generator = null;
let currentTask = 'text-generation';
let currentModel = '';

self.addEventListener('message', async (e) => {
    const { type, data } = e.data;

    if (type === 'init') {
        await initialize(data.model);
    } else if (type === 'generate') {
        await generate(data.messages, data.config);
    }
});

async function initialize(modelName) {
    if (generator && currentModel === modelName) {
        self.postMessage({ status: 'ready', message: 'Model already loaded in worker.' });
        return;
    }

    try {
        currentModel = modelName;
        
        // Detect task
        const lower = modelName.toLowerCase();
        currentTask = (lower.includes('t5') || lower.includes('bart') || lower.includes('flan')) 
            ? 'text2text-generation' 
            : 'text-generation';

        self.postMessage({ status: 'progress', message: 'Initiating Engine...', progress: 0 });

        generator = await pipeline(currentTask, modelName, {
            progress_callback: (progress) => {
                // Relay download progress to main thread
                if (progress.status === 'progress') {
                    self.postMessage({ 
                        status: 'progress', 
                        message: `Downloading ${progress.file}`, 
                        progress: progress.progress 
                    });
                } else if (progress.status === 'initiate') {
                    self.postMessage({ status: 'progress', message: `Downloading ${progress.file}...`, progress: 0 });
                } else if (progress.status === 'done') {
                    // File download done
                }
            }
        });

        self.postMessage({ status: 'ready', message: 'AI Engine Ready.' });

    } catch (err) {
        self.postMessage({ status: 'error', message: err.message });
    }
}

async function generate(messages, config) {
    if (!generator) {
        self.postMessage({ status: 'error', message: 'Model not initialized.' });
        return;
    }

    try {
        // Construct Prompt
        const systemMsg = messages.find(m => m.role === 'system')?.content || '';
        const userMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
        const contextMsg = messages.length > 2 ? messages[messages.length - 2].content : ''; // Crude context grab
        
        // Simple prompt construction logic
        let fullPrompt = '';
        if (currentTask === 'text-generation') {
            // ChatML-like style for generation models
            fullPrompt = `<|im_start|>system\n${systemMsg}\nCONTEXT:\n${contextMsg}<|im_end|>\n<|im_start|>user\n${userMsg}<|im_end|>\n<|im_start|>assistant\n`;
        } else {
            // T5 / Seq2Seq style
            fullPrompt = `Question: ${userMsg}\nContext: ${contextMsg}\n\nAnswer:`;
        }

        const output = await generator(fullPrompt, {
            max_new_tokens: 256,
            temperature: 0.7,
            do_sample: false, // Deterministic to be faster
            ...config
        });

        let text = output[0].generated_text;

        // ROBUST CLEANUP LOGIC
        // Some models echo the prompt. We need to strip everything up to "assistant"
        if (currentTask === 'text-generation') {
            // 1. Try to remove the exact prompt prefix if matched
            if (text.startsWith(fullPrompt)) {
                text = text.substring(fullPrompt.length);
            } 
            // 2. Strict splitting by the assistant token.
            // We specifically injected <|im_start|>assistant\n at the end of the prompt.
            // Everything before the LAST occurrence of this token is likely the prompt/system/context.
            else if (text.includes('<|im_start|>assistant')) {
                const parts = text.split('<|im_start|>assistant');
                // The answer is the last part (or the part after the prompt's assistant tag)
                text = parts[parts.length - 1];
            }
            // 3. Fallback: Regex to catch the specific leakage "system ... CONTEXT:"
            else {
                text = text.replace(/^[\s\S]*<\|im_start\|>assistant\s*/i, '');
                // Specific cleanup for raw text leaks if tokens are missing/malformed
                text = text.replace(/^[\s\S]*system\s+CONTEXT:[\s\S]*?user[\s\S]*?assistant/im, '');
            }
            
            // 4. Final cleanup of any lingering closing tags
            text = text.replace(/<\|im_end\|>$/, '');
        }
        
        self.postMessage({ status: 'complete', text: text.trim() });

    } catch (err) {
        self.postMessage({ status: 'error', message: err.message });
    }
}
