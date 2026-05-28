<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class HHC_Ajax {

	public function __construct() {
		// Public AJAX — no login required (page access acts as the gate)
		$public_pairs = array(
			'hhc_get_bookings_data'     => 'get_bookings_data',
			'hhc_get_settings'          => 'get_settings',
			'hhc_save_time_requirements' => 'save_time_requirements',
			'hhc_save_staff_data'       => 'save_staff_data',
		);
		foreach ( $public_pairs as $action => $method ) {
			add_action( 'wp_ajax_' . $action, array( $this, $method ) );
			add_action( 'wp_ajax_nopriv_' . $action, array( $this, $method ) );
		}

		// Admin-only AJAX
		add_action( 'wp_ajax_hhc_test_connection',    array( $this, 'test_connection' ) );
		add_action( 'wp_ajax_hhc_fetch_categories',   array( $this, 'fetch_categories' ) );
		add_action( 'wp_ajax_hhc_save_category_order', array( $this, 'save_category_order' ) );
	}

	// -------------------------------------------------------------------------
	// Nonce helpers
	// -------------------------------------------------------------------------

	private function verify_public() {
		if ( ! check_ajax_referer( 'hhc_public_action', 'nonce', false ) ) {
			wp_send_json_error( array( 'message' => 'Security check failed' ) );
		}
	}

	private function verify_admin() {
		if ( ! check_ajax_referer( 'hhc_admin_action', 'nonce', false ) || ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => 'Permission denied' ) );
		}
	}

	// -------------------------------------------------------------------------
	// Public actions
	// -------------------------------------------------------------------------

	public function get_bookings_data() {
		$this->verify_public();

		$force = ! empty( $_POST['force_refresh'] ) && $_POST['force_refresh'] === '1';
		$today = current_time( 'Y-m-d' );
		$cache_key = 'hhc_bookings_' . $today;

		if ( ! $force ) {
			$cached = get_transient( $cache_key );
			if ( $cached !== false ) {
				wp_send_json_success( $cached );
				return;
			}
		}

		$api = new HHC_Newbook_API();

		// Query yesterday through +6 days to capture today's departures from prior arrivals
		$yesterday = date( 'Y-m-d', strtotime( $today . ' -1 day' ) );
		$end_date  = date( 'Y-m-d', strtotime( $today . ' +6 days' ) );

		$bookings_resp = $api->fetch_bookings_range( $yesterday, $end_date );
		if ( isset( $bookings_resp['error'] ) || ! isset( $bookings_resp['data'] ) ) {
			$msg = isset( $bookings_resp['error'] ) ? $bookings_resp['error'] : 'No booking data returned';
			wp_send_json_error( array( 'message' => $msg ) );
			return;
		}

		$sites_resp = $api->fetch_sites_list();
		$sites      = isset( $sites_resp['data'] ) ? $sites_resp['data'] : array();

		// Build category map and site→category lookup from the sites list
		$category_map     = array(); // cat_id => ['name' => ..., 'total_rooms' => ...]
		$site_to_cat      = array(); // site_id => cat_id

		foreach ( $sites as $site ) {
			$site_id  = isset( $site['site_id'] ) ? $site['site_id'] : '';
			$cat_id   = isset( $site['category_id'] ) ? (string) $site['category_id'] : 'unknown';
			$cat_name = isset( $site['category_name'] ) ? $site['category_name'] : 'Unknown';

			if ( ! empty( $site_id ) ) {
				$site_to_cat[ $site_id ] = $cat_id;
			}
			if ( ! isset( $category_map[ $cat_id ] ) ) {
				$category_map[ $cat_id ] = array( 'name' => $cat_name, 'total_rooms' => 0 );
			}
			$category_map[ $cat_id ]['total_rooms']++;
		}

		// 7-day window starting today
		$dates = array();
		for ( $i = 0; $i < 7; $i++ ) {
			$dates[] = date( 'Y-m-d', strtotime( $today . ' +' . $i . ' days' ) );
		}

		// day_data[$date][$cat_id] = ['departs'=>0, 'stays'=>0, 'arrivals'=>0, 'rooms'=>[]]
		$day_data = array();
		foreach ( $dates as $d ) {
			$day_data[ $d ] = array();
		}

		foreach ( $bookings_resp['data'] as $booking ) {
			$site_id = isset( $booking['site_id'] ) ? $booking['site_id'] : '';
			if ( empty( $site_id ) ) {
				continue;
			}

			// Resolve category — prefer data from booking, fall back to site lookup
			if ( isset( $booking['category_id'] ) && $booking['category_id'] !== '' ) {
				$cat_id   = (string) $booking['category_id'];
				$cat_name = isset( $booking['category_name'] ) ? $booking['category_name'] : 'Unknown';
			} elseif ( isset( $site_to_cat[ $site_id ] ) ) {
				$cat_id   = $site_to_cat[ $site_id ];
				$cat_name = isset( $category_map[ $cat_id ] ) ? $category_map[ $cat_id ]['name'] : 'Unknown';
			} else {
				$cat_id   = 'unknown';
				$cat_name = 'Unknown';
			}

			// Ensure this category appears in the map (may come from booking data not in sites_list)
			if ( ! isset( $category_map[ $cat_id ] ) ) {
				$category_map[ $cat_id ] = array( 'name' => $cat_name, 'total_rooms' => 0 );
			}

			$arrival_str   = isset( $booking['booking_arrival'] ) ? $booking['booking_arrival'] : '';
			$departure_str = isset( $booking['booking_departure'] ) ? $booking['booking_departure'] : '';
			if ( empty( $arrival_str ) || empty( $departure_str ) ) {
				continue;
			}

			$arrival_date   = date( 'Y-m-d', strtotime( $arrival_str ) );
			$departure_date = date( 'Y-m-d', strtotime( $departure_str ) );

			foreach ( $dates as $date ) {
				$is_arriving  = ( $arrival_date === $date );
				$is_departing = ( $departure_date === $date );
				$is_staying   = ( $arrival_date < $date && $departure_date > $date );

				if ( ! $is_arriving && ! $is_departing && ! $is_staying ) {
					continue;
				}

				if ( ! isset( $day_data[ $date ][ $cat_id ] ) ) {
					$day_data[ $date ][ $cat_id ] = array(
						'cat_name' => $cat_name,
						'departs'  => 0,
						'stays'    => 0,
						'arrivals' => 0,
						'rooms'    => array(),
					);
				}

				if ( $is_departing ) {
					$day_data[ $date ][ $cat_id ]['departs']++;
				}
				if ( $is_staying ) {
					$day_data[ $date ][ $cat_id ]['stays']++;
				}
				if ( $is_arriving ) {
					$day_data[ $date ][ $cat_id ]['arrivals']++;
				}
				// Unique room count — a back-to-back room counts as 1 unit of work
				$day_data[ $date ][ $cat_id ]['rooms'][ $site_id ] = true;
			}
		}

		// Apply saved category sort order
		$saved_order   = get_option( 'hhc_category_order', array() );
		$ordered_ids   = array();

		foreach ( $saved_order as $cat_id ) {
			if ( isset( $category_map[ $cat_id ] ) ) {
				$ordered_ids[] = $cat_id;
			}
		}
		foreach ( $category_map as $cat_id => $cat ) {
			if ( ! in_array( $cat_id, $ordered_ids, true ) ) {
				$ordered_ids[] = $cat_id;
			}
		}

		// Build output
		$categories_out = array();
		foreach ( $ordered_ids as $cat_id ) {
			if ( ! isset( $category_map[ $cat_id ] ) ) {
				continue;
			}
			$cat_days = array();
			foreach ( $dates as $date ) {
				if ( isset( $day_data[ $date ][ $cat_id ] ) ) {
					$d = $day_data[ $date ][ $cat_id ];
					$cat_days[ $date ] = array(
						'total_servicing' => count( $d['rooms'] ),
						'departs'         => $d['departs'],
						'stays'           => $d['stays'],
						'arrivals'        => $d['arrivals'],
					);
				} else {
					$cat_days[ $date ] = array(
						'total_servicing' => 0,
						'departs'         => 0,
						'stays'           => 0,
						'arrivals'        => 0,
					);
				}
			}

			$categories_out[] = array(
				'id'          => $cat_id,
				'name'        => $category_map[ $cat_id ]['name'],
				'total_rooms' => $category_map[ $cat_id ]['total_rooms'],
				'days'        => $cat_days,
			);
		}

		$result = array(
			'dates'      => $dates,
			'categories' => $categories_out,
		);

		set_transient( $cache_key, $result, 5 * MINUTE_IN_SECONDS );
		wp_send_json_success( $result );
	}

	public function get_settings() {
		$this->verify_public();

		$time_reqs = get_option( 'hhc_time_requirements', array() );
		$staff     = get_option( 'hhc_staff_data', array() );
		$tolerance = absint( get_option( 'hhc_tolerance_minutes', 30 ) );

		wp_send_json_success(
			array(
				'time_requirements' => $time_reqs,
				'staff_data'        => $staff,
				'tolerance_minutes' => $tolerance,
			)
		);
	}

	public function save_time_requirements() {
		$this->verify_public();

		$raw  = isset( $_POST['time_requirements'] ) ? $_POST['time_requirements'] : '';
		$data = json_decode( stripslashes( $raw ), true );

		if ( ! is_array( $data ) ) {
			wp_send_json_error( array( 'message' => 'Invalid data' ) );
			return;
		}

		$clean = array();
		foreach ( $data as $cat_id => $actions ) {
			$cat_id          = sanitize_text_field( $cat_id );
			$clean[ $cat_id ] = array(
				'depart' => isset( $actions['depart'] ) ? absint( $actions['depart'] ) : 0,
				'stay'   => isset( $actions['stay'] ) ? absint( $actions['stay'] ) : 0,
				'arrive' => isset( $actions['arrive'] ) ? absint( $actions['arrive'] ) : 0,
			);
		}

		update_option( 'hhc_time_requirements', $clean );
		wp_send_json_success( array( 'message' => 'Saved' ) );
	}

	public function save_staff_data() {
		$this->verify_public();

		$raw  = isset( $_POST['staff_data'] ) ? $_POST['staff_data'] : '';
		$data = json_decode( stripslashes( $raw ), true );

		if ( ! is_array( $data ) ) {
			wp_send_json_error( array( 'message' => 'Invalid data' ) );
			return;
		}

		$clean = array();
		foreach ( $data as $row ) {
			if ( ! isset( $row['name'] ) ) {
				continue;
			}
			$name  = sanitize_text_field( $row['name'] );
			$hours = array();
			if ( isset( $row['hours'] ) && is_array( $row['hours'] ) ) {
				foreach ( $row['hours'] as $date => $hrs ) {
					$date          = sanitize_text_field( $date );
					$hours[ $date ] = max( 0, floatval( $hrs ) );
				}
			}
			$clean[] = array( 'name' => $name, 'hours' => $hours );
		}

		update_option( 'hhc_staff_data', $clean );
		wp_send_json_success( array( 'message' => 'Saved' ) );
	}

	// -------------------------------------------------------------------------
	// Admin-only actions
	// -------------------------------------------------------------------------

	public function test_connection() {
		$this->verify_admin();
		$api    = new HHC_Newbook_API();
		$result = $api->test_connection();
		if ( $result['success'] ) {
			wp_send_json_success( $result );
		} else {
			wp_send_json_error( $result );
		}
	}

	public function fetch_categories() {
		$this->verify_admin();

		$api      = new HHC_Newbook_API();
		$response = $api->fetch_sites_list();

		if ( isset( $response['error'] ) || ! isset( $response['data'] ) ) {
			$msg = isset( $response['error'] ) ? $response['error'] : 'No data returned';
			wp_send_json_error( array( 'message' => $msg ) );
			return;
		}

		$cats = array();
		foreach ( $response['data'] as $site ) {
			$cat_id   = isset( $site['category_id'] ) ? (string) $site['category_id'] : 'unknown';
			$cat_name = isset( $site['category_name'] ) ? $site['category_name'] : 'Unknown';
			if ( ! isset( $cats[ $cat_id ] ) ) {
				$cats[ $cat_id ] = array( 'id' => $cat_id, 'name' => $cat_name, 'room_count' => 0 );
			}
			$cats[ $cat_id ]['room_count']++;
		}

		// Apply saved order, append any new categories
		$saved_order = get_option( 'hhc_category_order', array() );
		$ordered     = array();
		foreach ( $saved_order as $cat_id ) {
			if ( isset( $cats[ $cat_id ] ) ) {
				$ordered[] = $cats[ $cat_id ];
				unset( $cats[ $cat_id ] );
			}
		}
		foreach ( $cats as $cat ) {
			$ordered[] = $cat;
		}

		wp_send_json_success( array( 'categories' => $ordered ) );
	}

	public function save_category_order() {
		$this->verify_admin();

		$raw   = isset( $_POST['order'] ) ? $_POST['order'] : '';
		$order = json_decode( stripslashes( $raw ), true );

		if ( ! is_array( $order ) ) {
			wp_send_json_error( array( 'message' => 'Invalid data' ) );
			return;
		}

		$clean = array_map( 'sanitize_text_field', $order );
		update_option( 'hhc_category_order', $clean );
		wp_send_json_success( array( 'message' => 'Order saved' ) );
	}
}
