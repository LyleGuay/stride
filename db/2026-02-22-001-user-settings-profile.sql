ALTER TABLE calorie_log_user_settings
  ADD COLUMN sex               varchar(10),
  ADD COLUMN date_of_birth     date,
  ADD COLUMN height_cm         numeric(5,1),
  ADD COLUMN weight_lbs        numeric(5,1),
  ADD COLUMN activity_level    varchar(20),
  ADD COLUMN target_weight_lbs numeric(5,1),
  ADD COLUMN target_date       date,
  ADD COLUMN units             varchar(10) NOT NULL DEFAULT 'us',
  ADD COLUMN budget_auto       boolean     NOT NULL DEFAULT true,
  ADD COLUMN setup_complete    boolean     NOT NULL DEFAULT false;
