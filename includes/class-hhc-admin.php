<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class HHC_Admin {

	public function __construct() {
		add_action( 'admin_menu', array( $this, 'add_admin_menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
	}

	public function add_admin_menu() {
		add_options_page(
			'Housekeeping Hour Calculator',
			'HK Calculator',
			'manage_options',
			'hhc-settings',
			array( $this, 'render_settings_page' )
		);
	}

	public function register_settings() {
		$text   = 'sanitize_text_field';
		$absint = 'absint';

		register_setting( 'hhc_settings', 'hhc_newbook_username', $text );
		register_setting( 'hhc_settings', 'hhc_newbook_password', $text );
		register_setting( 'hhc_settings', 'hhc_newbook_api_key', $text );
		register_setting( 'hhc_settings', 'hhc_newbook_region', $text );
		register_setting( 'hhc_settings', 'hhc_tolerance_minutes', $absint );
	}

	public function render_settings_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'Insufficient permissions' );
		}
		require_once HHC_PLUGIN_DIR . 'admin/views/admin-settings.php';
	}

	public function enqueue_assets( $hook ) {
		if ( $hook !== 'settings_page_hhc-settings' ) {
			return;
		}
		wp_enqueue_style( 'hhc-admin', HHC_PLUGIN_URL . 'admin/css/hhc-admin.css', array(), HHC_VERSION );
		wp_enqueue_script( 'hhc-admin', HHC_PLUGIN_URL . 'admin/js/hhc-admin.js', array( 'jquery' ), HHC_VERSION, true );
		wp_localize_script(
			'hhc-admin',
			'hhcAdmin',
			array(
				'ajax_url' => admin_url( 'admin-ajax.php' ),
				'nonce'    => wp_create_nonce( 'hhc_admin_action' ),
			)
		);
	}
}
