-- Keep the demo useful even when a fresh project has no shared spaces yet.

INSERT INTO amenities (
  id,
  name,
  description,
  max_capacity,
  hourly_rate,
  icon_name,
  gradient,
  community_id
)
VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    'Quincho Panorámico',
    'Espacio equipado para reuniones familiares y celebraciones pequeñas.',
    18,
    12000,
    'Flame',
    'from-orange-500 to-red-600',
    '00000000-0000-0000-0000-000000000000'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'Piscina',
    'Reserva turnos para uso ordenado de la piscina comunitaria.',
    24,
    0,
    'Waves',
    'from-cyan-400 to-blue-600',
    '00000000-0000-0000-0000-000000000000'
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    'Sala Multiuso',
    'Ideal para cumpleaños, reuniones de comité y actividades vecinales.',
    30,
    8000,
    'PartyPopper',
    'from-fuchsia-500 to-pink-600',
    '00000000-0000-0000-0000-000000000000'
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    'Gimnasio',
    'Bloques de entrenamiento para evitar sobrecupo en horas punta.',
    10,
    0,
    'Dumbbell',
    'from-emerald-400 to-teal-600',
    '00000000-0000-0000-0000-000000000000'
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  max_capacity = EXCLUDED.max_capacity,
  hourly_rate = EXCLUDED.hourly_rate,
  icon_name = EXCLUDED.icon_name,
  gradient = EXCLUDED.gradient,
  community_id = EXCLUDED.community_id;
