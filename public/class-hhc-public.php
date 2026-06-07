<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class HHC_Public {

	public function __construct() {
		add_shortcode( 'housekeeping_calculator', array( $this, 'shortcode_handler' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_assets' ) );
	}

	public function enqueue_assets() {
		global $post;
		if ( ! is_singular() || ! $post || ! has_shortcode( $post->post_content, 'housekeeping_calculator' ) ) {
			return;
		}

		wp_enqueue_style( 'hhc-public', HHC_PLUGIN_URL . 'public/css/hhc-public.css', array(), filemtime( HHC_PLUGIN_DIR . 'public/css/hhc-public.css' ) );
		wp_enqueue_script( 'hhc-public', HHC_PLUGIN_URL . 'public/js/hhc-public.js', array(), filemtime( HHC_PLUGIN_DIR . 'public/js/hhc-public.js' ), true );
		wp_localize_script(
			'hhc-public',
			'hhcData',
			array(
				'ajax_url' => admin_url( 'admin-ajax.php' ),
				'nonce'    => wp_create_nonce( 'hhc_public_action' ),
			)
		);
	}

	public function shortcode_handler( $atts ) {
		ob_start();
		require HHC_PLUGIN_DIR . 'public/views/calculator.php';
		return ob_get_clean();
	}
}
