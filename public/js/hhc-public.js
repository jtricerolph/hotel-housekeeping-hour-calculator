/* global hhcData */
(function () {
	'use strict';

	// =========================================================================
	// State
	// =========================================================================

	var bookingsData = null;  // {dates:[], categories:[]}
	var settings = {
		time_requirements: {},
		staff_data:        [],
		tolerance_minutes: 30
	};
	var pickupData   = {};  // catId → date → {count, total}
	var generalTasks = [];  // [{name, hours:{Mon:N,...}}]

	var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

	var _timers = {};

	// =========================================================================
	// Bootstrap
	// =========================================================================

	function init() {
		document.getElementById('hhc-refresh').addEventListener('click', function () {
			loadAll(true);
		});
		document.getElementById('hhc-add-staff').addEventListener('click', addStaffRow);
		document.getElementById('hhc-add-task').addEventListener('click', addTaskRow);
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
		fd.append('nonce',  hhcData.nonce);
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
		fd.append('nonce',  hhcData.nonce);

		return fetch(hhcData.ajax_url, { method: 'POST', body: fd })
			.then(function (r) { return r.json(); })
			.then(function (resp) {
				if (!resp.success) {
					throw 'Failed to fetch settings';
				}
				var tr = resp.data.time_requirements;
				settings.time_requirements = (tr && !Array.isArray(tr)) ? tr : {};
				settings.staff_data        = resp.data.staff_data || [];
				settings.tolerance_minutes = resp.data.tolerance_minutes || 30;

				var pd = resp.data.pickup_data;
				pickupData   = (pd && !Array.isArray(pd)) ? pd : {};
				generalTasks = resp.data.general_tasks || [];
			});
	}

	// =========================================================================
	// Render orchestration
	// =========================================================================

	function renderAll() {
		if (!bookingsData) { return; }

		var dates = bookingsData.dates;
		document.getElementById('hhc-date-range').textContent =
			fmtDate(dates[0]) + ' – ' + fmtDate(dates[dates.length - 1]);

		renderSummaryTable();
		renderRequiredTable();
		renderStaffTable();
		renderGeneralTasksTable();
		renderTimeTable();

		show('hhc-summary-section');
		show('hhc-required-section');
		show('hhc-staff-section');
		show('hhc-general-tasks-section');
		show('hhc-time-section');
	}

	// =========================================================================
	// 7-Day Summary Table
	// =========================================================================

	function renderSummaryTable() {
		var table = document.getElementById('hhc-summary-table');
		var dates = bookingsData.dates;
		var cats  = bookingsData.categories;
		var html  = '';

		// Header row 1
		html += '<thead><tr>';
		html += '<th class="hhc-th-cat" rowspan="2">Category</th>';
		dates.forEach(function (date) {
			html += '<th class="hhc-th-day" colspan="2">' + fmtDayHeader(date) + '</th>';
		});
		html += '</tr>';

		// Header row 2
		html += '<tr>';
		dates.forEach(function () {
			html += '<th class="hhc-th-rooms">Rooms</th>';
			html += '<th class="hhc-th-breakdown">D / S / A</th>';
		});
		html += '</tr></thead>';

		// Body: 3 rows per category
		html += '<tbody>';
		cats.forEach(function (cat, catIdx) {
			var isLast    = (catIdx === cats.length - 1);
			var lastClass = isLast ? '' : ' hhc-cat-row-last';

			// Row 1: label + total-cell (both rowspan=3) + departs
			html += '<tr class="hhc-cat-row-1">';
			html += '<td class="hhc-cat-label" rowspan="3">' + esc(cat.name) + '</td>';

			dates.forEach(function (date) {
				var d        = cat.days[date];
				var occupied = d.stays + d.arrivals;
				var vacant   = Math.max(0, cat.total_rooms - occupied);
				var pickup   = getDisplayPickup(cat.id, date, occupied, cat.total_rooms);

				html += '<td class="hhc-total-cell" rowspan="3">';
				html += '<div class="hhc-rooms-num">' + d.total_servicing + '</div>';
				html += '<div class="hhc-occ-vac">' + occupied + ' occ (' + vacant + ' vac)</div>';
				html += '<div class="hhc-pickup-ctrl">';
				html += '<button class="hhc-pickup-btn hhc-pickup-dec"' +
					' data-cat="' + esc(cat.id) + '" data-date="' + date + '"' +
					(pickup <= 0 ? ' disabled' : '') + '>&#x2212;</button>';
				html += '<span class="hhc-pickup-num"' +
					' data-cat="' + esc(cat.id) + '" data-date="' + date + '">' + pickup + '</span>';
				html += '<button class="hhc-pickup-btn hhc-pickup-inc"' +
					' data-cat="' + esc(cat.id) + '" data-date="' + date + '"' +
					(pickup >= vacant ? ' disabled' : '') + '>+</button>';
				html += '</div></td>';

				html += '<td class="hhc-breakdown-cell hhc-depart-row">' + d.departs + ' dep</td>';
			});
			html += '</tr>';

			// Row 2: stays
			html += '<tr class="hhc-cat-row-2">';
			dates.forEach(function (date) {
				html += '<td class="hhc-breakdown-cell hhc-stay-row">' + cat.days[date].stays + ' sta</td>';
			});
			html += '</tr>';

			// Row 3: arrivals
			html += '<tr class="hhc-cat-row-3' + lastClass + '">';
			dates.forEach(function (date) {
				html += '<td class="hhc-breakdown-cell hhc-arrive-row">' + cat.days[date].arrivals + ' arr</td>';
			});
			html += '</tr>';
		});
		html += '</tbody>';

		// Footer: totals (no pickup controls in total row)
		var totals = {};
		dates.forEach(function (date) {
			totals[date] = { servicing: 0, departs: 0, stays: 0, arrivals: 0 };
			cats.forEach(function (cat) {
				var d = cat.days[date];
				totals[date].servicing += d.total_servicing;
				totals[date].departs   += d.departs;
				totals[date].stays     += d.stays;
				totals[date].arrivals  += d.arrivals;
			});
		});

		html += '<tfoot>';
		html += '<tr class="hhc-cat-row-1">';
		html += '<td class="hhc-cat-label" rowspan="3" style="font-style:italic">Total</td>';
		dates.forEach(function (date) {
			html += '<td class="hhc-total-cell" rowspan="3"><div class="hhc-rooms-num">' + totals[date].servicing + '</div></td>';
			html += '<td class="hhc-breakdown-cell hhc-depart-row">' + totals[date].departs + ' dep</td>';
		});
		html += '</tr><tr class="hhc-cat-row-2">';
		dates.forEach(function (date) {
			html += '<td class="hhc-breakdown-cell hhc-stay-row">' + totals[date].stays + ' sta</td>';
		});
		html += '</tr><tr class="hhc-cat-row-3">';
		dates.forEach(function (date) {
			html += '<td class="hhc-breakdown-cell hhc-arrive-row">' + totals[date].arrivals + ' arr</td>';
		});
		html += '</tr></tfoot>';

		table.innerHTML = html;
		attachPickupListeners();
	}

	// =========================================================================
	// Pickup helpers
	// =========================================================================

	function getDisplayPickup(catId, date, occupiedNow, totalRooms) {
		var vacant = Math.max(0, totalRooms - occupiedNow);
		var saved  = pickupData[catId] && pickupData[catId][date];
		if (!saved || !saved.count) { return 0; }

		var savedBooked = saved.total - saved.count;
		var pickup;
		if (occupiedNow > savedBooked) {
			// Bookings increased — trim pickup so total-with-pickup stays the same
			pickup = Math.max(0, saved.total - occupiedNow);
		} else {
			// Bookings same or decreased — keep the saved count as-is
			pickup = saved.count;
		}
		return Math.min(pickup, vacant);
	}

	function attachPickupListeners() {
		document.querySelectorAll('.hhc-pickup-btn').forEach(function (btn) {
			btn.addEventListener('click', function () {
				var catId = btn.dataset.cat;
				var date  = btn.dataset.date;

				var cat = null;
				bookingsData.categories.forEach(function (c) {
					if (c.id === catId) { cat = c; }
				});
				if (!cat) { return; }

				var d        = cat.days[date];
				var occupied = d.stays + d.arrivals;
				var vacant   = Math.max(0, cat.total_rooms - occupied);

				var numEl   = document.querySelector('.hhc-pickup-num[data-cat="' + catId + '"][data-date="' + date + '"]');
				var current = numEl ? parseInt(numEl.textContent, 10) || 0 : 0;

				var newVal = btn.classList.contains('hhc-pickup-inc')
					? Math.min(current + 1, vacant)
					: Math.max(current - 1, 0);

				if (!pickupData[catId]) { pickupData[catId] = {}; }
				pickupData[catId][date] = { count: newVal, total: occupied + newVal };

				if (numEl) { numEl.textContent = newVal; }

				var decBtn = document.querySelector('.hhc-pickup-dec[data-cat="' + catId + '"][data-date="' + date + '"]');
				var incBtn = document.querySelector('.hhc-pickup-inc[data-cat="' + catId + '"][data-date="' + date + '"]');
				if (decBtn) { decBtn.disabled = (newVal <= 0); }
				if (incBtn) { incBtn.disabled = (newVal >= vacant); }

				renderRequiredTable();
				recalcDiffRow();
				debounce('pickup', savePickupData, 400);
			});
		});
	}

	// =========================================================================
	// Required Hours Table
	// =========================================================================

	function getDayName(dateStr) {
		var d = new Date(dateStr + 'T00:00:00');
		return DAYS[(d.getDay() + 6) % 7]; // JS Sun=0 → Mon=0..Sun=6
	}

	function calcRequired() {
		var result = {};
		var dates  = bookingsData.dates;

		// Initialise per-date buckets (include general tasks)
		dates.forEach(function (date) {
			var dayName = getDayName(date);
			var genHrs  = 0;
			generalTasks.forEach(function (task) {
				genHrs += ((task.hours && task.hours[dayName]) || 0) / 60;
			});
			result[date] = {
				booked:        0,
				pickup:        0,
				general:       genHrs,
				total:         genHrs,
				by_cat:        {},
				pickup_by_cat: {}
			};
		});

		// Room-based hours
		bookingsData.categories.forEach(function (cat) {
			var req = settings.time_requirements[cat.id] || { depart: 0, stay: 0, arrive: 0 };
			dates.forEach(function (date) {
				var d           = cat.days[date];
				var occupied    = d.stays + d.arrivals;
				var pickupCount = getDisplayPickup(cat.id, date, occupied, cat.total_rooms);

				var bookedMins = (d.departs  * (req.depart || 0)) +
				                 (d.stays    * (req.stay   || 0)) +
				                 (d.arrivals * (req.arrive || 0));
				var bookedHrs  = bookedMins / 60;
				var pickupHrs  = pickupCount * (req.arrive || 0) / 60;

				result[date].by_cat[cat.id]        = bookedHrs;
				result[date].pickup_by_cat[cat.id] = pickupHrs;
				result[date].booked += bookedHrs;
				result[date].pickup += pickupHrs;
				result[date].total  += bookedHrs + pickupHrs;
			});
		});

		return result;
	}

	function renderRequiredTable() {
		var table    = document.getElementById('hhc-required-table');
		var dates    = bookingsData.dates;
		var cats     = bookingsData.categories;
		var required = calcRequired();
		var html     = '';

		// Header
		html += '<thead><tr><th style="text-align:left;min-width:160px">Category</th>';
		dates.forEach(function (date) {
			html += '<th>' + fmtDayHeader(date) + '</th>';
		});
		html += '</tr></thead>';

		// Body: one row per category — booked hrs (+pickup hrs)
		html += '<tbody>';
		cats.forEach(function (cat) {
			html += '<tr>';
			html += '<td style="text-align:left;font-weight:600">' + esc(cat.name) + '</td>';
			dates.forEach(function (date) {
				var bookedHrs = required[date].by_cat[cat.id] || 0;
				var pickupHrs = required[date].pickup_by_cat[cat.id] || 0;
				var cell      = fmtHrs(bookedHrs);
				if (pickupHrs > 0) {
					cell += ' <span class="hhc-pickup-tag">(+' + fmtHrsNum(pickupHrs) + ')</span>';
				}
				html += '<td>' + cell + '</td>';
			});
			html += '</tr>';
		});
		html += '</tbody>';

		// Footer: summary rows + total
		html += '<tfoot>';

		html += '<tr class="hhc-req-summary-row hhc-req-booked">';
		html += '<td style="text-align:left">Booked hrs</td>';
		dates.forEach(function (date) {
			html += '<td>' + fmtHrsNum(required[date].booked) + '</td>';
		});
		html += '</tr>';

		html += '<tr class="hhc-req-summary-row hhc-req-pickup">';
		html += '<td style="text-align:left">Pickup hrs</td>';
		dates.forEach(function (date) {
			html += '<td>' + (required[date].pickup > 0.001 ? fmtHrsNum(required[date].pickup) : '&mdash;') + '</td>';
		});
		html += '</tr>';

		html += '<tr class="hhc-req-summary-row hhc-req-general">';
		html += '<td style="text-align:left">General HK tasks</td>';
		dates.forEach(function (date) {
			html += '<td>' + (required[date].general > 0.001 ? fmtHrsNum(required[date].general) : '&mdash;') + '</td>';
		});
		html += '</tr>';

		html += '<tr class="hhc-total-row">';
		html += '<td style="text-align:left">Total Required</td>';
		dates.forEach(function (date) {
			var cell = '<strong>' + fmtHrsNum(required[date].total) + '</strong>';
			if (required[date].pickup > 0.001) {
				cell += ' <span class="hhc-pickup-tag">(inc ' + fmtHrsNum(required[date].pickup) + ' pickup)</span>';
			}
			html += '<td id="hhc-req-total-' + date + '">' + cell + '</td>';
		});
		html += '</tr></tfoot>';

		table.innerHTML = html;
	}

	// =========================================================================
	// General Housekeeping Tasks Table
	// =========================================================================

	function renderGeneralTasksTable() {
		var tbody = document.getElementById('hhc-tasks-tbody');
		var html  = '';
		generalTasks.forEach(function (task, i) {
			html += buildTaskRow(task.name, task.hours || {}, i);
		});
		tbody.innerHTML = html;
		attachTaskListeners();
	}

	function buildTaskRow(name, hours, index) {
		var html = '<tr class="hhc-task-row" data-index="' + index + '">';
		html += '<td><input type="text" class="hhc-task-name" value="' + esc(name) + '" placeholder="Task name"></td>';
		DAYS.forEach(function (day) {
			var val = (hours[day] !== undefined && hours[day] !== 0) ? hours[day] : '';
			html += '<td><input type="number" class="hhc-task-mins" min="0" max="999"' +
				' data-day="' + day + '" value="' + val + '" placeholder="0"></td>';
		});
		html += '<td><button class="hhc-remove-staff" title="Remove">&times;</button></td>';
		html += '</tr>';
		return html;
	}

	function addTaskRow() {
		var tbody   = document.getElementById('hhc-tasks-tbody');
		var idx     = tbody.querySelectorAll('tr').length;
		var tmp     = document.createElement('tbody');
		tmp.innerHTML = buildTaskRow('', {}, idx);
		tbody.appendChild(tmp.firstChild);
		attachTaskListeners();
	}

	function attachTaskListeners() {
		document.querySelectorAll('#hhc-tasks-tbody .hhc-remove-staff').forEach(function (btn) {
			btn.onclick = function () {
				var row = btn.closest('tr');
				if (row) { row.parentNode.removeChild(row); }
				collectGeneralTasks();
				renderRequiredTable();
				recalcDiffRow();
				debounce('tasks', saveGeneralTasks, 400);
			};
		});

		document.querySelectorAll('#hhc-tasks-tbody .hhc-task-mins').forEach(function (el) {
			el.addEventListener('input', function () {
				collectGeneralTasks();
				renderRequiredTable();
				recalcDiffRow();
				debounce('tasks', saveGeneralTasks, 400);
			});
			el.addEventListener('change', function () {
				collectGeneralTasks();
				saveGeneralTasks();
			});
		});

		document.querySelectorAll('#hhc-tasks-tbody .hhc-task-name').forEach(function (el) {
			el.addEventListener('input', function () {
				debounce('tasks', saveGeneralTasks, 400);
			});
			el.addEventListener('change', function () {
				collectGeneralTasks();
				saveGeneralTasks();
			});
		});
	}

	function collectGeneralTasks() {
		var tasks = [];
		document.querySelectorAll('#hhc-tasks-tbody .hhc-task-row').forEach(function (row) {
			var nameEl = row.querySelector('.hhc-task-name');
			var name   = nameEl ? nameEl.value.trim() : '';
			if (!name) { return; }
			var hours = {};
			row.querySelectorAll('.hhc-task-mins').forEach(function (el) {
				hours[el.dataset.day] = parseInt(el.value, 10) || 0;
			});
			tasks.push({ name: name, hours: hours });
		});
		generalTasks = tasks;
	}

	// =========================================================================
	// Time Requirements Table (moved to bottom)
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
			el.addEventListener('input',  onTimeChange);
			el.addEventListener('change', onTimeCommit);
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
		debounce('req', saveTimeRequirements, 400);
	}

	function onTimeCommit() {
		collectTimeReqs();
		saveTimeRequirements();
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
	// Staff Table
	// =========================================================================

	function renderStaffTable() {
		var dates = bookingsData.dates;
		var staff = settings.staff_data || [];

		var headHtml = '<tr><th class="hhc-col-name">Staff Member</th>';
		dates.forEach(function (date) { headHtml += '<th>' + fmtDayHeader(date) + '</th>'; });
		headHtml += '<th class="hhc-col-remove"></th></tr>';
		document.getElementById('hhc-staff-thead').innerHTML = headHtml;

		var tbodyHtml = '';
		staff.forEach(function (member, i) {
			tbodyHtml += buildStaffRow(member.name, member.hours || {}, dates, i);
		});
		document.getElementById('hhc-staff-tbody').innerHTML = tbodyHtml;

		var tfootHtml = '';

		tfootHtml += '<tr class="hhc-staff-total-row"><td style="text-align:left">Total Available</td>';
		dates.forEach(function (date) {
			tfootHtml += '<td id="hhc-avail-' + date + '">0.0h</td>';
		});
		tfootHtml += '<td></td></tr>';

		tfootHtml += '<tr class="hhc-diff-row"><td style="text-align:left;font-size:12px;color:#555">Diff vs Required</td>';
		dates.forEach(function (date) {
			tfootHtml += '<td class="hhc-diff-cell" id="hhc-diff-' + date + '">&mdash;</td>';
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
		var tmp     = document.createElement('tbody');
		tmp.innerHTML = buildStaffRow('', {}, dates, idx);
		tbody.appendChild(tmp.firstChild);
		attachStaffListeners();
		debounce('staff', saveStaffData, 400);
	}

	function attachStaffListeners() {
		document.querySelectorAll('.hhc-remove-staff').forEach(function (btn) {
			if (btn.closest('#hhc-staff-tbody')) {
				btn.onclick = function () {
					var row = btn.closest('tr');
					if (row) { row.parentNode.removeChild(row); }
					recalcDiffRow();
					debounce('staff', saveStaffData, 400);
				};
			}
		});

		document.querySelectorAll('.hhc-staff-hours').forEach(function (el) {
			el.oninput = function () {
				recalcDiffRow();
				debounce('staff', saveStaffData, 400);
			};
			el.onchange = function () {
				recalcDiffRow();
				saveStaffData();
			};
		});

		document.querySelectorAll('.hhc-staff-name').forEach(function (el) {
			el.oninput = function () { debounce('staff', saveStaffData, 400); };
			el.onchange = function () { saveStaffData(); };
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
		collectTimeReqs();
		var fd = new FormData();
		fd.append('action', 'hhc_save_time_requirements');
		fd.append('nonce',  hhcData.nonce);
		fd.append('time_requirements', JSON.stringify(settings.time_requirements));

		fetch(hhcData.ajax_url, { method: 'POST', body: fd })
			.then(function (r) { return r.json(); })
			.then(function (resp) {
				flashSave(resp.success ? 'Requirements saved'
					: 'Save failed: ' + ((resp.data && resp.data.message) || 'unknown'));
			})
			.catch(function (err) { flashSave('Save error: ' + err, true); });
	}

	function saveStaffData() {
		var staffData = collectStaffData();
		settings.staff_data = staffData;

		var fd = new FormData();
		fd.append('action',     'hhc_save_staff_data');
		fd.append('nonce',      hhcData.nonce);
		fd.append('staff_data', JSON.stringify(staffData));

		fetch(hhcData.ajax_url, { method: 'POST', body: fd })
			.then(function (r) { return r.json(); })
			.then(function (resp) {
				flashSave(resp.success ? 'Staff hours saved'
					: 'Save failed: ' + ((resp.data && resp.data.message) || 'unknown'));
			})
			.catch(function (err) { flashSave('Save error: ' + err, true); });
	}

	function savePickupData() {
		var fd = new FormData();
		fd.append('action',      'hhc_save_pickup_data');
		fd.append('nonce',       hhcData.nonce);
		fd.append('pickup_data', JSON.stringify(pickupData));

		fetch(hhcData.ajax_url, { method: 'POST', body: fd })
			.then(function (r) { return r.json(); })
			.then(function (resp) {
				if (!resp.success) {
					flashSave('Pickup save failed: ' + ((resp.data && resp.data.message) || 'unknown'), true);
				}
			})
			.catch(function (err) { flashSave('Save error: ' + err, true); });
	}

	function saveGeneralTasks() {
		collectGeneralTasks();
		var fd = new FormData();
		fd.append('action',        'hhc_save_general_tasks');
		fd.append('nonce',         hhcData.nonce);
		fd.append('general_tasks', JSON.stringify(generalTasks));

		fetch(hhcData.ajax_url, { method: 'POST', body: fd })
			.then(function (r) { return r.json(); })
			.then(function (resp) {
				flashSave(resp.success ? 'Tasks saved'
					: 'Save failed: ' + ((resp.data && resp.data.message) || 'unknown'));
			})
			.catch(function (err) { flashSave('Save error: ' + err, true); });
	}

	// =========================================================================
	// Beacon save on page unload
	// =========================================================================

	window.addEventListener('beforeunload', function () {
		if (!bookingsData) { return; }

		collectTimeReqs();
		var fd1 = new FormData();
		fd1.append('action', 'hhc_save_time_requirements');
		fd1.append('nonce',  hhcData.nonce);
		fd1.append('time_requirements', JSON.stringify(settings.time_requirements));
		navigator.sendBeacon(hhcData.ajax_url, fd1);

		var staffData = collectStaffData();
		if (staffData.length) {
			var fd2 = new FormData();
			fd2.append('action',     'hhc_save_staff_data');
			fd2.append('nonce',      hhcData.nonce);
			fd2.append('staff_data', JSON.stringify(staffData));
			navigator.sendBeacon(hhcData.ajax_url, fd2);
		}

		var fd3 = new FormData();
		fd3.append('action',      'hhc_save_pickup_data');
		fd3.append('nonce',       hhcData.nonce);
		fd3.append('pickup_data', JSON.stringify(pickupData));
		navigator.sendBeacon(hhcData.ajax_url, fd3);

		collectGeneralTasks();
		var fd4 = new FormData();
		fd4.append('action',        'hhc_save_general_tasks');
		fd4.append('nonce',         hhcData.nonce);
		fd4.append('general_tasks', JSON.stringify(generalTasks));
		navigator.sendBeacon(hhcData.ajax_url, fd4);
	});

	// =========================================================================
	// Utilities
	// =========================================================================

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
		var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
		              'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		return days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()];
	}

	function fmtHrs(n) {
		return n === 0 ? '—' : n.toFixed(1) + 'h';
	}

	function fmtHrsNum(n) {
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

	function flashSave(msg, isError) {
		var el = document.getElementById('hhc-save-status');
		if (!el) { return; }
		var err = isError || /error|failed/i.test(msg);
		el.style.color   = err ? '#c0392b' : '#28a745';
		el.textContent   = msg;
		el.style.opacity = '1';
		clearTimeout(el._timer);
		el._timer = setTimeout(function () { el.style.opacity = '0'; }, err ? 5000 : 2500);
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
