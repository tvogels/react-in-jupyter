window.REACT_JUPYTER_SETUP_LOADED = true;

/**
 * RequireJS dependencies
 */
let d3requireLoaded = null;
window.d3require = library => {
    if (d3requireLoaded == null) {
        return new Promise(resolve => {
            require(["https://cdn.jsdelivr.net/npm/d3-require@1"], d3 => {
                const d3require = d3.require.alias({
                    react: "react@16/umd/react.production.min.js",
                    "react-dom": "react-dom@16/umd/react-dom.production.min.js"
                });
                d3requireLoaded = d3require;
                resolve(d3require(library));
            });
        });
    } else {
        console.log("we already have d3require");
        return d3requireLoaded(library);
    }
};

/**
 * Execute Python code and wait for the response
 */
window.python = function(pythonCode) {
    return new Promise((resolve, reject) => {
        let streamOutput = [];
        let errorOutput = null;
        const callbacks = {
            shell: {
                reply: msg => {
                    if (msg.msg_type === "execute_reply") {
                        if (msg.content.status === "ok") {
                            resolve(streamOutput.join(""));
                        } else if (msg.content.status === "error") {
                            reject(new Error(errorOutput.exception + ": " + errorOutput.message));
                        } else {
                            throw new Error("Unknown status " + msg.content.status);
                        }
                    }
                },
                payload: {
                    set_next_input: x => {
                        throw new Error("Don't know what to do with a set_next_input message.");
                    }
                }
            },
            iopub: {
                output: msg => {
                    if (msg.msg_type === "stream") {
                        streamOutput.push(msg.content.text);
                    } else if (msg.msg_type === "error") {
                        errorOutput = {
                            exception: msg.content.ename,
                            message: msg.content.evalue,
                            traceback: msg.content.traceback
                        };
                    } else {
                        throw new Error("Received output with unknown type " + msg.msg_type);
                    }
                },
                clear_output: msg => {
                    streamOutput = [];
                }
            },
            input: msg => {
                throw new Error("Don't know what to do with an input message.");
            }
        };
        Jupyter.notebook.kernel.execute(pythonCode, callbacks, { silent: false });
    });
};

/**
 * Fetch a Python variable from the server
 */
window.fetchVariable = function(variableName) {
    const code = `
from react_jupyter import CustomJSONEncoder
import json
print(json.dumps(${variableName}, cls=CustomJSONEncoder))`.trim();
    return window.python(code).then(x => JSON.parse(x.trim()));
};

/**
 * Enable syntax highlighting for JSX cells
 */
Jupyter.CodeCell.options_default.highlight_modes.magic_jsx = { reg: ["^%%jsx"] };

class CleanupManager {
    constructor() {
        this.callbacks = [];
    }
    register(callback) {
        this.callbacks.push(callback);
    }
    cleanup() {
        for (let callback of this.callbacks) {
            callback();
        }
        this.callbacks = [];
    }
    childScope() {
        const manager = new CleanupManager();
        this.register(() => manager.cleanup());
        return manager;
    }
}

/**
 * A Cell handles rendering and cleanup
 */
class Cell {
    constructor(element) {
        this.elem = element;
        this.outputDiv = this._findParentOutputDiv(element);
        this.notebookElement = this.outputDiv.parentElement.parentElement;
        this.notebookContainer = this.notebookElement.parentElement;

        this.cleanupManager = new CleanupManager();

        this._listenForCleanup();
    }

    render(tree) {
        d3require("react-dom").then(ReactDOM => {
            ReactDOM.render(tree, this.elem);
        });
    }

    renderError(errorMessage) {
        d3require("react").then(React => {
            this.render(
                React.createElement(
                    "div",
                    {
                        style: {
                            borderLeft: "3px solid red",
                            padding: "0.5em 1em",
                            backgroundColor: "rgba(255, 0, 0, 0.1)"
                        }
                    },
                    [
                        React.createElement("strong", {}, ["Error"]),
                        React.createElement("div", { style: { whiteSpace: "pre", fontFamily: "monospace" } }, [
                            errorMessage
                        ])
                    ]
                )
            );
        });
    }

    _cleanup() {
        this.cleanupManager.cleanup();
    }

    _listenForCleanup() {
        const reExecuteDetector = new MutationObserver(this._cleanup.bind(this));
        reExecuteDetector.observe(this.outputDiv, { childList: true });
        this.cleanupManager.register(() => reExecuteDetector.disconnect());

        const cellDeletionDetector = new MutationObserver(mutationRecord => {
            for (let mutation of mutationRecord) {
                if (mutation.type === "childList") {
                    for (let node of mutation.removedNodes) {
                        if (node === this.notebookElement) {
                            return this._cleanup(mutationRecord);
                        }
                    }
                }
            }
        });
        cellDeletionDetector.observe(this.notebookContainer, { childList: true });
        this.cleanupManager.register(() => cellDeletionDetector.disconnect());
    }

    _findParentOutputDiv(el) {
        let candidate = el;
        while (candidate) {
            candidate = candidate.parentElement;
            if (candidate.className === "output") {
                return candidate;
            }
        }
        throw Error("parent output div not found");
    }
}

window.Cell = Cell;

class Registry {
    constructor() {
        this.registry = new Map();
        this.dependencies = new Set();
    }

    publishMany(pairs) {
        for (const [variable, value] of pairs) {
            this.registry.set(variable, value);
        }
        const changedVariables = pairs.map(p => p[0]);
        for (const { variables, callback } of this.dependencies) {
            const nonZeroIntersection = changedVariables.find(v => variables.has(v));
            if (nonZeroIntersection) {
                this.call(variables, callback);
            }
        }
    }

    call(variables, callback) {
        const values = {};
        for (const v of variables) {
            values[v] = this.get(v);
        }
        callback(values);
    }

    publish(variable, value) {
        this.publishMany([[variable, value]]);
    }

    get(variable) {
        return this.registry.get(variable);
    }

    listen(variables, callback) {
        variables = new Set(variables);
        const obj = { variables, callback };
        this.dependencies.add(obj);

        this.call(variables, callback);

        return () => this.dependencies.delete(obj);
    }
}
window.registry = new Registry();

/**
 * Registry entry for the width of a code cell,
 * so cells can auto-update on resize.
 */
let previousCellWidth = null;
function updateCellWidth() {
    const width = Math.round(document.getElementsByClassName("inner_cell")[0].clientWidth - 18.8);
    if (width !== previousCellWidth) {
        previousCellWidth = width;
        registry.publish("width", width);
    }
}
updateCellWidth();
window.addEventListener("resize", updateCellWidth);
