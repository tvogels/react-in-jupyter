import inspect
import json
import os
import string

import numpy as np
import pandas as pd
from IPython.core.display import Javascript, clear_output, display
from IPython.core.magic import register_cell_magic


def init():
    with open(os.path.join(os.path.dirname(__file__), "setup.js"), "r") as fp:
        execute_js(fp.read())


class CustomJSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, np.ndarray):
            return o.tolist()
        if isinstance(o, pd.DataFrame):
            return o.to_json(orient="records")
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
    require(['babel', 'react', 'react-dom'], (Babel, React, ReactDOM) => {
        const cell = new Cell(element[0]);
        const render = cell.render.bind(cell);
        const onCleanup = cell.onCleanup.bind(cell);
        
        try {
            const babelOutput = Babel.transform($quoted_script, {presets: ['es2015', 'react', 'stage-2']})
            eval(babelOutput.code);
        } catch (e) {
            cell.renderError(e.message);
        }
    })
    """

    code = []

    # for variable in variable_pattern.findall(cell):
    for variable in line.split(","):
        variable = variable.strip()
        if len(variable) > 0:
            value = json.dumps(calling_scope_variable(variable), cls=CustomJSONEncoder)
            code.append(f"const {variable.strip()} = {value};")

    display(
        Javascript(
            (
                string.Template(code_template).substitute(
                    quoted_script=json.dumps("\n".join(code + [cell]))
                )
            )
        )
    )
