/* Order Desk page. Plain browser JavaScript, no build step. */
(function () {
  var STATUSES = ['NEW', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
  var LABELS = { NEW: 'New', PAID: 'Paid', SHIPPED: 'Shipped', DELIVERED: 'Delivered', CANCELLED: 'Cancelled' };
  var BAR_COLORS = { NEW: '#175cd3', PAID: '#6941c6', SHIPPED: '#b54708', DELIVERED: '#067647', CANCELLED: '#b42318' };
  var ACTION_LABELS = { PAID: 'Mark paid', SHIPPED: 'Mark shipped', DELIVERED: 'Mark delivered', CANCELLED: 'Cancel order' };

  var state = { orders: [], filter: 'ALL', query: '', openId: null };

  function $(id) { return document.getElementById(id); }

  function money(value) {
    var number = Number(value || 0);
    return '$' + number.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function when(text) {
    if (!text) return '';
    var date = new Date(text);
    if (isNaN(date.getTime())) return text;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function toast(message, isError) {
    var el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = message;
    $('toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, 3200);
  }

  /* ---- data ------------------------------------------------------------------------------- */

  function loadAll() {
    api.orders(function (err, orders) {
      if (err) {
        $('rows').innerHTML = '<tr><td colspan="6" class="empty">Could not load orders: ' + escapeHtml(err.message) + '</td></tr>';
        return;
      }
      state.orders = orders;
      renderFilters();
      renderRows();
      if (state.openId != null) {
        openDrawer(state.openId);
      }
    });
    api.dashboard(function (err, stats) {
      if (err) return;
      renderStats(stats);
    });
  }

  function loadRuntime() {
    api.runtime(function (err, info) {
      if (err) {
        $('runtime').textContent = 'Runtime unavailable';
        return;
      }
      var html = 'Java <b>' + escapeHtml(info.java) + '</b> · Boot <b>' + escapeHtml(info.springBoot) + '</b> · <b>' + escapeHtml(info.namespace) + '</b>';
      $('runtime').innerHTML = html;
      $('footer-runtime').innerHTML = html;
    });
  }

  /* ---- rendering -------------------------------------------------------------------------- */

  function renderStats(stats) {
    $('kpi-orders').textContent = stats.orderCount;
    $('kpi-open').textContent = stats.openCount;
    $('kpi-revenue').textContent = money(stats.revenue);
    $('kpi-average').textContent = money(stats.averageOrder);
    var max = 1;
    for (var i = 0; i < STATUSES.length; i++) {
      max = Math.max(max, stats.byStatus[STATUSES[i]] || 0);
    }
    var bars = '';
    for (var j = 0; j < STATUSES.length; j++) {
      var status = STATUSES[j];
      var count = stats.byStatus[status] || 0;
      bars += '<li><div class="bar-label"><span>' + LABELS[status] + '</span><b>' + count + '</b></div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + Math.round((count / max) * 100) + '%;background:' + BAR_COLORS[status] + '"></div></div></li>';
    }
    $('status-bars').innerHTML = bars;
    var top = '';
    for (var k = 0; k < stats.topProducts.length; k++) {
      top += '<li>' + escapeHtml(stats.topProducts[k]) + '</li>';
    }
    $('top-products').innerHTML = top || '<li class="muted">No sales yet</li>';
  }

  function renderFilters() {
    var counts = { ALL: state.orders.length };
    for (var i = 0; i < state.orders.length; i++) {
      var s = state.orders[i].status;
      counts[s] = (counts[s] || 0) + 1;
    }
    var keys = ['ALL'].concat(STATUSES);
    var html = '';
    for (var j = 0; j < keys.length; j++) {
      var key = keys[j];
      html += '<button type="button" class="filter' + (state.filter == key ? ' active' : '') + '" data-filter="' + key + '">' +
        (key == 'ALL' ? 'All' : LABELS[key]) + '<span class="count">' + (counts[key] || 0) + '</span></button>';
    }
    $('filters').innerHTML = html;
  }

  function visibleOrders() {
    var query = state.query.toLowerCase();
    return state.orders.filter(function (order) {
      if (state.filter != 'ALL' && order.status != state.filter) return false;
      if (query == '') return true;
      return order.customer.toLowerCase().indexOf(query) != -1 || (order.number || '').toLowerCase().indexOf(query) != -1;
    });
  }

  function renderRows() {
    var list = visibleOrders();
    if (list.length == 0) {
      $('rows').innerHTML = '<tr><td colspan="6" class="empty">No orders match.</td></tr>';
      return;
    }
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      html += '<tr data-id="' + o.id + '">' +
        '<td class="number">' + escapeHtml(o.number) + '</td>' +
        '<td class="customer">' + escapeHtml(o.customer) + (o.tier != 'STANDARD' ? '<span class="tier">' + escapeHtml(o.tier) + '</span>' : '') + '<small>' + escapeHtml(o.email) + '</small></td>' +
        '<td class="num">' + o.itemCount + '</td>' +
        '<td class="num">' + money(o.total) + '</td>' +
        '<td><span class="pill ' + o.status + '">' + LABELS[o.status] + '</span></td>' +
        '<td class="muted">' + when(o.createdAt) + '</td></tr>';
    }
    $('rows').innerHTML = html;
  }

  /* ---- drawer ----------------------------------------------------------------------------- */

  function openDrawer(id) {
    api.order(id, function (err, order) {
      if (err) {
        toast(err.message, true);
        closeDrawer();
        return;
      }
      state.openId = order.id;
      $('drawer-number').textContent = order.number;
      $('drawer-title').textContent = order.customer;
      $('drawer-email').textContent = order.email + ' · ' + order.tier.charAt(0) + order.tier.slice(1).toLowerCase() + ' tier';
      var lines = '';
      for (var i = 0; i < order.items.length; i++) {
        var item = order.items[i];
        lines += '<tr><td><b>' + escapeHtml(item.name) + '</b><div class="muted">' + escapeHtml(item.sku) + ' · ' + item.quantity + ' × ' + money(item.unitPrice) + '</div></td><td>' + money(item.lineTotal) + '</td></tr>';
      }
      var actions = '';
      for (var j = 0; j < order.nextStatuses.length; j++) {
        var next = order.nextStatuses[j];
        actions += '<button type="button" class="btn ' + (next == 'CANCELLED' ? 'btn-danger' : 'btn-primary') + ' btn-sm" data-status="' + next + '">' + ACTION_LABELS[next] + '</button>';
      }
      if (order.status == 'NEW' || order.status == 'CANCELLED') {
        actions += '<button type="button" class="btn btn-ghost btn-sm" data-delete="' + order.id + '">Delete</button>';
      }
      $('drawer-body').innerHTML =
        '<div><span class="pill ' + order.status + '">' + LABELS[order.status] + '</span> <span class="muted">· created ' + when(order.createdAt) + '</span></div>' +
        '<table class="line-items"><tbody>' + lines + '</tbody></table>' +
        '<div class="totals"><div><span class="muted">Subtotal</span><span>' + money(order.subtotal) + '</span></div>' +
        '<div><span class="muted">Discount</span><span>−' + money(order.discount) + '</span></div>' +
        '<div class="grand"><span>Total</span><span>' + money(order.total) + '</span></div></div>' +
        (order.note ? '<div class="note">' + escapeHtml(order.note) + '</div>' : '') +
        (actions ? '<div class="actions">' + actions + '</div>' : '<p class="muted">This order is finished.</p>');
      $('drawer-backdrop').hidden = false;
      $('drawer').classList.add('open');
      $('drawer').setAttribute('aria-hidden', 'false');
    });
  }

  function closeDrawer() {
    state.openId = null;
    $('drawer').classList.remove('open');
    $('drawer').setAttribute('aria-hidden', 'true');
    $('drawer-backdrop').hidden = true;
  }

  /* ---- new order form --------------------------------------------------------------------- */

  function itemRow() {
    var row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = '<input name="sku" placeholder="SKU" aria-label="SKU">' +
      '<input name="name" placeholder="Item name" aria-label="Item name">' +
      '<input name="quantity" type="number" min="1" value="1" aria-label="Quantity">' +
      '<input name="unitPrice" type="number" min="0.01" step="0.01" placeholder="Price" aria-label="Unit price">' +
      '<button type="button" class="icon-btn" data-remove aria-label="Remove item">×</button>';
    return row;
  }

  function readItems() {
    var rows = $('items').querySelectorAll('.item-row');
    var items = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      items.push({
        sku: r.querySelector('[name=sku]').value,
        name: r.querySelector('[name=name]').value,
        quantity: parseInt(r.querySelector('[name=quantity]').value, 10) || 0,
        unitPrice: r.querySelector('[name=unitPrice]').value == '' ? null : Number(r.querySelector('[name=unitPrice]').value)
      });
    }
    return items;
  }

  function updateSubtotal() {
    var items = readItems();
    var sum = 0;
    for (var i = 0; i < items.length; i++) {
      sum = sum + items[i].quantity * (items[i].unitPrice || 0);
    }
    $('form-subtotal').textContent = money(sum);
  }

  function clearErrors() {
    var errors = document.querySelectorAll('[data-error]');
    for (var i = 0; i < errors.length; i++) errors[i].textContent = '';
    var invalid = document.querySelectorAll('.invalid');
    for (var j = 0; j < invalid.length; j++) invalid[j].classList.remove('invalid');
    $('form-error').hidden = true;
  }

  function showErrors(err) {
    $('form-error').textContent = err.message;
    $('form-error').hidden = false;
    var fields = err.fields || {};
    for (var key in fields) {
      var match = /^items\[(\d+)\]\.(\w+)$/.exec(key);
      if (match) {
        var row = $('items').querySelectorAll('.item-row')[Number(match[1])];
        var input = row && row.querySelector('[name=' + match[2] + ']');
        if (input) {
          input.classList.add('invalid');
          input.title = fields[key];
        }
        continue;
      }
      var slot = document.querySelector('[data-error="' + key + '"]');
      if (slot) slot.textContent = fields[key];
      var field = document.querySelector('#order-form [name=' + key + ']');
      if (field) field.classList.add('invalid');
    }
  }

  function openModal() {
    $('order-form').reset();
    $('items').innerHTML = '';
    $('items').appendChild(itemRow());
    clearErrors();
    updateSubtotal();
    $('modal-backdrop').hidden = false;
    $('modal').hidden = false;
    $('order-form').querySelector('[name=customer]').focus();
  }

  function closeModal() {
    $('modal').hidden = true;
    $('modal-backdrop').hidden = true;
  }

  function submitOrder(event) {
    event.preventDefault();
    clearErrors();
    var form = $('order-form');
    var order = {
      customer: form.customer.value,
      email: form.email.value,
      tier: form.tier.value,
      note: form.note.value,
      items: readItems()
    };
    api.createOrder(order, function (err, created) {
      if (err) {
        showErrors(err);
        return;
      }
      closeModal();
      toast('Order ' + created.number + ' created · ' + money(created.total));
      loadAll();
    });
  }

  /* ---- events ----------------------------------------------------------------------------- */

  $('filters').addEventListener('click', function (event) {
    var button = event.target.closest('[data-filter]');
    if (!button) return;
    state.filter = button.getAttribute('data-filter');
    renderFilters();
    renderRows();
  });
  $('search').addEventListener('input', function (event) {
    state.query = event.target.value;
    renderRows();
  });
  $('rows').addEventListener('click', function (event) {
    var row = event.target.closest('tr[data-id]');
    if (row) openDrawer(row.getAttribute('data-id'));
  });
  $('drawer-close').addEventListener('click', closeDrawer);
  $('drawer-backdrop').addEventListener('click', closeDrawer);
  $('drawer-body').addEventListener('click', function (event) {
    var statusButton = event.target.closest('[data-status]');
    if (statusButton) {
      var next = statusButton.getAttribute('data-status');
      api.changeStatus(state.openId, next, function (err, order) {
        if (err) {
          toast(err.message, true);
          return;
        }
        toast(order.number + ' is now ' + LABELS[order.status].toLowerCase());
        loadAll();
      });
      return;
    }
    var deleteButton = event.target.closest('[data-delete]');
    if (deleteButton && confirm('Delete this order?')) {
      api.deleteOrder(deleteButton.getAttribute('data-delete'), function (err) {
        if (err) {
          toast(err.message, true);
          return;
        }
        toast('Order deleted');
        closeDrawer();
        loadAll();
      });
    }
  });
  $('new-order').addEventListener('click', openModal);
  $('modal-close').addEventListener('click', closeModal);
  $('modal-cancel').addEventListener('click', closeModal);
  $('modal-backdrop').addEventListener('click', closeModal);
  $('add-item').addEventListener('click', function () {
    $('items').appendChild(itemRow());
  });
  $('items').addEventListener('click', function (event) {
    if (event.target.hasAttribute('data-remove') && $('items').children.length > 1) {
      event.target.parentNode.remove();
      updateSubtotal();
    }
  });
  $('items').addEventListener('input', updateSubtotal);
  $('order-form').addEventListener('submit', submitOrder);
  document.addEventListener('keydown', function (event) {
    if (event.key == 'Escape') {
      closeModal();
      closeDrawer();
    }
  });

  loadRuntime();
  loadAll();
})();
