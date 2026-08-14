"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, FormError, Label } from "@/components/form";
import { autoMap, IMPORTABLE_FIELDS, parseCsv, type ImportableField } from "@/lib/csv";
import { trpc } from "@/lib/trpc/client";

type Mapping = Record<ImportableField, number | null>;

export default function ImportCandidatesPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const inputRef = useRef<HTMLInputElement>(null);

  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [dedupeMode, setDedupeMode] = useState<"skip" | "update">("skip");
  const [parseError, setParseError] = useState<string | null>(null);

  const importMut = trpc.candidates.importCandidates.useMutation();
  const preview = importMut.data?.dryRun ? importMut.data : null;
  const finalReport = importMut.data && !importMut.data.dryRun ? importMut.data : null;

  const mappedRows = useMemo(() => {
    if (!mapping) return [];
    return rows.map((cols) => {
      const obj: Record<string, string> = {};
      for (const { key } of IMPORTABLE_FIELDS) {
        const idx = mapping[key];
        if (idx !== null && cols[idx] !== undefined) obj[key] = cols[idx];
      }
      return obj;
    });
  }, [rows, mapping]);

  const onFile = async (file: File) => {
    setParseError(null);
    importMut.reset();
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setParseError("The file has no data rows.");
        return;
      }
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(autoMap(parsed.headers));
    } catch {
      setParseError("Could not read the file as CSV.");
    }
  };

  const run = (dryRun: boolean) => importMut.mutate({ rows: mappedRows, dedupeMode, dryRun });

  const lastNameMapped = mapping && mapping.lastName !== null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/candidates" className="text-sm text-[var(--muted)] hover:underline">
          &larr; Candidates
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Import candidates</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Upload a CSV, map the columns, preview, then import. Existing candidates are matched by
          email.
        </p>
      </div>

      <FormError message={parseError ?? importMut.error?.message} />

      <section className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-sm font-semibold">1. Choose a CSV file</h2>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => inputRef.current?.click()}>
            {headers.length > 0 ? "Choose a different file" : "Choose file"}
          </Button>
          {headers.length > 0 ? (
            <span className="text-sm text-[var(--muted)]">
              {rows.length.toLocaleString()} data rows, {headers.length} columns
            </span>
          ) : null}
        </div>
      </section>

      {mapping ? (
        <section className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-semibold">2. Map columns</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {IMPORTABLE_FIELDS.map((field) => (
              <div key={field.key}>
                <Label htmlFor={`map-${field.key}`}>{field.label}</Label>
                <select
                  id={`map-${field.key}`}
                  value={mapping[field.key] ?? ""}
                  onChange={(e) =>
                    setMapping({
                      ...mapping,
                      [field.key]: e.target.value === "" ? null : Number(e.target.value)
                    })
                  }
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                >
                  <option value="">- Not mapped -</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {!lastNameMapped ? (
            <p className="text-sm text-red-600">Last name must be mapped to continue.</p>
          ) : null}

          <div>
            <Label htmlFor="dedupe">When a candidate email already exists</Label>
            <select
              id="dedupe"
              value={dedupeMode}
              onChange={(e) => setDedupeMode(e.target.value as "skip" | "update")}
              className="w-full max-w-xs rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
            >
              <option value="skip">Skip the row</option>
              <option value="update">Update the existing candidate</option>
            </select>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!lastNameMapped || importMut.isPending}
              onClick={() => run(true)}
            >
              {importMut.isPending ? "Checking..." : "Preview"}
            </Button>
            <Button disabled={!lastNameMapped || importMut.isPending} onClick={() => run(false)}>
              {importMut.isPending ? "Importing..." : "Import"}
            </Button>
          </div>
        </section>
      ) : null}

      {preview ? (
        <section className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <h2 className="text-sm font-semibold">Preview (nothing imported yet)</h2>
          <ImportSummary report={preview} />
        </section>
      ) : null}

      {finalReport ? (
        <section className="space-y-3 rounded-lg border border-green-500/40 bg-green-500/10 p-4">
          <h2 className="text-sm font-semibold">Import complete</h2>
          <ImportSummary report={finalReport} />
          <Button
            onClick={async () => {
              await utils.candidates.list.invalidate();
              router.push("/candidates");
            }}
          >
            Go to candidates
          </Button>
        </section>
      ) : null}
    </div>
  );
}

function ImportSummary({
  report
}: {
  report: {
    total: number;
    valid: number;
    created: number;
    updated: number;
    skipped: number;
    errors: { row: number; message: string }[];
  };
}) {
  return (
    <div className="space-y-2 text-sm">
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
        <li>
          Total rows: <strong>{report.total}</strong>
        </li>
        <li>
          Created: <strong>{report.created}</strong>
        </li>
        <li>
          Updated: <strong>{report.updated}</strong>
        </li>
        <li>
          Skipped: <strong>{report.skipped}</strong>
        </li>
      </ul>
      {report.errors.length > 0 ? (
        <div>
          <p className="font-medium text-red-600">{report.errors.length} row(s) with errors:</p>
          <ul className="mt-1 max-h-40 overflow-y-auto text-[var(--muted)]">
            {report.errors.slice(0, 100).map((e, i) => (
              <li key={i}>
                Row {e.row}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-[var(--muted)]">No row errors.</p>
      )}
    </div>
  );
}
