import functools
import json
import re
import sys
from datetime import datetime

import git
from notebook.base.handlers import IPythonHandler
from tornado import web


def get_repo(path="."):
    """
    Returns a git repo from the specified path

    :param path: is the optional path to the git repo
    :return: git.Repo representing the input path
    """
    return git.Repo(path)


def get_browser_repo_url_from_git_url(git_url):
    """
    Converts a git https or ssh url to a corresponding browser url

    :param git_url: is the https or ssh git-clone format url
    :return: https browser-friendly url to the repo site
    """
    git_url = re.sub(r"\.git$", "", git_url)

    if git_url.startswith("git@"):
        return re.sub(r"^git@([^:]+):(.*)$", r"https://\1/\2", git_url)
    elif git_url.startswith("https://"):
        return re.sub(r"^https://([^@]+@)?(.*)$", r"https://\2", git_url)
    return ""


def get_browser_org_url_from_git_url(git_url):
    """
    Converts a git https or ssh url to a corresponding browser url

    :param git_url: is the https or ssh git-clone format url
    :return: https browser-friendly url to the repo site
    """
    # Get the url in a standard format before parsing
    repo_url = get_browser_repo_url_from_git_url(git_url)
    return re.sub(r"/[^/]*$", "", repo_url)


def get_repo_name_from_git_url(git_url):
    """
    Extracts repo name from a git-clone format url

    :param git_url: is the https or ssh git-clone format url
    :return: git repo name
    """
    # Get the url in a standard format before parsing
    git_url = get_browser_repo_url_from_git_url(git_url)
    return re.sub(r"^.*/([^/]*)$", r"\1", git_url)


def get_org_name_from_git_url(git_url):
    """
    Extracts org name from a git-clone format url

    :param git_url: is the https or ssh git-clone format url
    :return: git org name
    """
    # Get the url in a standard format before parsing
    git_url = get_browser_repo_url_from_git_url(git_url)
    return re.sub(r"^.*[/:]([^/:]*)/[^/]*$", r"\1", git_url)


class BaseHandler(IPythonHandler):
    """
    Base class with helper functions for all other handlers
    """

    def handle_exceptions(function):
        """
        A decorator that wraps the passed in function and logs 
        exceptions should one occur
        """

        @functools.wraps(function)
        def wrapper(*args, **kwargs):
            # grabs "self" that was passed into function so we can access it
            instance = args[0]
            try:
                instance.log.debug(
                    f"{instance.__class__.__name__} is handling: {str(instance.request)}"
                )
                return function(*args, **kwargs)
            except git.exc.GitError as e:
                instance.log.error(e)
                raise web.HTTPError(500, f"Git error: {e}")
            except Exception as e:
                instance.log.error(e)
                raise web.HTTPError(500, "An unexpected error occured.")

        return wrapper

    @property
    def log(self):
        """
        Creates a child log from the parent IPythonHandler log
        """
        return super().log.getChild("JupyterGitExtension")

    def write_response(self, status_code, status_message, **kwargs):
        """
        Write to the Jupyter Response for Javascript utilization

        :param status_code: is the Status Code to present to the UI
        :param status_message: is the message to present to the UI
        :param **kwargs: are optional arguments to add to the json response
        :return: None
        """
        response = {"status": status_code, "statusText": status_message}
        response.update(kwargs)
        self.write(response)


class CommitHandler(BaseHandler):
    """
    Notebook Server Handler for git commit
    """

    @BaseHandler.handle_exceptions
    def put(self):
        """
        Commit selected files

        :param self.request: is the incoming API request. Requires "files" key with a list of selected files
        :return: status code and message
        """
        repo = get_repo()
        request = self.get_json_body()
        repo.git.add(request["files"])
        repo.index.commit(request["message"])

        self.write_response(200, "Files committed successfully")


class PullHandler(BaseHandler):
    """
    Notebook Server Handler for git pull
    """

    @BaseHandler.handle_exceptions
    def put(self):
        """
        Runs a git pull in the current working directory

        :return: status code and message
        """
        repo = get_repo()
        repo.git.pull()
        self.write_response(200, "Repo pulled successfully")


class InfoHandler(BaseHandler):
    """
    Notebook Server Handler for git status information
    """

    @BaseHandler.handle_exceptions
    def put(self):
        """
        Checks git status of current directory

        :return: Dict with lots of repo information
        """
        repo = get_repo()
        modified_files = [
            item.a_path for item in repo.index.diff(None) if not item.deleted_file
        ]
        deleted_files = [
            item.a_path for item in repo.index.diff(None) if item.deleted_file
        ]
        last_commit_timestamp = datetime.utcfromtimestamp(
            repo.head.commit.committed_date
        ).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
        repo_url = get_browser_repo_url_from_git_url(repo.remotes.origin.url)
        repo_name = get_repo_name_from_git_url(repo.remotes.origin.url)
        org_url = get_browser_org_url_from_git_url(repo.remotes.origin.url)
        org_name = get_org_name_from_git_url(repo.remotes.origin.url)
        branch_name = repo.active_branch.name

        repo_info = {
            "deletedFiles": deleted_files,
            "modifiedFiles": modified_files,
            "untrackedFiles": repo.untracked_files,
            "lastCommitTimestamp": last_commit_timestamp,
            "repoUrl": repo_url,
            "repoName": repo_name,
            "orgUrl": org_url,
            "orgName": org_name,
            "branchName": branch_name,
        }

        self.write_response(200, "Status fetched successfully", repoInfo=repo_info)


class OriginInfoHandler(BaseHandler):
    """
    Notebook Server Handler for local -> origin status information
    """

    @BaseHandler.handle_exceptions
    def put(self):
        """
        Checks how many commits behind origin

        :return: Dict with commits behind
        """
        repo = get_repo()
        branch_name = repo.active_branch.name

        repo.remotes.origin.fetch()
        commits_behind = sum(
            1 for commit in repo.iter_commits(f"{branch_name}..{branch_name}@{{u}}")
        )

        commits_ahead = sum(
            1 for commit in repo.iter_commits(f"{branch_name}@{{u}}..{branch_name}")
        )

        repo_info = {"commitsBehind": commits_behind, "commitsAhead": commits_ahead}

        self.write_response(
            200, "Origin status fetched successfully", repoInfo=repo_info
        )


class PushHandler(BaseHandler):
    """
    Notebook Server Handler for git push
    """

    @BaseHandler.handle_exceptions
    def put(self):
        """
        Runs a git push to origin

        :return: Status message
        """
        repo = get_repo()
        push_output = repo.remotes.origin.push()
        push_output = push_output[0]

        # Manually check if push had an error. The method doesn't raise an error on a failed push
        if (push_output.flags & push_output.REJECTED) > 0:
            raise git.exc.GitError(
                f"Push rejected. You should pull remote changes and re-push after merging. Message: {push_output.summary}"
            )
        elif (push_output.flags & push_output.ERROR) > 0:
            raise git.exc.GitError(f"Push failed. Message: {push_output.summary}")

        self.write_response(200, "Repo pushed successfully")
