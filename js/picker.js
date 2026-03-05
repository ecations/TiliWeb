/**
 * Tilitin - Shared custom dropdown picker (used in COA panel, entry form, etc.)
 * Single modal in DOM; open with TilitinPicker.open(anchorEl, title, options, onSelect, opts).
 */

(function () {
  'use strict';

  let modal = null;
  let filterInput = null;
  let listEl = null;
  let titleEl = null;
  let innerEl = null;

  function ensureModal() {
    if (modal) return;
    modal = document.createElement('div');
    modal.id = 'tilitinPickerModal';
    modal.className = 'picker-modal hidden';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = '<div class="picker-modal-inner">' +
      '<div class="picker-modal-title"></div>' +
      '<input type="text" class="picker-modal-filter hidden" placeholder="Suodata…" autocomplete="off">' +
      '<label class="picker-modal-fav hidden"><input type="checkbox" class="picker-favourites-only"> Vain suosikkitilit</label>' +
      '<ul class="picker-modal-list"></ul></div>';
    document.body.appendChild(modal);
    innerEl = modal.querySelector('.picker-modal-inner');
    titleEl = modal.querySelector('.picker-modal-title');
    filterInput = modal.querySelector('.picker-modal-filter');
    listEl = modal.querySelector('.picker-modal-list');
    modal.addEventListener('click', function (e) {
      if (e.target === modal) close();
    });
  }

  function close() {
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  /**
   * Open the shared picker.
   * @param {HTMLElement} anchorEl - Element to position under (or pass { top, left, bottom } for rect)
   * @param {string} title - Modal title
   * @param {{ value: string|number, label: string, favourite?: boolean }[]} options - List of options
   * @param {function(value, label)} onSelect - Called when user picks an option
   * @param {{ showFilter?: boolean, showFavouritesFilter?: boolean, onToggleFavourite?: function(value, isFavourite) }} opts
   */
  function open(anchorEl, title, options, onSelect, opts) {
    ensureModal();
    opts = opts || {};
    const showFilter = opts.showFilter !== false && options.length > 15;
    const showFavouritesFilter = opts.showFavouritesFilter === true && typeof opts.onToggleFavourite === 'function';
    const favLabel = innerEl.querySelector('.picker-modal-fav');
    const favCheckbox = innerEl.querySelector('.picker-favourites-only');
    favLabel.classList.toggle('hidden', !showFavouritesFilter);
    if (showFavouritesFilter) {
      const saved = localStorage.getItem('tilitin_picker_favOnly');
      favCheckbox.checked = saved === '1';
    }

    titleEl.textContent = title || 'Valitse';
    filterInput.classList.toggle('hidden', !showFilter);
    filterInput.value = '';
    listEl.innerHTML = '';

    const optionsCopy = options.map(function (o) {
      return { value: o.value, label: o.label, favourite: !!o.favourite };
    });

    function applyFilters() {
      const q = (filterInput.value || '').toLowerCase();
      const favouritesOnly = showFavouritesFilter && favCheckbox.checked;
      listEl.querySelectorAll('li').forEach(function (li) {
        const opt = optionsCopy.find(function (x) { return String(x.value) === String(li.getAttribute('data-value')); });
        const matchesText = !q || (opt && (opt.label || '').toLowerCase().indexOf(q) >= 0);
        const isPlaceholder = opt && (opt.value == 0 || String(opt.value) === '0');
        const matchesFav = !favouritesOnly || (opt && (opt.favourite || isPlaceholder));
        li.style.display = (matchesText && matchesFav) ? '' : 'none';
      });
    }

    function setStarIcon(starEl, favourite) {
      starEl.textContent = favourite ? '\u2605' : '\u2606';
      starEl.classList.toggle('picker-star-on', !!favourite);
    }

    optionsCopy.forEach(function (opt) {
      const li = document.createElement('li');
      li.setAttribute('data-value', String(opt.value));
      const isAccountOption = showFavouritesFilter && opt.value != 0 && String(opt.value) !== '0';
      if (isAccountOption) {
        const labelSpan = document.createElement('span');
        labelSpan.className = 'picker-item-label';
        labelSpan.textContent = opt.label;
        li.appendChild(labelSpan);
        const starSpan = document.createElement('span');
        starSpan.className = 'picker-item-star';
        starSpan.setAttribute('title', 'Suosikkitili');
        setStarIcon(starSpan, opt.favourite);
        starSpan.onclick = function (e) {
          e.stopPropagation();
          const newFav = !opt.favourite;
          opts.onToggleFavourite(opt.value, newFav);
          opt.favourite = newFav;
          setStarIcon(starSpan, newFav);
          applyFilters();
        };
        li.appendChild(starSpan);
      } else {
        li.textContent = opt.label;
      }
      li.onclick = function (e) {
        if (showFavouritesFilter && e.target.classList.contains('picker-item-star')) return;
        onSelect(opt.value, opt.label);
        close();
      };
      listEl.appendChild(li);
    });

    if (showFilter) {
      filterInput.oninput = applyFilters;
    }
    if (showFavouritesFilter) {
      favCheckbox.onchange = function () {
        localStorage.setItem('tilitin_picker_favOnly', favCheckbox.checked ? '1' : '0');
        applyFilters();
      };
    }

    const rect = anchorEl && anchorEl.getBoundingClientRect ? anchorEl.getBoundingClientRect() : anchorEl;
    if (rect) {
      const top = rect.bottom != null ? rect.bottom + 4 : (rect.top != null ? rect.top + 4 : 8);
      const left = rect.left != null ? Math.max(8, rect.left) : 8;
      innerEl.style.top = top + 'px';
      innerEl.style.left = left + 'px';
    } else {
      innerEl.style.top = '';
      innerEl.style.left = '';
    }

    // Apply saved filters before showing so the list is already filtered on open.
    applyFilters();

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    if (showFilter) filterInput.focus(); else if (listEl.firstElementChild) listEl.firstElementChild.focus();
  }

  window.TilitinPicker = { open, close };
})();
