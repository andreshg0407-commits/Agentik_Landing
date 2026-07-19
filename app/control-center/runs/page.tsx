import RunsTable from "./runs-table";

export const dynamic = "force-dynamic";

export default function RunsPage() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Control Center — Runs</h1>
        <p className="text-sm text-muted-foreground">
          Lista de ejecuciones (jobs) del sistema.
        </p>
      </div>

      <RunsTable />
    </div>
  );
}