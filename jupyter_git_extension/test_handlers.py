"""
Tester for notebook git api handlers
"""

import functools
import unittest
import mock
import os
import re

import git
from notebook.base.handlers import IPythonHandler
from tornado import web

from . import handlers
from . import version


def mock_handler(base_class):
    """
    Helper to create arbitrary handler instances while skipping the __init__() function
    """

    class MockHandler(base_class):
        def __init__(self):
            self.request = None

    return MockHandler()


class Tests(unittest.TestCase):
    """
    Basic test class
    """

    @classmethod
    def setUpClass(cls):
        """
        Create generic testing variables available to all tests
        """
        cls.test_urls = [
            "https://git.example.com/org/repo.git",
            "https://git.example.com/org/repo",
            "https://user:token@git.example.com/org/repo",
            "https://user:token@git.example.com/org/repo.git",
            "git@git.example.com:org/repo.git",
        ]

    @classmethod
    def tearDownClass(cls):
        pass

    def setUp(self):
        pass

    def tearDown(self):
        pass

    class MockRepo:
        """
        Class used to "mock" the git.Repo and set object level vars
        """

        def __init__(self, path, *args, **kwargs):
            self.working_tree_dir = os.path.abspath(path)

    @mock.patch("git.Repo", new=MockRepo)
    def test_0001_get_repo(self):
        """
        Test getting a git repo with and without a path
        """

        absolute_path = os.path.abspath(".")
        repo = handlers.get_repo()

        self.assertEqual(absolute_path, repo.working_tree_dir)

        repo = handlers.get_repo(absolute_path)
        self.assertEqual(absolute_path, repo.working_tree_dir)

    def test_0002_get_browser_repo_url_from_git_url(self):
        """
        Test converting git https/ssh urls to browser navigable repo urls.
        """
        expected_url = "https://git.example.com/org/repo"

        for url in self.test_urls:
            parsed_url = handlers.get_browser_repo_url_from_git_url(url)
            self.assertEqual(expected_url, parsed_url)

    def test_0003_get_browser_org_url_from_git_url(self):
        """
        Test converting git https/ssh urls to browser navigable org urls.
        """
        expected_url = "https://git.example.com/org"

        for url in self.test_urls:
            parsed_url = handlers.get_browser_org_url_from_git_url(url)
            self.assertEqual(expected_url, parsed_url)

    def test_0004_get_repo_name_from_git_url(self):
        """
        Test parsing repo names from git https/ssh urls.
        """
        expected_repo_name = "repo"

        for url in self.test_urls:
            parsed_repo_name = handlers.get_repo_name_from_git_url(url)
            self.assertEqual(expected_repo_name, parsed_repo_name)

    def test_0005_get_org_name_from_git_url(self):
        """
        Test parsing org names from git https/ssh urls.
        """
        expected_org_name = "org"

        for url in self.test_urls:
            parsed_org_name = handlers.get_org_name_from_git_url(url)
            self.assertEqual(expected_org_name, parsed_org_name)

    @mock.patch(f"{__name__}.handlers.IPythonHandler.write")
    def test_0006_basehandler_write_response(self, mock_write: mock.MagicMock):
        """
        Test writing a response object with dynamic arguments
        """
        handler = mock_handler(handlers.BaseHandler)

        expected_dict = {
            "status": 200,
            "statusText": "Message",
            "customArgument": "I'm custom",
        }
        handler.write_response(200, "Message", customArgument="I'm custom")

        mock_write.assert_called_with(expected_dict)

    @mock.patch(f"{__name__}.handlers.BaseHandler.get_json_body")
    @mock.patch(f"{__name__}.handlers.BaseHandler.write_response")
    @mock.patch(f"{__name__}.handlers.get_repo")
    def test_0007_commithandler_put(
        self,
        mock_get_repo: mock.MagicMock,
        mock_write_response: mock.MagicMock,
        mock_get_json_body: mock.MagicMock,
    ):
        """
        Test commit handler flow to ensure at a minimum it runs
        the correct git commands to add, commit, push, and sends
        a response
        """
        mock_repo = mock.Mock()

        mock_get_repo.return_value = mock_repo

        expected_files = ["a.txt", ".mything.sh"]
        expected_message = "I am doing a commit"
        mock_get_json_body.return_value = {
            "files": expected_files,
            "message": expected_message,
        }

        # Test successful commit
        handler = mock_handler(handlers.CommitHandler)
        handler.put()

        mock_repo.git.add.assert_called_with(expected_files)

        mock_repo.index.commit.assert_called_with(expected_message)

        self.assertTrue(mock_write_response.call_count > 0)

    @mock.patch(f"{__name__}.handlers.BaseHandler.write_response")
    @mock.patch(f"{__name__}.handlers.get_repo")
    def test_0008_pullhandler_put(
        self, mock_get_repo: mock.MagicMock, mock_write_response: mock.MagicMock
    ):
        """
        Test the PullHandler. We check to ensure a pull() has been run
        and that a response was sent
        """
        mock_repo = mock.Mock()

        mock_get_repo.return_value = mock_repo

        handler = mock_handler(handlers.PullHandler)

        handler.put()

        self.assertTrue(mock_repo.git.pull.call_count > 0)

        self.assertTrue(mock_write_response.call_count > 0)

    @mock.patch(f"{__name__}.handlers.BaseHandler.write_response")
    @mock.patch(f"{__name__}.handlers.get_repo")
    def test_0009_infohandler_put(
        self, mock_get_repo: mock.MagicMock, mock_write_response: mock.MagicMock
    ):
        """
        Test the InfoHandler. We create a lot of mock data to ensure it's
        all returned in the correct format in the written response.
        """
        mock_repo = mock.Mock()

        mock_modified_file = mock.Mock()
        mock_modified_file.a_path = "modified.txt"
        mock_modified_file.deleted_file = False

        mock_deleted_file = mock.Mock()
        mock_deleted_file.a_path = "deleted.txt"
        mock_deleted_file.deleted_file = True

        diff_file_list = [mock_modified_file, mock_deleted_file]

        mock_repo.index.diff.return_value = diff_file_list
        mock_repo.head.commit.committed_date = 0
        mock_repo.remotes.origin.url = "https://git.example.com/org/repo.git"
        mock_repo.active_branch.name = "master"
        mock_repo.untracked_files = ["untracked.txt"]

        mock_get_repo.return_value = mock_repo

        expected_dict = {
            "deletedFiles": ["deleted.txt"],
            "modifiedFiles": ["modified.txt"],
            "untrackedFiles": ["untracked.txt"],
            "lastCommitTimestamp": "1970-01-01T00:00:00.000000Z",
            "repoUrl": "https://git.example.com/org/repo",
            "repoName": "repo",
            "orgUrl": "https://git.example.com/org",
            "orgName": "org",
            "branchName": "master",
        }

        handler = mock_handler(handlers.InfoHandler)

        handler.put()

        _, called_kwargs = mock_write_response.call_args
        constructed_dict = called_kwargs["repoInfo"]

        self.assertDictEqual(expected_dict, constructed_dict)

    @mock.patch(f"{__name__}.handlers.BaseHandler.write_response")
    @mock.patch(f"{__name__}.handlers.get_repo")
    def test_0010_origininfohandler_put(
        self, mock_get_repo: mock.MagicMock, mock_write_response: mock.MagicMock
    ):
        """
        Test the OriginInfoHandler. We mock the iter_commits call to simulate
        commits ahead/behind the origin.
        """
        mock_repo = mock.Mock()

        # simulate two commits on the first call and zero on the second call
        mock_repo.iter_commits.side_effect = [[0, 0], []]
        mock_repo.active_branch.name = "master"

        mock_get_repo.return_value = mock_repo

        expected_dict = {"commitsBehind": 2, "commitsAhead": 0}

        handler = mock_handler(handlers.OriginInfoHandler)

        handler.put()

        _, called_kwargs = mock_write_response.call_args
        constructed_dict = called_kwargs["repoInfo"]

        self.assertDictEqual(expected_dict, constructed_dict)

    @mock.patch(f"{__name__}.handlers.BaseHandler.write_response")
    @mock.patch(f"{__name__}.handlers.get_repo")
    def test_0011_pushhandler_put(
        self, mock_get_repo: mock.MagicMock, mock_write_response: mock.MagicMock
    ):
        """
        Test push handler flow to ensure at a minimum it runs
        the correct git commands to push and then sends
        a response
        """
        mock_repo = mock.Mock()

        mock_push_output = mock.Mock()
        mock_push_output.flags = 0
        mock_push_output.ERROR = 1
        mock_push_output.REJECTED = 2

        mock_repo.remotes.origin.push.return_value = [mock_push_output]

        mock_get_repo.return_value = mock_repo

        # Test successful push
        handler = mock_handler(handlers.PushHandler)
        handler.put()

        self.assertTrue(mock_repo.remotes.origin.push.call_count > 0)

        self.assertTrue(mock_write_response.call_count > 0)

        # Test that we error successfully if the push had an error
        mock_push_output.flags = 1
        try:
            handler.put()
            self.assertTrue(False)
        except web.HTTPError as e:
            self.assertTrue(True)

        mock_push_output.flags = 2
        try:
            handler.put()
            self.assertTrue(False)
        except web.HTTPError as e:
            self.assertTrue(True)

    def test_0012_version(self):
        """
        Test imported version number to make sure it's valid
        """
        match = re.fullmatch(r"\d\.\d\.\d", version.__version__)

        self.assertTrue(match)
