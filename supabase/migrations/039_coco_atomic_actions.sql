-- Atomic, service-role-only mutations used by CoCo.
-- Prevents booking races and vote counter drift under concurrent traffic.

CREATE OR REPLACE FUNCTION public.coco_create_booking(
  p_community_id uuid,
  p_amenity_id uuid,
  p_user_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id uuid;
BEGIN
  IF p_date < CURRENT_DATE OR p_start_time >= p_end_time THEN
    RAISE EXCEPTION 'INVALID_BOOKING_TIME';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.amenities
    WHERE id = p_amenity_id
      AND community_id = p_community_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'AMENITY_NOT_AVAILABLE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_user_id
      AND community_id = p_community_id
  ) THEN
    RAISE EXCEPTION 'USER_OUTSIDE_COMMUNITY';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_community_id::text || ':' || p_amenity_id::text || ':' || p_date::text, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM public.bookings
    WHERE community_id = p_community_id
      AND amenity_id = p_amenity_id
      AND date = p_date
      AND status <> 'cancelled'
      AND start_time < p_end_time
      AND end_time > p_start_time
  ) THEN
    RAISE EXCEPTION 'BOOKING_CONFLICT';
  END IF;

  INSERT INTO public.bookings (
    community_id,
    amenity_id,
    user_id,
    date,
    start_time,
    end_time,
    status
  ) VALUES (
    p_community_id,
    p_amenity_id,
    p_user_id,
    p_date,
    p_start_time,
    p_end_time,
    'confirmed'
  )
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.coco_cast_vote(
  p_community_id uuid,
  p_poll_id uuid,
  p_option_id uuid,
  p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vote_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_user_id
      AND community_id = p_community_id
      AND role = 'resident'
  ) THEN
    RAISE EXCEPTION 'RESIDENT_NOT_AUTHORIZED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_poll_id::text, 0));

  IF NOT EXISTS (
    SELECT 1
    FROM public.polls
    WHERE id = p_poll_id
      AND community_id = p_community_id
      AND status = 'active'
      AND end_date >= now()
  ) THEN
    RAISE EXCEPTION 'POLL_NOT_ACTIVE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.poll_options
    WHERE id = p_option_id
      AND poll_id = p_poll_id
  ) THEN
    RAISE EXCEPTION 'OPTION_OUTSIDE_POLL';
  END IF;

  INSERT INTO public.poll_votes (poll_id, option_id, user_id, community_id)
  VALUES (p_poll_id, p_option_id, p_user_id, p_community_id)
  RETURNING id INTO v_vote_id;

  UPDATE public.poll_options option_row
  SET votes = (
    SELECT count(*)::integer
    FROM public.poll_votes vote_row
    WHERE vote_row.option_id = option_row.id
  )
  WHERE option_row.id = p_option_id
    AND option_row.poll_id = p_poll_id;

  RETURN v_vote_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'ALREADY_VOTED';
END;
$$;

REVOKE ALL ON FUNCTION public.coco_create_booking(uuid, uuid, uuid, date, time, time) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coco_cast_vote(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coco_create_booking(uuid, uuid, uuid, date, time, time) TO service_role;
GRANT EXECUTE ON FUNCTION public.coco_cast_vote(uuid, uuid, uuid, uuid) TO service_role;
