--- TRUNCATE TABLE public.routes CASCADE;

--- TRUNCATE TABLE public.branches CASCADE;

--- TRUNCATE TABLE public.users CASCADE;

TRUNCATE TABLE bookings, booking_Items, portal_users RESTART IDENTITY;

TRUNCATE TABLE public.payment_modes CASCADE;

TRUNCATE TABLE public.ticket_items CASCADE;

TRUNCATE TABLE public.refresh_tokens CASCADE;

TRUNCATE TABLE public.boats CASCADE;

TRUNCATE TABLE public.ferry_schedules CASCADE;

TRUNCATE TABLE public.items CASCADE;

TRUNCATE TABLE public.tickets CASCADE;

TRUNCATE TABLE public.company CASCADE;

TRUNCATE TABLE public.item_rates CASCADE;

TRUNCATE TABLE public.sys_update_logs CASCADE;

TRUNCATE TABLE public.ticket_payement CASCADE;

--- insert superadmin
INSERT INTO users (id, email, username, full_name, hashed_password, role, is_active, is_verified)
VALUES
    (uuid_generate_v4(), 'superadmin@ssmspl.com', 'superadmin', 'Super Administrator',
     '$2b$12$40jxkhNDTRR7btlgX0mTIuom3jXuB3r5OT0J2dh0ep5Q3iK3YDUD.', 'SUPER_ADMIN', TRUE, TRUE);

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
    );
