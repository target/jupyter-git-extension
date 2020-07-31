define([
    'base/js/namespace',
    'base/js/dialog',
    'jquery'
],function(
    IPython,
    dialog,
    $
){

    /********************
    Utilities and boilerplate code
    ********************/

    /*
    Get xsrf token from cookies to validate our request
    */
    function getXSRFToken() {
        let xsrf_token = document.cookie.match('(^|;) ?_xsrf=([^;]*)(;|$)')
        xsrf_token = xsrf_token ? xsrf_token[2] : null;
        return xsrf_token;
    }

    /*
    Clears any existing notifications
    */
    function clearNotification() {
        $('.git-feedback').remove();
    }

    /*
    Adds a new muted background option for labels
    */
    function addMutedLabelStyle() {
        $('head').append(
            $('<style/>').attr('type', 'text/css').html('.label-muted { background-color: #777777; }')
        );
    }

    /*
    Creates new notification with success or error status

    :param message: is the error message to display
    :param error: is a boolean indicating if you want to display the message as an error
    */
    function createNotification(message, error, element_selector) {
        error = error || false;
        let notification = $('<div>').attr('role', 'alert').addClass('git-feedback alert alert-dismissible')
        if (error) {
            notification.addClass('alert-danger')
        } else {
            notification.addClass('alert-success')
        }
        notification.append(
            $('<button/>').attr({'type': 'button', 'class': 'close', 'data-dismiss': 'alert', 'aria-label': 'Close'}).append(
                $('<span/>').attr('aria-hidden', 'true').html('&times;')
            )
        )
        notification.append($('<p/>').text(message))

        clearNotification();
        $(element_selector).prepend(notification);
    }

    /*
    Template for AJAX call to back-end API
    Should be copied and added onto with:
    var settings = Object.assign({}, settings_template);
    */
    const settings_template = {
        processData : false,
        dataType: 'json',
        contentType: 'application/json',
        headers: {'X-XSRFToken': getXSRFToken()}
    };

    /*
    Returns github repository icon in SVG format
    */
    function repositoryIcon() {
        return $('<svg class="octicon octicon-repo" viewBox="0 0 12 16" version="1.1" width="12" height="16" aria-hidden="true"><path fill-rule="evenodd" d="M4 9H3V8h1v1zm0-3H3v1h1V6zm0-2H3v1h1V4zm0-2H3v1h1V2zm8-1v12c0 .55-.45 1-1 1H6v2l-1.5-1.5L3 16v-2H1c-.55 0-1-.45-1-1V1c0-.55.45-1 1-1h10c.55 0 1 .45 1 1zm-1 10H1v2h2v-1h3v1h5v-2zm0-10H2v9h9V1z"></path></svg>')
    }

    /*
    Returns basename of a file from a full path
    */
    function basename(filepath) {
        return filepath.split('\\').pop().split('/').pop();
    }

    /*
    Parses error text from bad request
    Takes in the data from an ajax request directly
    Uses default_message if no error could be parsed
    */
    function parseRequestError(data, default_message) {
        let error_message = null;
        try {
            error_message = $(data.responseText).find('.traceback').text();
        } catch(error) {
            error_message = default_message;
        }

        return error_message
    }



    /********************
    Expose utilities
    ********************/
    return {
        addMutedLabelStyle: addMutedLabelStyle,
        basename: basename,
        clearNotification: clearNotification,
        createNotification: createNotification,
        getXSRFToken: getXSRFToken,
        parseRequestError: parseRequestError,
        repositoryIcon: repositoryIcon,
        settings_template: settings_template
    };
})
