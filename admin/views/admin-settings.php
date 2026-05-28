<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
<div class="wrap hhc-admin-wrap">
	<h1>Housekeeping Hour Calculator &mdash; Settings</h1>

	<!-- ===== API CREDENTIALS ===== -->
	<div class="hhc-admin-card">
		<h2>NewBook API Credentials</h2>
		<form method="post" action="options.php">
			<?php settings_fields( 'hhc_settings' ); ?>
			<table class="form-table">
				<tr>
					<th scope="row"><label for="hhc_newbook_username">Username</label></th>
					<td><input type="text" id="hhc_newbook_username" name="hhc_newbook_username"
						value="<?php echo esc_attr( get_option( 'hhc_newbook_username' ) ); ?>"
						class="regular-text" autocomplete="off"></td>
				</tr>
				<tr>
					<th scope="row"><label for="hhc_newbook_password">Password</label></th>
					<td><input type="password" id="hhc_newbook_password" name="hhc_newbook_password"
						value="<?php echo esc_attr( get_option( 'hhc_newbook_password' ) ); ?>"
						class="regular-text" autocomplete="new-password"></td>
				</tr>
				<tr>
					<th scope="row"><label for="hhc_newbook_api_key">API Key</label></th>
					<td><input type="text" id="hhc_newbook_api_key" name="hhc_newbook_api_key"
						value="<?php echo esc_attr( get_option( 'hhc_newbook_api_key' ) ); ?>"
						class="regular-text" autocomplete="off"></td>
				</tr>
				<tr>
					<th scope="row"><label for="hhc_newbook_region">Region</label></th>
					<td>
						<input type="text" id="hhc_newbook_region" name="hhc_newbook_region"
							value="<?php echo esc_attr( get_option( 'hhc_newbook_region', 'uk' ) ); ?>"
							class="small-text">
						<p class="description">Usually <code>uk</code> or <code>us</code></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="hhc_tolerance_minutes">Staffing Tolerance</label></th>
					<td>
						<input type="number" id="hhc_tolerance_minutes" name="hhc_tolerance_minutes"
							value="<?php echo absint( get_option( 'hhc_tolerance_minutes', 30 ) ); ?>"
							class="small-text" min="0" max="240">
						<span class="description">&nbsp;minutes either side of required before flagging over/under</span>
						<p class="description">
							Green ✓ = within tolerance &nbsp;|&nbsp;
							Red ✗ = short by more than tolerance &nbsp;|&nbsp;
							Amber ⚠ = spare by more than tolerance
						</p>
					</td>
				</tr>
			</table>
			<?php submit_button( 'Save Credentials &amp; Settings' ); ?>
		</form>

		<div class="hhc-test-connection">
			<button id="hhc-test-btn" class="button button-secondary">Test Connection</button>
			<span id="hhc-test-result" class="hhc-test-result"></span>
		</div>
	</div>

	<!-- ===== CATEGORY ORDER ===== -->
	<div class="hhc-admin-card">
		<h2>Room Category Sort Order</h2>
		<p>Fetch your categories from NewBook, then drag the sort order numbers to rearrange.</p>

		<button id="hhc-fetch-cats" class="button button-primary">Load / Refresh Categories from NewBook</button>
		<span id="hhc-fetch-status" class="hhc-fetch-status"></span>

		<div id="hhc-cats-container" style="margin-top:16px; display:none">
			<table class="widefat striped hhc-cats-table">
				<thead>
					<tr>
						<th style="width:80px">Order</th>
						<th>Category Name</th>
						<th style="width:80px">Rooms</th>
						<th style="width:80px;text-align:center">Exclude</th>
					</tr>
				</thead>
				<tbody id="hhc-cats-tbody"></tbody>
			</table>
			<p class="description">Enter numbers to set sort order. Lower numbers appear first.</p>
			<button id="hhc-save-order" class="button button-primary" style="margin-top:8px">Save Order</button>
			<span id="hhc-order-status" class="hhc-fetch-status"></span>
		</div>
	</div>

	<!-- ===== SHORTCODE USAGE ===== -->
	<div class="hhc-admin-card">
		<h2>Usage</h2>
		<p>Add the following shortcode to any page to display the calculator:</p>
		<code>[housekeeping_calculator]</code>
		<p>The page will show the 7-day planning tool, editable time requirements, and the staff hours rota.</p>
	</div>
</div>
