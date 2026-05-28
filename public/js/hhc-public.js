/* global hhcData */
(function () {
	'use strict';

	// =========================================================================
	// State
	// =========================================================================

	var bookingsData = null;  // {dates:[], categories:[]}
	var settings = {
		time_requirements: {},
		staff_data: [],
		tolerance_minutes: 30
	};

	var timerReq   = null;
	var timerStaff = null;

	// =========================================================================
	// Bootstrap
	// =========================================================================

	function init() {
		document.getElementById('hhc-refresh').addEventListener('click', function () {
			loadAll(true);
		});
		document.getElementById('hhc-add-staff').addEventListener('click', addStaffRow);
		loadAll(false);
	}

	function loadAll(force) {
		setLoading(true);
		setError('');

		Promise.all([
			fetchBookings(force),
			fetchSettings()
		]).then(function () {
			setLoading(false);
			renderAll();
		}).catch(function (msg) {
			setLoading(false);
			setError('Failed to load data: ' + msg);
		});
	}

	// =========================================================================
	// Data fetching
	// =========================================================================

	function fetchBookings(force) {
		var fd = new FormData();
		fd.append('action', 'hhc_get_bookings_data');
		fd.append('nonce', hhcData.nonce);
		fd.append('force_refresh', force ? '1' : '0');

		return fetch(hhcData.ajax_url, { method: 'POST', body: fd })
			.then(function (r) { return r.json(); })
			.then(function (resp) {
				if (!resp.success) {
					throw (resp.data && resp.data.message) ? resp.data.message : 'Failed to fetch bookings';
				}
				bookingsData = resp.data;
			});
	}

	function fetchSettings() {
		var fd = new FormData();
		fd.append('action', 'hhc_get_settings');
		fd.append('nonce', hhcData.nonce);

		return fetch(hhcData.ajax_url, { method: 'POST', body: fd })
			.then(function (r) { return r.json(); })
			.then(function (resp) {
				if (!resp.success) {
					throw 'Failed to fetch settings';
				}
				settings.time_requirements = resp.data.time_requirements || {};
				settings.staff_data        = resp.data.staff_data || [];
				settings.tolerance_minutes = resp.data.tolerance_minutes || 30;
			});
	}

	// =========================================================================
	// Render orchestration
	// =========================================================================

	function renderAll() {
		if (!bookingsData) { return; }

		// Update header date range
		var dates = bookingsData.dates;
		document.getElementById('hhc-date-range').textContent =
			fmtDate(dates[0]) + ' – ' + fmtDate(dates[dates.length - 1]);

		renderTimeTable();
		renderSummaryTable();
		renderRequiredTable();
		renderStaffTable();

		show('hhc-time-section');
		show('hhc-summary-section');
		show('hhc-required-section');
		show('hhc-staff-section');
	}

	// =========================================================================
	// Time Requirements Table
	// =========================================================================

	function renderTimeTable() {
		var tbody = document.getElementById('hhc-time-tbody');
		var rows  = '';

		bookingsData.categories.forEach(function (cat) {
			var req = settings.time_requirements[cat.id] || { depart: 0, stay: 0, arrive: 0 };
			rows += '<tr>';
			rows += '<td class="hhc-cat-name-cell">' + esc(cat.name) + '</td>';
			rows += '<td>' + timeInput(cat.id, 'depart', req.depart) + '</td>';
			rows += '<td>' + timeInput(cat.id, 'stay',   req.stay)   + '</td>';
			rows += '<td>' + timeInput(cat.id, 'arrive', req.arrive) + '</td>';
			rows += '</tr>';
		});

		tbody.innerHTML = rows;

		tbody.querySelectorAll('.hhc-time-input').forEach(function (el) {
			el.addEventListener('input', onTimeChange);
		});
	}

	function timeInput(catId, action, value) {
		return '<input type="number" class="hhc-time-input" min="0" max="999"' +
			' data-cat="' + esc(catId) + '" data-action="' + action + '"' +
			' value="' + (parseInt(value, 10) || 0) + '">';
	}

	function onTimeChange() {
		collectTimeReqs();
		renderRequiredTable();
		recalcDiffRow();
		debounce('req', saveTimeRequirements, 1500);
	}

	function collectTimeReqs() {
		document.querySelectorAll('.hhc-time-input').forEach(function (el) {
			var cat    = el.dataset.cat;
			var action = el.dataset.action;
			if (!settings.time_requirements[cat]) {
				settings.time_requirements[cat] = { depart: 0, stay: 0, arrive: 0 };
			}
			settings.time_requirements[cat][action] = parseInt(el.value, 10) || 0;
		});
	}

	// =========================================================================
	// 7-Day Summary Table
	// =========================================================================

	function renderSummaryTable() {
		var table = document.getElementById('hhc-summary-table');
		var dates = bookingsData.dates;
		var cats  = bookingsData.categories;
		var html  = '';

		// ---- Header row 1: category col + day headers (colspan=2 each) ----
		html += '<thead><tr>';
		html += '<th class="hhc-th-cat" rowspan="2">Category</th>';
		dates.forEach(function (date) {
			html += '<th class="hhc-th-day" colspan="2">' + fmtDayHeader(date) + '</th>';
		});
		html += '</tr>';

		// ---- Header row 2: Rooms / D·S·A sub-headers ----
		html += '<tr>';
		dates.forEach(function () {
			html += '<th class="hhc-th-rooms">Rooms</th>';
			html += '<th class="hhc-th-breakdown">D / S / A</th>';
		});
		html += '</tr></thead>';

		// ---- Body: 3 rows per category ----
		html += '<tbody>';
		cats.forEach(function (cat, catIdx) {
			var isLast = (catIdx === cats.length - 1);
			var lastClass = isLast ? '' : ' hhc-cat-row-last';

			// Row 1 — category label (rowspan=3), total rooms (rowspan=3), departs
			html += '<tr class="hhc-cat-row-1">';
			html += '<td class="hhc-cat-label" rowspan="3">' + esc(cat.name) + '</td>';
			dates.forEach(function (date) {
				var d = cat.days[date];
				html += '<td class="hhc-total-cell" rowspan="3">' + d.total_servicing + '</td>';
				html += '<td class="hhc-breakdown-cell hhc-depart-row">' + d.departs + ' dep</td>';
			});
			html += '</tr>';

			// Row 2 — stays
			html += '<tr class="hhc-cat-row-2">';
			dates.forEach(function (date) {
				var d = cat.days[date];
				html += '<td class="hhc-breakdown-cell hhc-stay-row">' + d.stays + ' sta</td>';
			});
			html += '</tr>';

			// Row 3 — arrivals (plus bottom border for category separation)
			html += '<tr class="hhc-cat-row-3' + lastClass + '">';
			dates.forEach(function (date) {
				var d = cat.days[date];
				html += '<td class="hhc-breakdown-cell hhc-arrive-row">' + d.arrivals + ' arr</td>';
			});
			html += '</tr>';
		});
		html += '</tbody>';

		table.innerHTML = html;
	}

	// =========================================================================
	// Required Hours Table
	// =========================================================================

	function calcRequired() {
		var required = {};
		var dates = bookingsData.dates;

		dates.forEach(function (date) {
			required[date] = { total: 0, by_cat: {} };
		});

		bookingsData.categories.forEach(function (cat) {
			var req = settings.time_requirements[cat.id] || { depart: 0, stay: 0, arrive: 0 };
			dates.forEach(function (date) {
				var d    = cat.days[date];
				var mins = (d.departs  * (req.depart || 0)) +
				           (d.stays    * (req.stay   || 0)) +
				           (d.arrivals * (req.arrive  || 0));
				var hrs = mins / 60;
				required[date].by_cat[cat.id] = hrs;
				required[date].total += hrs;
			});
		});

		return required;
	}

	function renderRequiredTable() {
		var table    = document.getElementById('hhc-required-table');
		var dates    = bookingsData.dates;
		var cats     = bookingsData.categories;
		var required = calcRequired();
		var html     = '';

		// Header
		html += '<thead><tr><th style="text-align:left;min-width:140px">Category</th>';
		dates.forEach(function (date) {
			html += '<th>' + fmtDayHeader(date) + '</th>';
		});
		html += '</tr></thead>';

		// Body — one row per category
		html += '<tbody>';
		cats.forEach(function (cat) {
			html += '<tr>';
			html += '<td style="text-align:left;font-weight:600">' + esc(cat.name) + '</td>';
			dates.forEach(function (date) {
				var hrs = (required[date].by_cat[cat.id] || 0);
				html += '<td>' + fmtHrs(hrs) + '</td>';
			});
			html += '</tr>';
		});
		html += '</tbody>';

		// Total row
		html += '<tfoot><tr class="hhc-total-row">';
		html += '<td style="text-align:left">Total Required</td>';
		dates.forEach(function (date) {
			html += '<td id="hhc-req-total-' + date + '"><strong>' + fmtHrsNum(required[date].total) + '</strong></td>';
		});
		html += '</tr></tfoot>';

		table.innerHTML = html;
	}

	// =========================================================================
	// Staff Table
	// =========================================================================

	function renderStaffTable() {
		var dates = bookingsData.dates;
		var staff = settings.staff_data || [];

		// --- Head ---
		var headHtml = '<tr>';
		headHtml += '<th class="hhc-col-name">Staff Member</th>';
		dates.forEach(function (date) {
			headHtml += '<th>' + fmtDayHeader(date) + '</th>';
		});
		headHtml += '<th class="hhc-col-remove"></th></tr>';
		document.getElementById('hhc-staff-thead').innerHTML = headHtml;

		// --- Body ---
		var tbodyHtml = '';
		staff.forEach(function (member, i) {
			tbodyHtml += buildStaffRow(member.name, member.hours || {}, dates, i);
		});
		document.getElementById('hhc-staff-tbody').innerHTML = tbodyHtml;

		// --- Foot: total + diff ---
		var tfootHtml = '';

		// Total available row
		tfootHtml += '<tr class="hhc-staff-total-row">';
		tfootHtml += '<td style="text-align:left">Total Available</td>';
		dates.forEach(function (date) {
			tfootHtml += '<td id="hhc-avail-' + date + '">0.0h</td>';
		});
		tfootHtml += '<td></td></tr>';

		// Diff row
		tfootHtml += '<tr class="hhc-diff-row">';
		tfootHtml += '<td style="text-align:left;font-size:12px;color:#555">Diff vs Required</td>';
		dates.forEach(function (date) {
			tfootHtml += '<td class="hhc-diff-cell" id="hhc-diff-' + date + '">—</td>';
		});
		tfootHtml += '<td></td></tr>';

		document.getElementById('hhc-staff-tfoot').innerHTML = tfootHtml;

		attachStaffListeners();
		recalcDiffRow();
	}

	function buildStaffRow(name, hours, dates, index) {
		var html = '<tr class="hhc-staff-row" data-index="' + index + '">';
		html += '<td><input type="text" class="hhc-staff-name" value="' + esc(name) + '" placeholder="Staff name"></td>';
		dates.forEach(function (date) {
			var val = (hours[date] !== undefined && hours[date] !== '') ? hours[date] : '';
			html += '<td><input type="number" class="hhc-staff-hours" min="0" max="24" step="0.5"' +
				' data-date="' + date + '" value="' + val + '" placeholder="0"></td>';
		});
		html += '<td><button class="hhc-remove-staff" title="Remove">&times;</button></td>';
		html += '</tr>';
		return html;
	}

	function addStaffRow() {
		var dates   = bookingsData.dates;
		var tbody   = document.getElementById('hhc-staff-tbody');
		var idx     = tbody.querySelectorAll('tr').length;
		var rowHtml = buildStaffRow('', {}, dates, idx);
		var tmp     = document.createElement('tbody');
		tmp.innerHTML = rowHtml;
		tbody.appendChild(tmp.firstChild);
		attachStaffListeners();
		debounce('staff', saveStaffData, 1500);
	}

	function attachStaffListeners() {
		// Remove buttons
		document.querySelectorAll('.hhc-remove-staff').forEach(function (btn) {
			btn.onclick = function () {
				var row = btn.closest('tr');
				if (row) { row.parentNode.removeChild(row); }
				recalcDiffRow();
				debounce('staff', saveStaffData, 1500);
			};
		});

		// Hours inputs — recalc immediately, save with debounce
		document.querySelectorAll('.hhc-staff-hours').forEach(function (el) {
			el.oninput = function () {
				recalcDiffRow();
				debounce('staff', saveStaffData, 1500);
			};
		});

		// Name inputs — save with debounce
		document.querySelectorAll('.hhc-staff-name').forEach(function (el) {
			el.oninput = function () {
				debounce('staff', saveStaffData, 1500);
			};
		});
	}

	function recalcDiffRow() {
		if (!bookingsData) { return; }

		var dates     = bookingsData.dates;
		var required  = calcRequired();
		var tolerance = (settings.tolerance_minutes || 30) / 60;

		dates.forEach(function (date) {
			var available = 0;
			document.querySelectorAll('.hhc-staff-hours[data-date="' + date + '"]').forEach(function (el) {
				available += parseFloat(el.value) || 0;
			});

			var availEl = document.getElementById('hhc-avail-' + date);
			if (availEl) { availEl.textContent = fmtHrsNum(available); }

			var diffEl = document.getElementById('hhc-diff-' + date);
			if (!diffEl) { return; }

			var reqHrs = required[date].total;
			var diff   = available - reqHrs;

			diffEl.className = 'hhc-diff-cell';

			if (reqHrs === 0 && available === 0) {
				diffEl.textContent = '—';
				return;
			}

			if (diff < -tolerance) {
				diffEl.classList.add('hhc-diff-under');
				diffEl.innerHTML = '✗ ' + fmtHrsNum(Math.abs(diff)) + ' short';
			} else if (diff > tolerance) {
				diffEl.classList.add('hhc-diff-over');
				diffEl.innerHTML = '⚠ ' + fmtHrsNum(diff) + ' spare';
			} else {
				diffEl.classList.add('hhc-diff-ok');
				diffEl.innerHTML = '✓ ' + (diff >= 0 ? '+' : '') + fmtHrsNum(diff);
			}
		});
	}

	// =========================================================================
	// Collect staff data for saving
	// =========================================================================

	function collectStaffData() {
		var staff = [];
		document.querySelectorAll('#hhc-staff-tbody .hhc-staff-row').forEach(function (row) {
			var nameEl = row.querySelector('.hhc-staff-name');
			var name   = nameEl ? nameEl.value.trim() : '';
			if (!name) { return; }

			var hours = {};
			row.querySelectorAll('.hhc-staff-hours').forEach(function (el) {
				var val = parseFloat(el.value);
				if (!isNaN(val) && val > 0) {
					hours[el.dataset.date] = val;
				}
			});

			staff.push({ name: name, hours: hours });
		});
		return staff;
	}

	// =========================================================================
	// Save functions
	// =========================================================================

	function saveTimeRequirements() {
		var fd = new FormData();
		fd.append('action', 'hhc_save_time_requirements');
		fd.append('nonce', hhcData.nonce);
		fd.append('time_requirements', JSON.stringify(settings.time_requirements));

		fetch(hhcData.ajax_url, { method: 'POST', body: fd })
			.then(function (r) { return r.json(); })
			.then(function (resp) {
				flashSave(resp.success ? 'Requirements saved' : 'Save failed');
			});
	}

	function saveStaffData() {
		var staffData = collectStaffData();
		settings.staff_data = staffData;

		var fd = new FormData();
		fd.append('action', 'hhc_save_staff_data');
		fd.append('nonce', hhcData.nonce);
		fd.append('staff_data', JSON.stringify(staffData));

		fetch(hhcData.ajax_url, { method: 'POST', body: fd })
			.then(function (r) { return r.json(); })
			.then(function (resp) {
				flashSave(resp.success ? 'Staff hours saved' : 'Save failed');
			});
	}

	// =========================================================================
	// Utilities
	// =========================================================================

	var _timers = {};
	function debounce(key, fn, delay) {
		clearTimeout(_timers[key]);
		_timers[key] = setTimeout(fn, delay);
	}

	function fmtDate(dateStr) {
		var d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
	}

	function fmtDayHeader(dateStr) {
		var d      = new Date(dateStr + 'T00:00:00');
		var days   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		return days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()];
	}

	function fmtHrs(n) {
		// Returns em-dash for zero (used in category breakdown cells)
		return n === 0 ? '—' : n.toFixed(1) + 'h';
	}

	function fmtHrsNum(n) {
		// Always returns a number string (used in totals/diff)
		return n.toFixed(1) + 'h';
	}

	function esc(str) {
		return String(str)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function setLoading(show) {
		document.getElementById('hhc-loading').style.display = show ? '' : 'none';
	}

	function setError(msg) {
		var el = document.getElementById('hhc-error');
		el.style.display = msg ? '' : 'none';
		el.textContent   = msg;
	}

	function show(id) {
		var el = document.getElementById(id);
		if (el) { el.style.display = ''; }
	}

	function flashSave(msg) {
		var el = document.getElementById('hhc-save-status');
		if (!el) { return; }
		el.textContent    = msg;
		el.style.opacity  = '1';
		clearTimeout(el._timer);
		el._timer = setTimeout(function () { el.style.opacity = '0'; }, 2500);
	}

	// =========================================================================
	// Start
	// =========================================================================

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

})();
