<?php
/**
 * Plugin Name: Hotel Housekeeping Hour Calculator
 * Plugin URI: https://github.com/jtricerolph/hotel-housekeeping-hour-calculator
 * Description: 7-day housekeeping workload planner with NewBook PMS integration. Calculate required housekeeping hours, plan staff rotas, and identify under/over-staffing at a glance.
 * Version: 1.0.0
 * Author: JTR
 * License: GPL v2 or later
 * Text Domain: hhc
 * Requires at least: 5.8
 * Requires PHP: 7.4
 */

if ( ! defined( 'WPINC' ) ) {
	die;
}

define( 'HHC_VERSION', '1.0.0' );
define( 'HHC_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'HHC_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'HHC_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );

function activate_hhc() {
	require_once HHC_PLUGIN_DIR . 'includes/class-hhc-activator.php';
	HHC_Activator::activate();
}

function deactivate_hhc() {
	require_once HHC_PLUGIN_DIR . 'includes/class-hhc-activator.php';
	HHC_Activator::deactivate();
}

register_activation_hook( __FILE__, 'activate_hhc' );
register_deactivation_hook( __FILE__, 'deactivate_hhc' );

require_once HHC_PLUGIN_DIR . 'includes/class-hhc-activator.php';
require_once HHC_PLUGIN_DIR . 'includes/class-hhc-newbook-api.php';
require_once HHC_PLUGIN_DIR . 'includes/class-hhc-admin.php';
require_once HHC_PLUGIN_DIR . 'includes/class-hhc-ajax.php';
require_once HHC_PLUGIN_DIR . 'public/class-hhc-public.php';

new HHC_Admin();
new HHC_Ajax();
new HHC_Public();
