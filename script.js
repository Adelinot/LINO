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

// 1. Syntax Highlighter Engine
function applySyntaxHighlighting(code) {
    // 1. Clean and escape any raw HTML the user typed first
    let html = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // 2. Define the exact regex patterns
    const commentRegex = /(#[^\n]*)/g;
    const stringRegex = /("[^"]*")/g;
    const numberRegex = /\b(\d+(?:\.\d+)?)\b/g;
    const booleanRegex = /\b(yes|no)\b/g;
    const taskRegex = /\b(task)\b/g;
    const builtinRegex = /\b(say|ask|list|at)\b/g;
    const keywordRegex = /\b(let|when|repeat|if|elif|else)\b/g;
    const logicWordRegex = /\b(and|or|not|is|is not)\b/g;
    const operatorRegex = /(\+|-|\*|\/|=||!)/g; // Removed < and > from here to prevent tag breaking

    // 3. Protect comments and strings first using placeholders
    let placeholders = [];
    html = html.replace(commentRegex, match => {
        placeholders.push(`<span class="token-comment">${match}</span>`);
        return `___PLACEHOLDER_${placeholders.length - 1}___`;
    });
    html = html.replace(stringRegex, match => {
        placeholders.push(`<span class="token-string">${match}</span>`);
        return `___PLACEHOLDER_${placeholders.length - 1}___`;
    });

    // 4. Highlight elements that do NOT use <, >, or = symbols first
    html = html.replace(taskRegex, '<span class="token-task">$1</span>');
    html = html.replace(keywordRegex, '<span class="token-keyword">$1</span>');
    html = html.replace(builtinRegex, '<span class="token-builtin">$1</span>');
    html = html.replace(booleanRegex, '<span class="token-boolean">$1</span>');
    html = html.replace(logicWordRegex, '<span class="token-operator">$1</span>');
    html = html.replace(numberRegex, '<span class="token-number">$1</span>');

    // 5. Safely highlight operators WITHOUT breaking the span structures
    // This looks for operators that aren't inside an HTML tag name
    html = html.replace(/(?<!<[^>]*)([\+\-\*\/=!]+)(?![^<]*>)/g, '<span class="token-symbol">$1</span>');

    // 6. Restore comments and strings safely
    for (let i = 0; i < placeholders.length; i++) {
        html = html.replace(`___PLACEHOLDER_${i}___`, placeholders[i]);
    }

    return html;
}
// 2. Interpreter Runtime Engine
runBtn.addEventListener('click', runLino);

function runLino() {
    const code = editor.value;
    outputElement.textContent = ""; 
    
    let globalScope = {};
    let customTasks = {}; // Stores functions

    function logToConsole(text, isError = false) {
        if (isError) {
            outputElement.innerHTML += `<span style="color: #f48771; font-weight:bold;">${text}</span>\n`;
        } else {
            outputElement.textContent += (text === undefined ? "none" : text) + "\n";
        }
    }

    const lines = code.split('\n');
    let currentLineIndex = 0;

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

    function executeBlock(blockObjects, localScope = {}) {
        let savedIndex = currentLineIndex;
        for (let b = 0; b < blockObjects.length; b++) {
            currentLineIndex = blockObjects[b].index;
            let lineText = blockObjects[b].text.trim();
            if (lineText === "" || lineText.startsWith("#")) continue;
            executeStatement(lineText, localScope);
        }
        currentLineIndex = savedIndex;
    }

    function executeStatement(lineText, scope = globalScope) {
        // Handling say
        if (lineText.startsWith("say ")) {
            let expr = lineText.substring(4).trim();
            logToConsole(evaluateExpression(expr, scope));
        } 
        // Handling variables initialization/update
        else if (lineText.startsWith("let ")) {
            let assignment = lineText.substring(4).trim();
            let parts = assignment.split('=');
            if (parts.length !== 2) parseError("Syntax Error", "Invalid variable declaration formatting.");
            let varName = parts[0].trim();
            scope[varName] = evaluateExpression(parts[1].trim(), scope);
        }
        // Handling user input (ask)
        else if (lineText.startsWith("ask ")) {
            let content = lineText.substring(4).trim();
            if (!content.includes("to ")) parseError("Syntax Error", "Expected 'to' keyword target assignment.");
            let parts = content.split("to ");
            let promptText = parts[0].trim().replace(/"/g, '');
            let varName = parts[1].trim();
            let userInput = prompt(promptText);
            scope[varName] = (isNaN(userInput) || userInput.trim() === "") ? userInput : Number(userInput);
        }
        // Handling function/task call configurations directly on isolated lines
        else if (lineText.includes("(") && lineText.endsWith(")")) {
            evaluateExpression(lineText, scope);
        }
        else {
            parseError("Syntax Error", `Unknown instruction keyword alignment: '${lineText}'`);
        }
    }

    function evaluateExpression(expr, scope = globalScope) {
        let working = expr.trim();

        // 1. Convert native boolean values
        working = working.replace(/\byes\b/g, 'true').replace(/\bno\b/g, 'false');

        // 2. Convert Lino List syntax rules: list("A", "B") -> ["A", "B"]
        if (working.startsWith("list(") && working.endsWith(")")) {
            let itemsRaw = working.slice(5, -1);
            // Splitting elements cleanly
            let parsedArr = Function(`return [${itemsRaw}];`)();
            return parsedArr;
        }

        // 3. Convert List lookup syntax rules: x at 1 -> x[1]
        if (working.includes(" at ")) {
            let parts = working.split(" at ");
            let listName = parts[0].trim();
            let indexExpr = parts[1].trim();
            let targetList = scope[listName] || globalScope[listName];
            if (!Array.isArray(targetList)) parseError("Name Error", `'${listName}' is not an active list object type.`);
            let evaluatedIndex = evaluateExpression(indexExpr, scope);
            return targetList[evaluatedIndex];
        }

        // 4. Translate logical word operations safely
        working = working.replace(/\bis not\b/g, '!==')
                         .replace(/\bis\b/g, '===')
                         .replace(/\band\b/g, '&&')
                         .replace(/\bor\b/g, '||')
                         .replace(/\bnot\b/g, '!');

        // 5. Intercept custom task execution commands: functionName(args)
        let funcMatch = working.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\((.*)\)$/);
        if (funcMatch) {
            let taskName = funcMatch[1];
            let rawArgs = funcMatch[2];
            if (customTasks[taskName]) {
                let taskObj = customTasks[taskName];
                let passedArgs = rawArgs.trim() === "" ? [] : rawArgs.split(',').map(a => evaluateExpression(a.trim(), scope));
                
                if (passedArgs.length !== taskObj.params.length) {
                    parseError("Argument Error", `Task '${taskName}' expected ${taskObj.params.length} parameters, got ${passedArgs.length}.`);
                }
                
                // Build execution bubble sandbox
                let taskScope = {};
                taskObj.params.forEach((param, idx) => {
                    taskScope[param] = passedArgs[idx];
                });

                executeBlock(taskObj.block, taskScope);
                return; // Currently basic tasks don't return expressions explicitly
            }
        }

        // Inject active scoped variables
        let combinedScope = { ...globalScope, ...scope };
        for (let key in combinedScope) {
            let regex = new RegExp(`\\b${key}\\b`, 'g');
            let val = combinedScope[key];
            working = working.replace(regex, typeof val === 'string' ? `"${val}"` : JSON.stringify(val));
        }

        try {
            return Function(`return (${working});`)();
        } catch (e) {
            // Remove lingering artifact tracking
            return working.replace(/"/g, '');
        }
    }

    // Pipeline Engine Loop Execution Context
    try {
        while (currentLineIndex < lines.length) {
            let rawLine = lines[currentLineIndex];
            let line = rawLine.trim();
            
            if (line === "" || line.startsWith("#") || rawLine.startsWith("\t") || rawLine.startsWith("    ")) {
                currentLineIndex++;
                continue;
            }

            // A. Handling custom functions configuration: task name(param)
            if (line.startsWith("task ")) {
                let taskSignature = line.substring(5).trim();
                let match = taskSignature.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\((.*)\)$/);
                if (!match) parseError("Syntax Error", "Invalid task parameter signature pattern layout.");
                
                let taskName = match[1];
                let params = match[2].trim() === "" ? [] : match[2].split(',').map(p => p.trim());
                let block = getBlockLines(currentLineIndex);
                
                if (block.length === 0) parseError("Block Error", "Expected indented statements under task block declaration.");
                
                customTasks[taskName] = { params: params, block: block };
                currentLineIndex += block.length + 1;
                continue;
            }

            // B. Handling definite looping loops: repeat X
            if (line.startsWith("repeat ")) {
                let repeatNum = parseInt(evaluateExpression(line.substring(7).trim(), globalScope));
                let block = getBlockLines(currentLineIndex);
                if (block.length === 0) parseError("Block Error", "Expected indented statements under repeat block layout.");
                
                for (let r = 0; r < repeatNum; r++) {
                    executeBlock(block);
                }
                currentLineIndex += block.length + 1;
                continue;
            }

            // C. Handling indefinite iterations loops: when condition
            if (line.startsWith("when ")) {
                let conditionExpr = line.substring(5).trim();
                let block = getBlockLines(currentLineIndex);
                if (block.length === 0) parseError("Block Error", "Expected indented statements under when loop declaration.");
                
                let protectionCount = 0;
                while (evaluateExpression(conditionExpr, globalScope) === true) {
                    executeBlock(block);
                    protectionCount++;
                    if (protectionCount > 5000) parseError("Infinite Loop Error", "Loop execution overflow threshold reached (>5000 loops).");
                }
                currentLineIndex += block.length + 1;
                continue;
            }

            // D. Handling operational branching logic: if, elif, else
            if (line.startsWith("if ")) {
                let condition = line.substring(3).trim();
                let block = getBlockLines(currentLineIndex);
                if (block.length === 0) parseError("Block Error", "Expected indented statements under if execution path.");
                
                let conditionMet = false;
                if (evaluateExpression(condition, globalScope) === true) {
                    executeBlock(block);
                    conditionMet = true;
                }
                currentLineIndex += block.length + 1;

                // Scan and verify next sibling rows for chains
                while (currentLineIndex < lines.length) {
                    let nextLine = lines[currentLineIndex].trim();
                    if (nextLine.startsWith("elif ")) {
                        let elifBlock = getBlockLines(currentLineIndex);
                        if (!conditionMet && evaluateExpression(nextLine.substring(5).trim(), globalScope) === true) {
                            executeBlock(elifBlock);
                            conditionMet = true;
                        }
                        currentLineIndex += elifBlock.length + 1;
                    } else if (nextLine.startsWith("else")) {
                        let elseBlock = getBlockLines(currentLineIndex);
                        if (!conditionMet) {
                            executeBlock(elseBlock);
                        }
                        currentLineIndex += elseBlock.length + 1;
                        break;
                    } else {
                        break;
                    }
                }
                continue;
            }

            // Execute base system lines directly
            executeStatement(line, globalScope);
            currentLineIndex++;
        }
    } catch (err) {
        logToConsole(err.message, true);
    }
}

updateEditor();
