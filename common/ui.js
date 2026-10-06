

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export function createSelect(host, config) {
  const items = config.items || [];
  let value = config.value;
  let open = false;
  let pop = null;
  let searchTerm = '';

  host.classList.add('ui-select');
  host.innerHTML = '';

  const button = el('button', 'ui-select-btn');
  button.type = 'button';
  const label = el('span', 'ui-select-label');
  const arrow = el('span', 'ui-select-arrow');
  button.appendChild(label);
  button.appendChild(arrow);
  host.appendChild(button);

  function findItem(v) {
    return items.find(function (item) {
      return item.value === v;
    });
  }

  function paint() {
    const item = findItem(value);
    label.textContent = item ? item.label : config.placeholder || '请选择';
    label.classList.toggle('placeholder', !item);
    host.classList.toggle('disabled', !!config.disabled);
    button.disabled = !!config.disabled;
  }

  function close() {
    if (!open) return;
    open = false;
    host.classList.remove('open');
    if (pop) {
      pop.remove();
      pop = null;
    }
    document.removeEventListener('mousedown', onDocDown, true);
    window.removeEventListener('resize', close);
    window.removeEventListener('scroll', close, true);
  }

  function onDocDown(e) {
    if (pop && pop.contains(e.target)) return;
    if (host.contains(e.target)) return;
    close();
  }

  function renderList() {
    const list = el('div', 'ui-select-list');
    const keyword = searchTerm.trim().toLowerCase();
    const matched = keyword
      ? items.filter(function (item) {
          return (item.label + ' ' + (item.note || '')).toLowerCase().indexOf(keyword) !== -1;
        })
      : items;

    let lastGroup = null;
    matched.forEach(function (item) {
      if (item.group && item.group !== lastGroup) {
        list.appendChild(el('div', 'ui-select-group')).textContent = item.group;
        lastGroup = item.group;
      }
      const row = el('button', 'ui-select-item');
      row.type = 'button';
      row.dataset.value = item.value;
      if (item.value === value) row.classList.add('on');
      const text = el('span');
      text.textContent = item.label;
      row.appendChild(text);
      if (item.note) {
        const note = el('small');
        note.textContent = item.note;
        row.appendChild(note);
      }
      row.addEventListener('click', function (e) {
        e.stopPropagation();
        value = item.value;
        paint();
        close();
        if (config.onChange) config.onChange(value);
      });
      list.appendChild(row);
    });

    if (!matched.length) {
      const empty = el('div', 'ui-select-empty');
      empty.textContent = '没有匹配项';
      list.appendChild(empty);
    }
    return list;
  }

  function openPop() {
    if (open || config.disabled) return;
    open = true;
    host.classList.add('open');

    pop = el('div', 'ui-select-pop');

    if (config.searchable) {
      const box = el('div', 'ui-select-search');
      const input = el('input');
      input.type = 'text';
      input.placeholder = '搜索';
      input.value = searchTerm;
      input.addEventListener('input', function () {
        searchTerm = input.value;
        const fresh = renderList();
        const old = pop.querySelector('.ui-select-list');
        if (old) pop.replaceChild(fresh, old);
      });
      box.appendChild(input);
      pop.appendChild(box);
    }

    let list = renderList();
    pop.appendChild(list);
    document.body.appendChild(pop);

    const rect = host.getBoundingClientRect();
    const popHeight = Math.min(pop.offsetHeight, 320);
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const flip = below < popHeight && above > below;

    pop.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)) + 'px';
    pop.style.width = rect.width + 'px';
    pop.style.maxHeight = Math.min(320, flip ? above : below) + 'px';
    pop.style.top = (flip ? rect.top - popHeight - 4 : rect.bottom + 4) + 'px';
    pop.classList.toggle('up', flip);

    const active = pop.querySelector('.ui-select-item.on');
    if (active) active.scrollIntoView({ block: 'nearest' });

    setTimeout(function () {
      document.addEventListener('mousedown', onDocDown, true);
      window.addEventListener('resize', close);
      window.addEventListener('scroll', close, true);
    }, 0);
  }

  button.addEventListener('click', function (e) {
    e.stopPropagation();
    if (open) close();
    else openPop();
  });

  button.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open) close();
      else openPop();
    } else if (e.key === 'Escape') {
      close();
    }
  });

  paint();

  return {
    get value() {
      return value;
    },
    set: function (v) {
      value = v;
      paint();
    },
    destroy: function () {
      close();
    }
  };
}

export function upgradeSelects(scope) {
  const root = scope || document;
  root.querySelectorAll('select:not([data-ui-ready])').forEach(function (select) {
    select.setAttribute('data-ui-ready', '1');

    const items = [];
    Array.from(select.children).forEach(function (child) {
      if (child.tagName === 'OPTGROUP') {
        Array.from(child.children).forEach(function (option) {
          items.push({ value: option.value, label: option.textContent, group: child.label });
        });
      } else if (child.tagName === 'OPTION') {
        items.push({ value: child.value, label: child.textContent, group: '' });
      }
    });

    const host = el('div', 'ui-select');
    select.parentNode.insertBefore(host, select);
    select.classList.add('ui-select-native');

    createSelect(host, {
      items: items,
      value: select.value,
      searchable: items.length > 12,
      onChange: function (value) {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });
}

export function rebuildSelects(scope) {
  const root = scope || document;
  root.querySelectorAll('.ui-select').forEach(function (host) {
    const select = host.nextElementSibling;
    if (select && select.tagName === 'SELECT') {
      select.removeAttribute('data-ui-ready');
      select.classList.remove('ui-select-native');
    }
    host.remove();
  });
  upgradeSelects(root);
}


export function paintRange(input) {
  if (!input) return;
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 100;
  const value = Number(input.value);
  const percent = max === min ? 0 : ((value - min) / (max - min)) * 100;
  input.style.setProperty('--fill', percent.toFixed(2) + '%');
}

export function bindRanges(scope) {
  const root = scope || document;
  root.querySelectorAll('input[type="range"]').forEach(function (input) {
    paintRange(input);
    if (input.dataset.uiRange) return;
    input.dataset.uiRange = '1';

    const num = input.id ? document.getElementById('v-' + input.id) : null;
    if (num) {
      num.min = input.min;
      num.max = input.max;
      num.step = input.step;
      num.value = input.value;

      num.addEventListener('input', function () {
        let value = Number(num.value);
        if (!isFinite(value)) return;
        value = Math.min(Number(input.max), Math.max(Number(input.min), value));
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        paintRange(input);
      });

      num.addEventListener('blur', function () {
        let value = Number(num.value);
        if (!isFinite(value)) value = Number(input.min) || 0;
        value = Math.min(Number(input.max), Math.max(Number(input.min), value));
        num.value = String(value);
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        paintRange(input);
      });

      input.addEventListener('input', function () {
        if (document.activeElement !== num) num.value = input.value;
      });
    }

    input.addEventListener('input', function () {
      paintRange(input);
    });
  });
}
