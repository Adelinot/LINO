const editor = document.getElementById('editor');
const highlightCode = document.getElementById('highlight-code');
const lineNumbers = document.getElementById('line-numbers');
const runBtn = document.getElementById('run-btn');
const outputElement = document.getElementById('output');

editor.addEventListener('input', updateEditor);
editor.addEventListener('scroll', () => {
    document.getElementById('highlight-layer').scrollTop = editor.scrollTop;
    document.getElementById('highlight-layer').scrollLeft = editor.scrollLeft;
    lineNumbers.scrollTop = editor.scrollTop;
});

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
    const linesCount = text.split('\n').length;
    let gutterHTML = '';
    for (let i = 1; i <= linesCount; i++) gutterHTML += i + '<br>';
    lineNumbers.innerHTML = gutterHTML;
    highlightCode.innerHTML = applySyntaxHighlighting(text);
}

function applySyntaxHighlighting(code) {
    let html = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const commentRegex = /(#[^\n]*)/g;
    const stringRegex = /("[^"]*")/g;
    const numberRegex = /\b(\d+(?:\.\d+)?)\b/g;
    const booleanRegex = /\b(yes|no)\b/g;
    const taskRegex = /\b(task)\b/g;
    const builtinRegex = /\b(say|ask|list|at)\b/g;
    const keywordRegex = /\b(let|when|repeat|if|elif|else)\b/g;
    const logicWordRegex = /\b(and|or|not|is|is not)\b/g;

    let placeholders = [];
    html = html.replace(commentRegex, match => {
        placeholders.push(`<span class="token-comment">${match}</span>`);
        return `___PLACEHOLDER_${placeholders.length - 1}___`;
    });
    html = html.replace(stringRegex, match => {
        placeholders.push(`<span class="token-string">${match}</span>`);
        return `___PLACEHOLDER_${placeholders.length - 1}___`;
    });

    html = html.replace(taskRegex, '<span class="token-task">$1</span>');
    html = html.replace(keywordRegex, '<span class="token-keyword">$1</span>');
    html = html.replace(builtinRegex, '<span class="token-builtin">$1</span>');
    html = html.replace(booleanRegex, '<span class="token-boolean">$1</span>');
    html = html.replace(logicWordRegex, '<span class="token-operator">$1</span>');
    html = html.replace(numberRegex, '<span class="token-number">$1</span>');

    html = html.replace(/(?<!<[^>]*)([\+\-\*\/=!]+)(?![^<]*>)/g, '<span class="token-symbol">$1</span>');

    for (let i = 0; i < placeholders.length; i++) {
        html = html.replace(`___PLACEHOLDER_${i}___`, placeholders[i]);
    }
    return html;
}

// 2. Async Runtime Interpreter Engine
runBtn.addEventListener('click', runLino);

async function runLino() {
    const code = editor.value;
    outputElement.textContent = ""; 
    
    let globalScope = {};
    let customTasks = {}; 
    const lines = code.split('\n');
    let currentLineIndex = 0;

    function logToConsole(text, isError = false) {
        if (isError) {
            outputElement.innerHTML += `<span style="color: #f48771; font-weight:bold;">${text}</span>\n`;
        } else {
            outputElement.textContent += (text === undefined ? "none" : text) + "\n";
        }
        outputElement.scrollTop = outputElement.scrollHeight;
    }

    function readTerminalInput(promptText) {
        return new Promise((resolve) => {
            const inputContainer = document.createElement('div');
            inputContainer.className = 'terminal-input-line';
            
            const promptSpan = document.createElement('span');
            promptSpan.className = 'terminal-prompt-text';
            promptSpan.textContent = promptText;
            
            const inputBox = document.createElement('input');
            inputBox.className = 'terminal-input-box';
            inputBox.type = 'text';
            
            inputContainer.appendChild(promptSpan);
            inputContainer.appendChild(inputBox);
            outputElement.appendChild(inputContainer);
            
            inputBox.focus();
            outputElement.scrollTop = outputElement.scrollHeight;

            inputBox.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    const value = inputBox.value;
                    inputContainer.remove();
                    logToConsole(promptText + value);
                    resolve(value);
                }
            });
        });
    }

    function parseError(type, msg) {
        throw new Error(`[Line ${currentLineIndex + 1}] ${type}: ${msg}`);
    }

    function getBlockLines(startIndex) {
        let block = [];
        let j = startIndex + 1;
        while (j < lines.length) {
            if (lines[j].trim() === "") {
                block.push({ text: "", index: j });
                j++;
                continue;
            }
            if (lines[j].startsWith("\t") || lines[j].startsWith("    ")) {
                block.push({ text: lines[j], index: j });
                j++;
            } else {
                break;
            }
        }
        return block;
    }

    async function executeBlock(blockObjects, localScope = null) {
        let savedIndex = currentLineIndex;
        for (let b = 0; b < blockObjects.length; b++) {
            currentLineIndex = blockObjects[b].index;
            let lineText = blockObjects[b].text.trim();
            if (lineText === "" || lineText.startsWith("#")) continue;
            await executeStatement(lineText, localScope);
        }
        currentLineIndex = savedIndex;
    }

    async function executeStatement(lineText, scope = null) {
        let targetScope = scope || globalScope;

        if (lineText.startsWith("say ")) {
            let expr = lineText.substring(4).trim();
            logToConsole(evaluateExpression(expr, targetScope));
        } 
        else if (lineText.startsWith("let ")) {
            let assignment = lineText.substring(4).trim();
            let parts = assignment.split('=');
            if (parts.length !== 2) parseError("Syntax Error", "Invalid variable assignment declaration.");
            let varName = parts[0].trim();
            let value = evaluateExpression(parts[1].trim(), targetScope);
            
            if (scope && globalScope[varName] !== undefined && scope[varName] === undefined) {
                globalScope[varName] = value;
            } else {
                targetScope[varName] = value;
            }
        }
        else if (lineText.startsWith("ask ")) {
            let content = lineText.substring(4).trim();
            if (!content.includes("to ")) parseError("Syntax Error", "Expected 'to' keyword target pointer assignment.");
            let parts = content.split("to ");
            let promptText = parts[0].trim().replace(/"/g, '');
            let varName = parts[1].trim();
            
            let userInput = await readTerminalInput(promptText);
            let processedVal = (isNaN(userInput) || userInput.trim() === "") ? userInput : Number(userInput);
            
            if (scope && globalScope[varName] !== undefined && scope[varName] === undefined) {
                globalScope[varName] = processedVal;
            } else {
                targetScope[varName] = processedVal;
            }
        }
        else if (lineText.includes("(") && lineText.endsWith(")")) {
            evaluateExpression(lineText, targetScope);
        }
        else {
            parseError("Syntax Error", `Unknown instruction layout alignment: '${lineText}'`);
        }
    }

    function evaluateExpression(expr, scope = globalScope) {
    let working = expr.trim();

    // 1. Convert native Lino boolean words to JS constants safely
    working = working.replace(/\byes\b/g, 'true').replace(/\bno\b/g, 'false');

    // 2. Handle Lino List initialization syntax: list("A", "B") -> ["A", "B"]
    if (working.startsWith("list(") && working.endsWith(")")) {
        let itemsRaw = working.slice(5, -1);
        return Function(`return [${itemsRaw}];`)();
    }

    // 3. Handle List lookup syntax: inventory at 0
    if (working.includes(" at ")) {
        let parts = working.split(" at ");
        let listName = parts[0].trim().replace(/[\(\)]/g, ''); // Clear wrapping tracking parens if any
        let indexExpr = parts[1].trim().replace(/[\(\)]/g, '');
        
        let targetList = scope[listName] !== undefined ? scope[listName] : globalScope[listName];
        if (!Array.isArray(targetList)) parseError("Name Error", `'${listName}' is not a list.`);
        
        let evaluatedIndex = evaluateExpression(indexExpr, scope);
        return targetList[evaluatedIndex];
    }

    // 4. Tokenize strings out BEFORE converting keywords like 'is' or 'and'
    // This stops "index is now" from changing into "index === now"
    let stringPlaceholders = [];
    working = working.replace(/("[^"]*")/g, match => {
        stringPlaceholders.push(match);
        return `___STR_TOKEN_${stringPlaceholders.length - 1}___`;
    });

    // 5. Safely translate logic operators ONLY outside of the user's string text
    working = working.replace(/\bis not\b/g, '!==')
                     .replace(/\bis\b/g, '===')
                     .replace(/\band\b/g, '&&')
                     .replace(/\bor\b/g, '||')
                     .replace(/\bnot\b/g, '!');

    // 6. Restore the user's original uncorrupted text strings back into the expression
    for (let i = 0; i < stringPlaceholders.length; i++) {
        working = working.replace(`___STR_TOKEN_${i}___`, stringPlaceholders[i]);
    }

    // 7. Check for custom task/function execution formulas
    let funcMatch = working.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\((.*)\)$/);
    if (funcMatch) {
        let taskName = funcMatch[1];
        let rawArgs = funcMatch[2];
        if (customTasks[taskName]) {
            let taskObj = customTasks[taskName];
            let passedArgs = rawArgs.trim() === "" ? [] : rawArgs.split(',').map(a => evaluateExpression(a.trim(), scope));
            if (passedArgs.length !== taskObj.params.length) {
                parseError("Argument Error", `Expected ${taskObj.params.length} parameters, got ${passedArgs.length}.`);
            }
            let taskScope = {};
            taskObj.params.forEach((param, idx) => { taskScope[param] = passedArgs[idx]; });
            executeBlock(taskObj.block, taskScope);
            return;
        }
    }

    // 8. Sandbox scope evaluation execution
    let combinedScope = { ...globalScope, ...scope };
    let keys = Object.keys(combinedScope);
    let vals = Object.values(combinedScope);

    try {
        return new Function(...keys, `return (${working});`)(...vals);
    } catch (e) {
        return working.replace(/"/g, '');
    }
}

updateEditor();
