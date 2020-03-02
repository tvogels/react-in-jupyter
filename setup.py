#!/usr/bin/env python

from distutils.core import setup

setup(
    name="react-in-jupyter",
    version="0.1",
    description="Use React and JSX to build cells in Jupyter Notebooks",
    author="Thijs Vogels",
    author_email="t.vogels@me.com",
    url="https://github.com/tvogels/react-in-jupyter",
    packages=["react_jupyter"],
    include_package_data=True,
    package_data={"react_jupyter": ["setup.js"]},
)
