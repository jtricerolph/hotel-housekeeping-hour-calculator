/* global hhcAdmin, jQuery */
jQuery(function ($) {
	'use strict';

	// ---- Test connection ----
	$('#hhc-test-btn').on('click', function () {
		var $btn = $(this);
		var $res = $('#hhc-test-result');

		$btn.prop('disabled', true).text('Testing…');
		$res.text('').css('color', '');

		$.post(hhcAdmin.ajax_url, {
			action: 'hhc_test_connection',
			nonce:  hhcAdmin.nonce
		}, function (resp) {
			if (resp.success) {
				$res.text('✓ ' + resp.data.message).css('color', '#27ae60');
			} else {
				var msg = (resp.data && resp.data.message) ? resp.data.message : 'Connection failed';
				$res.text('✗ ' + msg).css('color', '#e74c3c');
			}
		}).always(function () {
			$btn.prop('disabled', false).text('Test Connection');
		});
	});

	// ---- Fetch categories ----
	$('#hhc-fetch-cats').on('click', function () {
		var $btn    = $(this);
		var $status = $('#hhc-fetch-status');

		$btn.prop('disabled', true).text('Loading…');
		$status.text('').css('color', '');

		$.post(hhcAdmin.ajax_url, {
			action: 'hhc_fetch_categories',
			nonce:  hhcAdmin.nonce
		}, function (resp) {
			if (resp.success) {
				renderCategories(resp.data.categories);
				$('#hhc-cats-container').show();
				$status.text('✓ ' + resp.data.categories.length + ' categories loaded').css('color', '#27ae60');
			} else {
				var msg = (resp.data && resp.data.message) ? resp.data.message : 'Failed';
				$status.text('✗ ' + msg).css('color', '#e74c3c');
			}
		}).always(function () {
			$btn.prop('disabled', false).text('Load / Refresh Categories from NewBook');
		});
	});

	function renderCategories(cats) {
		var html = '';
		cats.forEach(function (cat, i) {
			html += '<tr data-cat-id="' + escHtml(String(cat.id)) + '">';
			html += '<td><input type="number" class="hhc-cat-order-input" value="' + (i + 1) +
				'" min="1" max="99" style="width:60px;text-align:center"></td>';
			html += '<td>' + escHtml(cat.name) + '</td>';
			html += '<td>' + cat.room_count + '</td>';
			html += '</tr>';
		});
		$('#hhc-cats-tbody').html(html);
	}

	// ---- Save category order ----
	$('#hhc-save-order').on('click', function () {
		var $btn    = $(this);
		var $status = $('#hhc-order-status');

		// Collect rows and sort by order number
		var rows = [];
		$('#hhc-cats-tbody tr').each(function () {
			rows.push({
				id:    $(this).data('cat-id'),
				order: parseInt($(this).find('.hhc-cat-order-input').val(), 10) || 0
			});
		});
		rows.sort(function (a, b) { return a.order - b.order; });
		var ordered = rows.map(function (r) { return r.id; });

		$btn.prop('disabled', true).text('Saving…');
		$status.text('').css('color', '');

		$.post(hhcAdmin.ajax_url, {
			action: 'hhc_save_category_order',
			nonce:  hhcAdmin.nonce,
			order:  JSON.stringify(ordered)
		}, function (resp) {
			if (resp.success) {
				$status.text('✓ Order saved').css('color', '#27ae60');
			} else {
				var msg = (resp.data && resp.data.message) ? resp.data.message : 'Failed';
				$status.text('✗ ' + msg).css('color', '#e74c3c');
			}
		}).always(function () {
			$btn.prop('disabled', false).text('Save Order');
		});
	});

	function escHtml(str) {
		return String(str)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}
});
