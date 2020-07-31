# -*- coding: utf-8 -*-
#!/usr/bin/env python

try:
    from setuptools import setup, find_packages, Command
except ImportError:
    from ez_setup import use_setuptools

    use_setuptools()
    from setuptools import setup, find_packages, Command

exec(open("jupyter_git_extension/version.py").read())
description = "Jupyter git extension"
long_description = str(open("README.md", "rb").read())

setup(
    name="jupyter_git_extension",
    version=__version__,
    author="Andrew Hangsleben",
    url="https://github.com/target/jupyter-git-extension",
    description=description,
    long_description=long_description,
    packages=find_packages(),
    install_requires=["psutil", "notebook", "gitpython", "tornado"],
    package_data={"jupyter_git_extension": ["static/*"]},
    data_files=[
        (
            "share/jupyter/nbextensions/jupyter_git_extension",
            [
                "jupyter_git_extension/static/notebook.js",
                "jupyter_git_extension/static/notebook.yml",
                "jupyter_git_extension/static/tree.js",
                "jupyter_git_extension/static/tree.yml",
                "jupyter_git_extension/static/utils.js",
            ],
        )
    ],
    zip_safe=False,
)
