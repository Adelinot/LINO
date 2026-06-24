// ==========================
// Lino Language v1
// Interpreter
// ==========================

const editor = document.getElementById("editor");
const output = document.getElementById("output");
const runButton = document.getElementById("runButton");

runButton.addEventListener("click", runLino);

function runLino() {

    output.textContent = "";

    const variables = {};

    const lines = editor.value.split("\n");

    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {

        let line = lines[lineNumber].trim();

        if (line === "") continue;

        if (line.startsWith("#")) continue;

        // --------------------------
        // let
        // --------------------------

        if (line.startsWith("let ")) {

            let code = line.substring(4);

            if (!code.includes("=")) {
                error("Expected '='", lineNumber);
                return;
            }

            let parts = code.split("=");

            let name = parts[0].trim();

            let value = parts.slice(1).join("=").trim();

            variables[name] = evaluate(value, variables);

            continue;
        }

        // --------------------------
        // say
        // --------------------------

        if (line.startsWith("say ")) {

            let value = line.substring(4);

            output.textContent += evaluate(value, variables) + "\n";

            continue;
        }

        // --------------------------
        // variable assignment
        // --------------------------

        if (line.includes("=")) {

            let parts = line.split("=");

            let name = parts[0].trim();

            let value = parts.slice(1).join("=").trim();

            if (!(name in variables)) {
                error("Unknown variable '" + name + "'", lineNumber);
                return;
            }

            variables[name] = evaluate(value, variables);

            continue;
        }

        error("Unknown command", lineNumber);
        return;
    }

}

function evaluate(value, variables) {

    value = value.trim();

    // String

    if (
        value.startsWith('"') &&
        value.endsWith('"')
    ) {

        return value.substring(1, value.length - 1);

    }

    // Number

    if (!isNaN(value)) {

        return Number(value);

    }

    // Variable

    if (value in variables) {

        return variables[value];

    }

    // Replace variables inside expressions

    let expression = value;

    for (let name in variables) {

        expression = expression.replaceAll(
            name,
            variables[name]
        );

    }

    try {

        return eval(expression);

    }

    catch {

        return value;

    }

}

function error(message, line) {

    output.textContent +=
        "Error on line " +
        (line + 1) +
        "\n" +
        message;

}
