/* Thin client for the board's REST API. Everything goes through request() so errors look the same everywhere. */
(function () {
  var headerListener = function () {};

  function ApiError(status, statusText, method, path, message, fieldErrors) {
    this.status = status;
    this.statusText = statusText;
    this.method = method;
    this.path = path;
    this.message = message;
    this.fieldErrors = fieldErrors || [];
  }

  /* The server sets the XSRF-TOKEN cookie; changes must send it back in the X-XSRF-TOKEN header. */
  function readCookie(name) {
    var found = document.cookie.split('; ').filter(function (part) { return part.indexOf(name + '=') === 0; })[0];
    return found ? decodeURIComponent(found.substring(name.length + 1)) : null;
  }

  function request(method, path, body) {
    var headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') {
      var token = readCookie('XSRF-TOKEN');
      if (token) headers['X-XSRF-TOKEN'] = token;
    }
    return fetch(path, { method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' })
      .catch(function () {
        throw new ApiError(0, 'Network error', method, path, 'The server did not answer.');
      })
      .then(function (response) {
        headerListener(response.headers);
        if (response.ok) {
          return response.status === 204 ? null : response.json();
        }
        return response.text().then(function (text) {
          var parsed = null;
          try { parsed = JSON.parse(text); } catch (ignored) { /* not JSON */ }
          var message = (parsed && (parsed.message || parsed.error)) || '';
          throw new ApiError(response.status, response.statusText || '', method, path, message, parsed && parsed.errors);
        });
      });
  }

  window.Api = {
    ApiError: ApiError,
    onHeaders: function (listener) { headerListener = listener; },
    runtime: function () { return request('GET', '/api/runtime'); },
    listTasks: function (status, priority) {
      var query = '?status=' + encodeURIComponent(status || 'all') + (priority ? '&priority=' + encodeURIComponent(priority) : '');
      return request('GET', '/api/tasks/' + query);
    },
    stats: function () { return request('GET', '/api/tasks/stats/'); },
    createTask: function (task) { return request('POST', '/api/tasks/', task); },
    completeTask: function (id) { return request('POST', '/api/tasks/' + id + '/complete/'); },
    deleteTask: function (id) { return request('DELETE', '/api/tasks/' + id + '/'); }
  };
})();
