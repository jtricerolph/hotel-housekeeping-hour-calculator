/* global hhcData */
(function () {
	'use strict';

	// =========================================================================
	// State
	// =========================================================================

	var bookingsData = null;  // {dates:[], categories:[]}
	var startDate    = null;  // 'YYYY-MM-DD' — first day of displayed week, null = today
	var settings = {
		time_requirements: {},
		staff_data:        [],
		tolerance_minutes: 30
	};
	var pickupData        = {};   // catId → date → {count, total}
	var generalTasks      = [];   // [{name, hours:{Mon:N,...}}]
	var savedLastReviewed = null; // 'YYYY-MM-DD' — DB-persisted last-reviewed date

	var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

	var _timers = {};

	// =========================================================================
	// Bootstrap
	// =========================================================================

	function init() {
		// lvPicker controls the delta reference date — separate from the DB-saved last-reviewed date
		var lvPicker = document.getElementById('hhc-last-viewed');

		// Changing the picker just reruns the query with a different delta reference, no DB save
		lvPicker.addEventListener('change', function () {
			if (this.value) { loadAll(true); }
		});

		// "Update to Now" — save today to DB, but leave picker on whatever user has selected
		document.getElementById('hhc-update-last-viewed').addEventListener('click', function () {
			stampLastReviewed();
		});

		// Refresh — stamp today, reload
		document.getElementById('hhc-refresh').addEventListener('click', function () {
			stampLastReviewed();
			loadAll(true);
		});

		// Week nav — stamp today, reload at new week (picker stays as-is)
		document.getElementById('hhc-week-prev').addEventListener('click', function () {
			startDate = offsetDate(startDate || todayString(), -7);
			document.getElementById('hhc-week-picker').value = startDate;
			stampLastReviewed();
			loadAll(true);
		});
		document.getElementById('hhc-week-next').addEventListener('click', function () {
			startDate = offsetDate(startDate || todayString(), 7);
			document.getElementById('hhc-week-picker').value = startDate;
			stampLastReviewed();
			loadAll(true);
		});
		document.getElementById('hhc-week-today').addEventListener('click', function () {
			startDate = null;
			document.getElementById('hhc-week-picker').value = '';
			stampLastReviewed();
			loadAll(true);
		});
		document.getElementById('hhc-week-picker').addEventListener('change', function () {
			if (this.value) {
				startDate = this.value;
				stampLastReviewed();
				loadAll(true);
			}
		});
		document.getElementById('hhc-add-staff').addEventListener('click', function () {
			stampLastReviewed();
			addStaffRow();
		});
		document.getElementById('hhc-add-task').addEventListener('click', function () {
			stampLastReviewed();
			addTaskRow();
		});
		loadAll(false);
	}

	function stampLastReviewed() {
		var today = todayString();
		savedLastReviewed = today;
		saveLastReviewedToDb(today);
		updateSavedDisplay();
	}

	function saveLastReviewedToDb(date) {
		var fd = new FormData();
		fd.append('action', 'hhc_save_last_reviewed');
		fd.append('nonce',  hhcData.nonce);
		fd.append('date',   date);
		fetch(hhcData.ajax_url, { method: 'POST', body: fd });
	}

	function updateSavedDisplay() {
		var display = document.getElementById('hhc-last-viewed-display');
		if (!display) { return; }
		if (!savedLastReviewed) { display.textContent = ''; return; }
		var d = new Date(savedLastReviewed + 'T00:00:00');
		var fmt = String(d.getDate()).padStart(2, '0') + '/' +
			String(d.getMonth() + 1).padStart(2, '0') + '/' +
			String(d.getFullYear()).slice(2);
		display.textContent = fmt;
	}

	function todayString() {
		var d = new Date();
		return d.getFullYear() + '-' +
			String(d.getMonth() + 1).padStart(2, '0') + '-' +
			String(d.getDate()).padStart(2, '0');
	}

	function offsetDate(dateStr, days) {
		var d = new Date(dateStr + 'T00:00:00');
		d.setDate(d.getDate() + days);
		return d.getFullYear() + '-' +
			String(d.getMonth() + 1).padStart(2, '0') + '-' +
			String(d.getDate()).padStart(2, '0');
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
		if (startDate) { fd.append('start_date', startDate); }
		var lvVal = document.getElementById('hhc-last-viewed').value;
		if (lvVal) { fd.append('last_viewed', lvVal); }

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

				// Sync last-reviewed from DB (shared across devices)
				if (resp.data.last_reviewed) {
					savedLastReviewed = resp.data.last_reviewed;
					// Only seed the picker on first load (when it has no value yet)
					var lvPicker = document.getElementById('hhc-last-viewed');
					if (!lvPicker.value) { lvPicker.value = resp.data.last_reviewed; }
					updateSavedDisplay();
				}
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

		syncTableColumns();
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
		html += '<th class="hhc-phantom-col" rowspan="2"></th></tr>';

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

			dates.forEach(function (date, di) {
				var d        = cat.days[date];
				var occupied = d.stays + d.arrivals;
				var vacant   = Math.max(0, cat.total_rooms - occupied);
				var pickup   = getDisplayPickup(cat.id, date, occupied, cat.total_rooms);

				// Pickup rooms from the previous day depart today
				var prevDate      = dates[di - 1];
				var prevOccupied  = prevDate ? (cat.days[prevDate].stays + cat.days[prevDate].arrivals) : 0;
				var pickupFromPrev = prevDate ? getDisplayPickup(cat.id, prevDate, prevOccupied, cat.total_rooms) : 0;

				var dNew  = d.delta_new       || 0;
				var dCanc = d.delta_cancelled || 0;

				html += '<td class="hhc-total-cell" rowspan="3">';
				if (dNew > 0 || dCanc > 0) {
					html += '<div class="hhc-delta">';
					if (dNew  > 0) { html += '<span class="hhc-delta-new">&#9650;' + dNew  + '</span>'; }
					if (dCanc > 0) { html += '<span class="hhc-delta-canc">&#9660;' + dCanc + '</span>'; }
					html += '</div>';
				}
				var hint      = d.pickup_hint || 0;
				var leadDays  = d.pickup_lead !== undefined ? d.pickup_lead : 0;
				var priorOcc  = d.prior_occ !== undefined ? d.prior_occ : 0;
				var priorVac  = d.prior_vac !== undefined ? d.prior_vac : 0;

				// Occupied number tooltip
				var occTooltip = '';
				var saved = pickupData[cat.id] && pickupData[cat.id][date];
				if (saved && saved.count) {
					var savedBooked = saved.total - saved.count;
					var bookedChange = occupied - savedBooked;
					var changeDesc = bookedChange > 0
						? 'increased by ' + bookedChange + ' to ' + occupied
						: bookedChange < 0
							? 'decreased by ' + Math.abs(bookedChange) + ' to ' + occupied
							: 'unchanged at ' + occupied;
					var pickupDesc = pickup < saved.count
						? 'decreased to ' + pickup
						: 'remains ' + pickup;
					occTooltip = '+' + saved.count + ' pickup set when booked was ' + savedBooked +
						' (target ' + saved.total + '). Booked ' + changeDesc +
						', so pickup ' + pickupDesc + '.';
				}
				var priorLine = 'Last ' + getDayName(date) + ': ' + priorOcc + ' occ (' + priorVac + ' vac) — ' +
					( hint > 0
						? hint + ' room' + (hint === 1 ? '' : 's') + ' picked up within ' + leadDays + ' day' + (leadDays === 1 ? '' : 's') + ' of arrival'
						: 'no late pickups' );
				occTooltip += (occTooltip ? ' | ' : '') + priorLine;

				// Pickup + button tooltip (prior week hint only)
				var tooltip = priorLine;

				html += '<div class="hhc-rooms-num" title="' + esc(occTooltip) + '">' + occupied +
					(pickup > 0 ? '<span class="hhc-pickup-tag"> +' + pickup + '</span>' : '') + '</div>';
				html += '<div class="hhc-occ-vac">' + vacant + ' vac' +
					(pickup > 0 ? '<span class="hhc-pickup-tag"> (' + (vacant - pickup) + ')</span>' : '') + '</div>';

				html += '<div class="hhc-pickup-ctrl">';
				html += '<button class="hhc-pickup-btn hhc-pickup-dec"' +
					' data-cat="' + esc(cat.id) + '" data-date="' + date + '"' +
					(pickup <= 0 ? ' disabled' : '') + '>&#x2212;</button>';
				html += '<span class="hhc-pickup-num"' +
					' data-cat="' + esc(cat.id) + '" data-date="' + date + '">' + pickup + '</span>';
				html += '<button class="hhc-pickup-btn hhc-pickup-inc"' +
					' data-cat="' + esc(cat.id) + '" data-date="' + date + '"' +
					(pickup >= vacant ? ' disabled' : '') +
					' title="' + esc(tooltip) + '">+</button>';
				html += '</div></td>';

				var depTag = pickupFromPrev > 0 ? ' <span class="hhc-pickup-tag">(+' + pickupFromPrev + ')</span>' : '';
				html += '<td class="hhc-breakdown-cell hhc-depart-row">' + d.departs + 'd' + depTag + '</td>';
			});
			html += '<td class="hhc-phantom-col" rowspan="3"></td></tr>';

			// Row 2: stays
			html += '<tr class="hhc-cat-row-2">';
			dates.forEach(function (date) {
				html += '<td class="hhc-breakdown-cell hhc-stay-row">' + cat.days[date].stays + 's</td>';
			});
			html += '</tr>';

			// Row 3: arrivals
			html += '<tr class="hhc-cat-row-3' + lastClass + '">';
			dates.forEach(function (date) {
				var d        = cat.days[date];
				var occupied = d.stays + d.arrivals;
				var pickup   = getDisplayPickup(cat.id, date, occupied, cat.total_rooms);
				var arrTag   = pickup > 0 ? ' <span class="hhc-pickup-tag">(+' + pickup + ')</span>' : '';
				html += '<td class="hhc-breakdown-cell hhc-arrive-row">' + d.arrivals + 'a' + arrTag + '</td>';
			});
			html += '</tr>';
		});
		html += '</tbody>';

		// Footer: totals
		var totals = {};
		dates.forEach(function (date, di) {
			totals[date] = { servicing: 0, occupied: 0, vacant: 0, departs: 0, stays: 0, arrivals: 0, pickupArrive: 0, pickupDepart: 0, deltaNew: 0, deltaCanc: 0 };
			cats.forEach(function (cat) {
				var d        = cat.days[date];
				var occupied = d.stays + d.arrivals;
				var vacant   = Math.max(0, cat.total_rooms - occupied);
				var pickup   = getDisplayPickup(cat.id, date, occupied, cat.total_rooms);

				var prevDate     = dates[di - 1];
				var prevOccupied = prevDate ? (cat.days[prevDate].stays + cat.days[prevDate].arrivals) : 0;
				var prevPickup   = prevDate ? getDisplayPickup(cat.id, prevDate, prevOccupied, cat.total_rooms) : 0;

				totals[date].servicing    += d.total_servicing;
				totals[date].occupied     += occupied;
				totals[date].vacant       += vacant;
				totals[date].departs      += d.departs;
				totals[date].stays        += d.stays;
				totals[date].arrivals     += d.arrivals;
				totals[date].pickupArrive += pickup;
				totals[date].pickupDepart += prevPickup;
				totals[date].deltaNew     += d.delta_new       || 0;
				totals[date].deltaCanc    += d.delta_cancelled || 0;
			});
		});

		html += '<tfoot>';
		html += '<tr class="hhc-cat-row-1">';
		html += '<td class="hhc-cat-label" rowspan="3" style="font-style:italic">Total</td>';
		dates.forEach(function (date) {
			var pickupTotal = totals[date].pickupArrive;
			var tdNew  = totals[date].deltaNew;
			var tdCanc = totals[date].deltaCanc;
			var tdeltaHtml = '';
			if (tdNew > 0 || tdCanc > 0) {
				tdeltaHtml += '<div class="hhc-delta">';
				if (tdNew  > 0) { tdeltaHtml += '<span class="hhc-delta-new">&#9650;' + tdNew  + '</span>'; }
				if (tdCanc > 0) { tdeltaHtml += '<span class="hhc-delta-canc">&#9660;' + tdCanc + '</span>'; }
				tdeltaHtml += '</div>';
			}
			html += '<td class="hhc-total-cell" rowspan="3">' + tdeltaHtml + '<div class="hhc-rooms-num">' + totals[date].occupied +
				(pickupTotal > 0 ? '<span class="hhc-pickup-tag"> +' + pickupTotal + '</span>' : '') + '</div>' +
				'<div class="hhc-occ-vac">' + totals[date].vacant + ' vac' +
					(pickupTotal > 0 ? '<span class="hhc-pickup-tag"> (' + (totals[date].vacant - pickupTotal) + ')</span>' : '') + '</div></td>';
			var depTag = totals[date].pickupDepart > 0 ? ' <span class="hhc-pickup-tag">(+' + totals[date].pickupDepart + ')</span>' : '';
			html += '<td class="hhc-breakdown-cell hhc-depart-row">' + totals[date].departs + 'd' + depTag + '</td>';
		});
		html += '<td class="hhc-phantom-col" rowspan="3"></td></tr><tr class="hhc-cat-row-2">';
		dates.forEach(function (date) {
			html += '<td class="hhc-breakdown-cell hhc-stay-row">' + totals[date].stays + 's</td>';
		});
		html += '</tr><tr class="hhc-cat-row-3">';
		dates.forEach(function (date) {
			var arrTag = totals[date].pickupArrive > 0 ? ' <span class="hhc-pickup-tag">(+' + totals[date].pickupArrive + ')</span>' : '';
			html += '<td class="hhc-breakdown-cell hhc-arrive-row">' + totals[date].arrivals + 'a' + arrTag + '</td>';
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
				renderSummaryTable();
				renderRequiredTable();
				syncTableColumns();
				recalcDiffRow();
				stampLastReviewed();
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
			dates.forEach(function (date, di) {
				var d           = cat.days[date];
				var occupied    = d.stays + d.arrivals;
				var pickupCount = getDisplayPickup(cat.id, date, occupied, cat.total_rooms);

				var bookedMins = (d.departs  * (req.depart || 0)) +
				                 (d.stays    * (req.stay   || 0)) +
				                 (d.arrivals * (req.arrive || 0));
				var bookedHrs  = bookedMins / 60;

				// Pickup arrive hours land on this date
				var pickupArriveHrs = pickupCount * (req.arrive || 0) / 60;

				if (!result[date].pickup_by_cat[cat.id]) { result[date].pickup_by_cat[cat.id] = 0; }
				result[date].by_cat[cat.id] = bookedHrs;
				result[date].pickup_by_cat[cat.id] += pickupArriveHrs;
				result[date].booked += bookedHrs;
				result[date].pickup += pickupArriveHrs;
				result[date].total  += bookedHrs + pickupArriveHrs;

				// Pickup depart hours land on the NEXT date (they check out the following day)
				var nextDate = dates[di + 1];
				if (nextDate && pickupCount > 0) {
					var pickupDepartHrs = pickupCount * (req.depart || 0) / 60;
					if (!result[nextDate].pickup_by_cat[cat.id]) { result[nextDate].pickup_by_cat[cat.id] = 0; }
					result[nextDate].pickup_by_cat[cat.id] += pickupDepartHrs;
					result[nextDate].pickup += pickupDepartHrs;
					result[nextDate].total  += pickupDepartHrs;
				}
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
		html += '<th class="hhc-phantom-col"></th></tr></thead>';

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
			html += '<td class="hhc-phantom-col"></td></tr>';
		});
		html += '</tbody>';

		// Footer: summary rows + total
		html += '<tfoot>';

		html += '<tr class="hhc-req-summary-row hhc-req-booked">';
		html += '<td style="text-align:left">Booked hrs</td>';
		dates.forEach(function (date) {
			html += '<td>' + fmtHrsNum(required[date].booked) + '</td>';
		});
		html += '<td class="hhc-phantom-col"></td></tr>';

		html += '<tr class="hhc-req-summary-row hhc-req-pickup">';
		html += '<td style="text-align:left">Pickup hrs</td>';
		dates.forEach(function (date) {
			html += '<td>' + (required[date].pickup > 0.001 ? fmtHrsNum(required[date].pickup) : '&mdash;') + '</td>';
		});
		html += '<td class="hhc-phantom-col"></td></tr>';

		html += '<tr class="hhc-req-summary-row hhc-req-general">';
		html += '<td style="text-align:left">General HK tasks</td>';
		dates.forEach(function (date) {
			html += '<td>' + (required[date].general > 0.001 ? fmtHrsNum(required[date].general) : '&mdash;') + '</td>';
		});
		html += '<td class="hhc-phantom-col"></td></tr>';

		html += '<tr class="hhc-total-row">';
		html += '<td style="text-align:left">Total Required</td>';
		dates.forEach(function (date) {
			var cell = '<strong>' + fmtHrsNum(required[date].total) + '</strong>';
			if (required[date].pickup > 0.001) {
				cell += ' <span class="hhc-pickup-tag">(inc ' + fmtHrsNum(required[date].pickup) + ' pickup)</span>';
			}
			html += '<td id="hhc-req-total-' + date + '">' + cell + '</td>';
		});
		html += '<td class="hhc-phantom-col"></td></tr></tfoot>';

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
				stampLastReviewed();
				debounce('tasks', saveGeneralTasks, 400);
			};
		});

		document.querySelectorAll('#hhc-tasks-tbody .hhc-task-mins').forEach(function (el) {
			el.addEventListener('input', function () {
				collectGeneralTasks();
				renderRequiredTable();
				recalcDiffRow();
				stampLastReviewed();
				debounce('tasks', saveGeneralTasks, 400);
			});
			el.addEventListener('change', function () {
				collectGeneralTasks();
				saveGeneralTasks();
			});
		});

		document.querySelectorAll('#hhc-tasks-tbody .hhc-task-name').forEach(function (el) {
			el.addEventListener('input', function () {
				stampLastReviewed();
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
			el.addEventListener('input',  function () { onTimeChange(this); });
			el.addEventListener('change', function () { onTimeCommit(this); });
		});
	}

	// =========================================================================
	// Column sync — aligns day spans across Summary / Required / Staff tables
	// =========================================================================

	function syncTableColumns() {
		var dates  = bookingsData.dates;
		var nDays  = dates.length; // 7

		var reqTable     = document.getElementById('hhc-required-table');
		var staffTable   = document.getElementById('hhc-staff-table');
		var summaryTable = document.getElementById('hhc-summary-table');
		if (!reqTable) { return; }

		// Fixed widths — all three tables share the same cat + day + phantom-remove layout
		var catW    = 160;
		var removeW = 36;

		// Day cols share remaining width after cat and remove (phantom on req/summary)
		var totalW = reqTable.parentElement.offsetWidth || reqTable.offsetWidth;
		var dayW   = Math.floor((totalW - catW - removeW) / nDays);

		var dayWs = [];
		for (var i = 0; i < nDays; i++) { dayWs.push(dayW); }

		// Required: cat + 7 days + phantom col (hidden, matches remove width)
		applyColgroup(reqTable, [catW].concat(dayWs).concat([removeW]));

		// Staff: cat + 7 days + remove col (real)
		applyColgroup(staffTable, [catW].concat(dayWs).concat([removeW]));

		// Summary: cat + (Rooms + D/S/A) × 7 days + phantom col
		var summaryCols = [catW];
		for (var j = 0; j < nDays; j++) {
			summaryCols.push(Math.round(dayW * 0.52)); // Rooms sub-col
			summaryCols.push(Math.round(dayW * 0.48)); // D/S/A sub-col
		}
		summaryCols.push(removeW);
		applyColgroup(summaryTable, summaryCols);
	}

	function applyColgroup(table, widths) {
		if (!table) { return; }
		// Remove existing colgroup
		var existing = table.querySelector('colgroup');
		if (existing) { table.removeChild(existing); }

		var cg = document.createElement('colgroup');
		widths.forEach(function (w) {
			var col = document.createElement('col');
			col.style.width = w + 'px';
			cg.appendChild(col);
		});
		table.insertBefore(cg, table.firstChild);
		table.style.tableLayout = 'fixed';
		table.style.width = '100%';
	}

	function timeInput(catId, action, value) {
		return '<input type="number" class="hhc-time-input" min="0" max="999"' +
			' data-cat="' + esc(catId) + '" data-action="' + action + '"' +
			' value="' + (parseInt(value, 10) || 0) + '">';
	}

	function onTimeChange(el) {
		var cat    = el.dataset.cat;
		var action = el.dataset.action;
		var value  = parseInt(el.value, 10) || 0;
		if (!settings.time_requirements[cat]) {
			settings.time_requirements[cat] = { depart: 0, stay: 0, arrive: 0 };
		}
		settings.time_requirements[cat][action] = value;
		renderRequiredTable();
		recalcDiffRow();
		stampLastReviewed();
		debounce('req-' + cat + '-' + action, function () { saveTimeField(cat, action, value); }, 400);
	}

	function onTimeCommit(el) {
		var cat    = el.dataset.cat;
		var action = el.dataset.action;
		var value  = parseInt(el.value, 10) || 0;
		if (!settings.time_requirements[cat]) {
			settings.time_requirements[cat] = { depart: 0, stay: 0, arrive: 0 };
		}
		settings.time_requirements[cat][action] = value;
		saveTimeField(cat, action, value);
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

		tfootHtml += '<tr class="hhc-diff-row"><td style="text-align:left;font-size:12px;color:#555">Diff vs Booked</td>';
		dates.forEach(function (date) {
			tfootHtml += '<td class="hhc-diff-cell" id="hhc-diff-' + date + '">&mdash;</td>';
		});
		tfootHtml += '<td></td></tr>';

		tfootHtml += '<tr class="hhc-diff-row hhc-diff-pickup-row"><td style="text-align:left;font-size:12px;color:#555">Diff vs with Pickup</td>';
		dates.forEach(function (date) {
			tfootHtml += '<td class="hhc-diff-cell" id="hhc-diff-pickup-' + date + '">&mdash;</td>';
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
					stampLastReviewed();
					debounce('staff', saveStaffData, 400);
				};
			}
		});

		document.querySelectorAll('.hhc-staff-hours').forEach(function (el) {
			el.oninput = function () {
				recalcDiffRow();
				stampLastReviewed();
				debounce('staff', saveStaffData, 400);
			};
			el.onchange = function () {
				recalcDiffRow();
				saveStaffData();
			};
		});

		document.querySelectorAll('.hhc-staff-name').forEach(function (el) {
			el.oninput = function () {
				stampLastReviewed();
				debounce('staff', saveStaffData, 400);
			};
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

			var bookedHrs  = required[date].booked + required[date].general;
			var totalHrs   = required[date].total;

			setDiffCell('hhc-diff-' + date,        available, bookedHrs, tolerance);
			setDiffCell('hhc-diff-pickup-' + date, available, totalHrs,  tolerance);
		});
	}

	function setDiffCell(id, available, reqHrs, tolerance) {
		var el = document.getElementById(id);
		if (!el) { return; }

		var diff = available - reqHrs;
		el.className = 'hhc-diff-cell';

		if (reqHrs === 0 && available === 0) {
			el.textContent = '—';
			return;
		}

		if (diff < -tolerance) {
			el.classList.add('hhc-diff-under');
			el.innerHTML = '✗ ' + fmtHrsNum(Math.abs(diff)) + ' short';
		} else if (diff > tolerance) {
			el.classList.add('hhc-diff-over');
			el.innerHTML = '⚠ ' + fmtHrsNum(diff) + ' spare';
		} else {
			el.classList.add('hhc-diff-ok');
			el.innerHTML = '✓ ' + (diff >= 0 ? '+' : '') + fmtHrsNum(diff);
		}
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

	function saveTimeField(cat, action, value) {
		var fd = new FormData();
		fd.append('action', 'hhc_save_time_requirements');
		fd.append('nonce',  hhcData.nonce);
		fd.append('cat',    cat);
		fd.append('act',    action);
		fd.append('val',    value);

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
