<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class HHC_Newbook_API {

	private $api_base_url = 'https://api.newbook.cloud/rest/';
	private $username;
	private $password;
	private $api_key;
	private $region;

	public function __construct() {
		$this->username = get_option( 'hhc_newbook_username', '' );
		$this->password = get_option( 'hhc_newbook_password', '' );
		$this->api_key  = get_option( 'hhc_newbook_api_key', '' );
		$this->region   = get_option( 'hhc_newbook_region', 'uk' );
	}

	private function call_api( $endpoint, $data = array() ) {
		if ( empty( $this->username ) || empty( $this->password ) || empty( $this->api_key ) ) {
			return array( 'error' => 'API credentials not configured' );
		}

		$data['region']  = $this->region;
		$data['api_key'] = $this->api_key;

		$response = wp_remote_post(
			$this->api_base_url . $endpoint,
			array(
				'method'  => 'POST',
				'timeout' => 30,
				'headers' => array(
					'Content-Type'  => 'application/json',
					'Authorization' => 'Basic ' . base64_encode( $this->username . ':' . $this->password ),
				),
				'body'    => json_encode( $data ),
			)
		);

		if ( is_wp_error( $response ) ) {
			return array( 'error' => $response->get_error_message() );
		}

		$code = wp_remote_retrieve_response_code( $response );
		$body = wp_remote_retrieve_body( $response );
		$decoded = json_decode( $body, true );

		if ( $code !== 200 ) {
			$msg = isset( $decoded['message'] ) ? $decoded['message'] : 'HTTP ' . $code;
			error_log( 'HHC: NewBook API error on ' . $endpoint . ': ' . $msg );
			return array( 'error' => $msg );
		}

		if ( json_last_error() !== JSON_ERROR_NONE ) {
			return array( 'error' => 'Invalid JSON response' );
		}

		return $decoded;
	}

	/**
	 * Fetch all bookings overlapping a date range.
	 * list_type 'staying' returns confirmed/unconfirmed/arrived/departed bookings
	 * that overlap the period (including long stays that started before period_from).
	 */
	public function fetch_bookings_range( $start_date, $end_date ) {
		return $this->call_api(
			'bookings_list',
			array(
				'period_from' => $start_date . ' 00:00:00',
				'period_to'   => $end_date . ' 23:59:59',
				'list_type'   => 'staying',
				'data_offset' => 0,
				'data_limit'  => 2000,
			)
		);
	}

	/**
	 * Fetch all bookings (including cancelled) placed or modified since a given date.
	 * Used for delta calculations only — does not affect occupancy counts.
	 */
	public function fetch_bookings_delta( $start_date, $end_date ) {
		return $this->call_api(
			'bookings_list',
			array(
				'period_from' => $start_date . ' 00:00:00',
				'period_to'   => $end_date . ' 23:59:59',
				'list_type'   => 'all',
				'data_offset' => 0,
				'data_limit'  => 2000,
			)
		);
	}

	/**
	 * Fetch all sites (rooms) with category info.
	 */
	public function fetch_sites_list() {
		return $this->call_api( 'sites_list', array() );
	}

	public function test_connection() {
		$response = $this->fetch_sites_list();
		if ( isset( $response['data'] ) ) {
			return array(
				'success' => true,
				'message' => 'Connected successfully. Found ' . count( $response['data'] ) . ' site(s).',
			);
		}
		$msg = isset( $response['error'] ) ? $response['error'] : 'Connection failed — check credentials.';
		return array( 'success' => false, 'message' => $msg );
	}
}
