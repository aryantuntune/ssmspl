-- ============================================================
-- SSMSPL – Production Seed Data (All-in-One)
-- ============================================================
-- Sources:
--   Branches/Routes/Schedules: actual CSV timing files
--   Item Rates: actual CSV rate files per route
--   Items: items master list
--   Boats, Users, Company, Payment Modes: operational defaults
--
-- Prerequisites: Run ddl.sql first on a clean database.
-- Default password for seed superadmin: Password@123
-- IMPORTANT: Change password before deploying to production!
-- ============================================================

BEGIN;

-- ============================================================
-- 1. BRANCHES (14)
-- ============================================================
INSERT INTO branches (id, name, address, contact_nos, latitude, longitude, sf_after, sf_before, last_ticket_no, last_booking_no, is_active)
VALUES
    (101, 'DABHOL',     'Dabhol, Maharashtra 415706',                                                    '02348-248900, 9767248900', 17.586058130000001, 73.177510299999994, '22:15:00', '06:00:00', 0, 0, TRUE),
    (102, 'DHOPAVE',    'Dhopave, Maharashtra 415634',                                                   '7709250800',               17.580611230000000, 73.181980450000000, '22:15:00', '06:00:00', 0, 0, TRUE),
    (103, 'VESHVI',     'Fanas, Bankot, Maharashtra 415208',                                             '02350-223300, 8767980300', 17.991896250000000, 73.060650880000000, '22:15:00', '06:00:00', 0, 0, TRUE),
    (104, 'BAGMANDALE', 'Bagmandla, Maharashtra 402114',                                                 '9322819161',               17.982583520000000, 73.062374420000000, '22:15:00', '06:00:00', 0, 0, TRUE),
    (105, 'JAIGAD',     'Maharashtra State Highway 4, Jaigad, Maharashtra',                              '02354-242500, 8550999884', 17.294506860000000, 73.239508200000000, '22:15:00', '06:00:00', 0, 0, TRUE),
    (106, 'TAVSAL',     'Tavsal, Guhagar, Tavasal, Maharashtra 415703',                                  '8550999880',               17.292074440000000, 73.223632300000000, '22:15:00', '06:00:00', 0, 0, TRUE),
    (107, 'AGARDANDA',  'Rajapuri Creek, Agardanda, Maharashtra 402401',                                 '8550999887',               18.264839040000000, 72.973455290000000, '22:15:00', '06:00:00', 0, 0, TRUE),
    (108, 'DIGHI',      'Dighi, Maharashtra',                                                            '9156546700',               18.274628490000000, 72.993665240000000, '22:15:00', '06:00:00', 0, 0, TRUE),
    (109, 'VASAI',      'Police Colony, Naigaon West, Naigaon, Vasai-Virar, Maharashtra 401201',         '8624063900',               19.318682690000000, 72.850771390000000, '22:15:00', '06:00:00', 0, 0, TRUE),
    (110, 'BHAYANDER',  'Bhayandar, Jai Ambe Nagar, Bhayandar West, Mira Bhayandar, Maharashtra 401101','8600314710',               19.332657980000000, 72.819967780000000, '22:15:00', '06:00:00', 0, 0, TRUE),
    (111, 'AMBET',      'Ambet, Maharashtra',                                                            '',                         17.550000000000000, 73.200000000000000, '00:30:00', '06:00:00', 0, 0, TRUE),
    (112, 'MHAPRAL',    'Mhapral, Maharashtra',                                                          '',                         17.545000000000000, 73.195000000000000, '00:30:00', '06:00:00', 0, 0, TRUE),
    (113, 'VIRAR',      'Virar, Vasai-Virar, Maharashtra',                                               '',                         19.455000000000000, 72.811000000000000, '22:15:00', '06:00:00', 0, 0, TRUE),
    (114, 'SAFALE',     'Safale (Jalsar), Maharashtra',                                                  '',                         19.545000000000000, 72.844000000000000, '22:15:00', '06:00:00', 0, 0, TRUE)
ON CONFLICT (name) DO UPDATE SET
    address     = EXCLUDED.address,
    contact_nos = EXCLUDED.contact_nos,
    latitude    = EXCLUDED.latitude,
    longitude   = EXCLUDED.longitude,
    sf_after    = EXCLUDED.sf_after,
    sf_before   = EXCLUDED.sf_before,
    is_active   = EXCLUDED.is_active,
    updated_at  = NOW();

-- ============================================================
-- 2. ROUTES (7)
-- ============================================================
INSERT INTO routes (id, branch_id_one, branch_id_two, is_active)
VALUES
    (1, 101, 102, TRUE),   -- DABHOL <-> DHOPAVE
    (2, 103, 104, TRUE),   -- VESHVI <-> BAGMANDALE
    (3, 105, 106, TRUE),   -- JAIGAD <-> TAVSAL
    (4, 107, 108, TRUE),   -- AGARDANDA <-> DIGHI
    (5, 110, 109, TRUE),   -- BHAYANDER <-> VASAI
    (6, 111, 112, TRUE),   -- AMBET <-> MHAPRAL
    (7, 113, 114, TRUE)    -- VIRAR <-> SAFALE (JALSAR)
ON CONFLICT (id) DO UPDATE SET
    branch_id_one = EXCLUDED.branch_id_one,
    branch_id_two = EXCLUDED.branch_id_two,
    is_active     = EXCLUDED.is_active,
    updated_at    = NOW();

-- ============================================================
-- 3. USERS (superadmin only — Password@123)
-- ============================================================
INSERT INTO users (id, email, username, full_name, hashed_password, role, is_active, is_verified)
VALUES
    (uuid_generate_v4(), 'superadmin@ssmspl.com', 'superadmin', 'Super Administrator',
     '$2b$12$40jxkhNDTRR7btlgX0mTIuom3jXuB3r5OT0J2dh0ep5Q3iK3YDUD.', 'SUPER_ADMIN', TRUE, TRUE)
ON CONFLICT (username) DO NOTHING;

-- ============================================================
-- 4. BOATS (12)
-- ============================================================
-- Source of truth: data/Ferry location details 30.03.2026.pdf
-- route_id maps each vessel to its operating route corridor:
--   VESAV-BAGMANDALE = route 2, VASAI-BHAYANDER = route 5,
--   DABHOL-DHOPAVE = route 1, DIGHI-AGARDANDA = route 4,
--   JAIGAD-TAVSAL = route 3, VIRAR-SAPHALE = route 7
INSERT INTO boats (id, name, no, is_active, route_id)
VALUES
    (1,  'SHANTADURGA', 'RTN-IV-03-00001', TRUE, 2),
    (2,  'SONIA',       'RTN-IV-03-00007', TRUE, 5),
    (3,  'PRIYANKA',    'RTN-IV-08-00010', TRUE, 1),
    (4,  'SUPRIYA',     'RTN-IV-08-00011', TRUE, 1),
    (5,  'AISHWARYA',   'RTN-IV-08-00030', TRUE, 4),
    (6,  'AVANTIKA',    'RTN-IV-03-00082', TRUE, 2),
    (7,  'ISHWARI',     'RTN-IV-118',      TRUE, 3),
    (8,  'VAIBHAVI',    'RTN-IV-124',      TRUE, 5),
    (9,  'AAROHI',      'RTN-IV-125',      TRUE, 7),
    (10, 'GIRIJA',      'RTN-IV-136',      TRUE, 7),
    (11, 'JANHVI',      'RTN-IV-137',      TRUE, 2),
    (12, 'DEVIKA',      'RTN-IV-159',      TRUE, 1)
ON CONFLICT (name) DO UPDATE SET
    no         = EXCLUDED.no,
    route_id   = EXCLUDED.route_id,
    is_active  = EXCLUDED.is_active,
    updated_at = NOW();

-- ============================================================
-- 5. ITEMS — V2 (21 items, per PDF "NEW ITEM ID & RATE")
--    Migrated from V1 (49 items) on 2026-03-29.
--    Historical V1 item names are preserved in ticket_items.item_name_snapshot.
-- ============================================================
INSERT INTO items (id, name, short_name, online_visiblity, is_vehicle, is_active)
VALUES
    -- Vehicles
    (1,  'CYCLE',                                         'CYCLE',                TRUE,  TRUE,  TRUE),
    (2,  'MOTOR CYCLE WITH DRIVER',                       'MOTORCYCLE W/ DRIVER', TRUE,  TRUE,  TRUE),
    (3,  'EMPTY 3 WHLR RICKSHAW',                        '3 WHLR RICKSHAW',      TRUE,  TRUE,  TRUE),
    (4,  'MAGIC/IRIS/CAR',                               'MAGIC/IRIS/CAR',       TRUE,  TRUE,  TRUE),
    (5,  'LUX CAR 5 ST/SUMO/SCORPIO/TAVERA 7 ST',       'LUX CAR/SUMO',         TRUE,  TRUE,  TRUE),
    (6,  'AMBULANCE',                                     'AMBULANCE',            TRUE,  TRUE,  TRUE),
    (7,  'T.T/407/709/18 & 21 ST BUS',                  'TT/407/709/BUS',       TRUE,  TRUE,  TRUE),
    (8,  'BUS/TRUCK/TANKER',                             'BUS/TRUCK/TANKER',     TRUE,  TRUE,  TRUE),
    (9,  'TRUCK 10 WHLR/JCB',                           'TRUCK 10 WHLR/JCB',   TRUE,  TRUE,  TRUE),
    (10, 'TRACTOR WITH TROLLY',                          'TRACTOR W/ TROLLY',    TRUE,  TRUE,  TRUE),
    -- Passengers
    (11, 'PASSENGER ADULT ABOVE 12 YR',                  'PASSENGER ADULT',      TRUE,  FALSE, TRUE),
    (12, 'PASSENGER CHILD 3-12 YR',                     'PASSENGER CHILD',      TRUE,  FALSE, TRUE),
    -- Goods / livestock / luggage
    (13, 'GOODS PER HALF TON',                          'GOODS/HALF TON',       TRUE,  FALSE, TRUE),
    (14, 'PASS LUG ABV 20KG PER KG',                   'LUGGAGE ABV 20KG/KG',  TRUE,  FALSE, TRUE),
    (15, 'DOG/GOATS/SHEEP & FISH/CHICKEN/BIRDS/FRUITS', 'ANIMALS & GOODS',      TRUE,  FALSE, TRUE),
    (16, 'COWS/BUFFELLOW (PER NO)',                     'COWS/BUFFALO',         TRUE,  FALSE, TRUE),
    -- Tourist / passes / special
    (17, 'TOURIST (FOR 1 HOUR)',                        'TOURIST 1HR',          TRUE,  FALSE, TRUE),
    (18, 'MONTH PASS STUDENT UPTO 7TH',                 'STDNT PASS UPTO 7TH',  FALSE, FALSE, TRUE),
    (19, 'MONTH PASS STUDENT ABOVE XTH',                'STDNT PASS ABOVE XTH', FALSE, FALSE, TRUE),
    (20, 'MONTH PASS PASSENGER',                        'PASSENGER MONTH PASS',  FALSE, FALSE, TRUE),
    (21, 'SPECIAL FERRY',                               'SPECIAL FERRY',         FALSE, FALSE, TRUE)
ON CONFLICT (id) DO UPDATE SET
    name              = EXCLUDED.name,
    short_name        = EXCLUDED.short_name,
    online_visiblity  = EXCLUDED.online_visiblity,
    is_vehicle        = EXCLUDED.is_vehicle,
    is_active         = EXCLUDED.is_active,
    updated_at        = NOW();

-- ============================================================
-- 6. PAYMENT MODES
-- ============================================================
INSERT INTO payment_modes (id, description, is_active, show_at_pos)
VALUES
    (1, 'Cash',   TRUE,  TRUE),
    (2, 'UPI',    TRUE,  TRUE),
    (3, 'Card',   TRUE,  TRUE),
    (4, 'Online', TRUE,  FALSE)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 7. FERRY SCHEDULES — actual times from CSV timing files
-- ============================================================
INSERT INTO ferry_schedules (id, branch_id, departure)
VALUES
    -- --------------------------------------------------------
    -- DABHOL (101) — 21 departures
    -- --------------------------------------------------------
    (1,   101, '06:30'), (2,   101, '07:15'), (3,   101, '08:15'), (4,   101, '09:00'),
    (5,   101, '09:45'), (6,   101, '10:30'), (7,   101, '11:15'), (8,   101, '12:00'),
    (9,   101, '12:40'), (10,  101, '13:35'), (11,  101, '14:15'), (12,  101, '15:00'),
    (13,  101, '15:45'), (14,  101, '16:30'), (15,  101, '17:15'), (16,  101, '18:00'),
    (17,  101, '18:45'), (18,  101, '19:30'), (19,  101, '20:15'), (20,  101, '21:00'),
    (21,  101, '22:00'),

    -- --------------------------------------------------------
    -- DHOPAVE (102) — 21 departures
    -- --------------------------------------------------------
    (22,  102, '06:45'), (23,  102, '07:30'), (24,  102, '08:30'), (25,  102, '09:15'),
    (26,  102, '10:00'), (27,  102, '10:45'), (28,  102, '11:30'), (29,  102, '12:15'),
    (30,  102, '12:50'), (31,  102, '13:45'), (32,  102, '14:30'), (33,  102, '15:15'),
    (34,  102, '16:00'), (35,  102, '16:45'), (36,  102, '17:30'), (37,  102, '18:15'),
    (38,  102, '19:00'), (39,  102, '19:45'), (40,  102, '20:30'), (41,  102, '21:15'),
    (42,  102, '22:10'),

    -- --------------------------------------------------------
    -- VESHVI (103) — 16 departures
    -- --------------------------------------------------------
    (43,  103, '07:00'), (44,  103, '08:00'), (45,  103, '09:00'), (46,  103, '10:00'),
    (47,  103, '11:00'), (48,  103, '12:00'), (49,  103, '13:00'), (50,  103, '14:15'),
    (51,  103, '15:00'), (52,  103, '16:00'), (53,  103, '17:00'), (54,  103, '18:00'),
    (55,  103, '19:00'), (56,  103, '20:00'), (57,  103, '21:00'), (58,  103, '22:00'),

    -- --------------------------------------------------------
    -- BAGMANDALE (104) — 16 departures
    -- --------------------------------------------------------
    (59,  104, '07:30'), (60,  104, '08:30'), (61,  104, '09:30'), (62,  104, '10:30'),
    (63,  104, '11:30'), (64,  104, '12:30'), (65,  104, '13:30'), (66,  104, '14:30'),
    (67,  104, '15:30'), (68,  104, '16:30'), (69,  104, '17:30'), (70,  104, '18:30'),
    (71,  104, '19:30'), (72,  104, '20:30'), (73,  104, '21:30'), (74,  104, '22:10'),

    -- --------------------------------------------------------
    -- JAIGAD (105) — 15 departures
    -- --------------------------------------------------------
    (75,  105, '07:00'), (76,  105, '08:00'), (77,  105, '09:00'), (78,  105, '10:00'),
    (79,  105, '11:00'), (80,  105, '12:00'), (81,  105, '13:00'), (82,  105, '14:15'),
    (83,  105, '16:00'), (84,  105, '17:00'), (85,  105, '18:00'), (86,  105, '19:00'),
    (87,  105, '20:00'), (88,  105, '21:00'), (89,  105, '22:00'),

    -- --------------------------------------------------------
    -- TAVSAL (106) — 15 departures
    -- --------------------------------------------------------
    (90,  106, '06:40'), (91,  106, '07:40'), (92,  106, '08:30'), (93,  106, '09:40'),
    (94,  106, '10:40'), (95,  106, '11:40'), (96,  106, '12:40'), (97,  106, '14:00'),
    (98,  106, '15:40'), (99,  106, '16:40'), (100, 106, '17:40'), (101, 106, '18:40'),
    (102, 106, '19:40'), (103, 106, '20:40'), (104, 106, '21:40'),

    -- --------------------------------------------------------
    -- AGARDANDA (107) — 13 departures
    -- --------------------------------------------------------
    (105, 107, '08:00'), (106, 107, '09:00'), (107, 107, '10:00'), (108, 107, '11:00'),
    (109, 107, '12:00'), (110, 107, '13:00'), (111, 107, '14:30'), (112, 107, '15:30'),
    (113, 107, '16:30'), (114, 107, '17:30'), (115, 107, '18:30'), (116, 107, '19:00'),
    (117, 107, '20:30'),

    -- --------------------------------------------------------
    -- DIGHI (108) — 13 departures
    -- --------------------------------------------------------
    (118, 108, '08:00'), (119, 108, '09:00'), (120, 108, '10:00'), (121, 108, '11:00'),
    (122, 108, '12:00'), (123, 108, '13:00'), (124, 108, '14:30'), (125, 108, '15:30'),
    (126, 108, '16:30'), (127, 108, '17:30'), (128, 108, '18:30'), (129, 108, '19:30'),
    (130, 108, '21:00'),

    -- --------------------------------------------------------
    -- VASAI (109) — 15 departures
    -- --------------------------------------------------------
    (131, 109, '06:45'), (132, 109, '08:15'), (133, 109, '09:30'), (134, 109, '10:30'),
    (135, 109, '11:15'), (136, 109, '12:00'), (137, 109, '12:45'), (138, 109, '14:15'),
    (139, 109, '15:00'), (140, 109, '15:45'), (141, 109, '16:30'), (142, 109, '17:15'),
    (143, 109, '18:00'), (144, 109, '18:45'), (145, 109, '20:15'),

    -- --------------------------------------------------------
    -- BHAYANDER (110) — 15 departures
    -- --------------------------------------------------------
    (146, 110, '07:30'), (147, 110, '09:30'), (148, 110, '10:30'), (149, 110, '11:15'),
    (150, 110, '12:00'), (151, 110, '12:45'), (152, 110, '14:15'), (153, 110, '15:00'),
    (154, 110, '15:45'), (155, 110, '16:30'), (156, 110, '17:15'), (157, 110, '18:00'),
    (158, 110, '18:45'), (159, 110, '19:30'), (160, 110, '21:00'),

    -- --------------------------------------------------------
    -- AMBET (111) — 19 departures
    -- --------------------------------------------------------
    (161, 111, '06:15'), (162, 111, '07:15'), (163, 111, '08:15'), (164, 111, '09:15'),
    (165, 111, '10:15'), (166, 111, '11:15'), (167, 111, '12:15'), (168, 111, '13:15'),
    (169, 111, '14:15'), (170, 111, '15:15'), (171, 111, '16:15'), (172, 111, '17:15'),
    (173, 111, '18:15'), (174, 111, '19:15'), (175, 111, '20:15'), (176, 111, '21:15'),
    (177, 111, '22:15'), (178, 111, '23:15'), (179, 111, '00:15'),

    -- --------------------------------------------------------
    -- MHAPRAL (112) — 19 departures
    -- --------------------------------------------------------
    (180, 112, '06:00'), (181, 112, '07:00'), (182, 112, '08:00'), (183, 112, '09:00'),
    (184, 112, '10:00'), (185, 112, '11:00'), (186, 112, '12:00'), (187, 112, '13:00'),
    (188, 112, '14:00'), (189, 112, '15:00'), (190, 112, '16:00'), (191, 112, '17:00'),
    (192, 112, '18:00'), (193, 112, '19:00'), (194, 112, '20:00'), (195, 112, '21:00'),
    (196, 112, '22:00'), (197, 112, '23:00'), (198, 112, '00:00'),

    -- --------------------------------------------------------
    -- VIRAR (113) — 21 departures
    -- --------------------------------------------------------
    (199, 113, '06:30'), (200, 113, '07:30'), (201, 113, '08:15'), (202, 113, '09:00'),
    (203, 113, '09:45'), (204, 113, '10:30'), (205, 113, '11:15'), (206, 113, '12:00'),
    (207, 113, '12:40'), (208, 113, '13:35'), (209, 113, '14:15'), (210, 113, '15:00'),
    (211, 113, '15:45'), (212, 113, '16:30'), (213, 113, '17:15'), (214, 113, '18:00'),
    (215, 113, '18:45'), (216, 113, '19:30'), (217, 113, '20:15'), (218, 113, '21:00'),
    (219, 113, '22:00'),

    -- --------------------------------------------------------
    -- SAFALE / JALSAR (114) — 21 departures
    -- --------------------------------------------------------
    (220, 114, '06:45'), (221, 114, '07:45'), (222, 114, '08:30'), (223, 114, '09:15'),
    (224, 114, '10:00'), (225, 114, '10:45'), (226, 114, '11:30'), (227, 114, '12:15'),
    (228, 114, '12:50'), (229, 114, '13:45'), (230, 114, '14:30'), (231, 114, '15:15'),
    (232, 114, '16:00'), (233, 114, '16:45'), (234, 114, '17:30'), (235, 114, '18:15'),
    (236, 114, '19:00'), (237, 114, '19:45'), (238, 114, '20:30'), (239, 114, '21:15'),
    (240, 114, '22:10')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 8. ITEM RATES — actual per-route rates from CSV rate files
--    One rate per item per route (route-only pricing).
-- ============================================================
-- Column: (levy, rate, item_id, route_id, is_active)
-- V2: 21 items × 6 routes = 126 rows (route 6 AMBET-MHAPRAL unchanged below)
-- Source: PDF "NEW ITEM ID & RATE" — migrated 2026-03-29

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- ROUTE 1: DABHOL (101) <-> DHOPAVE (102) — 21 items
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
INSERT INTO item_rates (levy, rate, item_id, route_id, is_active)
VALUES
    ( 2.00,   13.00,  1, 1, TRUE),  -- Cycle
    ( 7.00,   58.00,  2, 1, TRUE),  -- Motor Cycle With Driver
    ( 9.00,   81.00,  3, 1, TRUE),  -- Empty 3-Wheeler Rickshaw
    (17.00,  163.00,  4, 1, TRUE),  -- Magic/Iris/Car
    (19.00,  181.00,  5, 1, TRUE),  -- Lux Car/Sumo/Scorpio/Tavera 7 St
    ( 0.00,  180.00,  6, 1, TRUE),  -- Ambulance
    (25.00,  225.00,  7, 1, TRUE),  -- T.T/407/709/18 & 21 St Bus
    (40.00,  360.00,  8, 1, TRUE),  -- Bus/Truck/Tanker
    (50.00,  500.00,  9, 1, TRUE),  -- Truck 10 Whlr/JCB
    (31.00,  319.00, 10, 1, TRUE),  -- Tractor With Trolly
    ( 2.00,   18.00, 11, 1, TRUE),  -- Passenger Adult Above 12 Yr
    ( 1.00,    9.00, 12, 1, TRUE),  -- Passenger Child 3-12 Yr
    ( 4.00,   36.00, 13, 1, TRUE),  -- Goods Per Half Ton
    ( 0.00,    1.00, 14, 1, TRUE),  -- Pass Lug Abv 20Kg Per Kg
    ( 2.00,   18.00, 15, 1, TRUE),  -- Dog/Goats/Sheep & Fish/Chicken/Birds/Fruits
    ( 5.00,   45.00, 16, 1, TRUE),  -- Cows/Buffellow (Per No)
    ( 3.00,   27.00, 17, 1, TRUE),  -- Tourist (For 1 Hour)
    (30.00,  270.00, 18, 1, TRUE),  -- Month Pass Student Upto 7th
    (40.00,  360.00, 19, 1, TRUE),  -- Month Pass Student Above Xth
    (60.00,  640.00, 20, 1, TRUE),  -- Month Pass Passenger
    ( 0.00,  500.00, 21, 1, TRUE)   -- Special Ferry
ON CONFLICT (item_id, route_id) DO UPDATE SET
    rate = EXCLUDED.rate, levy = EXCLUDED.levy, is_active = TRUE, updated_at = NOW();

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- ROUTE 2: VESHVI (103) <-> BAGMANDALE (104) — 21 items
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
INSERT INTO item_rates (levy, rate, item_id, route_id, is_active)
VALUES
    ( 2.00,   13.00,  1, 2, TRUE),
    ( 7.00,   58.00,  2, 2, TRUE),
    ( 9.00,   81.00,  3, 2, TRUE),
    (17.00,  163.00,  4, 2, TRUE),
    (19.00,  181.00,  5, 2, TRUE),
    ( 0.00,  180.00,  6, 2, TRUE),
    (25.00,  225.00,  7, 2, TRUE),
    (40.00,  360.00,  8, 2, TRUE),
    (50.00,  500.00,  9, 2, TRUE),
    (31.00,  319.00, 10, 2, TRUE),
    ( 2.00,   18.00, 11, 2, TRUE),
    ( 1.00,    9.00, 12, 2, TRUE),
    ( 4.00,   36.00, 13, 2, TRUE),
    ( 0.00,    1.00, 14, 2, TRUE),
    ( 2.00,   18.00, 15, 2, TRUE),
    ( 5.00,   45.00, 16, 2, TRUE),
    ( 3.00,   27.00, 17, 2, TRUE),
    (30.00,  270.00, 18, 2, TRUE),
    (40.00,  360.00, 19, 2, TRUE),
    (60.00,  640.00, 20, 2, TRUE),
    ( 0.00,  500.00, 21, 2, TRUE)
ON CONFLICT (item_id, route_id) DO UPDATE SET
    rate = EXCLUDED.rate, levy = EXCLUDED.levy, is_active = TRUE, updated_at = NOW();

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- ROUTE 3: JAIGAD (105) <-> TAVSAL (106) — 21 items
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
INSERT INTO item_rates (levy, rate, item_id, route_id, is_active)
VALUES
    ( 2.00,   18.00,  1, 3, TRUE),
    ( 7.00,   73.00,  2, 3, TRUE),
    (10.00,   95.00,  3, 3, TRUE),
    (18.00,  182.00,  4, 3, TRUE),
    (20.00,  205.00,  5, 3, TRUE),
    ( 0.00,  200.00,  6, 3, TRUE),
    (22.00,  238.00,  7, 3, TRUE),
    (40.00,  410.00,  8, 3, TRUE),
    (50.00,  550.00,  9, 3, TRUE),
    (27.00,  273.00, 10, 3, TRUE),
    ( 3.00,   27.00, 11, 3, TRUE),
    ( 2.00,   13.00, 12, 3, TRUE),
    ( 5.00,   45.00, 13, 3, TRUE),
    ( 0.00,    1.00, 14, 3, TRUE),
    ( 2.00,   23.00, 15, 3, TRUE),
    ( 6.00,   64.00, 16, 3, TRUE),
    ( 5.00,   45.00, 17, 3, TRUE),
    (50.00,  450.00, 18, 3, TRUE),
    (50.00,  550.00, 19, 3, TRUE),
    (120.00, 1180.00, 20, 3, TRUE),
    ( 0.00,  600.00, 21, 3, TRUE)
ON CONFLICT (item_id, route_id) DO UPDATE SET
    rate = EXCLUDED.rate, levy = EXCLUDED.levy, is_active = TRUE, updated_at = NOW();

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- ROUTE 4: DIGHI (108) <-> AGARDANDA (107) — 21 items
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
INSERT INTO item_rates (levy, rate, item_id, route_id, is_active)
VALUES
    ( 1.00,   10.00,  1, 4, TRUE),
    ( 5.00,   50.00,  2, 4, TRUE),
    ( 7.00,   68.00,  3, 4, TRUE),
    (14.00,  140.00,  4, 4, TRUE),
    (16.00,  160.00,  5, 4, TRUE),
    ( 0.00,  200.00,  6, 4, TRUE),
    (20.00,  200.00,  7, 4, TRUE),
    (30.00,  300.00,  8, 4, TRUE),
    (50.00,  400.00,  9, 4, TRUE),
    (20.00,  200.00, 10, 4, TRUE),
    ( 3.00,   27.00, 11, 4, TRUE),
    ( 2.00,   13.00, 12, 4, TRUE),
    ( 3.00,   30.00, 13, 4, TRUE),
    ( 0.00,    1.00, 14, 4, TRUE),
    ( 1.00,    9.00, 15, 4, TRUE),
    ( 5.00,   50.00, 16, 4, TRUE),
    ( 5.00,   45.00, 17, 4, TRUE),
    (50.00,  450.00, 18, 4, TRUE),
    (50.00,  550.00, 19, 4, TRUE),
    (120.00, 1180.00, 20, 4, TRUE),
    ( 0.00,  700.00, 21, 4, TRUE)
ON CONFLICT (item_id, route_id) DO UPDATE SET
    rate = EXCLUDED.rate, levy = EXCLUDED.levy, is_active = TRUE, updated_at = NOW();

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- ROUTE 5: VASAI (109) <-> BHAYANDAR (110) — 21 items
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
INSERT INTO item_rates (levy, rate, item_id, route_id, is_active)
VALUES
    ( 1.00,    9.00,  1, 5, TRUE),
    ( 6.00,   60.00,  2, 5, TRUE),
    (10.00,  100.00,  3, 5, TRUE),
    (20.00,  180.00,  4, 5, TRUE),
    (20.00,  180.00,  5, 5, TRUE),
    ( 0.00,  200.00,  6, 5, TRUE),
    (20.00,  200.00,  7, 5, TRUE),
    (30.00,  300.00,  8, 5, TRUE),
    (50.00,  500.00,  9, 5, TRUE),
    (20.00,  200.00, 10, 5, TRUE),
    ( 3.00,   27.00, 11, 5, TRUE),
    ( 2.00,   13.00, 12, 5, TRUE),
    ( 3.00,   27.00, 13, 5, TRUE),
    ( 0.00,    1.00, 14, 5, TRUE),
    ( 4.00,   36.00, 15, 5, TRUE),
    ( 5.00,   50.00, 16, 5, TRUE),
    ( 5.00,   55.00, 17, 5, TRUE),
    (50.00,  450.00, 18, 5, TRUE),
    (50.00,  550.00, 19, 5, TRUE),
    (100.00, 1000.00, 20, 5, TRUE),
    ( 0.00,  500.00, 21, 5, TRUE)
ON CONFLICT (item_id, route_id) DO UPDATE SET
    rate = EXCLUDED.rate, levy = EXCLUDED.levy, is_active = TRUE, updated_at = NOW();

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- ROUTE 6: AMBET (111) <-> MHAPRAL (112) — unchanged (not in PDF)
--   Rates retained from V1; item_ids reference surviving V1 items.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
INSERT INTO item_rates (levy, rate, item_id, route_id, is_active)
VALUES
    ( 1.00,   9.00,  1, 6, TRUE),   -- Cycle
    ( 5.00,  45.00,  2, 6, TRUE),   -- Motor Cycle With Driver
    ( 7.00,  68.00,  3, 6, TRUE),   -- Empty 3-Wheeler Rickshaw
    (14.00, 106.00,  4, 6, TRUE),   -- Magic/Iris/Car (was Empty Car 5 St)
    (14.00, 116.00,  5, 6, TRUE),   -- Lux Car/Sumo  (was Empty Lux Car)
    (14.00, 136.00,  7, 6, TRUE),   -- T.T/407/709   (was Tata 407)
    (25.00, 185.00,  8, 6, TRUE),   -- Bus/Truck/Tanker (was 709)
    (20.00, 155.00, 10, 6, TRUE),   -- Tractor With Trolly
    (30.00, 220.00,  8, 6, TRUE),   -- Bus/Truck/Tanker (was Passenger Bus)  [duplicate guard below]
    (50.00, 350.00,  9, 6, TRUE),   -- Truck 10 Whlr/JCB
    ( 3.00,  27.00, 13, 6, TRUE),   -- Goods Per Half Ton
    ( 2.00,   8.00, 11, 6, TRUE),   -- Passenger Adult
    ( 1.00,   4.00, 12, 6, TRUE),   -- Passenger Child
    ( 0.00,   1.00, 14, 6, TRUE),   -- Passenger Luggage per kg
    ( 1.00,   9.00, 15, 6, TRUE),   -- Animals & Goods
    ( 5.00,  45.00, 16, 6, TRUE),   -- Cows/Buffalo
    (20.00, 180.00, 18, 6, TRUE),   -- Month Pass Student Upto 7th
    (30.00, 270.00, 19, 6, TRUE),   -- Month Pass Student Above Xth
    ( 2.00,  18.00, 17, 6, TRUE),   -- Tourist
    ( 0.00, 150.00, 21, 6, TRUE)    -- Special Ferry
ON CONFLICT (item_id, route_id) DO UPDATE SET
    rate = EXCLUDED.rate, levy = EXCLUDED.levy, is_active = TRUE, updated_at = NOW();

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- ROUTE 7: VIRAR (113) <-> SAFALE / JALSAR (114) — 21 items
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
INSERT INTO item_rates (levy, rate, item_id, route_id, is_active)
VALUES
    ( 1.00,    9.00,  1, 7, TRUE),
    ( 6.00,   60.00,  2, 7, TRUE),
    (10.00,  100.00,  3, 7, TRUE),
    (20.00,  180.00,  4, 7, TRUE),
    (20.00,  180.00,  5, 7, TRUE),
    ( 0.00,  200.00,  6, 7, TRUE),
    (20.00,  200.00,  7, 7, TRUE),
    (30.00,  300.00,  8, 7, TRUE),
    (50.00,  500.00,  9, 7, TRUE),
    (20.00,  200.00, 10, 7, TRUE),
    ( 3.00,   27.00, 11, 7, TRUE),
    ( 2.00,   13.00, 12, 7, TRUE),
    ( 3.00,   27.00, 13, 7, TRUE),
    ( 0.00,    1.00, 14, 7, TRUE),
    ( 1.00,   10.00, 15, 7, TRUE),
    ( 5.00,   50.00, 16, 7, TRUE),
    ( 5.00,   55.00, 17, 7, TRUE),
    (50.00,  550.00, 18, 7, TRUE),
    (50.00,  600.00, 19, 7, TRUE),
    (100.00, 1000.00, 20, 7, TRUE),
    ( 0.00,  500.00, 21, 7, TRUE)
ON CONFLICT (item_id, route_id) DO UPDATE SET
    rate = EXCLUDED.rate, levy = EXCLUDED.levy, is_active = TRUE, updated_at = NOW();

-- ============================================================
-- 9. COMPANY
-- ============================================================
INSERT INTO company (id, name, short_name, reg_address, gst_no, pan_no, tan_no, cin_no, contact, email, sf_item_id, updated_at)
VALUES
    (1,
     'Suvarnadurga Shipping & Marine Services Pvt. Ltd.',
     'Suvarnadurga Shipping',
     'Dabhol FerryBoat Jetty, Dapoli, Dist. Ratnagiri, Maharashtra - 415712, India',
     'N/A',
     'N/A',
     'N/A',
     'N/A',
     '9767248900',
     'ssmsdapoli@rediffmail.com',
     34,
     NOW()
    )
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
SELECT 'Branches' AS entity, COUNT(*) AS total FROM branches;
SELECT 'Routes' AS entity, COUNT(*) AS total FROM routes;
SELECT 'Users' AS entity, COUNT(*) AS total FROM users;
SELECT 'Boats' AS entity, COUNT(*) AS total FROM boats;
SELECT 'Items' AS entity, COUNT(*) AS total FROM items;
SELECT 'Payment Modes' AS entity, COUNT(*) AS total FROM payment_modes;
SELECT 'Ferry Schedules' AS entity, COUNT(*) AS total FROM ferry_schedules;
SELECT 'Item Rates' AS entity, COUNT(*) AS total FROM item_rates;
SELECT r.id, b1.name AS branch_one, b2.name AS branch_two
  FROM routes r
  JOIN branches b1 ON b1.id = r.branch_id_one
  JOIN branches b2 ON b2.id = r.branch_id_two
  ORDER BY r.id;
