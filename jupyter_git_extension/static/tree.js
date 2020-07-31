define([
    'base/js/namespace',
    'base/js/dialog',
    'base/js/events',
    'base/js/utils',
    'moment',
    'jquery',
    './utils'
],function(
    IPython,
    dialog,
    events,
    utils,
    moment,
    $,
    gitUtils
){
    function _on_load(){
        /********************
        General Setup Code
        ********************/

        /*
        Add muted label
        */
        gitUtils.addMutedLabelStyle();

        /*
        Template for ad-hoc AJAX calls to back-end API
        Extended from basic template in git utils
        Should be copied and added onto with:
        var settings = Object.assign({}, settings_template);
        */
        const settings_template = Object.assign({
            success: function(data) {
                gitUtils.createNotification(data.statusText, false, '#tab_content');
                Jupyter.notebook_list.load_sessions();
                Jupyter.notebook_list.select('select-none');
            },
            error: function(data, status, error) {
                let error_message = gitUtils.parseRequestError(data, error);
                gitUtils.createNotification(error_message, true, '#tab_content');
                Jupyter.notebook_list.load_sessions();
            }
        }, gitUtils.settings_template);

        /*
        Template for recurring AJAX calls to back-end API
        Extended from basic template in git utils
        Should be copied and added onto with:
        var settings = Object.assign({}, settings_template);
        Polling functions should set their own success.
        We also don't re-draw the notebook list since polling
        functions might trigger on that.
        */
        const polling_settings_template = Object.assign({
            error: function(data, status, error) {
                let error_message = gitUtils.parseRequestError(data, error);
                gitUtils.createNotification(error_message, true, '#tab_content');
            }
        }, gitUtils.settings_template);

        /*
        Sets up a space to register buttons/information to later
        */
        $('#tabs').append($('<div id="git-global-buttons" class="pull-right"/>').css({'margin-top': '-1.3em', 'text-align': 'right', 'width': '50%'})
            .append($('<div id="git-global-commit"/>').css('margin-bottom', '0.15em'))
            .append($('<div id="git-global-pull-push"/>'))
        );

        /*
        We need to override the selection changed function so we can show/hide our dynamic button(s).
        We call the original function from our function first to ensure normal behavior then we
        run our logic to show/hide the button if files are/aren't selected.
        We also store previously selected files so we can re-draw deleted files after the Jupyter redraw.
        */
        Jupyter.notebook_list.__selection_changed = Jupyter.notebook_list._selection_changed;
        Jupyter.notebook_list._selection_changed = function () {
            Jupyter.notebook_list._previously_selected = Jupyter.notebook_list.selected;
            Jupyter.notebook_list.__selection_changed();
            if (Jupyter.notebook_list.selected.length > 0) {
                $('.git-selected').css('display', 'inline-block');
            } else {
                $('.git-selected').css('display', 'none');
            }
        }


        /********************
        Information polling
        ********************/

        /*
        Get repo status info.
        This injects git org/repo links, last commit timestamp, commits behind,
        and file/folder labels to indicate status (modified/untracked/deleted).
        */
        var info = function() {
            gitUtils.clearNotification();

            // Create DOM elements to be populated by AJAX call
            let git_links = $('<div id="git-links"/>');
            git_links.append($('<h4/>').css({'margin': '0', 'margin-top': '0.25em'})
                .append(gitUtils.repositoryIcon())
                .append(' ')
                .append($('<span id="git-org-link"/>'))
                .append(' / ')
                .append($('<span id="git-repo-link"/>'))
                .append(' ')
                .append($('<span id="git-branch-dropdown" class="btn btn-xs btn-default"/>').css({'cursor': 'not-allowed', 'pointer-events': 'none'})
                    .append($('<span class="text-muted"/>').text('Branch: '))
                    .append($('<span id="git-branch"/>'))
                )
            );
            $('#header-container').find('span.flex-spacer').after(git_links);
            $('#git-links').after($('<span class="flex-spacer"/>'));

            $('#git-global-commit').prepend(' ').prepend($('<span id="git-last-commit"/>')).prepend('Last commit ');

            // Initial AJAX settings will tell back end to compare local git against origin to determine commits behind
            let settings = Object.assign({
                url : Jupyter.session_list.base_url + 'git/info',
                type : 'put'
            }, polling_settings_template);

            // Inject data from AJAX call into the DOM
            let renderInfo = function (data) {
                // Render links
                $('#git-org-link').html($('<a/>').css('font-weight', 'normal').attr({'href': data.repoInfo.orgUrl, 'target': '_'}).text(data.repoInfo.orgName));
                $('#git-repo-link').html($('<a/>').attr({'href': data.repoInfo.repoUrl, 'target': '_'}).text(data.repoInfo.repoName));
                $('#git-branch').text(data.repoInfo.branchName);

                // Render commit timestamp
                $('#git-last-commit').text(utils.format_datetime(data.repoInfo.lastCommitTimestamp));
                $('#git-last-commit').attr("title", moment(data.repoInfo.lastCommitTimestamp).local().format("YYYY-MM-DD HH:mm"));

                // Clear any existing file labels so we don't double up if something strange happens
                $('.git-file-status').remove()

                let file_list = Jupyter.notebook_list.model_list.content;

                // Helper to easily add label to file
                function addLabelToFile(file_name, label_text, label_class) {
                    // Starting at root notebook_list element find the span with the file name as text
                    // Add the label after the span's parent link tag
                    $(Jupyter.notebook_list.element).find('span.item_name:contains("' + file_name + '")').parent().after(
                        $('<span/>').addClass('label git-file-status').css('margin-left', '.5em')
                            .addClass(label_class).text(label_text)
                    );
                }

                // Helper to check if any string in list starts with given string
                function arrayStartsWith(strings, string) {
                    for (let i = 0; i < strings.length; i++) {
                        if (strings[i].startsWith(string)) {
                            return true;
                        }
                    }
                    return false;
                }

                function createDeletedFileHeaderIfNotExists() {
                    if ($('#git-deleted-files-header').length) {
                        return;
                    }

                    $('#notebook_list').append(
                        $('<div id="git-deleted-files-header" class="row list_header git-deleted-files"/>').append(
                            $('<div/>').append($('<span class="text-muted"/>').text('Deleted Files'))
                        )
                    )
                }

                function createDeletedFileRow(filepath) {
                    let filename = gitUtils.basename(filepath);
                    let checkbox = $('<input type="checkbox" title="Click here to select"/>');

                    if (Jupyter.notebook_list._previously_selected) {
                        for (let i = 0; i< Jupyter.notebook_list._previously_selected.length; i++) {
                            if (Jupyter.notebook_list._previously_selected[i].name == filename) {
                                checkbox.prop('checked', true);
                                break;
                            }
                        }
                    }

                    let row = $('<div class="list_item row git-deleted-files"/>').append(
                        $('<div class="col-md-12"/>')
                            .append(checkbox)
                            .append($('<i class="item_icon file_icon icon-fixed-width"/>'))
                            .append($('<span/>').append($('<span class="item_name"/>').text(filename)))
                    );

                    row.data('name', filename);
                    row.data('path', filepath);
                    row.data('modified', '');
                    row.data('type', 'file');

                    row.click(function(e) {
                        // toggle checkbox only if the click doesn't come from the checkbox
                        if (!$(e.target).is('input[type=checkbox]')) {
                            checkbox.prop('checked', !checkbox.prop('checked'));
                        }
                        Jupyter.notebook_list._selection_changed();
                    });

                    $('#notebook_list').append(row);
                }

                // Add labels depending on status of file
                file_list.forEach(function(file) {
                    // Directories can have multiple labels if their contents have multiple change types
                    if (file.type == 'directory') {
                        if (arrayStartsWith(data.repoInfo.deletedFiles, file.path + '/')) {
                            addLabelToFile(file.name, 'Deleted Contents', 'label-muted');
                        }
                        if (arrayStartsWith(data.repoInfo.modifiedFiles, file.path + '/')) {
                            addLabelToFile(file.name, 'Modified Contents', 'label-warning');
                        }
                        if (arrayStartsWith(data.repoInfo.untrackedFiles, file.path + '/')) {
                            addLabelToFile(file.name, 'Untracked Contents', 'label-danger');
                        }
                    } else {
                        if (data.repoInfo.modifiedFiles.includes(file.path)) {
                            addLabelToFile(file.name, 'Modified', 'label-warning');
                        } else if (data.repoInfo.untrackedFiles.includes(file.path)) {
                            addLabelToFile(file.name, 'Untracked', 'label-danger');
                        }
                    }
                });

                // Clear deleted file elements before redraw
                $('.git-deleted-files').remove()

                let current_path = Jupyter.notebook_list.notebook_path;
                // Oneliner to append / to non-empty path for comparison later
                current_path = current_path == '' ? current_path : current_path + '/';
                data.repoInfo.deletedFiles.forEach(function(filepath) {
                    // If the current path + basename matches the filepath it means the file is from our current directory
                    if (current_path + gitUtils.basename(filepath) == filepath) {
                        // Create deleted files header for first deleted file found
                        createDeletedFileHeaderIfNotExists();
                        createDeletedFileRow(filepath);
                        addLabelToFile(gitUtils.basename(filepath), 'Deleted', 'label-muted');
                    }
                });

                Jupyter.notebook_list._selection_changed();
            }

            // Add render function as callback
            settings.success = renderInfo;

            // Send request to API
            $.ajax(settings);

            // Re-grab info when the notebook list changes
            events.on('draw_notebook_list.NotebookList', function() {$.ajax(settings)});
            events.on('notebook_deleted.NotebookList', function() {$.ajax(settings)});
        }
        info();


        /*
        Get info comparing local repo to origin
        */
        var originInfo = function() {
            if (!$('#git-commits-behind-ahead').length) {
                $('#git-global-pull-push').prepend(' ').prepend($('<span id="git-commits-behind-ahead"/>'));
            }

            // Initial AJAX settings will tell back end to compare local git against origin to determine commits behind
            let settings = Object.assign({
                url : Jupyter.session_list.base_url + 'git/origin-info',
                type : 'put',
                success : function(){},
                error : function(){}
            }, polling_settings_template);

            // Inject data from AJAX call into the DOM
            let renderInfo = function (data) {
                // Render commits behind if it is in the response. Otherwise don't overwrite the element=
                $('#git-commits-behind-ahead').text(
                    data.repoInfo.commitsBehind + ' Commits behind, ' + data.repoInfo.commitsAhead + ' Commits ahead'
                );
            }

            // Add render function as callback
            settings.success = renderInfo;

            // Send request to API
            $.ajax(settings);
        }
        originInfo();


        /********************
        Buttons and functions
        ********************/
        /*
        Push repo
        */
        var push = function() {
            let settings = Object.assign({
                url : Jupyter.session_list.base_url + 'git/push',
                type : 'PUT'
            }, settings_template);

            let _success = settings.success;
            settings.success = function(data) {
                _success(data);
                originInfo();
            }

            let _error = settings.error;
            settings.error = function(data) {
                _error(data);
                originInfo();
            }

            // Send request to API
            $.ajax(settings);
        }


        /*
        Commit and push files
        Function takes in an arbitrary event parameter which allows you to send in data on click with jquery
        Ex.: $(...).click({commit_all: true}, commit_and_push)
        This allows us to reuse this function for commit all and commit selected
        */
        var commit_and_push = function(event) {
            let commit_all = false;
            if (event.data && event.data.commit_all) {
                commit_all = true;
            }

            if (!commit_all && !Jupyter.notebook_list.selected.length) {
                gitUtils.createNotification('No files selected', true);
                return;
            }
            gitUtils.clearNotification();

            // Create modal body with a checkbox for push y/n and a text box input for commit message
            let modal_body = $('<div id="modal-body"/>')
                .append($('<div/>')
                    .append($('<input type="checkbox" name="push-changes" id="push-changes" checked/>'))
                    .append($('<label for="push-changes"/>').html('&nbsp;Push changes'))
                )
                .append($('<div/>')
                    .append($('<p/>').text('Commit Message:')
                        .append($('<span/>').css('color', 'red').text('*'))
                    )
                    .append($('<textarea id="commit-message" rows="3" cols="50">'))
                );

            function on_open(){
                // Disable automatic close of modal on submit so we can form validate
                $('button:contains("Commit")').removeAttr("data-dismiss");
            }


            // Function to run when modal is submitted
            function on_ok(commit_all) {
                let files = [];
                if (commit_all) {
                    files = ['.']
                } else {
                    // Get list of selected files from Jupyter
                    files = Jupyter.notebook_list.selected.map(function(item) {
                        return item['path']
                    });
                }

                // Read data from modal form
                let push_changes = $('#push-changes').is(':checked');
                let message = $('#commit-message').val().trim();
                
                // Do some form validation
                $('.form-validation').remove();
                if (message == '') {
                  $('#commit-message').after($('<p/>').addClass('form-validation text-danger').text("Commit Message is required"));
                  return;
                }

                // Construct data payload for API call
                let payload = {
                    files: files,
                    message: message
                }

                let settings = Object.assign({
                    url : Jupyter.session_list.base_url + 'git/commit',
                    type : 'PUT',
                    data: JSON.stringify(payload)
                }, settings_template);

                if(push_changes) {
                    let _success = settings.success;
                    settings.success = function(data) {
                        _success(data);
                        push();
                    }
                }

                // Send request to API
                $.ajax(settings);

                // Dismiss modal manually
                $('.modal').modal('hide');
            }

            // Create modal to get commit message before making API call
            dialog.modal({
                body: modal_body ,
                title: 'Commit Files',
                buttons: {
                    'Commit': {
                        class:'btn-primary btn-large',
                        click: $.proxy(on_ok, {}, commit_all) // Proxy the function so we can pass in commit_all variable dynamically
                    },
                    'Cancel':{}
                },
                open: on_open
            });
            
        }


        /*
        Commit and push selected files.
        This will be dynamically shown/hidden based on our override of
        Jupyter.notebook_list._selection_changed() above.
        */
        $('.dynamic-buttons').prepend(
            $('<button/>').addClass('btn btn-default btn-xs git-selected').text('Commit').attr('title', 'Commit selected').click(commit_and_push).hide()
        );


        /*
        Commit and push all files
        We can reuse the function above and pass in a 'commit_all` flag
        */
        $('#git-global-commit').append(
            $('<button/>').addClass('btn btn-default btn-xs').text('Commit All').click({commit_all: true}, commit_and_push).css({'width': '128px', 'text-align': 'center'})
        );


        /*
        Pull changes
        */
        var pull = function() {
            gitUtils.clearNotification();

            let settings = Object.assign({
                url : Jupyter.session_list.base_url + 'git/pull',
                type : 'PUT'
            }, settings_template);

            let _success = settings.success;
            settings.success = function(data) {
                _success(data);
                originInfo();
            }

            // Send request to API
            $.ajax(settings);
        }
        $('#git-global-pull-push').append(
            $('<button/>').addClass('btn btn-default btn-xs').text('Pull').click(pull).css({'width': '62px', 'text-align': 'center'})
        ).append(
            ' '
        ).append(
            $('<button/>').addClass('btn btn-default btn-xs').text('Push').click(push).css({'width': '62px', 'text-align': 'center'})
        );
        


        /********************
        Finalization
        ********************/
        console.info('Loaded Jupyter Git extension');
    }

    return {load_ipython_extension: _on_load};
})
