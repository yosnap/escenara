ALTER TABLE "user_policies" DROP CONSTRAINT "user_policies_budget_valid";--> statement-breakpoint
ALTER TABLE "user_policies" DROP CONSTRAINT "user_policies_job_valid";--> statement-breakpoint
ALTER TABLE "user_policies" ADD CONSTRAINT "user_policies_budget_valid" CHECK (("user_policies"."budget_mode" in ('heredar', 'sin-tope') and "user_policies"."budget_value" is null) or ("user_policies"."budget_mode" = 'limite' and "user_policies"."budget_value" is not null and "user_policies"."budget_value" > 0 and "user_policies"."budget_value" < 'Infinity'::real));--> statement-breakpoint
ALTER TABLE "user_policies" ADD CONSTRAINT "user_policies_job_valid" CHECK (("user_policies"."job_mode" in ('heredar', 'sin-tope') and "user_policies"."job_value" is null) or ("user_policies"."job_mode" = 'limite' and "user_policies"."job_value" is not null and "user_policies"."job_value" > 0 and "user_policies"."job_value" < 'Infinity'::real));--> statement-breakpoint
CREATE FUNCTION admin_minimizar_usuario_borrado() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE admin_events SET reason = 'Cuenta eliminada', changes = '{}'::jsonb
  WHERE actor_id = OLD.id OR target_id = OLD.id;
  RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER admin_minimizar_usuario BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION admin_minimizar_usuario_borrado();--> statement-breakpoint
CREATE FUNCTION admin_impedir_sesion_bloqueada() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bloqueado boolean;
BEGIN
  SELECT banned INTO bloqueado FROM users WHERE id = NEW.user_id FOR SHARE;
  IF bloqueado IS TRUE THEN RAISE EXCEPTION 'Cuenta bloqueada'; END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER admin_sesion_bloqueada BEFORE INSERT ON sessions FOR EACH ROW EXECUTE FUNCTION admin_impedir_sesion_bloqueada();
