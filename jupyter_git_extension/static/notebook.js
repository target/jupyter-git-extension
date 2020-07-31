define([
    'base/js/namespace',
    'base/js/dialog',
    'jquery',
    './utils'
],function(
    IPython,
    dialog,
    $,
    gitUtils
){
    function _on_load(){

        /********************
        General Setup Code      
        ********************/     
        
        /*
        Template for AJAX call to back-end API
        Extended from basic template in git utils
        Should be copied and added onto with:
        var settings = Object.assign({}, settings_template);
        */
        const settings_template = Object.assign({
            success: function(data) {
                gitUtils.createNotification(data.statusText, false, '#notebook-container');
            },
            error: function(data) {
                let error_message = gitUtils.parseRequestError(data, error);
                gitUtils.createNotification(error_message, true, '#notebook-container');
            }
        }, gitUtils.settings_template);


        /********************
        Notebook Editor Buttons        
        ********************/
        /*
        Push repo
        */
        var push = function() {
            let settings = Object.assign({
                url : Jupyter.notebook.base_url + 'git/push',
                type : 'PUT'
            }, settings_template);

            // Send request to API
            $.ajax(settings);
        }

        /*
        Save and commit current notebook
        */
        save_commit_notebook = function () {
            let toolbar_action = {
                help: 'Save and Commit this Notebook.',
                icon : 'fa-git',
                help_index : '',
                handler : function (env) {
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
                    function on_ok() {
                        let filepath = env.notebook.notebook_path;

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
                            files: [filepath],
                            message: message
                        }

                        var settings = Object.assign({
                            url : env.notebook.base_url + 'git/commit',
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

                        // Trigger notebook save and make commit-push request once saved
                        $.when(env.notebook.save_notebook()).then(function(data) {
                            // Send request to API
                            $.ajax(settings);
                        }, function(error) {
                            gitUtils.createNotification("Failed to save notebook. Save required to commit notebook", true);
                        });


                        // Dismiss modal manually
                        $('.modal').modal('hide');
                    }

                    // Create modal to get commit message before making API call
                    dialog.modal({
                        body: modal_body ,
                        title: 'Commit Notebook',
                        buttons: {
                            'Commit': {
                                class:'btn-primary btn-large',
                                click: on_ok
                            },
                            'Cancel':{}
                        },
                        open: on_open,
                        notebook: env.notebook,
                        keyboard_manager: env.notebook.keyboard_manager
                    });
                }
            }

            // Register button and add to the toolbar
            let action_name = Jupyter.keyboard_manager.actions.register(toolbar_action, 'commit-notebook', 'jupyter_git_extension');
            Jupyter.toolbar.add_buttons_group([action_name]);
        }
        save_commit_notebook();


        /********************
        Finalization
        ********************/
        console.info('Loaded Jupyter Git extension');
    }

    return {load_ipython_extension: _on_load };
})
