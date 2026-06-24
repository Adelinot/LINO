const editor = document.getElementById('editor');
const highlightCode = document.getElementById('highlight-code');
const lineNumbers = document.getElementById('line-numbers');
const runBtn = document.getElementById('run-btn');
const outputElement = document.getElementById('output');

// 1. Live Input Synchronizer (Line numbers & Highlight)
editor.addEventListener('input', () => {
    updateEditor();
});

// Keep scrolling matched exactly between invisible input layer and view layer
editor.addEventListener('scroll', () => {
    document.getElementById('highlight-layer').scrollTop = editor.scrollTop;
    document.getElementById('highlight-layer').scrollLeft = editor.scrollLeft;
    lineNumbers.scrollTop = editor.scrollTop;
});

// Handle Tab Key cleanly
editor.addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.selectionStart;
        const end = this.selectionEnd;
        this.value = this.value.substring(0, start) + "\t" + this.value.substring(end);
        this.selectionStart = this.selectionEnd = start + 1;
        updateEditor();
    }
});

function updateEditor() {
    const text = editor.value;
    
    // Update Line Numbers
    const linesCount = text.split('\n').length;
    let gutterHTML = '';
    for (let i = 1; i <= linesCount; i++) {
        gutterHTML += i + '<br>';
    }
    lineNumbers.innerHTML = gutterHTML;

    // Apply Real-time Syntax Coloring
    highlightCode.innerHTML = applySyntaxHighlighting(text);
}

// 2. Syntax Highlighter Regex Core
function applySyntaxHighlighting(code) {
    // Escape HTML characters safely
    let html = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Match keywords: let, say, ask, when, repeat, if, elif, else
    const keywords = /\b(let|say|ask|when|repeat|if|elif|else)\b/g;
    // Match comments starting with #
    const comments = /(#[^\n]*)/g;
    // Match Strings
    const strings = /("[^"\\]*(?:\\.[^"\\]*)*")/g;
    // Match Numbers
    const numbers = /\b(\d+)\b/g;

    // We apply token parsing (Order matters to prevent string contents from breaking keywords)
    html = html.replace(strings, '<span class="token-string">$1</span>');
    
    // Quick trick to bypass wrapping keywords inside comments
    html = html.replace(comments, '<span class="token-comment">$1</span>');

    // Run keywords token injection outside string modifications
    html = html.replace(keywords, match => {
        // Only modify if not already inside an injected span tag
        return `<span class="token-keyword">${match}</span>`;
    });

    html = html.replace(numbers, '<span class="token-number">$1</span>');

    return html;
}

// 3. Execution Engine Core (Lino Interpreter Runtime)
runBtn.addEventListener('click', runLino);

function runLino() {
    const code = editor.value;
    outputElement.textContent = ""; // Reset terminal screen
    let variables = {};

    function logToConsole(text) {
        outputElement.textContent += text + "\n";
    }

    const lines = code.split('\n');
    let i = 0;

    while (i < lines.length) {
        let line = lines[i].trim();
        
        if (line === "" || line.startsWith("#")) {
            i++;
            continue;
        }

        // Lino Syntax: say "hello" / say x
        if (line.startsWith("say ")) {
            let expr = line.substring(4).trim();
            if (expr.startsWith('"') && expr.endsWith('"')) {
                logToConsole(expr.slice(1, -1));
            } else {
                logToConsole(evaluateExpression(expr, variables));
            }
        }
        // Lino Syntax: let x = 5
        else if (line.startsWith("let ")) {
            let assignment = line.substring(4).trim();
            let parts = assignment.split('=');
            if (parts.length === 2) {
                let varName = parts[0].trim();
                let varValue = parts[1].trim();
                variables[varName] = evaluateExpression(varValue, variables);
            }
        }
        // Lino Syntax: ask "Your Name" to variable
        else if (line.startsWith("ask ")) {
            let content = line.substring(4).trim();
            if (content.includes("to ")) {
                let parts = content.split("to ");
                let promptText = parts[0].trim().replace(/"/g, '');
                let varName = parts[1].trim();
                let userInput = prompt(promptText);
                variables[varName] = isNaN(userInput) ? userInput : Number(userInput);
            }
        }
        // Lino Syntax: repeat 5
        else if (line.startsWith("repeat ")) {
            let repeatNum = parseInt(line.substring(7).trim());
            let loopLines = [];
            let j = i + 1;
            
            while (j < lines.length && (lines[j].startsWith("\t") || lines[j].startsWith("    "))) {
                loopLines.push(lines[j]);
                j++;
            }

            for (let r = 0; r < repeatNum; r++) {
                loopLines.forEach(loopLine => {
                    let cleanLine = loopLine.trim();
                    if (cleanLine.startsWith("say ")) {
                        let expr = cleanLine.substring(4).trim();
                        if (expr.startsWith('"') && expr.endsWith('"')) {
                            logToConsole(expr.slice(1, -1));
                        } else {
                            logToConsole(evaluateExpression(expr, variables));
                        }
                    }
                });
            }
            i = j - 1;
        }
        i++;
    }
}

function evaluateExpression(expr, variables) {
    for (let varName in variables) {
        let regex = new RegExp(`\\b${varName}\\b`, 'g');
        expr = expr.replace(regex, variables[varName]);
    }
    try {
        return Function(`return (${expr});`)();
    } catch (e) {
        return expr;
    }
}

// Run initial execution mapping to set up line 1
updateEditor();
