window.REACT_JUPYTER_SETUP_LOADED = true;

/**
 * RequireJS dependencies
 */
// require(["https://cdn.jsdelivr.net/npm/d3-require@1"], ({ requireFrom }) => {
//     window.d3require = requireFrom(async name => {
//         return `https://unpkg.com/${name}`;
//     });
// });
require.config({
    paths: {
        babel: "https://unpkg.com/babel-standalone@6/babel.min",
        react: "https://unpkg.com/react@16.13.0/umd/react.production.min",
        "react-dom": "https://unpkg.com/react-dom@16.13.0/umd/react-dom.production.min",
        flexvg: "https://unpkg.com/flexvg@0.0.5/dist/flexvg.umd",
        "d3-scale": "https://unpkg.com/d3-scale@3.2.1/dist/d3-scale.min",
        "d3-shape": "https://unpkg.com/d3-shape@1.3.7/dist/d3-shape.min",
        "d3-scale-chromatic": "https://unpkg.com/d3-scale-chromatic@1.5.0/dist/d3-scale-chromatic.min",
        "d3-array": "https://unpkg.com/d3-array@2.4.0/dist/d3-array",
        "d3-path": "https://unpkg.com/d3-path@1.0.9/dist/d3-path.min",
        "d3-format": "https://unpkg.com/d3-format@1.4.3/dist/d3-format.min",
        "d3-time": "https://unpkg.com/d3-time@1.1.0/dist/d3-time.min",
        "d3-time-format": "https://unpkg.com/d3-time-format@2.2.3/dist/d3-time-format",
        "d3-interpolate": "https://unpkg.com/d3-interpolate@1.4.0/dist/d3-interpolate.min",
        "d3-color": "https://unpkg.com/d3-color@1.4.0/dist/d3-color.min"
    }
});

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
        require(["react-dom"], ReactDOM => {
            ReactDOM.render(tree, this.elem);
        });
    }

    renderError(errorMessage) {
        require(["react"], React => {
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
    const width = Math.round(document.getElementsByClassName("inner_cell")[0].clientWidth - 7);
    if (width !== previousCellWidth) {
        previousCellWidth = width;
        registry.publish("width", width);
    }
}
updateCellWidth();
window.addEventListener("resize", updateCellWidth);
