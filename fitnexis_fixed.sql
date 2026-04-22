--
-- PostgreSQL database dump
--

\restrict 8wRUdzguEbL0P3xFkmNfAROkMJXgJ4RQa7CuCkKs4Pzbo19rlFBnJj2riKJFX1e

-- Dumped from database version 18.1
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
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: attendance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attendance (
    id integer NOT NULL,
    user_id integer NOT NULL,
    session_id integer,
    check_in_time timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_by integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    gym_id uuid NOT NULL
);


ALTER TABLE public.attendance OWNER TO postgres;

--
-- Name: attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.attendance_id_seq OWNER TO postgres;

--
-- Name: attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.attendance_id_seq OWNED BY public.attendance.id;


--
-- Name: class_bookings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.class_bookings (
    id integer NOT NULL,
    session_id integer NOT NULL,
    user_id integer CONSTRAINT class_bookings_member_id_not_null NOT NULL,
    booking_status character varying(20) DEFAULT 'booked'::character varying NOT NULL,
    booked_at timestamp without time zone DEFAULT now(),
    gym_id uuid NOT NULL,
    CONSTRAINT class_bookings_status_check CHECK (((booking_status)::text = ANY ((ARRAY['booked'::character varying, 'cancelled'::character varying, 'waitlisted'::character varying, 'no_show'::character varying, 'attended'::character varying])::text[])))
);


ALTER TABLE public.class_bookings OWNER TO postgres;

--
-- Name: class_bookings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.class_bookings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.class_bookings_id_seq OWNER TO postgres;

--
-- Name: class_bookings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.class_bookings_id_seq OWNED BY public.class_bookings.id;


--
-- Name: class_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.class_sessions (
    id integer NOT NULL,
    class_type_id integer NOT NULL,
    trainer_id integer,
    starts_at timestamp without time zone NOT NULL,
    ends_at timestamp without time zone,
    capacity integer DEFAULT 20 NOT NULL,
    location character varying(100),
    status character varying(20) DEFAULT 'scheduled'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    start_time time without time zone,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    waitlist_enabled boolean DEFAULT false,
    cancellation_deadline_hours integer DEFAULT 24,
    gym_id uuid NOT NULL,
    CONSTRAINT class_sessions_capacity_check CHECK ((capacity > 0)),
    CONSTRAINT class_sessions_status_check CHECK (((status)::text = ANY ((ARRAY['scheduled'::character varying, 'cancelled'::character varying, 'completed'::character varying])::text[])))
);


ALTER TABLE public.class_sessions OWNER TO postgres;

--
-- Name: class_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.class_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.class_sessions_id_seq OWNER TO postgres;

--
-- Name: class_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.class_sessions_id_seq OWNED BY public.class_sessions.id;


--
-- Name: class_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.class_types (
    id integer NOT NULL,
    name character varying(80) NOT NULL,
    description text,
    default_duration_minutes integer DEFAULT 60,
    created_at timestamp without time zone DEFAULT now(),
    gym_id uuid NOT NULL
);


ALTER TABLE public.class_types OWNER TO postgres;

--
-- Name: class_types_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.class_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.class_types_id_seq OWNER TO postgres;

--
-- Name: class_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.class_types_id_seq OWNED BY public.class_types.id;


--
-- Name: gyms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gyms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255),
    email character varying(255),
    phone character varying(255),
    address character varying(255),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    slug text DEFAULT 'mashfitness'::text
);


ALTER TABLE public.gyms OWNER TO postgres;

--
-- Name: invoices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoices (
    id integer NOT NULL,
    user_id integer NOT NULL,
    membership_id integer,
    amount numeric(10,2) NOT NULL,
    currency character varying(10) DEFAULT 'ZAR'::character varying NOT NULL,
    status character varying(20) DEFAULT 'due'::character varying NOT NULL,
    issued_at timestamp without time zone DEFAULT now(),
    due_at timestamp without time zone,
    gym_id uuid NOT NULL,
    CONSTRAINT invoices_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT invoices_status_check CHECK (((status)::text = ANY ((ARRAY['due'::character varying, 'paid'::character varying, 'void'::character varying, 'overdue'::character varying])::text[])))
);


ALTER TABLE public.invoices OWNER TO postgres;

--
-- Name: invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.invoices_id_seq OWNER TO postgres;

--
-- Name: invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.invoices_id_seq OWNED BY public.invoices.id;


--
-- Name: knex_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


ALTER TABLE public.knex_migrations OWNER TO postgres;

--
-- Name: knex_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_id_seq OWNER TO postgres;

--
-- Name: knex_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_id_seq OWNED BY public.knex_migrations.id;


--
-- Name: knex_migrations_lock; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knex_migrations_lock (
    index integer NOT NULL,
    is_locked integer
);


ALTER TABLE public.knex_migrations_lock OWNER TO postgres;

--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.knex_migrations_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_lock_index_seq OWNER TO postgres;

--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.knex_migrations_lock_index_seq OWNED BY public.knex_migrations_lock.index;


--
-- Name: member_contact_details; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.member_contact_details (
    id integer NOT NULL,
    user_id integer NOT NULL,
    whatsapp_number character varying(20),
    alt_phone character varying(20),
    street_address text,
    city character varying(100),
    province character varying(100),
    postal_code character varying(20),
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    gender character varying(255),
    birthdate date,
    gym_id uuid NOT NULL
);


ALTER TABLE public.member_contact_details OWNER TO postgres;

--
-- Name: member_contact_details_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.member_contact_details ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.member_contact_details_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: member_dietary_info; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.member_dietary_info (
    id integer NOT NULL,
    user_id integer NOT NULL,
    diet_type character varying(50),
    meals_per_day smallint,
    water_per_day numeric(4,1),
    foods_avoid text,
    supplements text,
    hydration_goal numeric(4,1),
    allergies text,
    restrictions text,
    preferred_checkin_day character varying(10),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    gym_id uuid NOT NULL
);


ALTER TABLE public.member_dietary_info OWNER TO postgres;

--
-- Name: member_dietary_info_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.member_dietary_info_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.member_dietary_info_id_seq OWNER TO postgres;

--
-- Name: member_dietary_info_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.member_dietary_info_id_seq OWNED BY public.member_dietary_info.id;


--
-- Name: member_emergency_contacts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.member_emergency_contacts (
    id integer NOT NULL,
    user_id integer NOT NULL,
    ecname character varying(150) NOT NULL,
    relationship character varying(100),
    phone character varying(20) NOT NULL,
    priority character varying(20) DEFAULT 'primary'::character varying NOT NULL,
    ems_notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    gym_id uuid NOT NULL,
    CONSTRAINT chk_priority CHECK (((priority)::text = ANY ((ARRAY['primary'::character varying, 'secondary'::character varying])::text[])))
);


ALTER TABLE public.member_emergency_contacts OWNER TO postgres;

--
-- Name: member_emergency_contacts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.member_emergency_contacts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.member_emergency_contacts_id_seq OWNER TO postgres;

--
-- Name: member_emergency_contacts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.member_emergency_contacts_id_seq OWNED BY public.member_emergency_contacts.id;


--
-- Name: member_health_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.member_health_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    medical_conditions text,
    injuries text,
    health_notes text,
    consent_share_trainer boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    medication text,
    gym_id uuid NOT NULL
);


ALTER TABLE public.member_health_records OWNER TO postgres;

--
-- Name: member_physique_lifestyle; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.member_physique_lifestyle (
    id integer NOT NULL,
    user_id integer NOT NULL,
    primary_goal character varying(255) DEFAULT 'select'::character varying,
    current_weight real,
    target_weight real,
    height real,
    waist real,
    protein integer,
    carbs integer,
    fats integer,
    notes text,
    occupation character varying(255),
    stress_level character varying(255),
    sleep_hours character varying(255),
    activity_level character varying(255),
    exercise_frequency character varying(255),
    sitting_hours character varying(255),
    current_activities text[],
    training_styles text[],
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    gym_id uuid NOT NULL
);


ALTER TABLE public.member_physique_lifestyle OWNER TO postgres;

--
-- Name: member_physique_lifestyle_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.member_physique_lifestyle_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.member_physique_lifestyle_id_seq OWNER TO postgres;

--
-- Name: member_physique_lifestyle_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.member_physique_lifestyle_id_seq OWNED BY public.member_physique_lifestyle.id;


--
-- Name: member_profile; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.member_profile (
    id integer NOT NULL,
    user_id integer NOT NULL,
    profile_picture text DEFAULT '/images/profile-pic.jpg'::text NOT NULL,
    display_name character varying(80),
    bio text DEFAULT 'I am a fit, strong and healthy, I take the world by storm!'::text NOT NULL,
    mail_note boolean DEFAULT false NOT NULL,
    sms_note boolean DEFAULT false NOT NULL,
    wa_note boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    gym_id uuid NOT NULL
);


ALTER TABLE public.member_profile OWNER TO postgres;

--
-- Name: member_profile_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.member_profile_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.member_profile_id_seq OWNER TO postgres;

--
-- Name: member_profile_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.member_profile_id_seq OWNED BY public.member_profile.id;


--
-- Name: memberships; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.memberships (
    id integer NOT NULL,
    user_id integer NOT NULL,
    plan_id integer NOT NULL,
    start_date date DEFAULT CURRENT_DATE NOT NULL,
    end_date date,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    gym_id uuid NOT NULL,
    CONSTRAINT memberships_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'paused'::character varying, 'cancelled'::character varying, 'expired'::character varying])::text[])))
);


ALTER TABLE public.memberships OWNER TO postgres;

--
-- Name: memberships_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.memberships_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.memberships_id_seq OWNER TO postgres;

--
-- Name: memberships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.memberships_id_seq OWNED BY public.memberships.id;


--
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payments (
    id integer NOT NULL,
    invoice_id integer NOT NULL,
    provider character varying(30) DEFAULT 'cash'::character varying NOT NULL,
    amount numeric(10,2) NOT NULL,
    paid_at timestamp without time zone DEFAULT now(),
    reference character varying(100),
    gym_id uuid NOT NULL,
    CONSTRAINT payments_amount_check CHECK ((amount > (0)::numeric))
);


ALTER TABLE public.payments OWNER TO postgres;

--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payments_id_seq OWNER TO postgres;

--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Name: plans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.plans (
    id integer NOT NULL,
    name character varying(40) NOT NULL,
    price numeric(10,2) DEFAULT 0 NOT NULL,
    billing_cycle character varying(20) DEFAULT 'monthly'::character varying NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now(),
    gym_id uuid NOT NULL
);


ALTER TABLE public.plans OWNER TO postgres;

--
-- Name: plans_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.plans_id_seq OWNER TO postgres;

--
-- Name: plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.plans_id_seq OWNED BY public.plans.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    firstname character varying(40) NOT NULL,
    lastname character varying(40) NOT NULL,
    phone character varying(40) NOT NULL,
    email character varying(100) NOT NULL,
    password character varying(255),
    tier character varying(20) DEFAULT 'Gold'::character varying NOT NULL,
    joindate date DEFAULT CURRENT_DATE,
    role character varying(20) DEFAULT 'member'::character varying NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    gym_id uuid NOT NULL,
    CONSTRAINT users_tier_check CHECK (((tier)::text = ANY ((ARRAY['Bronze'::character varying, 'Gold'::character varying, 'Platinum'::character varying])::text[])))
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
-- Name: v_members_with_plan; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_members_with_plan AS
 SELECT u.id,
    u.firstname,
    u.lastname,
    u.email,
    u.phone,
    COALESCE(p.name, u.tier) AS tier,
    u.joindate
   FROM ((public.users u
     LEFT JOIN public.memberships m ON (((m.user_id = u.id) AND ((m.status)::text = 'active'::text))))
     LEFT JOIN public.plans p ON ((p.id = m.plan_id)));


ALTER VIEW public.v_members_with_plan OWNER TO postgres;

--
-- Name: attendance id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance ALTER COLUMN id SET DEFAULT nextval('public.attendance_id_seq'::regclass);


--
-- Name: class_bookings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_bookings ALTER COLUMN id SET DEFAULT nextval('public.class_bookings_id_seq'::regclass);


--
-- Name: class_sessions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_sessions ALTER COLUMN id SET DEFAULT nextval('public.class_sessions_id_seq'::regclass);


--
-- Name: class_types id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_types ALTER COLUMN id SET DEFAULT nextval('public.class_types_id_seq'::regclass);


--
-- Name: invoices id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices ALTER COLUMN id SET DEFAULT nextval('public.invoices_id_seq'::regclass);


--
-- Name: knex_migrations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_id_seq'::regclass);


--
-- Name: knex_migrations_lock index; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_lock_index_seq'::regclass);


--
-- Name: member_dietary_info id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_dietary_info ALTER COLUMN id SET DEFAULT nextval('public.member_dietary_info_id_seq'::regclass);


--
-- Name: member_emergency_contacts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_emergency_contacts ALTER COLUMN id SET DEFAULT nextval('public.member_emergency_contacts_id_seq'::regclass);


--
-- Name: member_physique_lifestyle id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_physique_lifestyle ALTER COLUMN id SET DEFAULT nextval('public.member_physique_lifestyle_id_seq'::regclass);


--
-- Name: member_profile id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_profile ALTER COLUMN id SET DEFAULT nextval('public.member_profile_id_seq'::regclass);


--
-- Name: memberships id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.memberships ALTER COLUMN id SET DEFAULT nextval('public.memberships_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- Name: plans id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plans ALTER COLUMN id SET DEFAULT nextval('public.plans_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: attendance; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.attendance (id, user_id, session_id, check_in_time, created_by, created_at, updated_at, gym_id) FROM stdin;
3	1	\N	2026-04-10 17:02:02.512713+02	1	2026-04-10 17:02:02.512713+02	2026-04-10 17:02:02.512713+02	bae0bfda-a38c-480b-9de7-919a3e100a6f
4	8	\N	2026-04-15 07:16:07.514532+02	1	2026-04-15 07:16:07.514532+02	2026-04-15 07:16:07.514532+02	bae0bfda-a38c-480b-9de7-919a3e100a6f
5	6	\N	2026-04-15 22:30:44.894498+02	1	2026-04-15 22:30:44.894498+02	2026-04-15 22:30:44.894498+02	bae0bfda-a38c-480b-9de7-919a3e100a6f
6	7	\N	2026-04-15 22:30:57.177166+02	1	2026-04-15 22:30:57.177166+02	2026-04-15 22:30:57.177166+02	bae0bfda-a38c-480b-9de7-919a3e100a6f
7	5	\N	2026-04-15 22:45:24.54738+02	1	2026-04-15 22:45:24.54738+02	2026-04-15 22:45:24.54738+02	bae0bfda-a38c-480b-9de7-919a3e100a6f
8	4	\N	2026-04-15 22:45:28.980163+02	1	2026-04-15 22:45:28.980163+02	2026-04-15 22:45:28.980163+02	bae0bfda-a38c-480b-9de7-919a3e100a6f
9	9	\N	2026-04-15 22:47:38.193595+02	1	2026-04-15 22:47:38.193595+02	2026-04-15 22:47:38.193595+02	bae0bfda-a38c-480b-9de7-919a3e100a6f
10	11	\N	2026-04-15 22:50:33.057942+02	1	2026-04-15 22:50:33.057942+02	2026-04-15 22:50:33.057942+02	bae0bfda-a38c-480b-9de7-919a3e100a6f
11	10	\N	2026-04-15 22:50:34.31243+02	1	2026-04-15 22:50:34.31243+02	2026-04-15 22:50:34.31243+02	bae0bfda-a38c-480b-9de7-919a3e100a6f
12	14	\N	2026-04-15 22:55:45.030187+02	1	2026-04-15 22:55:45.030187+02	2026-04-15 22:55:45.030187+02	bae0bfda-a38c-480b-9de7-919a3e100a6f
13	20	\N	2026-04-19 08:51:57.793589+02	19	2026-04-19 08:51:57.793589+02	2026-04-19 08:51:57.793589+02	da60267b-e87a-4b82-8b2f-8153526831fc
\.


--
-- Data for Name: class_bookings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.class_bookings (id, session_id, user_id, booking_status, booked_at, gym_id) FROM stdin;
\.


--
-- Data for Name: class_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.class_sessions (id, class_type_id, trainer_id, starts_at, ends_at, capacity, location, status, created_at, start_time, updated_at, waitlist_enabled, cancellation_deadline_hours, gym_id) FROM stdin;
\.


--
-- Data for Name: class_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.class_types (id, name, description, default_duration_minutes, created_at, gym_id) FROM stdin;
12	Hiking	rtshvrtdh rhvjbb  gjhr  yj j jj h tyj yt hg j j 	6	2026-03-06 16:50:28.460364	bae0bfda-a38c-480b-9de7-919a3e100a6f
14	5AM Club	cgrgffv v fdv v v	60	2026-03-06 18:09:34.904069	bae0bfda-a38c-480b-9de7-919a3e100a6f
10	Yoga Steeze	Physical exercise that combines rhythmic aerobic exercise with stretching and 	40	2026-03-05 19:15:05.230322	bae0bfda-a38c-480b-9de7-919a3e100a6f
\.


--
-- Data for Name: gyms; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.gyms (id, name, email, phone, address, created_at, updated_at, slug) FROM stdin;
bae0bfda-a38c-480b-9de7-919a3e100a6f	Mash Fitness Club	mashfitnessclub@gmail.com	0795370418	Rabie Ridge Sports Ground	2026-03-30 10:03:50.889202+02	2026-03-30 10:03:50.889202+02	mashfitness
da60267b-e87a-4b82-8b2f-8153526831fc	Gold's Gym	hello@goldsgym.co.uk	0987654321	2262 Motloetsi str, Midrand	2026-04-16 07:11:10.549055+02	2026-04-16 07:11:10.549055+02	goldsgym
35a525b3-9683-416c-b7b7-82d9d205d5c8	Gym Shack	md@sharklasers.com	\N	\N	2026-04-19 20:23:29.185911+02	2026-04-19 20:23:29.185911+02	gymshack
\.


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.invoices (id, user_id, membership_id, amount, currency, status, issued_at, due_at, gym_id) FROM stdin;
\.


--
-- Data for Name: knex_migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations (id, name, batch, migration_time) FROM stdin;
113	20260219070246_create_member_contact_details.js	1	2026-03-30 09:28:40.746+02
114	20260219073228_create_member_emergency_contacts.js	1	2026-03-30 09:28:40.781+02
115	20260219152926_create_member_health_records.js	1	2026-03-30 09:28:40.796+02
116	20260225085221_add_gender_birthdate_and_medication.js	1	2026-03-30 09:28:40.799+02
117	20260225092834_rename_birthdate_to_snake_case.js	1	2026-03-30 09:28:40.801+02
118	20260225135419_create_member_dietary_info.js	1	2026-03-30 09:28:40.828+02
119	20260226154410_create_physique_lifestyle.js	1	2026-03-30 09:28:40.844+02
120	20260306125936_update_class_sessions_table.js	1	2026-03-30 09:28:40.911+02
121	20260311210927_update_class_bookings_userid.js	1	2026-03-30 09:28:40.917+02
122	20260316143741_create_attendance_table.js	1	2026-03-30 09:28:40.933+02
123	20260330070537_drop_gym_id_attendance.js	1	2026-03-30 09:28:40.939+02
124	20260330074835_create_gyms_table.js	2	2026-03-30 09:53:37.042+02
125	20260330075608_seed_Mash_Fitness_Club.js	3	2026-03-30 10:03:50.914+02
126	20260330080424_add_gym_id_to_tables.js	4	2026-03-30 10:05:05.31+02
133	20260330080549_backfill_gym_id.js	5	2026-04-16 07:08:56.217+02
134	20260330080915_enforce_gym_id_constraints.js	5	2026-04-16 07:08:56.279+02
135	20260410093047_add_slug_to_gym_table.js	5	2026-04-16 07:08:56.284+02
136	20260410165750_update_gyms_table.js	5	2026-04-16 07:08:56.299+02
\.


--
-- Data for Name: knex_migrations_lock; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.knex_migrations_lock (index, is_locked) FROM stdin;
1	0
\.


--
-- Data for Name: member_contact_details; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.member_contact_details (id, user_id, whatsapp_number, alt_phone, street_address, city, province, postal_code, notes, created_at, updated_at, gender, birthdate, gym_id) FROM stdin;
2	4	\N	\N	\N	\N	\N	\N		2026-04-10 12:53:28.073749	2026-04-10 12:53:28.073749+02	male	2026-04-17	bae0bfda-a38c-480b-9de7-919a3e100a6f
3	5	\N	\N	\N	\N	\N	\N	nada	2026-04-15 07:11:47.537642	2026-04-15 07:11:47.537642+02	male	2026-04-15	bae0bfda-a38c-480b-9de7-919a3e100a6f
4	6	\N	\N	\N	\N	\N	\N	call after 9 AM	2026-04-15 07:13:01.574658	2026-04-15 07:13:01.574658+02	Female	2026-04-15	bae0bfda-a38c-480b-9de7-919a3e100a6f
5	7	\N	\N	\N	\N	\N	\N		2026-04-15 07:14:12.89594	2026-04-15 07:14:12.89594+02	male	2026-03-19	bae0bfda-a38c-480b-9de7-919a3e100a6f
6	8	\N	\N	\N	\N	\N	\N		2026-04-15 07:15:16.878739	2026-04-15 07:15:16.878739+02	Female	2026-01-14	bae0bfda-a38c-480b-9de7-919a3e100a6f
7	9	\N	\N	\N	\N	\N	\N	fuky yuh uhpikh	2026-04-15 22:47:05.820651	2026-04-15 22:47:05.820651+02	Female	2024-06-30	bae0bfda-a38c-480b-9de7-919a3e100a6f
8	10	\N	\N	\N	\N	\N	\N	rydfchu tfgk j	2026-04-15 22:49:08.343836	2026-04-15 22:49:08.343836+02	Female	2020-06-15	bae0bfda-a38c-480b-9de7-919a3e100a6f
9	11	\N	\N	\N	\N	\N	\N	yuk	2026-04-15 22:50:17.536071	2026-04-15 22:50:17.536071+02	Select	2026-04-15	bae0bfda-a38c-480b-9de7-919a3e100a6f
10	12	\N	\N	\N	\N	\N	\N		2026-04-15 22:52:48.715151	2026-04-15 22:52:48.715151+02	male	2026-04-16	bae0bfda-a38c-480b-9de7-919a3e100a6f
11	13	\N	\N	\N	\N	\N	\N		2026-04-15 22:53:32.335473	2026-04-15 22:53:32.335473+02	male	2026-04-15	bae0bfda-a38c-480b-9de7-919a3e100a6f
12	14	\N	\N	\N	\N	\N	\N		2026-04-15 22:54:33.953706	2026-04-15 22:54:33.953706+02	Female	2026-04-15	bae0bfda-a38c-480b-9de7-919a3e100a6f
13	20	\N	\N	\N	\N	\N	\N	ad;mo imim	2026-04-19 08:50:44.467023	2026-04-19 08:50:44.467023+02	male	2026-04-19	da60267b-e87a-4b82-8b2f-8153526831fc
\.


--
-- Data for Name: member_dietary_info; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.member_dietary_info (id, user_id, diet_type, meals_per_day, water_per_day, foods_avoid, supplements, hydration_goal, allergies, restrictions, preferred_checkin_day, created_at, updated_at, gym_id) FROM stdin;
\.


--
-- Data for Name: member_emergency_contacts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.member_emergency_contacts (id, user_id, ecname, relationship, phone, priority, ems_notes, created_at, updated_at, gym_id) FROM stdin;
1	4				primary	\N	2026-04-10 12:53:28.073749	2026-04-10 12:53:28.073749	bae0bfda-a38c-480b-9de7-919a3e100a6f
2	5	Sibusiso Msimango	Bro	0672845741	primary	\N	2026-04-15 07:11:47.537642	2026-04-15 07:11:47.537642	bae0bfda-a38c-480b-9de7-919a3e100a6f
3	6	Sibusiso Msimango	Bro	0672845741	primary	\N	2026-04-15 07:13:01.574658	2026-04-15 07:13:01.574658	bae0bfda-a38c-480b-9de7-919a3e100a6f
4	7	Sibusiso Msimango	Bro	0672845741	primary	\N	2026-04-15 07:14:12.89594	2026-04-15 07:14:12.89594	bae0bfda-a38c-480b-9de7-919a3e100a6f
5	8	Sibusiso Msimango	Bro	0672845741	primary	\N	2026-04-15 07:15:16.878739	2026-04-15 07:15:16.878739	bae0bfda-a38c-480b-9de7-919a3e100a6f
6	9	Sibusiso Msimango	niece	0672845741	primary	\N	2026-04-15 22:47:05.820651	2026-04-15 22:47:05.820651	bae0bfda-a38c-480b-9de7-919a3e100a6f
7	10	Sibusiso Msimango	colleague	0672845741	primary	\N	2026-04-15 22:49:08.343836	2026-04-15 22:49:08.343836	bae0bfda-a38c-480b-9de7-919a3e100a6f
8	11	Sibusiso Msimango	Parent	0672845741	primary	\N	2026-04-15 22:50:17.536071	2026-04-15 22:50:17.536071	bae0bfda-a38c-480b-9de7-919a3e100a6f
9	12	Sibusiso Msimango		0672845741	primary	\N	2026-04-15 22:52:48.715151	2026-04-15 22:52:48.715151	bae0bfda-a38c-480b-9de7-919a3e100a6f
10	13				primary	\N	2026-04-15 22:53:32.335473	2026-04-15 22:53:32.335473	bae0bfda-a38c-480b-9de7-919a3e100a6f
11	14				primary	\N	2026-04-15 22:54:33.953706	2026-04-15 22:54:33.953706	bae0bfda-a38c-480b-9de7-919a3e100a6f
12	20	Sibusiso Msimango	nephew	0788828262	primary	\N	2026-04-19 08:50:44.467023	2026-04-19 08:50:44.467023	da60267b-e87a-4b82-8b2f-8153526831fc
\.


--
-- Data for Name: member_health_records; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.member_health_records (id, user_id, medical_conditions, injuries, health_notes, consent_share_trainer, created_at, updated_at, medication, gym_id) FROM stdin;
\.


--
-- Data for Name: member_physique_lifestyle; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.member_physique_lifestyle (id, user_id, primary_goal, current_weight, target_weight, height, waist, protein, carbs, fats, notes, occupation, stress_level, sleep_hours, activity_level, exercise_frequency, sitting_hours, current_activities, training_styles, created_at, updated_at, gym_id) FROM stdin;
\.


--
-- Data for Name: member_profile; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.member_profile (id, user_id, profile_picture, display_name, bio, mail_note, sms_note, wa_note, created_at, updated_at, gym_id) FROM stdin;
\.


--
-- Data for Name: memberships; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.memberships (id, user_id, plan_id, start_date, end_date, status, created_at, gym_id) FROM stdin;
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payments (id, invoice_id, provider, amount, paid_at, reference, gym_id) FROM stdin;
\.


--
-- Data for Name: plans; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.plans (id, name, price, billing_cycle, description, created_at, gym_id) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, firstname, lastname, phone, email, password, tier, joindate, role, status, gym_id) FROM stdin;
22	Mike	Dozen	0987654321	md@sharklasers.com	$2b$10$XlK3i92xegSZclCKTEJtLubnZvvuZtXmem3sHtHKIkjwIpH4eBe.m	Gold	2026-04-19	admin	active	35a525b3-9683-416c-b7b7-82d9d205d5c8
23	Siren	Man	0672845741	admin1@smconnect.co.za	$2b$10$1yHzCzD7ErnxqZ3DxMfiju16UP/PUhg5D0.hmosSjZrGMDz5Al0ki	Gold	2026-04-19	admin	active	35a525b3-9683-416c-b7b7-82d9d205d5c8
1	Sir	Mango	0672845741	admin@smconnect.co.za.1	$2b$10$ywPuOt8vVbcDkQe2Opv5p.F1Zg/yFLza0b0piW302qP4YRvJYnW.i	Gold	2026-04-02	admin	active	bae0bfda-a38c-480b-9de7-919a3e100a6f
4	Sibusiso	Msimango	0788828262	smsimango81@gmail.com	$2b$10$P4Z9taE2josLdjegBEbPGuad.a4hLTT1LLzFrN3VwyOyMwSb4exgK	Bronze	2026-04-17	member	active	bae0bfda-a38c-480b-9de7-919a3e100a6f
5	Rhulani	Ndlhovu	0672845741	rhundh@sharklasers.com	$2b$10$hDZELb3lT.tFyIc2EUrOHe0eTf4Fb7IctAm.VRgoVzoAD6Nu13cZm	Bronze	2026-04-15	member	active	bae0bfda-a38c-480b-9de7-919a3e100a6f
6	Thando	Kumalo	0672845741	thando@sharklasers.com	$2b$10$lsQ93FQiAYrmyaPtYMdJ0uKLOrBRaFsVfxI.PHzvClYD5nmdzZDu6	Platinum	2026-04-15	member	active	bae0bfda-a38c-480b-9de7-919a3e100a6f
7	John	Doe	0672845741	jd@sharklasers.com	$2b$10$QIM6Efyz4l2lcZbG7vQaMu2RW2m0U8riU/pCZfPUhx03XHlHseF2W	Gold	2026-03-11	member	active	bae0bfda-a38c-480b-9de7-919a3e100a6f
8	Neo	Make	67285741	neom@sharklasers.com	$2b$10$Ugoo7n.qo1C1lioJfOu0i.KYfgp9HAmtKpZisUursi4c3cH59joEq	Platinum	2026-04-15	member	active	bae0bfda-a38c-480b-9de7-919a3e100a6f
9	Bontle	Msimango	0672845741	bpntlem@sharklasers.com	$2b$10$1TN9ENRTseN7N4tueqcw3Ob/E0TRN396dl5kE1khIQh66RtZM01xC	Gold	2026-04-15	member	active	bae0bfda-a38c-480b-9de7-919a3e100a6f
10	Sarh	Wilson	0788828262	sarahw@sharklasers.com	$2b$10$ibNUdcse0iy9pQ21cRAvgeHs.b9OR5ikYqbqVZnqTgqn6K.raOoFW	Platinum	2026-04-15	member	active	bae0bfda-a38c-480b-9de7-919a3e100a6f
11	Refilwe	Mha	0672845741	fifimha@sharklasers.com	$2b$10$O.2O8LJDatIBRRfjq4AxaO3BuCHWvJyFLITmwNhRGU0flXcSuZrtG	Bronze	2026-04-07	member	active	bae0bfda-a38c-480b-9de7-919a3e100a6f
12	Melusi	Thethwayo	0788828262	melusit@sharklasers.com	$2b$10$pxsv3PeCvtyuGnUa0fd1d.dfyISHO3a38XvGPWMZ.iiXoQBbxk0p.	Gold	2026-04-15	member	active	bae0bfda-a38c-480b-9de7-919a3e100a6f
13	Alex	Langa	67285741	alexlanga@sharklasers.com	$2b$10$oW3fo7l5nkwwsPLSThgINe/08OfY7GqLoYkrpXeqQ2dA.FRxvfawm	Bronze	2026-04-15	member	active	bae0bfda-a38c-480b-9de7-919a3e100a6f
14	Thato	Tecson	0788828262	tt@sharklasers.com	$2b$10$OR2UYoMyKi3EoDVd.k8Kj.AWUVnzYfDMq3LaQYWNWM8lIveWeg8Au	Gold	2026-04-15	member	active	bae0bfda-a38c-480b-9de7-919a3e100a6f
19	Siren	Man	0672845741	admin@smconnect.co.za.2	$2b$10$F3GHKP4.3tGMighG2ByurOjM6TQKqdXMARrZeIzUinNBT6KLMxztC	Gold	2026-04-17	admin	active	da60267b-e87a-4b82-8b2f-8153526831fc
20	Sphamandla	Nkosi	0672845741	sn@gmail.com	$2b$10$yqILe6PFC9UN5/btIRio.OMWjeQGsUCjE/dgTFTYfwD5gAke8A6e6	Bronze	2026-04-12	member	active	da60267b-e87a-4b82-8b2f-8153526831fc
\.


--
-- Name: attendance_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.attendance_id_seq', 13, true);


--
-- Name: class_bookings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.class_bookings_id_seq', 1, false);


--
-- Name: class_sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.class_sessions_id_seq', 1, false);


--
-- Name: class_types_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.class_types_id_seq', 21, true);


--
-- Name: invoices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.invoices_id_seq', 1, false);


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_id_seq', 136, true);


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.knex_migrations_lock_index_seq', 1, true);


--
-- Name: member_contact_details_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.member_contact_details_id_seq', 13, true);


--
-- Name: member_dietary_info_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.member_dietary_info_id_seq', 1, false);


--
-- Name: member_emergency_contacts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.member_emergency_contacts_id_seq', 12, true);


--
-- Name: member_physique_lifestyle_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.member_physique_lifestyle_id_seq', 1, false);


--
-- Name: member_profile_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.member_profile_id_seq', 1, false);


--
-- Name: memberships_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.memberships_id_seq', 1, false);


--
-- Name: payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.payments_id_seq', 1, false);


--
-- Name: plans_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.plans_id_seq', 1, false);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 27, true);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: class_bookings class_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_bookings
    ADD CONSTRAINT class_bookings_pkey PRIMARY KEY (id);


--
-- Name: class_bookings class_bookings_session_id_member_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_bookings
    ADD CONSTRAINT class_bookings_session_id_member_id_key UNIQUE (session_id, user_id);


--
-- Name: class_sessions class_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_pkey PRIMARY KEY (id);


--
-- Name: class_types class_types_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_types
    ADD CONSTRAINT class_types_name_key UNIQUE (name);


--
-- Name: class_types class_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_types
    ADD CONSTRAINT class_types_pkey PRIMARY KEY (id);


--
-- Name: gyms gyms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gyms
    ADD CONSTRAINT gyms_pkey PRIMARY KEY (id);


--
-- Name: gyms gyms_slug_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gyms
    ADD CONSTRAINT gyms_slug_unique UNIQUE (slug);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: knex_migrations_lock knex_migrations_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations_lock
    ADD CONSTRAINT knex_migrations_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations knex_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knex_migrations
    ADD CONSTRAINT knex_migrations_pkey PRIMARY KEY (id);


--
-- Name: member_contact_details member_contact_details_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_contact_details
    ADD CONSTRAINT member_contact_details_pkey PRIMARY KEY (id);


--
-- Name: member_contact_details member_contact_details_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_contact_details
    ADD CONSTRAINT member_contact_details_user_id_key UNIQUE (user_id);


--
-- Name: member_dietary_info member_dietary_info_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_dietary_info
    ADD CONSTRAINT member_dietary_info_pkey PRIMARY KEY (id);


--
-- Name: member_dietary_info member_dietary_info_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_dietary_info
    ADD CONSTRAINT member_dietary_info_user_id_unique UNIQUE (user_id);


--
-- Name: member_emergency_contacts member_emergency_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_emergency_contacts
    ADD CONSTRAINT member_emergency_contacts_pkey PRIMARY KEY (id);


--
-- Name: member_health_records member_health_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_health_records
    ADD CONSTRAINT member_health_records_pkey PRIMARY KEY (id);


--
-- Name: member_health_records member_health_records_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_health_records
    ADD CONSTRAINT member_health_records_user_id_key UNIQUE (user_id);


--
-- Name: member_physique_lifestyle member_physique_lifestyle_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_physique_lifestyle
    ADD CONSTRAINT member_physique_lifestyle_pkey PRIMARY KEY (id);


--
-- Name: member_physique_lifestyle member_physique_lifestyle_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_physique_lifestyle
    ADD CONSTRAINT member_physique_lifestyle_user_id_unique UNIQUE (user_id);


--
-- Name: member_profile member_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_profile
    ADD CONSTRAINT member_profile_pkey PRIMARY KEY (id);


--
-- Name: member_profile member_profile_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_profile
    ADD CONSTRAINT member_profile_user_id_key UNIQUE (user_id);


--
-- Name: memberships memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: plans plans_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_name_key UNIQUE (name);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: class_bookings unique_booking; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_bookings
    ADD CONSTRAINT unique_booking UNIQUE (user_id, session_id);


--
-- Name: member_emergency_contacts unique_user_priority; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_emergency_contacts
    ADD CONSTRAINT unique_user_priority UNIQUE (user_id, priority);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_class_bookings_member_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_class_bookings_member_id ON public.class_bookings USING btree (user_id);


--
-- Name: idx_class_bookings_session_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_class_bookings_session_id ON public.class_bookings USING btree (session_id);


--
-- Name: idx_class_sessions_starts_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_class_sessions_starts_at ON public.class_sessions USING btree (starts_at);


--
-- Name: idx_class_sessions_type_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_class_sessions_type_id ON public.class_sessions USING btree (class_type_id);


--
-- Name: idx_invoices_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_invoices_user_id ON public.invoices USING btree (user_id);


--
-- Name: idx_memberships_plan_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_memberships_plan_id ON public.memberships USING btree (plan_id);


--
-- Name: idx_memberships_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_memberships_user_id ON public.memberships USING btree (user_id);


--
-- Name: idx_payments_invoice_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_invoice_id ON public.payments USING btree (invoice_id);


--
-- Name: uniq_one_active_membership_per_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uniq_one_active_membership_per_user ON public.memberships USING btree (user_id) WHERE ((status)::text = 'active'::text);


--
-- Name: attendance attendance_created_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_created_by_foreign FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: attendance attendance_gym_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_gym_id_foreign FOREIGN KEY (gym_id) REFERENCES public.gyms(id) ON DELETE CASCADE;


--
-- Name: attendance attendance_session_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_session_id_foreign FOREIGN KEY (session_id) REFERENCES public.class_sessions(id) ON DELETE SET NULL;


--
-- Name: attendance attendance_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: class_bookings class_bookings_gym_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_bookings
    ADD CONSTRAINT class_bookings_gym_id_foreign FOREIGN KEY (gym_id) REFERENCES public.gyms(id) ON DELETE CASCADE;


--
-- Name: class_bookings class_bookings_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_bookings
    ADD CONSTRAINT class_bookings_member_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: class_bookings class_bookings_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_bookings
    ADD CONSTRAINT class_bookings_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.class_sessions(id) ON DELETE CASCADE;


--
-- Name: class_sessions class_sessions_class_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_class_type_id_fkey FOREIGN KEY (class_type_id) REFERENCES public.class_types(id) ON DELETE CASCADE;


--
-- Name: class_sessions class_sessions_gym_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_gym_id_foreign FOREIGN KEY (gym_id) REFERENCES public.gyms(id) ON DELETE CASCADE;


--
-- Name: class_sessions class_sessions_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.users(id);


--
-- Name: class_types class_types_gym_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_types
    ADD CONSTRAINT class_types_gym_id_foreign FOREIGN KEY (gym_id) REFERENCES public.gyms(id) ON DELETE CASCADE;


--
-- Name: member_emergency_contacts fk_member_emergency; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_emergency_contacts
    ADD CONSTRAINT fk_member_emergency FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: member_contact_details fk_user_contact; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_contact_details
    ADD CONSTRAINT fk_user_contact FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_gym_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_gym_id_foreign FOREIGN KEY (gym_id) REFERENCES public.gyms(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.memberships(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: member_contact_details member_contact_details_gym_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_contact_details
    ADD CONSTRAINT member_contact_details_gym_id_foreign FOREIGN KEY (gym_id) REFERENCES public.gyms(id) ON DELETE CASCADE;


--
-- Name: member_dietary_info member_dietary_info_gym_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_dietary_info
    ADD CONSTRAINT member_dietary_info_gym_id_foreign FOREIGN KEY (gym_id) REFERENCES public.gyms(id) ON DELETE CASCADE;


--
-- Name: member_dietary_info member_dietary_info_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_dietary_info
    ADD CONSTRAINT member_dietary_info_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: member_emergency_contacts member_emergency_contacts_gym_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_emergency_contacts
    ADD CONSTRAINT member_emergency_contacts_gym_id_foreign FOREIGN KEY (gym_id) REFERENCES public.gyms(id) ON DELETE CASCADE;


--
-- Name: member_health_records member_health_records_gym_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_health_records
    ADD CONSTRAINT member_health_records_gym_id_foreign FOREIGN KEY (gym_id) REFERENCES public.gyms(id) ON DELETE CASCADE;


--
-- Name: member_health_records member_health_records_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_health_records
    ADD CONSTRAINT member_health_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: member_physique_lifestyle member_physique_lifestyle_gym_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_physique_lifestyle
    ADD CONSTRAINT member_physique_lifestyle_gym_id_foreign FOREIGN KEY (gym_id) REFERENCES public.gyms(id) ON DELETE CASCADE;


--
-- Name: member_physique_lifestyle member_physique_lifestyle_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_physique_lifestyle
    ADD CONSTRAINT member_physique_lifestyle_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: member_profile member_profile_gym_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_profile
    ADD CONSTRAINT member_profile_gym_id_foreign FOREIGN KEY (gym_id) REFERENCES public.gyms(id) ON DELETE CASCADE;


--
-- Name: member_profile member_profile_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_profile
    ADD CONSTRAINT member_profile_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: memberships memberships_gym_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_gym_id_foreign FOREIGN KEY (gym_id) REFERENCES public.gyms(id) ON DELETE CASCADE;


--
-- Name: memberships memberships_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id);


--
-- Name: memberships memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payments payments_gym_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_gym_id_foreign FOREIGN KEY (gym_id) REFERENCES public.gyms(id) ON DELETE CASCADE;


--
-- Name: payments payments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: plans plans_gym_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_gym_id_foreign FOREIGN KEY (gym_id) REFERENCES public.gyms(id) ON DELETE CASCADE;


--
-- Name: users users_gym_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_gym_id_foreign FOREIGN KEY (gym_id) REFERENCES public.gyms(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 8wRUdzguEbL0P3xFkmNfAROkMJXgJ4RQa7CuCkKs4Pzbo19rlFBnJj2riKJFX1e

