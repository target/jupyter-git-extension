"""
Jupyter Extension
"""
from notebook.utils import url_path_join

from .handlers import (
    CommitHandler,
    PullHandler,
    InfoHandler,
    OriginInfoHandler,
    PushHandler,
)

log = None


def _jupyter_nbextension_paths():
    return [
        {
            "section": "tree",
            "dest": "jupyter_git_extension",
            "src": "static",
            "require": "jupyter_git_extension/tree",
        },
        {
            "section": "notebook",
            "dest": "jupyter_git_extension",
            "src": "static",
            "require": "jupyter_git_extension/notebook",
        },
    ]


def _jupyter_server_extension_paths():
    return [{"module": "jupyter_git_extension"}]


def load_jupyter_server_extension(nb_server_app):
    global log
    log = nb_server_app.log
    log.info("Git Extension Enabled.")
    web_app = nb_server_app.web_app
    host_pattern = ".*$"
    base_route_pattern = url_path_join(web_app.settings["base_url"], "/git")

    # Add all handlers at once
    web_app.add_handlers(
        host_pattern,
        [
            (url_path_join(base_route_pattern, "/commit"), CommitHandler),
            (url_path_join(base_route_pattern, "/pull"), PullHandler),
            (url_path_join(base_route_pattern, "/info"), InfoHandler),
            (url_path_join(base_route_pattern, "/origin-info"), OriginInfoHandler),
            (url_path_join(base_route_pattern, "/push"), PushHandler),
        ],
    )
