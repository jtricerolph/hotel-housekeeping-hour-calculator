<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class HHC_Activator {

	public static function activate() {
		flush_rewrite_rules();
	}

	public static function deactivate() {
		flush_rewrite_rules();
	}
}
