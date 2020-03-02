# React in Jupyter

Use React and JSX to build cells in Jupyter Notebooks

## Installation

`pip install react-in-jupyter`

## Demo

See [this demo notebook](JSX_in_Jupyter.ipynb).

## Features

-   ES2015 JSX transpiled with Babel
-   Querying the Python kernel from JS
-   Cleanup at cell invalidation
-   Code highlighting
-   Nicely displayed error messages

---

#### Thanks

-   jeremyschlatter for [this gist](https://gist.github.com/jeremyschlatter/c35c6bfa568e5a40440cb2fefcc7fd4e?short_path=b00cf46)

#### Uploading to PyPi

Update the version in `setup.py`.

```
python setup.py sdist
twine upload dist/react-in-jupyter-0.1.tar.gz
```
