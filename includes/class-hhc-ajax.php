<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class HHC_Ajax {

	public function __construct() {
		// Public AJAX — no login required (page access acts as the gate)
		$public_pairs = array(
			'hhc_get_bookings_data'      => 'get_bookings_data',
			'hhc_get_settings'           => 'get_settings',
			'hhc_save_time_requirements' => 'save_time_requirements',
			'hhc_save_staff_data'        => 'save_staff_data',
			'hhc_save_pickup_data'       => 'save_pickup_data',
			'hhc_save_general_tasks'     => 'save_general_tasks',
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

		$force     = ! empty( $_POST['force_refresh'] ) && $_POST['force_refresh'] === '1';
		$today     = current_time( 'Y-m-d' );
		$cache_key = 'hhc_bookings_' . $today;

		if ( ! $force ) {
			$cached = get_transient( $cache_key );
			if ( $cached !== false ) {
				wp_send_json_success( $cached );
				return;
			}
		}

		$api = new HHC_Newbook_API();

		// Fetch 8 days back through +6 days: prior week for pickup hints + this week
		$fetch_from = date( 'Y-m-d', strtotime( $today . ' -8 days' ) );
		$end_date   = date( 'Y-m-d', strtotime( $today . ' +6 days' ) );

		$bookings_resp = $api->fetch_bookings_range( $fetch_from, $end_date );
		if ( isset( $bookings_resp['error'] ) || ! isset( $bookings_resp['data'] ) ) {
			$msg = isset( $bookings_resp['error'] ) ? $bookings_resp['error'] : 'No booking data returned';
			wp_send_json_error( array( 'message' => $msg ) );
			return;
		}

		$sites_resp = $api->fetch_sites_list();
		$sites      = isset( $sites_resp['data'] ) ? $sites_resp['data'] : array();

		// category_id differs between sites_list and bookings_list for the same category.
		// Use normalised category_name as the stable grouping key throughout.
		$category_map = array(); // cat_key => ['name' => ..., 'total_rooms' => ...]
		$site_to_key  = array(); // site_id  => cat_key

		foreach ( $sites as $site ) {
			$site_id  = isset( $site['site_id'] ) ? $site['site_id'] : '';
			$cat_name = isset( $site['category_name'] ) ? trim( $site['category_name'] ) : 'Unknown';
			$cat_key  = strtolower( $cat_name );

			if ( ! empty( $site_id ) ) {
				$site_to_key[ $site_id ] = $cat_key;
			}
			if ( ! isset( $category_map[ $cat_key ] ) ) {
				$category_map[ $cat_key ] = array( 'name' => $cat_name, 'total_rooms' => 0 );
			}
			$category_map[ $cat_key ]['total_rooms']++;
		}

		// 7-day window starting today
		$dates = array();
		for ( $i = 0; $i < 7; $i++ ) {
			$dates[] = date( 'Y-m-d', strtotime( $today . ' +' . $i . ' days' ) );
		}

		// day_data[$date][$cat_key] = ['departs'=>0,'stays'=>0,'arrivals'=>0,'rooms'=>[]]
		$day_data = array();
		foreach ( $dates as $d ) {
			$day_data[ $d ] = array();
		}

		// prior_arrivals[$cat_key][$day_of_week] = [['arrival_date'=>..., 'placed_date'=>...], ...]
		// day_of_week: 0=Sun … 6=Sat (PHP date('w'))
		$prior_arrivals = array();

		$today_ts     = strtotime( $today );
		$yesterday_ts = $today_ts - 86400;

		foreach ( $bookings_resp['data'] as $booking ) {
			$site_id = isset( $booking['site_id'] ) ? $booking['site_id'] : '';
			if ( empty( $site_id ) ) {
				continue;
			}

			// Resolve category
			if ( ! empty( $booking['category_name'] ) ) {
				$cat_name = trim( $booking['category_name'] );
			} elseif ( isset( $site_to_key[ $site_id ] ) ) {
				$cat_key  = $site_to_key[ $site_id ];
				$cat_name = $category_map[ $cat_key ]['name'];
			} else {
				$cat_name = 'Unknown';
			}
			$cat_key = strtolower( $cat_name );

			if ( ! isset( $category_map[ $cat_key ] ) ) {
				$category_map[ $cat_key ] = array( 'name' => $cat_name, 'total_rooms' => 0 );
			}

			$arrival_str   = isset( $booking['booking_arrival'] ) ? $booking['booking_arrival'] : '';
			$departure_str = isset( $booking['booking_departure'] ) ? $booking['booking_departure'] : '';
			if ( empty( $arrival_str ) || empty( $departure_str ) ) {
				continue;
			}

			$arrival_date   = substr( $arrival_str, 0, 10 );
			$departure_date = substr( $departure_str, 0, 10 );
			$arrival_ts     = strtotime( $arrival_date );

			// ---- This-week day_data ----
			foreach ( $dates as $date ) {
				$is_arriving  = ( $arrival_date === $date );
				$is_departing = ( $departure_date === $date );
				$is_staying   = ( $arrival_date < $date && $departure_date > $date );

				if ( ! $is_arriving && ! $is_departing && ! $is_staying ) {
					continue;
				}

				if ( ! isset( $day_data[ $date ][ $cat_key ] ) ) {
					$day_data[ $date ][ $cat_key ] = array(
						'departs'  => 0,
						'stays'    => 0,
						'arrivals' => 0,
						'rooms'    => array(),
					);
				}

				if ( $is_departing ) { $day_data[ $date ][ $cat_key ]['departs']++; }
				if ( $is_staying )   { $day_data[ $date ][ $cat_key ]['stays']++; }
				if ( $is_arriving )  { $day_data[ $date ][ $cat_key ]['arrivals']++; }
				$day_data[ $date ][ $cat_key ]['rooms'][ $site_id ] = true;
			}

			// ---- Prior-week arrival pickup hints ----
			// Only consider arrivals that fell strictly before today
			if ( $arrival_ts >= $today_ts ) {
				continue;
			}

			$placed_str  = isset( $booking['booking_placed'] ) ? $booking['booking_placed'] : '';
			$placed_date = $placed_str ? substr( $placed_str, 0, 10 ) : '';
			if ( empty( $placed_date ) ) {
				continue;
			}

			$dow = (int) date( 'w', $arrival_ts ); // 0=Sun … 6=Sat

			if ( ! isset( $prior_arrivals[ $cat_key ] ) ) {
				$prior_arrivals[ $cat_key ] = array();
			}
			if ( ! isset( $prior_arrivals[ $cat_key ][ $dow ] ) ) {
				$prior_arrivals[ $cat_key ][ $dow ] = array();
			}
			$prior_arrivals[ $cat_key ][ $dow ][] = array(
				'arrival_date' => $arrival_date,
				'placed_date'  => $placed_date,
			);
		}

		// Apply saved sort order (stored as cat_keys), append any new categories
		$saved_order  = get_option( 'hhc_category_order', array() );
		$excluded     = get_option( 'hhc_excluded_categories', array() );
		$ordered_keys = array();
		foreach ( $saved_order as $key ) {
			if ( isset( $category_map[ $key ] ) ) {
				$ordered_keys[] = $key;
			}
		}
		foreach ( array_keys( $category_map ) as $key ) {
			if ( ! in_array( $key, $ordered_keys, true ) ) {
				$ordered_keys[] = $key;
			}
		}

		// Build output — skip excluded categories
		$categories_out = array();
		foreach ( $ordered_keys as $cat_key ) {
			if ( ! isset( $category_map[ $cat_key ] ) ) {
				continue;
			}
			if ( in_array( $cat_key, $excluded, true ) ) {
				continue;
			}
			$cat_days = array();
			foreach ( $dates as $date ) {
				$date_ts  = strtotime( $date );
				// Lead time = days from today until this date (0 = today, 1 = tomorrow …)
				$lead_days = (int) round( ( $date_ts - $today_ts ) / 86400 );
				$dow       = (int) date( 'w', $date_ts );

				// Count prior-week arrivals on the same weekday that were placed
				// within the same lead-time window (placed <= lead_days before arrival)
				$hint_count = 0;
				if ( isset( $prior_arrivals[ $cat_key ][ $dow ] ) ) {
					foreach ( $prior_arrivals[ $cat_key ][ $dow ] as $pa ) {
						$arr_ts    = strtotime( $pa['arrival_date'] );
						$placed_ts = strtotime( $pa['placed_date'] );
						$days_before = (int) round( ( $arr_ts - $placed_ts ) / 86400 );
						if ( $days_before <= $lead_days ) {
							$hint_count++;
						}
					}
				}

				if ( isset( $day_data[ $date ][ $cat_key ] ) ) {
					$d = $day_data[ $date ][ $cat_key ];
					$cat_days[ $date ] = array(
						'total_servicing' => count( $d['rooms'] ),
						'departs'         => $d['departs'],
						'stays'           => $d['stays'],
						'arrivals'        => $d['arrivals'],
						'pickup_hint'     => $hint_count,
						'pickup_lead'     => $lead_days,
					);
				} else {
					$cat_days[ $date ] = array(
						'total_servicing' => 0,
						'departs'         => 0,
						'stays'           => 0,
						'arrivals'        => 0,
						'pickup_hint'     => $hint_count,
						'pickup_lead'     => $lead_days,
					);
				}
			}

			$categories_out[] = array(
				'id'          => $cat_key,
				'name'        => $category_map[ $cat_key ]['name'],
				'total_rooms' => $category_map[ $cat_key ]['total_rooms'],
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

		$time_reqs   = get_option( 'hhc_time_requirements', array() );
		$staff       = get_option( 'hhc_staff_data', array() );
		$tolerance   = absint( get_option( 'hhc_tolerance_minutes', 30 ) );
		$pickup      = get_option( 'hhc_pickup_data', array() );
		$gen_tasks   = get_option( 'hhc_general_tasks', array() );

		// PHP empty arrays encode as JSON [] not {} — cast to object so JS receives {}
		if ( empty( $time_reqs ) ) { $time_reqs = new stdClass(); }
		if ( empty( $pickup ) )    { $pickup    = new stdClass(); }

		wp_send_json_success(
			array(
				'time_requirements' => $time_reqs,
				'staff_data'        => $staff,
				'tolerance_minutes' => $tolerance,
				'pickup_data'       => $pickup,
				'general_tasks'     => $gen_tasks,
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

	public function save_pickup_data() {
		$this->verify_public();

		$raw  = isset( $_POST['pickup_data'] ) ? $_POST['pickup_data'] : '';
		$data = json_decode( stripslashes( $raw ), true );

		if ( ! is_array( $data ) ) {
			wp_send_json_error( array( 'message' => 'Invalid data' ) );
			return;
		}

		$clean = array();
		foreach ( $data as $cat_id => $dates ) {
			$cat_id = sanitize_text_field( $cat_id );
			if ( ! is_array( $dates ) ) { continue; }
			$clean[ $cat_id ] = array();
			foreach ( $dates as $date => $vals ) {
				$date = sanitize_text_field( $date );
				$clean[ $cat_id ][ $date ] = array(
					'count' => absint( isset( $vals['count'] ) ? $vals['count'] : 0 ),
					'total' => absint( isset( $vals['total'] ) ? $vals['total'] : 0 ),
				);
			}
		}

		update_option( 'hhc_pickup_data', $clean );
		wp_send_json_success( array( 'message' => 'Saved' ) );
	}

	public function save_general_tasks() {
		$this->verify_public();

		$raw  = isset( $_POST['general_tasks'] ) ? $_POST['general_tasks'] : '';
		$data = json_decode( stripslashes( $raw ), true );

		if ( ! is_array( $data ) ) {
			wp_send_json_error( array( 'message' => 'Invalid data' ) );
			return;
		}

		$days  = array( 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun' );
		$clean = array();
		foreach ( $data as $task ) {
			if ( ! isset( $task['name'] ) ) { continue; }
			$name = sanitize_text_field( $task['name'] );
			if ( empty( $name ) ) { continue; }
			$hrs = array();
			foreach ( $days as $day ) {
				$hrs[ $day ] = absint( isset( $task['hours'][ $day ] ) ? $task['hours'][ $day ] : 0 );
			}
			$clean[] = array( 'name' => $name, 'hours' => $hrs );
		}

		update_option( 'hhc_general_tasks', $clean );
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

		// Key by normalised name — same reason as get_bookings_data()
		$cats = array();
		foreach ( $response['data'] as $site ) {
			$cat_name = isset( $site['category_name'] ) ? trim( $site['category_name'] ) : 'Unknown';
			$cat_key  = strtolower( $cat_name );
			if ( ! isset( $cats[ $cat_key ] ) ) {
				$cats[ $cat_key ] = array( 'id' => $cat_key, 'name' => $cat_name, 'room_count' => 0 );
			}
			$cats[ $cat_key ]['room_count']++;
		}

		// Apply saved order, append any new categories
		$saved_order = get_option( 'hhc_category_order', array() );
		$excluded    = get_option( 'hhc_excluded_categories', array() );
		$ordered     = array();
		foreach ( $saved_order as $key ) {
			if ( isset( $cats[ $key ] ) ) {
				$cats[ $key ]['excluded'] = in_array( $key, $excluded, true );
				$ordered[] = $cats[ $key ];
				unset( $cats[ $key ] );
			}
		}
		foreach ( $cats as $key => $cat ) {
			$cat['excluded'] = in_array( $key, $excluded, true );
			$ordered[]       = $cat;
		}

		wp_send_json_success( array( 'categories' => $ordered ) );
	}

	public function save_category_order() {
		$this->verify_admin();

		$raw   = isset( $_POST['order'] ) ? $_POST['order'] : '';
		$order = json_decode( stripslashes( $raw ), true );

		$raw_excl = isset( $_POST['excluded'] ) ? $_POST['excluded'] : '';
		$excl     = json_decode( stripslashes( $raw_excl ), true );

		if ( ! is_array( $order ) ) {
			wp_send_json_error( array( 'message' => 'Invalid data' ) );
			return;
		}

		$clean_order = array_map( 'sanitize_text_field', $order );
		$clean_excl  = is_array( $excl ) ? array_map( 'sanitize_text_field', $excl ) : array();

		update_option( 'hhc_category_order', $clean_order );
		update_option( 'hhc_excluded_categories', $clean_excl );
		wp_send_json_success( array( 'message' => 'Saved' ) );
	}
}
