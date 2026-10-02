import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";

loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error() {} }, true);
test.skipIf(!process.env.DATABASE_URL)(
  "migración vacía, esquema anterior sintético y lectura de rollback",
  async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Migración QA solo local.");
    const nombre = `escenara_pruebas_migracion_${crypto.randomUUID().replaceAll("-", "")}`;
    const administrativa = new Bun.SQL(url.toString(), { max: 1 });
    let cliente: Bun.SQL | undefined;
    const carpeta = await mkdtemp(path.join(tmpdir(), "escenara-migracion-"));
    try {
      await administrativa.unsafe(`create database "${nombre}"`);
      url.pathname = `/${nombre}`;
      cliente = new Bun.SQL(url.toString(), { max: 2 });
      const bd = drizzle({ client: cliente });
      const origen = path.resolve(import.meta.dirname, "../../../drizzle");
      const journal = JSON.parse(await readFile(path.join(origen, "meta/_journal.json"), "utf8"));
      const anteriores = journal.entries.filter((e: { idx: number }) => e.idx < 66);
      await Bun.$`mkdir -p ${path.join(carpeta, "meta")}`.quiet();
      await writeFile(path.join(carpeta, "meta/_journal.json"), JSON.stringify({ ...journal, entries: anteriores }));
      for (const entrada of anteriores)
        await symlink(path.join(origen, `${entrada.tag}.sql`), path.join(carpeta, `${entrada.tag}.sql`));
      // Primera parte real del journal aplicada sobre BD vacía: estado 0.49.4.
      await migrate(bd, { migrationsFolder: carpeta });
      const id = crypto.randomUUID();
      await cliente`insert into users(id, name, email, email_verified) values (${id}, 'Usuario anterior sintético', ${`${id}@migracion.test`}, true)`;
      await cliente`insert into generation_jobs(user_id, kind, provider, model, prompt, input, estimated_credits, state) values (${id}, 'fotograma', 'kie', 'qa', 'Sintético', '{}'::jsonb, 4, 'desconocido')`;
      await cliente`insert into usage_ledger(user_id, provider, model, entry_type, credits, amount_eur) values (${id}, 'kie', 'qa', 'ajuste', 4, 0.2)`;
      await cliente`insert into community_posts(author_id, kind, title, signature, consent_text, consent_at) values (${id}, 'plantilla', 'Publicación anterior sintética', 'Demo', 'Declaración sintética', now())`;
      await migrate(bd, { migrationsFolder: origen });
      await migrate(bd, { migrationsFolder: origen });
      expect((await cliente`select count(*)::int n from user_policies`)[0].n).toBe(0);
      expect((await cliente`select email_verified from users where id = ${id}`)[0].email_verified).toBe(true);
      // SQL usado por la versión anterior sigue leyendo sin borrar nuevas tablas ni historial.
      expect((await cliente`select sum(credits)::float8 n from usage_ledger where user_id = ${id}`)[0].n).toBe(4);
      expect((await cliente`select state from generation_jobs where user_id = ${id}`)[0].state).toBe("desconocido");
      expect((await cliente`select count(*)::int n from admin_events`)[0].n).toBe(0);
      expect((await cliente`select title from community_posts where author_id = ${id}`)[0].title).toBe(
        "Publicación anterior sintética",
      );
    } finally {
      await cliente?.close();
      await administrativa.unsafe(`drop database if exists "${nombre}"`);
      await administrativa.close();
      await rm(carpeta, { recursive: true, force: true });
    }
  },
  60000,
);
