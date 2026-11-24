/* The Team Task Board page: add / complete / delete tasks, filter, and show errors with their status code. */
(function () {
  var $ = function (selector) { return document.querySelector(selector); };
  var state = { status: 'all', priority: '' };

  /* ---- toasts: every failed call says which one failed and why ---- */
  function toast(title, detail, kind) {
    var node = document.createElement('div');
    node.className = 'toast toast-' + (kind || 'error');
    var strong = document.createElement('strong');
    strong.textContent = title;
    var span = document.createElement('span');
    span.textContent = detail || '';
    node.appendChild(strong);
    node.appendChild(span);
    $('#toasts').appendChild(node);
    setTimeout(function () { node.remove(); }, 9000);
  }

  function reportError(error, what) {
    if (error && error.status !== undefined) {
      var title = error.status ? error.status + ' ' + error.statusText : 'No answer';
      toast(what + ' failed: ' + title, error.method + ' ' + error.path + (error.message ? ' \u2014 ' + error.message : ''));
    } else {
      toast(what + ' failed', String(error));
    }
  }

  /* ---- runtime badge (real values from /api/runtime) ---- */
  function javaLabel(version) {
    if (!version) return '?';
    return version.indexOf('1.') === 0 ? version.split('.').slice(0, 2).join('.') : version.split(/[.+-]/)[0];
  }

  function shortVersion(version) {
    return version ? version.split('.').slice(0, 2).join('.') : '?';
  }

  function showRuntime(info) {
    var pill = 'Java ' + javaLabel(info.java) + ' \u00b7 Boot ' + shortVersion(info.springBoot) + ' \u00b7 ' + info.namespace;
    $('#runtime-pill').textContent = pill;
    $('#runtime-pill').dataset.namespace = info.namespace;
    $('#runtime-detail').textContent = 'Runtime: Java ' + info.java + ' \u00b7 Spring Boot ' + info.springBoot + ' \u00b7 Spring Security ' + info.springSecurity + ' \u00b7 ' + info.namespace + '.* namespace';
  }

  Api.onHeaders(function (headers) {
    var count = headers.get('X-Request-Count');
    var uptime = headers.get('X-Uptime-Seconds');
    if (count) $('#api-stats').textContent = 'API calls handled: ' + count + (uptime ? ' \u00b7 server up ' + uptime + ' s' : '');
  });

  /* ---- views ---- */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /* "due in 3 days" / "2 days late" / "due today", worked out from the server's eta (days until the due date). */
  function dueText(task) {
    var days = Math.round(task.eta);
    if (days === 0) return 'Due today \u00b7 ' + task.dueDate;
    if (days < 0) return Math.abs(days) + (days === -1 ? ' day' : ' days') + ' late \u00b7 ' + task.dueDate;
    return 'Due in ' + days + (days === 1 ? ' day' : ' days') + ' \u00b7 ' + task.dueDate;
  }

  function renderTasks(tasks) {
    var list = $('#task-list');
    list.textContent = '';
    $('#empty').hidden = tasks.length > 0;
    tasks.slice().sort(function (a, b) { return (a.eta === null) - (b.eta === null) || a.eta - b.eta; }).forEach(function (task) {
      var item = el('li', 'task' + (task.done ? ' is-done' : '') + (task.overdue ? ' is-overdue' : ''));
      var main = el('div', 'task-main');
      main.appendChild(el('span', 'task-title', task.title));
      var link = el('a', 'task-link', 'Link: ' + task.url);
      link.href = task.url;
      main.appendChild(link);
      var meta = el('span', 'task-meta');
      meta.appendChild(el('span', 'chip chip-' + task.priority.toLowerCase(), task.priority.charAt(0) + task.priority.slice(1).toLowerCase()));
      if (task.dueDate) meta.appendChild(el('span', 'due' + (task.overdue ? ' due-late' : ''), dueText(task)));
      if (task.done) meta.appendChild(el('span', 'due', 'Done'));
      main.appendChild(meta);
      if (task.notes) main.appendChild(el('span', 'task-notes', task.notes));
      var actions = el('div', 'task-actions');
      if (!task.done) {
        var done = el('button', 'btn btn-small', 'Complete');
        done.type = 'button';
        done.addEventListener('click', function () { complete(task.id); });
        actions.appendChild(done);
      }
      var remove = el('button', 'btn btn-small btn-ghost', 'Delete');
      remove.type = 'button';
      remove.addEventListener('click', function () { removeTask(task.id); });
      actions.appendChild(remove);
      item.appendChild(main);
      item.appendChild(actions);
      list.appendChild(item);
    });
  }

  /* The soonest open due date, from the same eta numbers. */
  function showNextDue(tasks) {
    var days = tasks.filter(function (task) { return !task.done && task.dueDate; }).map(function (task) { return task.eta; });
    if (!days.length) {
      $('#next-due').textContent = 'Nothing due';
      return;
    }
    var next = Math.min.apply(null, days);
    $('#next-due').textContent = 'Next due: ' + (next < 0 ? Math.abs(next) + (next === -1 ? ' day' : ' days') + ' ago (late)' : next === 0 ? 'today' : 'in ' + next + (next === 1 ? ' day' : ' days'));
  }

  function renderStats(stats) {
    $('#stat-total').textContent = stats.total;
    $('#stat-open').textContent = stats.open;
    $('#stat-done').textContent = stats.done;
    $('#stat-overdue').textContent = stats.overdue;
  }

  function refresh() {
    return Promise.all([
      Api.listTasks(state.status, state.priority).then(function (tasks) { renderTasks(tasks); showNextDue(tasks); }).catch(function (e) { renderTasks([]); reportError(e, 'Loading tasks'); }),
      Api.stats().then(renderStats).catch(function (e) { reportError(e, 'Loading statistics'); })
    ]);
  }

  /* ---- actions ---- */
  function complete(id) {
    Api.completeTask(id).then(refresh).catch(function (e) { reportError(e, 'Completing the task'); });
  }

  function removeTask(id) {
    Api.deleteTask(id).then(refresh).catch(function (e) { reportError(e, 'Deleting the task'); });
  }

  function clearFieldErrors() {
    document.querySelectorAll('.field-error').forEach(function (node) { node.textContent = ''; });
    document.querySelectorAll('#task-form .invalid').forEach(function (node) { node.classList.remove('invalid'); });
  }

  function showFieldErrors(errors) {
    errors.forEach(function (problem) {
      var target = document.querySelector('.field-error[data-for="' + problem.field + '"]');
      if (target) {
        target.textContent = problem.message;
        var input = target.parentElement.querySelector('input, textarea, select');
        if (input) input.classList.add('invalid');
      }
    });
  }

  $('#task-form').addEventListener('submit', function (event) {
    event.preventDefault();
    clearFieldErrors();
    var task = {
      title: $('#f-title').value,
      notes: $('#f-notes').value,
      priority: $('#f-priority').value || null,
      dueDate: $('#f-due').value || null
    };
    Api.createTask(task)
      .then(function () {
        $('#task-form').reset();
        toast('Task added', task.title, 'ok');
        return refresh();
      })
      .catch(function (e) {
        if (e.status === 400 && e.fieldErrors.length) {
          showFieldErrors(e.fieldErrors);
          toast('Not saved: 400 ' + e.statusText, e.message);
        } else {
          reportError(e, 'Adding the task');
        }
      });
  });

  document.querySelectorAll('.filters .chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      state.status = chip.dataset.status;
      document.querySelectorAll('.filters .chip').forEach(function (other) { other.classList.toggle('is-active', other === chip); });
      refresh();
    });
  });
  $('#filter-priority').addEventListener('change', function (event) {
    state.priority = event.target.value;
    refresh();
  });

  /* ---- start ---- */
  Api.runtime().then(showRuntime).catch(function (e) {
    $('#runtime-pill').textContent = 'Runtime unavailable';
    reportError(e, 'Reading the runtime');
  });

  refresh();
})();
