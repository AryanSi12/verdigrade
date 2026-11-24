/* Order Desk API client. Callback style: every call is api.x(args..., function (err, data) { ... }). */
var api = (function () {
  var JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };

  function call(method, path, body, done) {
    var options = { method: method, headers: JSON_HEADERS };
    if (body != null) {
      options.body = JSON.stringify(body);
    }
    fetch(path, options).then(function (response) {
      if (response.status == 204) {
        done(null, null);
        return;
      }
      response.text().then(function (text) {
        var data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (e) {
          data = null;
        }
        if (response.ok) {
          done(null, data);
        } else {
          var err = new Error((data && data.message) || ('HTTP ' + response.status));
          err.status = response.status;
          err.fields = (data && data.fields) || {};
          done(err);
        }
      });
    }, function () {
      var err = new Error('The server did not answer');
      err.status = 0;
      err.fields = {};
      done(err);
    });
  }

  return {
    runtime: function (done) { call('GET', '/api/runtime', null, done); },
    dashboard: function (done) { call('GET', '/api/dashboard', null, done); },
    orders: function (done) { call('GET', '/api/orders', null, done); },
    order: function (id, done) { call('GET', '/api/orders/' + id, null, done); },
    createOrder: function (order, done) { call('POST', '/api/orders', order, done); },
    changeStatus: function (id, status, done) { call('PATCH', '/api/orders/' + id + '/status', { status: status }, done); },
    deleteOrder: function (id, done) { call('DELETE', '/api/orders/' + id, null, done); }
  };
})();
