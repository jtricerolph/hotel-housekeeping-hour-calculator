<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
<div id="hhc-calculator" class="hhc-calculator">

	<div class="hhc-header">
		<div class="hhc-header-left">
			<h2 class="hhc-title">Housekeeping Hour Calculator</h2>
			<span class="hhc-date-range" id="hhc-date-range"></span>
		</div>
		<div class="hhc-header-right">
			<span class="hhc-save-status" id="hhc-save-status"></span>
			<div class="hhc-week-nav">
				<button class="hhc-btn hhc-btn-secondary" id="hhc-week-prev">&#8249; Prev</button>
				<button class="hhc-btn hhc-btn-secondary" id="hhc-week-today">Today</button>
				<button class="hhc-btn hhc-btn-secondary" id="hhc-week-next">Next &#8250;</button>
				<input type="date" id="hhc-week-picker" class="hhc-date-picker" title="Jump to date">
			</div>
			<button class="hhc-btn hhc-btn-secondary" id="hhc-refresh">&#8635; Refresh Data</button>
		</div>
	</div>

	<div class="hhc-loading" id="hhc-loading">
		<div class="hhc-spinner"></div>
		<p>Loading bookings from NewBook&hellip;</p>
	</div>

	<div class="hhc-error" id="hhc-error" style="display:none"></div>

	<!-- ===== 7-DAY SUMMARY ===== -->
	<div class="hhc-section" id="hhc-summary-section" style="display:none">
		<div class="hhc-section-header">
			<div class="hhc-section-header-row">
				<div>
					<h3>7-Day Occupancy Summary</h3>
					<p class="hhc-section-desc">Big number = occupied tonight, small = vacant. D&nbsp;/&nbsp;S&nbsp;/&nbsp;A = departures / stays / arrivals. Use &minus;&nbsp;/&nbsp;+ to add expected pickup bookings.</p>
				</div>
				<div class="hhc-last-viewed-wrap">
					<label for="hhc-last-viewed">Changes since</label>
					<input type="date" id="hhc-last-viewed" class="hhc-date-picker">
				</div>
			</div>
		</div>
		<div class="hhc-table-scroll">
			<table class="hhc-table hhc-summary-table" id="hhc-summary-table"></table>
		</div>
	</div>

	<!-- ===== REQUIRED HOURS ===== -->
	<div class="hhc-section" id="hhc-required-section" style="display:none">
		<div class="hhc-section-header">
			<h3>Required Housekeeping Hours</h3>
			<p class="hhc-section-desc">Calculated from room counts &times; minutes per action &divide; 60. Pickup rooms counted as arrivals.</p>
		</div>
		<div class="hhc-table-scroll">
			<table class="hhc-table hhc-required-table" id="hhc-required-table"></table>
		</div>
	</div>

	<!-- ===== STAFF HOURS ===== -->
	<div class="hhc-section" id="hhc-staff-section" style="display:none">
		<div class="hhc-section-header">
			<h3>Staff Hours Available</h3>
			<p class="hhc-section-desc">Enter available hours per staff member per day. Changes are saved automatically.</p>
		</div>
		<div class="hhc-table-scroll">
			<table class="hhc-table hhc-staff-table" id="hhc-staff-table">
				<thead id="hhc-staff-thead"></thead>
				<tbody id="hhc-staff-tbody"></tbody>
				<tfoot id="hhc-staff-tfoot"></tfoot>
			</table>
		</div>
		<div class="hhc-staff-controls">
			<button class="hhc-btn hhc-btn-add" id="hhc-add-staff">+ Add Staff Member</button>
		</div>
	</div>

	<!-- ===== GENERAL HOUSEKEEPING TASKS ===== -->
	<div class="hhc-section" id="hhc-general-tasks-section" style="display:none">
		<div class="hhc-section-header">
			<h3>General Housekeeping Tasks</h3>
			<p class="hhc-section-desc">Non-room tasks with fixed weekly time allocations. Enter <strong>minutes</strong> per day. These are added to the required hours totals.</p>
		</div>
		<div class="hhc-table-scroll">
			<table class="hhc-table hhc-general-tasks-table" id="hhc-general-tasks-table">
				<thead>
					<tr>
						<th style="text-align:left;min-width:180px">Task</th>
						<th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Sun</th>
						<th style="width:40px"></th>
					</tr>
				</thead>
				<tbody id="hhc-tasks-tbody"></tbody>
			</table>
		</div>
		<div class="hhc-staff-controls">
			<button class="hhc-btn hhc-btn-add" id="hhc-add-task">+ Add Task</button>
		</div>
	</div>

	<!-- ===== TIME REQUIREMENTS (settings — moved to bottom) ===== -->
	<div class="hhc-section" id="hhc-time-section" style="display:none">
		<div class="hhc-section-header">
			<h3>Time Requirements per Room</h3>
			<p class="hhc-section-desc">Set how many minutes each room type takes per action. Changes are saved automatically.</p>
		</div>
		<div class="hhc-table-wrap">
			<table class="hhc-table hhc-time-table" id="hhc-time-table">
				<thead>
					<tr>
						<th class="hhc-col-cat">Room Category</th>
						<th class="hhc-col-action hhc-depart-col">Depart (mins)</th>
						<th class="hhc-col-action hhc-stay-col">Stay (mins)</th>
						<th class="hhc-col-action hhc-arrive-col">Arrive (mins)</th>
					</tr>
				</thead>
				<tbody id="hhc-time-tbody"></tbody>
			</table>
		</div>
	</div>

</div>
