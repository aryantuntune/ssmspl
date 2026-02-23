-- ============================================================
-- SSMSPL - Branch-wise Schedules & Rates Seed Script
-- ============================================================
-- Sources: data/*_rates.csv, data/*_timing.csv
-- DO NOT RUN without first running ddl.sql and seed_data.sql
-- This script UPSERTs branches/routes, clears and re-inserts
-- items, ferry_schedules, and item_rates with actual CSV data.
-- ============================================================
--
-- WARNING: This script will NEVER touch these production tables:
--   users, bookings, booking_items, tickets, ticket_items,
--   ticket_payement, portal_users, refresh_tokens
--
-- It WILL clear and re-seed:
--   items, item_rates, ferry_schedules
-- It WILL upsert (insert or update):
--   branches, routes
-- ============================================================

BEGIN;

-- ============================================================
-- 1. BRANCHES — UPSERT all 14 branches
-- ============================================================
INSERT INTO branches (id, name, address, contact_nos, latitude, longitude, sf_after, sf_before, last_ticket_no, last_booking_no, is_active)
VALUES
    (101, 'DABHOL',     'Dabhol, Maharashtra 415706',                                                    '02348-248900, 9767248900', 17.586058130000001, 73.177510299999994, '22:15:00', '06:00:00', 14, 0, TRUE),
    (102, 'DHOPAVE',    'Dhopave, Maharashtra 415634',                                                   '7709250800',               17.580611230000000, 73.181980450000000, '22:15:00', '06:00:00',  0, 0, TRUE),
    (103, 'VESHVI',     'Fanas, Bankot, Maharashtra 415208',                                             '02350-223300, 8767980300', 17.991896250000000, 73.060650880000000, '22:15:00', '06:00:00',  1, 0, TRUE),
    (104, 'BAGMANDALE', 'Bagmandla, Maharashtra 402114',                                                 '9322819161',               17.982583520000000, 73.062374420000000, '22:15:00', '06:00:00',  0, 0, TRUE),
    (105, 'JAIGAD',     'Maharashtra State Highway 4, Jaigad, Maharashtra',                              '02354-242500, 8550999884', 17.294506860000000, 73.239508200000000, '22:15:00', '06:00:00',  0, 0, TRUE),
    (106, 'TAVSAL',     'Tavsal, Guhagar, Tavasal, Maharashtra 415703',                                  '8550999880',               17.292074440000000, 73.223632300000000, '22:15:00', '06:00:00',  0, 0, TRUE),
    (107, 'AGARDANDA',  'Rajapuri Creek, Agardanda, Maharashtra 402401',                                 '8550999887',               18.264839040000000, 72.973455290000000, '22:15:00', '06:00:00',  0, 0, TRUE),
    (108, 'DIGHI',      'Dighi, Maharashtra',                                                            '9156546700',               18.274628490000000, 72.993665240000000, '22:15:00', '06:00:00',  0, 0, TRUE),
    (109, 'VASAI',      'Police Colony, Naigaon West, Naigaon, Vasai-Virar, Maharashtra 401201',         '8624063900',               19.318682690000000, 72.850771390000000, '22:15:00', '06:00:00',  0, 0, TRUE),
    (110, 'BHAYANDER',  'Bhayandar, Jai Ambe Nagar, Bhayandar West, Mira Bhayandar, Maharashtra 401101','8600314710',               19.332657980000000, 72.819967780000000, '22:15:00', '06:00:00',  0, 0, TRUE),
    (111, 'AMBET',      'Ambet, Maharashtra',                                                            '',                         17.550000000000000, 73.200000000000000, '00:30:00', '06:00:00',  0, 0, TRUE),
    (112, 'MHAPRAL',    'Mhapral, Maharashtra',                                                          '',                         17.545000000000000, 73.195000000000000, '00:30:00', '06:00:00',  0, 0, TRUE),
    (113, 'VIRAR',      'Virar, Vasai-Virar, Maharashtra',                                               '',                         19.455000000000000, 72.811000000000000, '22:15:00', '06:00:00',  0, 0, TRUE),
    (114, 'SAFALE',     'Safale (Jalsar), Maharashtra',                                                  '',                         19.545000000000000, 72.844000000000000, '22:15:00', '06:00:00',  0, 0, TRUE)
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
-- 2. ROUTES — UPSERT all 7 routes
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
-- 3. CLEAR item_rates, ferry_schedules, items (safe to DELETE)
-- ============================================================
-- item_rates depends on items, so delete rates first
DELETE FROM item_rates;
DELETE FROM ferry_schedules;
DELETE FROM items;

-- ============================================================
-- 4. ITEMS — re-insert all items (from seed_data.sql items list)
-- ============================================================
INSERT INTO items (id, name, short_name, online_visiblity, is_vehicle, is_active)
VALUES
    -- Two-wheelers
    (1,   'CYCLE',                             'CYCLE',                     TRUE,  TRUE,  TRUE),
    (2,   'MOTOTR CYCLE WITH DRIVER.',         'MOTOTR CYCLE WITH DRIVER',  TRUE,  TRUE,  TRUE),
    (153, 'MOTERCYCLE BELO 100 CC',            'MOTERCYCLE BELO 100 CC',    TRUE,  TRUE,  TRUE),
    -- Three-wheelers
    (3,   'EMPTY 3 WHLR RICKSHAW',            'EMPTY 3 WHLR RICKSHAW',     TRUE,  TRUE,  TRUE),
    (4,   'EMPTY 3WHLR 5 ST RICKSHAW',        'EMPTY 3WHLR 5 TEMPO',       TRUE,  TRUE,  TRUE),
    -- Light vehicles
    (5,   'TATA MAGIC/MAXIMO 6 ST',           'TATA MAGIC/MAXIMO 6 ST',    TRUE,  TRUE,  TRUE),
    (6,   'TATA ACE/MAXIMO TEMPO',            'TATA ACE/MAXIMO TEMPO',     TRUE,  TRUE,  TRUE),
    (7,   'EMPTY CAR 5 ST',                   'EMPTY CAR 5 ST',            TRUE,  TRUE,  TRUE),
    (8,   'EMPTY LUX. CAR 5 ST',             'EMPTY LUX. CAR 5 ST',       TRUE,  TRUE,  TRUE),
    (9,   'SUMO/SCAPIO/TAVERA/INOVA 7 ST',   'SUMO/SCAPIO/TAVERA/INOVA',  TRUE,  TRUE,  TRUE),
    (10,  'TATA MOBILE/MAX PICKUP',           'TATA MOBILE/MAX PICKUP',    TRUE,  TRUE,  TRUE),
    -- Medium vehicles
    (13,  'AMBULANCE',                         'AMBULANCE',                 TRUE,  TRUE,  TRUE),
    (14,  'TEMPO TRAVELER/18 ST BUS',         'TEMPO TRAVELER/18 ST BUS',  TRUE,  TRUE,  TRUE),
    (15,  '407 TEMPO',                         '407 TEMPO',                 TRUE,  TRUE,  TRUE),
    (16,  'MINI BUS 21 ST',                   'MINI BUS 21 ST',            TRUE,  TRUE,  TRUE),
    (17,  'LODED 709',                         'LODED 709',                 TRUE,  TRUE,  TRUE),
    (18,  'MED.GOODS 6 WHLR  (709)',          'MED.GOODS 6 WHLR  (709',   TRUE,  TRUE,  TRUE),
    -- Heavy vehicles
    (19,  'LODED TRUCK',                       'LODED TRUCK',               TRUE,  TRUE,  TRUE),
    (20,  'PASSENGER BUS',                     'PASSENGER BUS',             TRUE,  TRUE,  TRUE),
    (21,  'TANKER /TRUCK',                     'TANKER/TRUCK',              TRUE,  TRUE,  TRUE),
    (22,  'TRUCK 10 WHLR',                    'TRUCK 10 WHLR',             TRUE,  TRUE,  TRUE),
    (32,  'JCB',                               'JCB',                       TRUE,  TRUE,  TRUE),
    (33,  'TRACTOR WITH TROLLY',              'TRACTOR WITH TROLLY',       TRUE,  TRUE,  TRUE),
    (154, 'EMPTY 14 WHEELER GOODS TRUCK',     'EMPTY 14 WHEELER GOODS TRUCK', TRUE, TRUE, TRUE),
    -- Heavy machinery
    (35,  'ROAD ROLLER',                       'ROAD ROLLER',               FALSE, TRUE,  TRUE),
    (36,  'HEAVY MACHINES',                    'HEAVY MACHINES',            FALSE, TRUE,  TRUE),
    (37,  'HYDRA',                             'HYDRA',                     FALSE, TRUE,  TRUE),
    (38,  'OIL TANKER',                        'OIL TANKER',                FALSE, TRUE,  TRUE),
    -- Passengers
    (11,  'PASSENGER ADULT ABOVE 12 YR',      'PASSENGER ADULT ABV 12 YR', TRUE,  FALSE, TRUE),
    (12,  'PASSENGER CHILD 3-12 YR',          'PASSENGER CHILD 3-12 YR',   TRUE,  FALSE, TRUE),
    (29,  'TOURIST (FOR 1 HOUR)',              'TOURIST (FOR 1 HOUR',       TRUE,  FALSE, TRUE),
    -- Monthly passes
    (27,  'MONTH PASS STUDNT UPTO 10TH STD.', 'MONTH PASS STDNT UPTO 10',  FALSE, FALSE, TRUE),
    (28,  'MONTH PASS STUDNT AVOVE XTH STD.', 'MONTH PASS STDNT ABOV 10',  FALSE, FALSE, TRUE),
    (30,  'MONTH PASS PASSENGER',              'MONTH PASS PASSENGER',      FALSE, FALSE, TRUE),
    -- Goods / livestock / luggage
    (23,  'GOODS PER HALF TON',               'GOODS PER HALF TON',        TRUE,  FALSE, TRUE),
    (24,  'PASSENGER LUGGABE ABV 20KG PER KG','PASSNGR LUGGAGE(ABV 20KG',  TRUE,  FALSE, TRUE),
    (151, 'LUGGAGE',                           'LUGGAGE',                   TRUE,  FALSE, TRUE),
    (25,  'DOG/GOATS/SHEEP (PER NO)',         'DOG/GOATS/SHEEP (PER NO',   TRUE,  FALSE, TRUE),
    (26,  'COWS/BUFFELLOW(PER NO)',           'COWS/BUFFELLOW(PER NO',     TRUE,  FALSE, TRUE),
    (31,  'FISH/CHICKEN/BIRDS/FRUITS',        'FISH/CHICKEN/BIRDS/FRUITS', TRUE,  FALSE, TRUE),
    -- Special services / charges
    (34,  'SPECIAL FERRY',                     'SPECIAL FERRY',             FALSE, FALSE, TRUE),
    (45,  'SPECIAL FERRY DAY',                'SPECIAL FERRY DAY',         FALSE, FALSE, TRUE),
    (39,  'WAITING CHARGES',                   'WAITING CHARGES',           FALSE, FALSE, TRUE),
    (40,  'PARTY',                             'PARTY',                     FALSE, FALSE, TRUE),
    (41,  'SHOOTING',                          'SHOOTING',                  FALSE, FALSE, TRUE),
    (42,  'PUMPE FILLING CHARGES',            'PUMPE FILLING CHARGES',     FALSE, FALSE, TRUE),
    (43,  'CAFE COUNTER',                     'CAFE COUNTER',              FALSE, FALSE, TRUE),
    (44,  'SHIPE TO SHORE',                   'SHIPE TO SHORE',            FALSE, FALSE, TRUE),
    (152, 'ROUND UP',                          'ROUND UP',                  FALSE, FALSE, TRUE);

-- ============================================================
-- 5. FERRY SCHEDULES — actual times from CSV timing files
-- ============================================================
-- Source CSV files (renamed): data/<route>_timing.csv
-- Each CSV has departure times for both branches on that route.
-- AM/PM times converted to 24-hour format.
-- ============================================================

INSERT INTO ferry_schedules (id, branch_id, departure)
VALUES
    -- --------------------------------------------------------
    -- DABHOL (101) — dabhol_dhopave_timing.csv "timing_from_dabhol"
    -- 21 departures: 6:30 AM to 10:00 PM
    -- --------------------------------------------------------
    (1,   101, '06:30'), (2,   101, '07:15'), (3,   101, '08:15'), (4,   101, '09:00'),
    (5,   101, '09:45'), (6,   101, '10:30'), (7,   101, '11:15'), (8,   101, '12:00'),
    (9,   101, '12:40'), (10,  101, '13:35'), (11,  101, '14:15'), (12,  101, '15:00'),
    (13,  101, '15:45'), (14,  101, '16:30'), (15,  101, '17:15'), (16,  101, '18:00'),
    (17,  101, '18:45'), (18,  101, '19:30'), (19,  101, '20:15'), (20,  101, '21:00'),
    (21,  101, '22:00'),

    -- --------------------------------------------------------
    -- DHOPAVE (102) — dabhol_dhopave_timing.csv "timing_from_dhopave"
    -- 21 departures: 6:45 AM to 10:10 PM
    -- --------------------------------------------------------
    (22,  102, '06:45'), (23,  102, '07:30'), (24,  102, '08:30'), (25,  102, '09:15'),
    (26,  102, '10:00'), (27,  102, '10:45'), (28,  102, '11:30'), (29,  102, '12:15'),
    (30,  102, '12:50'), (31,  102, '13:45'), (32,  102, '14:30'), (33,  102, '15:15'),
    (34,  102, '16:00'), (35,  102, '16:45'), (36,  102, '17:30'), (37,  102, '18:15'),
    (38,  102, '19:00'), (39,  102, '19:45'), (40,  102, '20:30'), (41,  102, '21:15'),
    (42,  102, '22:10'),

    -- --------------------------------------------------------
    -- VESHVI (103) — veshvi_bagmandale_timing.csv "timing_from_veshvi"
    -- 16 departures: 7:00 AM to 10:00 PM
    -- --------------------------------------------------------
    (43,  103, '07:00'), (44,  103, '08:00'), (45,  103, '09:00'), (46,  103, '10:00'),
    (47,  103, '11:00'), (48,  103, '12:00'), (49,  103, '13:00'), (50,  103, '14:15'),
    (51,  103, '15:00'), (52,  103, '16:00'), (53,  103, '17:00'), (54,  103, '18:00'),
    (55,  103, '19:00'), (56,  103, '20:00'), (57,  103, '21:00'), (58,  103, '22:00'),

    -- --------------------------------------------------------
    -- BAGMANDALE (104) — veshvi_bagmandale_timing.csv "timing_from_bagmandale"
    -- 16 departures: 7:30 AM to 10:10 PM
    -- --------------------------------------------------------
    (59,  104, '07:30'), (60,  104, '08:30'), (61,  104, '09:30'), (62,  104, '10:30'),
    (63,  104, '11:30'), (64,  104, '12:30'), (65,  104, '13:30'), (66,  104, '14:30'),
    (67,  104, '15:30'), (68,  104, '16:30'), (69,  104, '17:30'), (70,  104, '18:30'),
    (71,  104, '19:30'), (72,  104, '20:30'), (73,  104, '21:30'), (74,  104, '22:10'),

    -- --------------------------------------------------------
    -- JAIGAD (105) — jaigad_tawsal_timing.csv "timing_from_jaigad"
    -- 15 departures: 7:00 AM to 10:00 PM
    -- --------------------------------------------------------
    (75,  105, '07:00'), (76,  105, '08:00'), (77,  105, '09:00'), (78,  105, '10:00'),
    (79,  105, '11:00'), (80,  105, '12:00'), (81,  105, '13:00'), (82,  105, '14:15'),
    (83,  105, '16:00'), (84,  105, '17:00'), (85,  105, '18:00'), (86,  105, '19:00'),
    (87,  105, '20:00'), (88,  105, '21:00'), (89,  105, '22:00'),

    -- --------------------------------------------------------
    -- TAVSAL (106) — jaigad_tawsal_timing.csv "timing_from_tawsal"
    -- 15 departures: 6:40 AM to 9:40 PM
    -- --------------------------------------------------------
    (90,  106, '06:40'), (91,  106, '07:40'), (92,  106, '08:30'), (93,  106, '09:40'),
    (94,  106, '10:40'), (95,  106, '11:40'), (96,  106, '12:40'), (97,  106, '14:00'),
    (98,  106, '15:40'), (99,  106, '16:40'), (100, 106, '17:40'), (101, 106, '18:40'),
    (102, 106, '19:40'), (103, 106, '20:40'), (104, 106, '21:40'),

    -- --------------------------------------------------------
    -- AGARDANDA (107) — dighi_agardanda_timing.csv "timing_from_agardanda"
    -- 13 departures: 8:00 AM to 8:30 PM
    -- --------------------------------------------------------
    (105, 107, '08:00'), (106, 107, '09:00'), (107, 107, '10:00'), (108, 107, '11:00'),
    (109, 107, '12:00'), (110, 107, '13:00'), (111, 107, '14:30'), (112, 107, '15:30'),
    (113, 107, '16:30'), (114, 107, '17:30'), (115, 107, '18:30'), (116, 107, '19:00'),
    (117, 107, '20:30'),

    -- --------------------------------------------------------
    -- DIGHI (108) — dighi_agardanda_timing.csv "timing_from_dighi"
    -- 13 departures: 8:00 AM to 9:00 PM
    -- --------------------------------------------------------
    (118, 108, '08:00'), (119, 108, '09:00'), (120, 108, '10:00'), (121, 108, '11:00'),
    (122, 108, '12:00'), (123, 108, '13:00'), (124, 108, '14:30'), (125, 108, '15:30'),
    (126, 108, '16:30'), (127, 108, '17:30'), (128, 108, '18:30'), (129, 108, '19:30'),
    (130, 108, '21:00'),

    -- --------------------------------------------------------
    -- VASAI (109) — vasai_bhayander_timing.csv "timing_from_vasai"
    -- 15 departures (skipped "-" and LUNCH BREAK entries)
    -- --------------------------------------------------------
    (131, 109, '06:45'), (132, 109, '08:15'), (133, 109, '09:30'), (134, 109, '10:30'),
    (135, 109, '11:15'), (136, 109, '12:00'), (137, 109, '12:45'), (138, 109, '14:15'),
    (139, 109, '15:00'), (140, 109, '15:45'), (141, 109, '16:30'), (142, 109, '17:15'),
    (143, 109, '18:00'), (144, 109, '18:45'), (145, 109, '20:15'),

    -- --------------------------------------------------------
    -- BHAYANDER (110) — vasai_bhayander_timing.csv "timing_from_bhayander"
    -- 15 departures (skipped "-" and LUNCH BREAK entries)
    -- --------------------------------------------------------
    (146, 110, '07:30'), (147, 110, '09:30'), (148, 110, '10:30'), (149, 110, '11:15'),
    (150, 110, '12:00'), (151, 110, '12:45'), (152, 110, '14:15'), (153, 110, '15:00'),
    (154, 110, '15:45'), (155, 110, '16:30'), (156, 110, '17:15'), (157, 110, '18:00'),
    (158, 110, '18:45'), (159, 110, '19:30'), (160, 110, '21:00'),

    -- --------------------------------------------------------
    -- AMBET (111) — ambet_mhapral_timing.csv "timing_from_ambet"
    -- 19 departures: 6:15 AM to 12:15 AM
    -- --------------------------------------------------------
    (161, 111, '06:15'), (162, 111, '07:15'), (163, 111, '08:15'), (164, 111, '09:15'),
    (165, 111, '10:15'), (166, 111, '11:15'), (167, 111, '12:15'), (168, 111, '13:15'),
    (169, 111, '14:15'), (170, 111, '15:15'), (171, 111, '16:15'), (172, 111, '17:15'),
    (173, 111, '18:15'), (174, 111, '19:15'), (175, 111, '20:15'), (176, 111, '21:15'),
    (177, 111, '22:15'), (178, 111, '23:15'), (179, 111, '00:15'),

    -- --------------------------------------------------------
    -- MHAPRAL (112) — ambet_mhapral_timing.csv "timing_from_mhapral"
    -- 19 departures: 6:00 AM to 12:00 AM
    -- --------------------------------------------------------
    (180, 112, '06:00'), (181, 112, '07:00'), (182, 112, '08:00'), (183, 112, '09:00'),
    (184, 112, '10:00'), (185, 112, '11:00'), (186, 112, '12:00'), (187, 112, '13:00'),
    (188, 112, '14:00'), (189, 112, '15:00'), (190, 112, '16:00'), (191, 112, '17:00'),
    (192, 112, '18:00'), (193, 112, '19:00'), (194, 112, '20:00'), (195, 112, '21:00'),
    (196, 112, '22:00'), (197, 112, '23:00'), (198, 112, '00:00'),

    -- --------------------------------------------------------
    -- VIRAR (113) — virar_safale_timing.csv "timing_from_virar"
    -- 21 departures: 6:30 AM to 10:00 PM
    -- --------------------------------------------------------
    (199, 113, '06:30'), (200, 113, '07:30'), (201, 113, '08:15'), (202, 113, '09:00'),
    (203, 113, '09:45'), (204, 113, '10:30'), (205, 113, '11:15'), (206, 113, '12:00'),
    (207, 113, '12:40'), (208, 113, '13:35'), (209, 113, '14:15'), (210, 113, '15:00'),
    (211, 113, '15:45'), (212, 113, '16:30'), (213, 113, '17:15'), (214, 113, '18:00'),
    (215, 113, '18:45'), (216, 113, '19:30'), (217, 113, '20:15'), (218, 113, '21:00'),
    (219, 113, '22:00'),

    -- --------------------------------------------------------
    -- SAFALE / JALSAR (114) — virar_safale_timing.csv "timing_from_safale_jalsar"
    -- 21 departures: 6:45 AM to 10:10 PM
    -- --------------------------------------------------------
    (220, 114, '06:45'), (221, 114, '07:45'), (222, 114, '08:30'), (223, 114, '09:15'),
    (224, 114, '10:00'), (225, 114, '10:45'), (226, 114, '11:30'), (227, 114, '12:15'),
    (228, 114, '12:50'), (229, 114, '13:45'), (230, 114, '14:30'), (231, 114, '15:15'),
    (232, 114, '16:00'), (233, 114, '16:45'), (234, 114, '17:30'), (235, 114, '18:15'),
    (236, 114, '19:00'), (237, 114, '19:45'), (238, 114, '20:30'), (239, 114, '21:15'),
    (240, 114, '22:10');

-- ============================================================
-- 6. ITEM RATES — actual per-route rates from CSV rate files
-- ============================================================
-- CSV item -> DB item_id mapping:
--   Bicycle (Saykal)                          -> 1  (CYCLE)
--   Motorcycle (with driver)                   -> 2  (MOTOR CYCLE WITH DRIVER)
--   Three-Wheeler Rickshaw                     -> 3  (EMPTY 3 WHLR RICKSHAW)
--   Empty Car 5 Seater / Maruti 800            -> 7  (EMPTY CAR 5 ST)
--   Luxury Car / Passenger 8 Seater / Pickup   -> 8  (EMPTY LUX. CAR 5 ST)
--   Passenger 8 Seater / Pickup / up to 407    -> 9  (SUMO/SCAPIO/TAVERA/INOVA)
--   Medium Goods Tata 407                      -> 15 (407 TEMPO)
--   Medium Goods Tata 709 / Eicher 1095        -> 18 (MED.GOODS 6 WHLR (709))
--   Passenger Bus / Truck / Tanker             -> 21 (TANKER/TRUCK)
--   Large Goods Truck / JCB                    -> 32 (JCB)
--   Goods per Half Ton                         -> 23 (GOODS PER HALF TON)
--   Trolley-size Tractor                       -> 33 (TRACTOR WITH TROLLY)
--   Passenger Adult                            -> 11 (PASSENGER ADULT ABOVE 12 YR)
--   Passenger Child                            -> 12 (PASSENGER CHILD 3-12 YR)
--   Fish/Poultry/Dog/Goat/Sheep                -> 31 (FISH/CHICKEN/BIRDS/FRUITS)
--   Cow / Bull / Buffalo                       -> 26 (COWS/BUFFELLOW)
--   Passenger Luggage per kg                   -> 24 (PASSENGER LUGGAGE ABV 20KG)
--   Student Monthly Pass (lower)               -> 27 (MONTH PASS STUDENT UPTO 10TH)
--   Student Monthly Pass (higher)              -> 28 (MONTH PASS STUDENT ABOVE 10TH)
--   Tourist                                    -> 29 (TOURIST)
--   Passenger Monthly Pass                     -> 30 (MONTH PASS PASSENGER)
--   Special / Extra Ferry                      -> 34 (SPECIAL FERRY)
-- ============================================================

INSERT INTO item_rates (id, applicable_from_date, levy, rate, item_id, route_id, is_active)
VALUES
    -- ============================================================
    -- ROUTE 1: DABHOL <-> DHOPAVE  (dabhol_dhopave_rates.csv)
    -- 17 items
    -- ============================================================
    (1,   '2026-01-01',  2.00,   13.00,  1,  1, TRUE),  -- Bicycle
    (2,   '2026-01-01',  7.00,   58.00,  2,  1, TRUE),  -- Motorcycle
    (3,   '2026-01-01',  9.00,   81.00,  3,  1, TRUE),  -- Three-Wheeler Rickshaw
    (4,   '2026-01-01', 17.00,  163.00,  7,  1, TRUE),  -- Empty Car 5 Seater (Maruti 800)
    (5,   '2026-01-01', 19.00,  181.00,  9,  1, TRUE),  -- Passenger 8 Seater / Pickup / up to 407
    (6,   '2026-01-01', 25.00,  225.00, 18,  1, TRUE),  -- Medium Goods (709/Eicher 1095+)
    (7,   '2026-01-01', 40.00,  360.00, 21,  1, TRUE),  -- Passenger Bus / Truck / Tanker
    (8,   '2026-01-01', 50.00,  500.00, 32,  1, TRUE),  -- Large Goods Truck / JCB
    (9,   '2026-01-01',  4.00,   36.00, 23,  1, TRUE),  -- Goods per Half Ton
    (10,  '2026-01-01', 31.00,  319.00, 33,  1, TRUE),  -- Trolley-size Tractor
    (11,  '2026-01-01',  2.00,   18.00, 11,  1, TRUE),  -- Passenger Adult
    (12,  '2026-01-01',  1.00,    9.00, 12,  1, TRUE),  -- Passenger Child
    (13,  '2026-01-01',  2.00,   18.00, 31,  1, TRUE),  -- Fish/Poultry/Dog/Goat/Sheep
    (14,  '2026-01-01',  5.00,   45.00, 26,  1, TRUE),  -- Cow / Bull / Buffalo
    (15,  '2026-01-01', 30.00,  270.00, 27,  1, TRUE),  -- Student Pass (Std 7th and below)
    (16,  '2026-01-01', 40.00,  360.00, 28,  1, TRUE),  -- Student Pass (Std 7th and above)
    (17,  '2026-01-01', 60.00,  640.00, 30,  1, TRUE),  -- Passenger Monthly Pass

    -- ============================================================
    -- ROUTE 2: VESHVI <-> BAGMANDALE  (veshvi_bagmandale_rates.csv)
    -- 17 items
    -- ============================================================
    (18,  '2026-01-01',  2.00,   13.00,  1,  2, TRUE),  -- Bicycle
    (19,  '2026-01-01',  7.00,   58.00,  2,  2, TRUE),  -- Motorcycle
    (20,  '2026-01-01',  9.00,   81.00,  3,  2, TRUE),  -- Three-Wheeler Rickshaw
    (21,  '2026-01-01', 17.00,  163.00,  7,  2, TRUE),  -- Empty Car 5 Seater (Maruti 800)
    (22,  '2026-01-01', 19.00,  181.00,  9,  2, TRUE),  -- Passenger 5 Seater / Pickup / up to 407
    (23,  '2026-01-01', 25.00,  225.00, 18,  2, TRUE),  -- Medium Goods (709/Eicher 1095+)
    (24,  '2026-01-01', 40.00,  360.00, 21,  2, TRUE),  -- Passenger Bus / Truck / Tanker
    (25,  '2026-01-01', 50.00,  500.00, 32,  2, TRUE),  -- Large Goods Truck / JCB
    (26,  '2026-01-01',  4.00,   36.00, 23,  2, TRUE),  -- Goods per Half Ton
    (27,  '2026-01-01', 31.00,  319.00, 33,  2, TRUE),  -- Trolley-size Tractor
    (28,  '2026-01-01',  2.00,   18.00, 11,  2, TRUE),  -- Passenger Adult
    (29,  '2026-01-01',  1.00,    9.00, 12,  2, TRUE),  -- Passenger Child
    (30,  '2026-01-01',  2.00,   18.00, 31,  2, TRUE),  -- Fish/Poultry/Dog/Goat/Sheep
    (31,  '2026-01-01',  5.00,   45.00, 26,  2, TRUE),  -- Cow / Bull / Buffalo
    (32,  '2026-01-01', 30.00,  270.00, 27,  2, TRUE),  -- Student Pass (Std 10th and below)
    (33,  '2026-01-01', 40.00,  360.00, 28,  2, TRUE),  -- Student Pass (Std 10th and above)
    (34,  '2026-01-01', 60.00,  640.00, 30,  2, TRUE),  -- Passenger Monthly Pass

    -- ============================================================
    -- ROUTE 3: JAIGAD <-> TAVSAL  (jaigad_tawsal_rates.csv)
    -- 15 items
    -- ============================================================
    (35,  '2026-01-01',  2.00,   18.00,  1,  3, TRUE),  -- Bicycle
    (36,  '2026-01-01',  7.00,   73.00,  2,  3, TRUE),  -- Motorcycle
    (37,  '2026-01-01', 10.00,   95.00,  3,  3, TRUE),  -- Three-Wheeler Rickshaw / Mini-Door Tempo
    (38,  '2026-01-01', 18.00,  182.00,  7,  3, TRUE),  -- Empty Car 5 Seater + Tata Magic
    (39,  '2026-01-01', 20.00,  205.00,  8,  3, TRUE),  -- Luxury Car / Passenger 8 Seater / Pickup
    (40,  '2026-01-01', 22.00,  228.00, 15,  3, TRUE),  -- Medium Goods (Tata 407)
    (41,  '2026-01-01', 25.00,  250.00, 18,  3, TRUE),  -- Medium Goods (709/Eicher 1095)
    (42,  '2026-01-01', 40.00,  410.00, 21,  3, TRUE),  -- Passenger Bus / Truck / Tanker
    (43,  '2026-01-01', 50.00,  550.00, 32,  3, TRUE),  -- Large Goods Truck / JCB
    (44,  '2026-01-01',  5.00,   45.00, 23,  3, TRUE),  -- Goods per Half Ton
    (45,  '2026-01-01', 27.00,  273.00, 33,  3, TRUE),  -- Trolley-size Tractor
    (46,  '2026-01-01',  3.00,   27.00, 11,  3, TRUE),  -- Passenger Adult
    (47,  '2026-01-01',  2.00,   13.00, 12,  3, TRUE),  -- Passenger Child
    (48,  '2026-01-01',  2.00,   23.00, 31,  3, TRUE),  -- Fish/Poultry/Dog/Goat/Sheep
    (49,  '2026-01-01',  6.00,   64.00, 26,  3, TRUE),  -- Cow / Bull / Buffalo

    -- ============================================================
    -- ROUTE 4: AGARDANDA <-> DIGHI  (dighi_agardanda_rates.csv)
    -- 15 items (identical rates to Route 3)
    -- ============================================================
    (50,  '2026-01-01',  2.00,   18.00,  1,  4, TRUE),  -- Bicycle
    (51,  '2026-01-01',  7.00,   73.00,  2,  4, TRUE),  -- Motorcycle
    (52,  '2026-01-01', 10.00,   95.00,  3,  4, TRUE),  -- Three-Wheeler Rickshaw / Mini-Door Tempo
    (53,  '2026-01-01', 18.00,  182.00,  7,  4, TRUE),  -- Empty Car 5 Seater + Tata Magic
    (54,  '2026-01-01', 20.00,  205.00,  8,  4, TRUE),  -- Luxury Car / Passenger 8 Seater / Pickup
    (55,  '2026-01-01', 22.00,  228.00, 15,  4, TRUE),  -- Medium Goods (Tata 407)
    (56,  '2026-01-01', 25.00,  250.00, 18,  4, TRUE),  -- Medium Goods (709/Eicher 1095)
    (57,  '2026-01-01', 40.00,  410.00, 21,  4, TRUE),  -- Passenger Bus / Truck / Tanker
    (58,  '2026-01-01', 50.00,  550.00, 32,  4, TRUE),  -- Large Goods Truck / JCB
    (59,  '2026-01-01',  5.00,   45.00, 23,  4, TRUE),  -- Goods per Half Ton
    (60,  '2026-01-01', 27.00,  273.00, 33,  4, TRUE),  -- Trolley-size Tractor
    (61,  '2026-01-01',  3.00,   27.00, 11,  4, TRUE),  -- Passenger Adult
    (62,  '2026-01-01',  2.00,   13.00, 12,  4, TRUE),  -- Passenger Child
    (63,  '2026-01-01',  2.00,   23.00, 31,  4, TRUE),  -- Fish/Poultry/Dog/Goat/Sheep
    (64,  '2026-01-01',  6.00,   64.00, 26,  4, TRUE),  -- Cow / Bull / Buffalo

    -- ============================================================
    -- ROUTE 5: BHAYANDER <-> VASAI  (vasai_bhayander_rates.csv)
    -- Tax = Transhipment/Passenger Tax
    -- 14 items
    -- ============================================================
    (65,  '2026-01-01',  1.00,    9.00,  1,  5, TRUE),  -- Bicycle
    (66,  '2026-01-01',  6.00,   60.00,  2,  5, TRUE),  -- Motorcycle
    (67,  '2026-01-01', 10.00,  100.00,  3,  5, TRUE),  -- Three-Wheeler Rickshaw
    (68,  '2026-01-01', 20.00,  180.00,  8,  5, TRUE),  -- Luxury Car / Passenger 8 Seater / Pickup
    (69,  '2026-01-01', 20.00,  200.00, 15,  5, TRUE),  -- Medium Goods (Tata 407)
    (70,  '2026-01-01', 25.00,  250.00, 18,  5, TRUE),  -- Medium Goods (709/Eicher 1095)
    (71,  '2026-01-01', 30.00,  300.00, 21,  5, TRUE),  -- Passenger Bus / Truck / Tractor
    (72,  '2026-01-01', 40.00,  400.00, 32,  5, TRUE),  -- Large Goods Truck / JCB
    (73,  '2026-01-01',  3.00,   26.00, 23,  5, TRUE),  -- Goods per Half Ton
    (74,  '2026-01-01', 20.00,  200.00, 33,  5, TRUE),  -- Trolley-size Tractor
    (75,  '2026-01-01',  3.00,   26.00, 11,  5, TRUE),  -- Passenger Adult
    (76,  '2026-01-01',  2.00,   13.00, 12,  5, TRUE),  -- Passenger Child
    (77,  '2026-01-01',  4.00,   36.00, 31,  5, TRUE),  -- Fish/Poultry/Dog/Goat/Sheep
    (78,  '2026-01-01',  5.00,   50.00, 26,  5, TRUE),  -- Cow / Bull / Buffalo

    -- ============================================================
    -- ROUTE 6: AMBET <-> MHAPRAL  (ambet_mhapral_rates.csv)
    -- 20 items (includes Tourist, Extra Ferry, Luggage)
    -- ============================================================
    (79,  '2026-01-01',  1.00,    9.00,  1,  6, TRUE),  -- Bicycle
    (80,  '2026-01-01',  5.00,   45.00,  2,  6, TRUE),  -- Motorcycle
    (81,  '2026-01-01',  7.00,   68.00,  3,  6, TRUE),  -- Three-Wheeler Rickshaw / Goods Tempo
    (82,  '2026-01-01', 14.00,  106.00,  7,  6, TRUE),  -- Empty Car 5 Seater + Tata Magic
    (83,  '2026-01-01', 14.00,  116.00,  8,  6, TRUE),  -- Luxury Car / Passenger 8 Seater / Pickup
    (84,  '2026-01-01', 14.00,  136.00, 15,  6, TRUE),  -- Medium Goods (Tata 407)
    (85,  '2026-01-01', 25.00,  185.00, 18,  6, TRUE),  -- Medium Goods (709/Eicher 1095)
    (86,  '2026-01-01', 20.00,  155.00, 33,  6, TRUE),  -- Trolley-size Tractor
    (87,  '2026-01-01', 30.00,  220.00, 21,  6, TRUE),  -- Passenger Bus / Truck / Tanker
    (88,  '2026-01-01', 50.00,  350.00, 32,  6, TRUE),  -- Large Goods Truck / JCB
    (89,  '2026-01-01',  3.00,   27.00, 23,  6, TRUE),  -- Goods per Half Ton
    (90,  '2026-01-01',  2.00,    8.00, 11,  6, TRUE),  -- Passenger Adult
    (91,  '2026-01-01',  1.00,    4.00, 12,  6, TRUE),  -- Passenger Child
    -- NOTE: Passenger Luggage rate=1.00 in CSV, using 1.01 (DB constraint: rate > 1)
    (92,  '2026-01-01',  0.00,    1.01, 24,  6, TRUE),  -- Passenger Luggage per kg
    (93,  '2026-01-01',  1.00,    9.00, 31,  6, TRUE),  -- Fish/Poultry/Dog/Goat/Sheep
    (94,  '2026-01-01',  5.00,   45.00, 26,  6, TRUE),  -- Cow / Bull / Buffalo
    (95,  '2026-01-01', 20.00,  180.00, 27,  6, TRUE),  -- Student Pass (Std 10th and below)
    (96,  '2026-01-01', 30.00,  270.00, 28,  6, TRUE),  -- Student Pass (Std 10th and above)
    (97,  '2026-01-01',  2.00,   18.00, 29,  6, TRUE),  -- Tourist (one-way)
    (98,  '2026-01-01',  0.00,  150.00, 34,  6, TRUE),  -- Extra Ferry (Night 11PM-6AM)

    -- ============================================================
    -- ROUTE 7: VIRAR <-> SAFALE / JALSAR  (virar_safale_rates.csv)
    -- Tax = Transhipment/Passenger Tax
    -- 13 items
    -- ============================================================
    (99,  '2026-01-01',  1.00,    9.00,  1,  7, TRUE),  -- Bicycle
    (100, '2026-01-01',  6.00,   60.00,  2,  7, TRUE),  -- Motorcycle
    (101, '2026-01-01', 10.00,  100.00,  3,  7, TRUE),  -- Three-Wheeler Rickshaw
    (102, '2026-01-01', 20.00,  180.00,  7,  7, TRUE),  -- Empty Car 5 Seater (Maruti 800)
    (103, '2026-01-01', 20.00,  200.00,  9,  7, TRUE),  -- Passenger 8 Seater / Pickup / up to 407
    (104, '2026-01-01', 25.00,  250.00, 18,  7, TRUE),  -- Medium Goods (709/Eicher 1095)
    (105, '2026-01-01', 30.00,  300.00, 21,  7, TRUE),  -- Passenger Bus / Truck / Tractor
    (106, '2026-01-01', 50.00,  400.00, 32,  7, TRUE),  -- Large Goods Truck / JCB
    (107, '2026-01-01',  3.00,   27.00, 23,  7, TRUE),  -- Goods per Half Ton
    (108, '2026-01-01',  4.00,   36.00, 31,  7, TRUE),  -- Fish/Poultry/Dog/Goat/Sheep
    (109, '2026-01-01',  5.00,   50.00, 26,  7, TRUE),  -- Cow / Bull / Buffalo
    (110, '2026-01-01',  3.00,   27.00, 11,  7, TRUE),  -- Passenger Adult
    (111, '2026-01-01',  2.00,   13.00, 12,  7, TRUE);  -- Passenger Child

COMMIT;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
SELECT 'Branches' AS entity, COUNT(*) AS total FROM branches;
SELECT 'Routes' AS entity, COUNT(*) AS total FROM routes;
SELECT 'Items' AS entity, COUNT(*) AS total FROM items;
SELECT 'Ferry Schedules' AS entity, COUNT(*) AS total FROM ferry_schedules;
SELECT 'Item Rates' AS entity, COUNT(*) AS total FROM item_rates;
SELECT r.id, b1.name AS branch_one, b2.name AS branch_two
  FROM routes r
  JOIN branches b1 ON b1.id = r.branch_id_one
  JOIN branches b2 ON b2.id = r.branch_id_two
  ORDER BY r.id;
