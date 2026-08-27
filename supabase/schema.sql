-- Ejecutar en Supabase Dashboard > SQL Editor.
-- Se conservan los IDs de Appwrite como texto para facilitar la importación.
create table if not exists employees (id text primary key, name text not null, email text not null, department text, position text, role text not null default 'employee' check (role in ('admin','employee')), auth_user_id text, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists evaluation_cycles (id text primary key, name text not null, description text, status text not null default 'draft' check (status in ('draft','active','closed')), start_date timestamptz, end_date timestamptz, evaluated_employee_id text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists questions (id text primary key, text text not null, category text not null, max_score numeric default 1, "order" integer, is_inverted boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists responses (id text primary key, cycle_id text not null, question_id text not null, evaluator_id text not null, evaluated_id text not null, score numeric not null, evaluation_type text not null check (evaluation_type in ('self','peer')), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists final_reports (id text primary key, cycle_id text not null, employee_id text not null, self_score numeric, collective_score numeric, admin_summary text, strengths text, opportunities text, final_score numeric, is_exported boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists evaluation_assignments (id text primary key, cycle_id text not null, evaluated_id text not null, evaluator_id text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists evaluation_comments (id text primary key, cycle_id text not null, evaluator_id text not null, evaluated_id text not null, evaluation_type text not null check (evaluation_type in ('self','peer')), comment text, strengths text, opportunities text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());

alter table employees enable row level security;
alter table evaluation_cycles enable row level security;
alter table questions enable row level security;
alter table responses enable row level security;
alter table final_reports enable row level security;
alter table evaluation_assignments enable row level security;
alter table evaluation_comments enable row level security;

-- Compatibilidad inicial; después de importar usuarios conviene restringir por rol.
do $$ declare t text; begin foreach t in array array['employees','evaluation_cycles','questions','responses','final_reports','evaluation_assignments','evaluation_comments'] loop execute format('create policy "authenticated access" on %I for all to authenticated using (true) with check (true)', t); end loop; end $$;
