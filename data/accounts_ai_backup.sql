--
-- PostgreSQL database dump
--

\restrict sQZZ4tD7s33mqAbxIVQqB0oSTintQZgjiCeqUVtxT4w2ipCmOaLSlmEjNMrGyrf

-- Dumped from database version 17.0
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: account_nature; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.account_nature AS ENUM (
    'Assets',
    'Liabilities',
    'Income',
    'Expenditure'
);


ALTER TYPE public.account_nature OWNER TO postgres;

--
-- Name: entry_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.entry_type AS ENUM (
    'Debit',
    'Credit'
);


ALTER TYPE public.entry_type OWNER TO postgres;

--
-- Name: gst_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.gst_type AS ENUM (
    'Input',
    'Output'
);


ALTER TYPE public.gst_type OWNER TO postgres;

--
-- Name: periodicity; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.periodicity AS ENUM (
    'Yearly',
    'Monthly',
    'Daily',
    'Never'
);


ALTER TYPE public.periodicity OWNER TO postgres;

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_role AS ENUM (
    'Super Admin',
    'Company Admin',
    'Accountant',
    'Viewer'
);


ALTER TYPE public.user_role OWNER TO postgres;

--
-- Name: voucher_class; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.voucher_class AS ENUM (
    'Receipt',
    'Payment',
    'Contra',
    'Journal',
    'Sales',
    'Purchase',
    'Credit Note',
    'Debit Note',
    'Memo',
    'Reversing Journal',
    'Custom'
);


ALTER TYPE public.voucher_class OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account_groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.account_groups (
    id integer NOT NULL,
    company_id integer NOT NULL,
    name character varying(255) NOT NULL,
    parent_id integer,
    nature public.account_nature NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    is_revenue boolean DEFAULT false NOT NULL,
    affects_gross_profit boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.account_groups OWNER TO postgres;

--
-- Name: account_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.account_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.account_groups_id_seq OWNER TO postgres;

--
-- Name: account_groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.account_groups_id_seq OWNED BY public.account_groups.id;


--
-- Name: budgets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.budgets (
    id integer NOT NULL,
    company_id integer NOT NULL,
    name character varying(255) NOT NULL,
    ledger_id integer,
    group_id integer,
    period_from date NOT NULL,
    period_to date NOT NULL,
    budget_type character varying(20) DEFAULT 'On Nett Transactions'::character varying,
    amount numeric(18,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.budgets OWNER TO postgres;

--
-- Name: budgets_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.budgets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.budgets_id_seq OWNER TO postgres;

--
-- Name: budgets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.budgets_id_seq OWNED BY public.budgets.id;


--
-- Name: companies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.companies (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    formal_name character varying(255),
    address text,
    city character varying(100),
    state character varying(100),
    pincode character varying(10),
    country character varying(100) DEFAULT 'India'::character varying,
    phone character varying(20),
    email character varying(255),
    website character varying(255),
    gstin character varying(15),
    pan character varying(10),
    financial_year_from date NOT NULL,
    financial_year_to date NOT NULL,
    books_from date NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.companies OWNER TO postgres;

--
-- Name: companies_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.companies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.companies_id_seq OWNER TO postgres;

--
-- Name: companies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.companies_id_seq OWNED BY public.companies.id;


--
-- Name: cost_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cost_categories (
    id integer NOT NULL,
    company_id integer NOT NULL,
    name character varying(255) NOT NULL,
    allocate_revenue boolean DEFAULT true NOT NULL,
    allocate_non_revenue boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.cost_categories OWNER TO postgres;

--
-- Name: cost_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.cost_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cost_categories_id_seq OWNER TO postgres;

--
-- Name: cost_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.cost_categories_id_seq OWNED BY public.cost_categories.id;


--
-- Name: cost_centers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cost_centers (
    id integer NOT NULL,
    company_id integer NOT NULL,
    name character varying(255) NOT NULL,
    parent_id integer,
    category_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.cost_centers OWNER TO postgres;

--
-- Name: cost_centers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.cost_centers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cost_centers_id_seq OWNER TO postgres;

--
-- Name: cost_centers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.cost_centers_id_seq OWNED BY public.cost_centers.id;


--
-- Name: gst_tax_rates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gst_tax_rates (
    id integer NOT NULL,
    company_id integer NOT NULL,
    description character varying(100) NOT NULL,
    hsn_sac_code character varying(8),
    tax_type character varying(20) DEFAULT 'GST'::character varying NOT NULL,
    igst_rate numeric(5,2) DEFAULT 0 NOT NULL,
    cgst_rate numeric(5,2) DEFAULT 0 NOT NULL,
    sgst_rate numeric(5,2) DEFAULT 0 NOT NULL,
    cess_rate numeric(5,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.gst_tax_rates OWNER TO postgres;

--
-- Name: gst_tax_rates_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.gst_tax_rates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gst_tax_rates_id_seq OWNER TO postgres;

--
-- Name: gst_tax_rates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.gst_tax_rates_id_seq OWNED BY public.gst_tax_rates.id;


--
-- Name: ledger_gst_details; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ledger_gst_details (
    id integer NOT NULL,
    ledger_id integer NOT NULL,
    gst_type public.gst_type NOT NULL,
    gst_rate_id integer,
    hsn_sac_code character varying(8),
    is_reverse_charge boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.ledger_gst_details OWNER TO postgres;

--
-- Name: ledger_gst_details_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ledger_gst_details_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ledger_gst_details_id_seq OWNER TO postgres;

--
-- Name: ledger_gst_details_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ledger_gst_details_id_seq OWNED BY public.ledger_gst_details.id;


--
-- Name: ledgers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ledgers (
    id integer NOT NULL,
    company_id integer NOT NULL,
    name character varying(255) NOT NULL,
    group_id integer NOT NULL,
    opening_balance numeric(18,2) DEFAULT 0.00 NOT NULL,
    mailing_name character varying(255),
    address text,
    city character varying(100),
    state character varying(100),
    pincode character varying(10),
    country character varying(100),
    phone character varying(20),
    email character varying(255),
    pan character varying(10),
    gstin character varying(15),
    bank_name character varying(255),
    bank_account_no character varying(50),
    ifsc_code character varying(11),
    is_bill_wise boolean DEFAULT false NOT NULL,
    is_cost_centre boolean DEFAULT false NOT NULL,
    credit_period integer DEFAULT 0,
    credit_limit numeric(18,2) DEFAULT 0.00,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.ledgers OWNER TO postgres;

--
-- Name: ledgers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ledgers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ledgers_id_seq OWNER TO postgres;

--
-- Name: ledgers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ledgers_id_seq OWNED BY public.ledgers.id;


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.refresh_tokens (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token_hash character varying(255) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    is_revoked boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.refresh_tokens OWNER TO postgres;

--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.refresh_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.refresh_tokens_id_seq OWNER TO postgres;

--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.refresh_tokens_id_seq OWNED BY public.refresh_tokens.id;


--
-- Name: user_companies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_companies (
    id integer NOT NULL,
    user_id integer NOT NULL,
    company_id integer NOT NULL,
    role public.user_role DEFAULT 'Viewer'::public.user_role NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.user_companies OWNER TO postgres;

--
-- Name: user_companies_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_companies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_companies_id_seq OWNER TO postgres;

--
-- Name: user_companies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_companies_id_seq OWNED BY public.user_companies.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    full_name character varying(255) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_super_admin boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: voucher_cost_allocations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.voucher_cost_allocations (
    id integer NOT NULL,
    voucher_entry_id integer NOT NULL,
    cost_center_id integer NOT NULL,
    amount numeric(18,2) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.voucher_cost_allocations OWNER TO postgres;

--
-- Name: voucher_cost_allocations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.voucher_cost_allocations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.voucher_cost_allocations_id_seq OWNER TO postgres;

--
-- Name: voucher_cost_allocations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.voucher_cost_allocations_id_seq OWNED BY public.voucher_cost_allocations.id;


--
-- Name: voucher_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.voucher_entries (
    id integer NOT NULL,
    voucher_id integer NOT NULL,
    ledger_id integer NOT NULL,
    entry_type public.entry_type NOT NULL,
    amount numeric(18,2) NOT NULL,
    particulars character varying(255),
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.voucher_entries OWNER TO postgres;

--
-- Name: voucher_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.voucher_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.voucher_entries_id_seq OWNER TO postgres;

--
-- Name: voucher_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.voucher_entries_id_seq OWNED BY public.voucher_entries.id;


--
-- Name: voucher_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.voucher_types (
    id integer NOT NULL,
    company_id integer NOT NULL,
    name character varying(100) NOT NULL,
    parent_type public.voucher_class NOT NULL,
    abbreviation character varying(10),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    numbering_method character varying(20) DEFAULT 'Automatic'::character varying,
    prefix character varying(20) DEFAULT ''::character varying,
    suffix character varying(20) DEFAULT ''::character varying,
    starting_number integer DEFAULT 1,
    periodicity public.periodicity DEFAULT 'Yearly'::public.periodicity NOT NULL
);


ALTER TABLE public.voucher_types OWNER TO postgres;

--
-- Name: voucher_types_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.voucher_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.voucher_types_id_seq OWNER TO postgres;

--
-- Name: voucher_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.voucher_types_id_seq OWNED BY public.voucher_types.id;


--
-- Name: vouchers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vouchers (
    id integer NOT NULL,
    company_id integer NOT NULL,
    voucher_type_id integer NOT NULL,
    voucher_number character varying(50) NOT NULL,
    date date NOT NULL,
    reference_no character varying(100),
    reference_date date,
    narration text,
    is_cancelled boolean DEFAULT false NOT NULL,
    is_optional boolean DEFAULT false NOT NULL,
    exchange_rate numeric(18,6) DEFAULT 1.000000,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.vouchers OWNER TO postgres;

--
-- Name: vouchers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.vouchers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vouchers_id_seq OWNER TO postgres;

--
-- Name: vouchers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.vouchers_id_seq OWNED BY public.vouchers.id;


--
-- Name: account_groups id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_groups ALTER COLUMN id SET DEFAULT nextval('public.account_groups_id_seq'::regclass);


--
-- Name: budgets id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.budgets ALTER COLUMN id SET DEFAULT nextval('public.budgets_id_seq'::regclass);


--
-- Name: companies id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.companies ALTER COLUMN id SET DEFAULT nextval('public.companies_id_seq'::regclass);


--
-- Name: cost_categories id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cost_categories ALTER COLUMN id SET DEFAULT nextval('public.cost_categories_id_seq'::regclass);


--
-- Name: cost_centers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cost_centers ALTER COLUMN id SET DEFAULT nextval('public.cost_centers_id_seq'::regclass);


--
-- Name: gst_tax_rates id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gst_tax_rates ALTER COLUMN id SET DEFAULT nextval('public.gst_tax_rates_id_seq'::regclass);


--
-- Name: ledger_gst_details id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ledger_gst_details ALTER COLUMN id SET DEFAULT nextval('public.ledger_gst_details_id_seq'::regclass);


--
-- Name: ledgers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ledgers ALTER COLUMN id SET DEFAULT nextval('public.ledgers_id_seq'::regclass);


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('public.refresh_tokens_id_seq'::regclass);


--
-- Name: user_companies id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_companies ALTER COLUMN id SET DEFAULT nextval('public.user_companies_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: voucher_cost_allocations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.voucher_cost_allocations ALTER COLUMN id SET DEFAULT nextval('public.voucher_cost_allocations_id_seq'::regclass);


--
-- Name: voucher_entries id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.voucher_entries ALTER COLUMN id SET DEFAULT nextval('public.voucher_entries_id_seq'::regclass);


--
-- Name: voucher_types id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.voucher_types ALTER COLUMN id SET DEFAULT nextval('public.voucher_types_id_seq'::regclass);


--
-- Name: vouchers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vouchers ALTER COLUMN id SET DEFAULT nextval('public.vouchers_id_seq'::regclass);


--
-- Data for Name: account_groups; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.account_groups (id, company_id, name, parent_id, nature, is_primary, is_revenue, affects_gross_profit, sort_order, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: budgets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.budgets (id, company_id, name, ledger_id, group_id, period_from, period_to, budget_type, amount, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: companies; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.companies (id, name, formal_name, address, city, state, pincode, country, phone, email, website, gstin, pan, financial_year_from, financial_year_to, books_from, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: cost_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cost_categories (id, company_id, name, allocate_revenue, allocate_non_revenue, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: cost_centers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cost_centers (id, company_id, name, parent_id, category_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: gst_tax_rates; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.gst_tax_rates (id, company_id, description, hsn_sac_code, tax_type, igst_rate, cgst_rate, sgst_rate, cess_rate, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: ledger_gst_details; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ledger_gst_details (id, ledger_id, gst_type, gst_rate_id, hsn_sac_code, is_reverse_charge, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: ledgers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ledgers (id, company_id, name, group_id, opening_balance, mailing_name, address, city, state, pincode, country, phone, email, pan, gstin, bank_name, bank_account_no, ifsc_code, is_bill_wise, is_cost_centre, credit_period, credit_limit, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.refresh_tokens (id, user_id, token_hash, expires_at, is_revoked, created_at) FROM stdin;
\.


--
-- Data for Name: user_companies; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_companies (id, user_id, company_id, role, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, email, password_hash, full_name, is_active, is_super_admin, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: voucher_cost_allocations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.voucher_cost_allocations (id, voucher_entry_id, cost_center_id, amount, created_at) FROM stdin;
\.


--
-- Data for Name: voucher_entries; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.voucher_entries (id, voucher_id, ledger_id, entry_type, amount, particulars, sort_order, created_at) FROM stdin;
\.


--
-- Data for Name: voucher_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.voucher_types (id, company_id, name, parent_type, abbreviation, is_active, created_at, updated_at, numbering_method, prefix, suffix, starting_number, periodicity) FROM stdin;
\.


--
-- Data for Name: vouchers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.vouchers (id, company_id, voucher_type_id, voucher_number, date, reference_no, reference_date, narration, is_cancelled, is_optional, exchange_rate, created_at, updated_at) FROM stdin;
\.


--
-- Name: account_groups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.account_groups_id_seq', 1, false);


--
-- Name: budgets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.budgets_id_seq', 1, false);


--
-- Name: companies_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.companies_id_seq', 1, false);


--
-- Name: cost_categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.cost_categories_id_seq', 1, false);


--
-- Name: cost_centers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.cost_centers_id_seq', 1, false);


--
-- Name: gst_tax_rates_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.gst_tax_rates_id_seq', 1, false);


--
-- Name: ledger_gst_details_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ledger_gst_details_id_seq', 1, false);


--
-- Name: ledgers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ledgers_id_seq', 1, false);


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.refresh_tokens_id_seq', 1, false);


--
-- Name: user_companies_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.user_companies_id_seq', 1, false);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 1, false);


--
-- Name: voucher_cost_allocations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.voucher_cost_allocations_id_seq', 1, false);


--
-- Name: voucher_entries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.voucher_entries_id_seq', 1, false);


--
-- Name: voucher_types_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.voucher_types_id_seq', 1, false);


--
-- Name: vouchers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.vouchers_id_seq', 1, false);


--
-- Name: account_groups account_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_groups
    ADD CONSTRAINT account_groups_pkey PRIMARY KEY (id);


--
-- Name: budgets budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: cost_categories cost_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cost_categories
    ADD CONSTRAINT cost_categories_pkey PRIMARY KEY (id);


--
-- Name: cost_centers cost_centers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_pkey PRIMARY KEY (id);


--
-- Name: gst_tax_rates gst_tax_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gst_tax_rates
    ADD CONSTRAINT gst_tax_rates_pkey PRIMARY KEY (id);


--
-- Name: ledger_gst_details ledger_gst_details_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ledger_gst_details
    ADD CONSTRAINT ledger_gst_details_pkey PRIMARY KEY (id);


--
-- Name: ledgers ledgers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ledgers
    ADD CONSTRAINT ledgers_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: user_companies user_companies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_companies
    ADD CONSTRAINT user_companies_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: voucher_cost_allocations voucher_cost_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.voucher_cost_allocations
    ADD CONSTRAINT voucher_cost_allocations_pkey PRIMARY KEY (id);


--
-- Name: voucher_entries voucher_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.voucher_entries
    ADD CONSTRAINT voucher_entries_pkey PRIMARY KEY (id);


--
-- Name: voucher_types voucher_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.voucher_types
    ADD CONSTRAINT voucher_types_pkey PRIMARY KEY (id);


--
-- Name: vouchers vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_pkey PRIMARY KEY (id);


--
-- Name: account_groups_company_id_name_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX account_groups_company_id_name_key ON public.account_groups USING btree (company_id, name);


--
-- Name: cost_categories_company_id_name_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX cost_categories_company_id_name_key ON public.cost_categories USING btree (company_id, name);


--
-- Name: cost_centers_company_id_name_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX cost_centers_company_id_name_key ON public.cost_centers USING btree (company_id, name);


--
-- Name: idx_account_groups_nature; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_account_groups_nature ON public.account_groups USING btree (company_id, nature);


--
-- Name: idx_account_groups_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_account_groups_parent ON public.account_groups USING btree (parent_id);


--
-- Name: idx_cost_alloc_center; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cost_alloc_center ON public.voucher_cost_allocations USING btree (cost_center_id);


--
-- Name: idx_cost_alloc_entry; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cost_alloc_entry ON public.voucher_cost_allocations USING btree (voucher_entry_id);


--
-- Name: idx_cost_centers_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cost_centers_parent ON public.cost_centers USING btree (parent_id);


--
-- Name: idx_ledgers_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ledgers_company ON public.ledgers USING btree (company_id);


--
-- Name: idx_ledgers_group; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ledgers_group ON public.ledgers USING btree (group_id);


--
-- Name: idx_refresh_tokens_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_refresh_tokens_user ON public.refresh_tokens USING btree (user_id);


--
-- Name: idx_user_companies_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_companies_company ON public.user_companies USING btree (company_id);


--
-- Name: idx_user_companies_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_companies_user ON public.user_companies USING btree (user_id);


--
-- Name: idx_voucher_entries_ledger; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_voucher_entries_ledger ON public.voucher_entries USING btree (ledger_id);


--
-- Name: idx_voucher_entries_voucher; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_voucher_entries_voucher ON public.voucher_entries USING btree (voucher_id);


--
-- Name: idx_vouchers_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vouchers_date ON public.vouchers USING btree (company_id, date);


--
-- Name: idx_vouchers_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vouchers_number ON public.vouchers USING btree (company_id, voucher_number);


--
-- Name: idx_vouchers_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vouchers_type ON public.vouchers USING btree (voucher_type_id);


--
-- Name: ledgers_company_id_name_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ledgers_company_id_name_key ON public.ledgers USING btree (company_id, name);


--
-- Name: user_companies_user_company_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX user_companies_user_company_key ON public.user_companies USING btree (user_id, company_id);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: voucher_types_company_id_name_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX voucher_types_company_id_name_key ON public.voucher_types USING btree (company_id, name);


--
-- Name: account_groups account_groups_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_groups
    ADD CONSTRAINT account_groups_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: account_groups account_groups_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_groups
    ADD CONSTRAINT account_groups_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.account_groups(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: budgets budgets_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: budgets budgets_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.account_groups(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: budgets budgets_ledger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: cost_categories cost_categories_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cost_categories
    ADD CONSTRAINT cost_categories_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: cost_centers cost_centers_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.cost_categories(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: cost_centers cost_centers_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: cost_centers cost_centers_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.cost_centers(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: gst_tax_rates gst_tax_rates_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gst_tax_rates
    ADD CONSTRAINT gst_tax_rates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ledger_gst_details ledger_gst_details_gst_rate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ledger_gst_details
    ADD CONSTRAINT ledger_gst_details_gst_rate_id_fkey FOREIGN KEY (gst_rate_id) REFERENCES public.gst_tax_rates(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ledger_gst_details ledger_gst_details_ledger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ledger_gst_details
    ADD CONSTRAINT ledger_gst_details_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ledgers ledgers_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ledgers
    ADD CONSTRAINT ledgers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ledgers ledgers_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ledgers
    ADD CONSTRAINT ledgers_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.account_groups(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_companies user_companies_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_companies
    ADD CONSTRAINT user_companies_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_companies user_companies_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_companies
    ADD CONSTRAINT user_companies_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: voucher_cost_allocations voucher_cost_allocations_cost_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.voucher_cost_allocations
    ADD CONSTRAINT voucher_cost_allocations_cost_center_id_fkey FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: voucher_cost_allocations voucher_cost_allocations_voucher_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.voucher_cost_allocations
    ADD CONSTRAINT voucher_cost_allocations_voucher_entry_id_fkey FOREIGN KEY (voucher_entry_id) REFERENCES public.voucher_entries(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: voucher_entries voucher_entries_ledger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.voucher_entries
    ADD CONSTRAINT voucher_entries_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.ledgers(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: voucher_entries voucher_entries_voucher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.voucher_entries
    ADD CONSTRAINT voucher_entries_voucher_id_fkey FOREIGN KEY (voucher_id) REFERENCES public.vouchers(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: voucher_types voucher_types_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.voucher_types
    ADD CONSTRAINT voucher_types_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: vouchers vouchers_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: vouchers vouchers_voucher_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_voucher_type_id_fkey FOREIGN KEY (voucher_type_id) REFERENCES public.voucher_types(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict sQZZ4tD7s33mqAbxIVQqB0oSTintQZgjiCeqUVtxT4w2ipCmOaLSlmEjNMrGyrf

