import inspect
import json
import os
import string

import numpy as np
import pandas as pd
from IPython.core.display import Javascript, clear_output, display
from IPython.core.magic import register_cell_magic, register_line_magic


def init():
    with open(os.path.join(os.path.dirname(__file__), "setup.js"), "r") as fp:
        execute_js(fp.read())


class CustomJSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, np.ndarray):
            return o.tolist()
        if isinstance(o, pd.DataFrame):
            return o.to_dict("records")
        return json.JSONEncoder.default(self, o)


def execute_js(code):
    """Execute JavaScript code in a Notebook environment"""
    display(Javascript(code))


def calling_scope_variable(name):
    frame = inspect.stack()[1][0]
    while name not in frame.f_locals:
        frame = frame.f_back
        if frame is None:
            return None
    return frame.f_locals[name]


@register_cell_magic
def jsx(line, cell):
    code_template = """
    if (!window.REACT_JUPYTER_SETUP_LOADED) {
        element[0].innerHTML = "Make sure to run <code>react_jupyter.init()</code> before this cell.";
    } else {
        Promise.all(["babel-standalone@6", "react", "react-dom"].map(x => d3require(x))).then(([Babel, React, ReactDOM]) => {
            const cell = new Cell(element[0]);
            const render = cell.render.bind(cell);

            const cleanupManager = cell.cleanupManager.childScope();
            const onCleanup = cleanupManager.register.bind(cleanupManager);

            const require = d3require;

            const dependHandle = registry.listen($dependency_list, ({ $dependency_dict }) => {
                cleanupManager.cleanup(); // Clean up from the previous iteration
                try {
                    const babelOutput = Babel.transform($quoted_script, {presets: ['es2017', 'react', 'stage-0', 'stage-1', 'stage-2']})
                    eval(babelOutput.code);
                } catch (e) {
                    cell.renderError(e.message);
                }
            });
            cell.cleanupManager.register(dependHandle);
        })
        }
    """

    dependency_list = []
    for dep in line.split(" "):
        if len(dep) > 0:
            dependency_list.append(dep)

    execute_js(
        string.Template(code_template).substitute(
            quoted_script=json.dumps(
                "(async () => {\n" + cell + "})().catch(e => cell.renderError(e.message))\n"
            ),
            dependency_list=json.dumps(dependency_list),
            dependency_dict=", ".join(dependency_list),
        )
    )


@register_line_magic
def publish(line):
    variables = line.split(" ")
    pairs = [[v, calling_scope_variable(v)] for v in variables]
    execute_js("registry.publishMany(" + json.dumps(pairs, cls=CustomJSONEncoder) + ");")
