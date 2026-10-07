"use client";

import { useState, useEffect } from "react";
import { Modal } from "../Modal";
import { Database, Table, Search, Terminal, Columns, RefreshCw, ChevronLeft, ChevronRight, Play, CheckCircle2, AlertCircle } from "lucide-react";
import { notify } from "../toast";

interface TableInfo {
  name: string;
  count: number;
}

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

export function DatabaseViewerModal({ onClose }: { onClose: () => void }) {
  const [loadingTables, setLoadingTables] = useState(true);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [dbName, setDbName] = useState("clinic_db");
  const [dbMode, setDbMode] = useState<"postgresql" | "local_storage">("postgresql");
  const [tableFilter, setTableFilter] = useState("");

  // Table Data State
  const [loadingData, setLoadingData] = useState(false);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [activeTab, setActiveTab] = useState<"browse" | "structure" | "sql">("browse");
  const [rowSearch, setRowSearch] = useState("");

  // SQL Console State
  const [sqlQuery, setSqlQuery] = useState("SELECT * FROM public.patients LIMIT 25;");
  const [sqlLoading, setSqlLoading] = useState(false);
  const [sqlResult, setSqlResult] = useState<{
    columns: string[];
    rows: Record<string, unknown>[];
    rowCount: number;
    durationMs: number;
  } | null>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);

  // Load all tables on open
  useEffect(() => {
    loadTables();
  }, []);

  async function loadTables() {
    setLoadingTables(true);
    try {
      const res = await fetch("/api/admin/database");
      const data = await res.json();
      if (res.ok && data.tables) {
        setTables(data.tables);
        setDbName(data.database || "clinic_db");
        setDbMode(data.mode || "postgresql");
        if (data.tables.length > 0 && !selectedTable) {
          setSelectedTable(data.tables[0].name);
        }
      }
    } catch {
      notify("Failed to connect to database tables.", "error");
    } finally {
      setLoadingTables(false);
    }
  }

  // Load table data when selected table or page changes
  useEffect(() => {
    if (selectedTable) {
      loadTableData(selectedTable, page);
      setSqlQuery(`SELECT * FROM public."${selectedTable}" LIMIT 25;`);
    }
  }, [selectedTable, page]);

  async function loadTableData(tableName: string, pageNum: number) {
    setLoadingData(true);
    try {
      const offset = (pageNum - 1) * pageSize;
      const res = await fetch(`/api/admin/database?table=${encodeURIComponent(tableName)}&limit=${pageSize}&offset=${offset}`);
      const data = await res.json();
      if (res.ok) {
        setColumns(data.columns || []);
        setRows(data.rows || []);
        setTotalRows(data.total || 0);
      } else {
        notify(data.error?.message || "Failed to load table rows.", "error");
      }
    } catch {
      notify("Network error while reading table.", "error");
    } finally {
      setLoadingData(false);
    }
  }

  async function handleRunSql() {
    if (!sqlQuery.trim()) return;
    setSqlLoading(true);
    setSqlError(null);
    setSqlResult(null);
    try {
      const res = await fetch("/api/admin/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: sqlQuery.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setSqlResult({
          columns: data.columns || [],
          rows: data.rows || [],
          rowCount: data.rowCount ?? 0,
          durationMs: data.durationMs ?? 0,
        });
      } else {
        setSqlError(data.error?.message || "SQL Execution error.");
      }
    } catch (err) {
      setSqlError((err as Error).message || "Could not execute SQL query.");
    } finally {
      setSqlLoading(false);
    }
  }

  const filteredTables = tables.filter((t) =>
    t.name.toLowerCase().includes(tableFilter.toLowerCase())
  );

  const filteredRows = rows.filter((r) => {
    if (!rowSearch.trim()) return true;
    const term = rowSearch.toLowerCase();
    return Object.values(r).some((val) =>
      val !== null && val !== undefined && String(val).toLowerCase().includes(term)
    );
  });

  const totalPages = Math.ceil(totalRows / pageSize) || 1;

  return (
    <Modal
      labelledBy="db-viewer-title"
      closeLabel="Close Database Explorer"
      onClose={onClose}
      className="modal-panel max-w-6xl w-full p-0 overflow-hidden flex flex-col h-[85vh] bg-[var(--surface)]"
    >
      {/* Top phpMyAdmin Style Navigation Bar */}
      <div className="bg-[var(--surface-2)] border-b border-[var(--line)] px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--blue-soft)] flex items-center justify-center text-[var(--blue)]">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 id="db-viewer-title" className="text-sm font-extrabold text-[var(--navy)] tracking-tight">
                Database Explorer
              </h2>
              <span className="badge badge-blue text-[0.65rem] font-mono font-bold">
                phpMyAdmin View
              </span>
              <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full ${
                dbMode === "postgresql" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
              }`}>
                {dbMode === "postgresql" ? "PostgreSQL 18 (Live)" : "Local JSON Storage"}
              </span>
            </div>
            <p className="text-[0.65rem] text-[var(--muted)] font-mono">
              Server: 127.0.0.1:5432 &gt; Database: <span className="font-bold text-[var(--ink)]">{dbName}</span>
              {selectedTable && <> &gt; Table: <span className="font-bold text-[var(--blue)]">public.{selectedTable}</span></>}
            </p>
          </div>
        </div>

        {/* Tab switchers */}
        <div className="flex items-center gap-1.5 bg-[var(--surface)] p-1 rounded-lg border border-[var(--line)]">
          <button
            type="button"
            onClick={() => setActiveTab("browse")}
            className={`px-3 py-1 text-xs font-bold rounded-md flex items-center gap-1.5 transition ${
              activeTab === "browse"
                ? "bg-[var(--blue)] text-white shadow-xs"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            Browse Data
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("structure")}
            className={`px-3 py-1 text-xs font-bold rounded-md flex items-center gap-1.5 transition ${
              activeTab === "structure"
                ? "bg-[var(--blue)] text-white shadow-xs"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            <Columns className="w-3.5 h-3.5" />
            Structure
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("sql")}
            className={`px-3 py-1 text-xs font-bold rounded-md flex items-center gap-1.5 transition ${
              activeTab === "sql"
                ? "bg-[var(--blue)] text-white shadow-xs"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            SQL Console
          </button>
        </div>
      </div>

      {/* Main Body: Left Sidebar + Right Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Table List */}
        <div className="w-64 sm:w-72 border-r border-[var(--line)] bg-[var(--surface-2)] flex flex-col shrink-0">
          <div className="p-2.5 border-b border-[var(--line)] flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[var(--muted)]" />
              <input
                type="text"
                placeholder="Filter tables..."
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value)}
                className="w-full text-xs pl-8 pr-2 py-1.5 rounded-md border border-[var(--line)] bg-[var(--surface)]"
              />
            </div>
            <button
              onClick={loadTables}
              title="Refresh Tables"
              className="p-1.5 rounded-md border border-[var(--line)] hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)] transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingTables ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <div className="px-2 py-1 text-[0.65rem] font-bold text-[var(--muted)] uppercase tracking-wider flex justify-between">
              <span>Tables ({filteredTables.length})</span>
              <span>Rows</span>
            </div>

            {loadingTables ? (
              <div className="p-4 text-center text-xs text-[var(--muted)]">Loading schema...</div>
            ) : filteredTables.length === 0 ? (
              <div className="p-4 text-center text-xs text-[var(--muted)]">No tables found</div>
            ) : (
              filteredTables.map((t) => (
                <button
                  key={t.name}
                  onClick={() => {
                    setSelectedTable(t.name);
                    setPage(1);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono flex items-center justify-between transition ${
                    selectedTable === t.name
                      ? "bg-[var(--blue-soft)] text-[var(--blue)] font-extrabold border border-[var(--blue-line)]"
                      : "hover:bg-[var(--surface)] text-[var(--ink)]"
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <Table className="w-3.5 h-3.5 shrink-0 opacity-70" />
                    <span className="truncate">{t.name}</span>
                  </span>
                  <span className="text-[0.65rem] font-sans px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--line)] font-bold text-[var(--muted)]">
                    {t.count}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Main Panel */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[var(--surface)]">
          {/* TAB 1: BROWSE DATA */}
          {activeTab === "browse" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Table Toolbar */}
              <div className="p-3 border-b border-[var(--line)] flex flex-wrap items-center justify-between gap-3 bg-[var(--surface)] shrink-0">
                <div className="flex items-center gap-3">
                  <div className="relative w-64">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[var(--muted)]" />
                    <input
                      type="text"
                      placeholder="Quick filter in page..."
                      value={rowSearch}
                      onChange={(e) => setRowSearch(e.target.value)}
                      className="w-full text-xs pl-8 pr-2 py-1.5 rounded-md border border-[var(--line)] bg-[var(--surface-2)]"
                    />
                  </div>
                  <span className="text-xs text-[var(--muted)] font-medium">
                    Showing {filteredRows.length} of {totalRows} records
                  </span>
                </div>

                {/* Pagination */}
                <div className="flex items-center gap-2">
                  <button
                    disabled={page <= 1 || loadingData}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded border border-[var(--line)] hover:bg-[var(--surface-2)] disabled:opacity-40"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs font-bold text-[var(--ink)] font-mono">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    disabled={page >= totalPages || loadingData}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded border border-[var(--line)] hover:bg-[var(--surface-2)] disabled:opacity-40"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Data Table */}
              <div className="flex-1 overflow-auto">
                {loadingData ? (
                  <div className="h-full flex items-center justify-center text-xs text-[var(--muted)]">
                    Loading rows for public.{selectedTable}...
                  </div>
                ) : rows.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-6 text-center text-xs text-[var(--muted)]">
                    <Table className="w-10 h-10 mb-2 opacity-30 text-[var(--muted)]" />
                    <p className="font-bold text-[var(--ink)]">Table public.{selectedTable} is empty.</p>
                    <p>Zero records recorded yet.</p>
                  </div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-[var(--surface-2)] border-b border-[var(--line)] z-10 shadow-xs">
                      <tr>
                        <th className="p-2.5 font-bold font-mono text-[var(--muted)] text-[0.65rem] border-r border-[var(--line)] w-12 text-center">
                          #
                        </th>
                        {columns.map((c) => (
                          <th
                            key={c.name}
                            className="p-2.5 font-mono font-extrabold text-[var(--ink)] border-r border-[var(--line)] whitespace-nowrap"
                          >
                            <div>{c.name}</div>
                            <div className="text-[0.6rem] font-normal text-[var(--muted)] uppercase font-sans">
                              {c.type}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line)] font-mono text-[0.72rem]">
                      {filteredRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-[var(--surface-2)] transition-colors">
                          <td className="p-2 text-center text-[var(--muted)] border-r border-[var(--line)] bg-[var(--surface-2)]">
                            {(page - 1) * pageSize + idx + 1}
                          </td>
                          {columns.map((col) => {
                            const val = row[col.name];
                            const isNull = val === null || val === undefined;
                            const isJson = typeof val === "object" && !isNull;
                            const displayVal = isNull
                              ? "NULL"
                              : isJson
                              ? JSON.stringify(val)
                              : String(val);

                            return (
                              <td
                                key={col.name}
                                title={displayVal}
                                className="p-2 border-r border-[var(--line)] max-w-xs truncate"
                              >
                                {isNull ? (
                                  <span className="text-[0.65rem] px-1 py-0.2 rounded bg-gray-100 text-gray-500 font-bold">
                                    NULL
                                  </span>
                                ) : typeof val === "boolean" ? (
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[0.65rem] font-bold ${
                                      val ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                                    }`}
                                  >
                                    {val ? "TRUE" : "FALSE"}
                                  </span>
                                ) : (
                                  <span>{displayVal}</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: TABLE STRUCTURE */}
          {activeTab === "structure" && (
            <div className="flex-1 overflow-auto p-4 space-y-4">
              <div className="border border-[var(--line)] rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--surface-2)] border-b border-[var(--line)] text-[var(--muted)] font-bold">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">Column Name</th>
                      <th className="p-3">Data Type</th>
                      <th className="p-3">Nullable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)] font-mono">
                    {columns.map((c, i) => (
                      <tr key={c.name} className="hover:bg-[var(--surface-2)]">
                        <td className="p-3 text-[var(--muted)]">{i + 1}</td>
                        <td className="p-3 font-bold text-[var(--ink)]">{c.name}</td>
                        <td className="p-3 text-[var(--blue)] font-semibold">{c.type}</td>
                        <td className="p-3">
                          {c.nullable ? (
                            <span className="badge badge-mint text-[0.65rem]">YES</span>
                          ) : (
                            <span className="badge badge-amber text-[0.65rem]">NO</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: SQL CONSOLE */}
          {activeTab === "sql" && (
            <div className="flex-1 flex flex-col overflow-hidden p-4 space-y-3">
              <div className="space-y-2 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-[var(--muted)] uppercase">
                    Run SQL Query on <span className="font-mono text-[var(--navy)]">{dbName}</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSqlQuery("SELECT * FROM public.patients ORDER BY created_at DESC LIMIT 25;")}
                      className="text-[0.65rem] px-2 py-1 rounded bg-[var(--surface-2)] hover:bg-[var(--line)] font-mono"
                    >
                      SELECT patients
                    </button>
                    <button
                      type="button"
                      onClick={() => setSqlQuery("SELECT * FROM public.staff_members;")}
                      className="text-[0.65rem] px-2 py-1 rounded bg-[var(--surface-2)] hover:bg-[var(--line)] font-mono"
                    >
                      SELECT staff
                    </button>
                    <button
                      type="button"
                      onClick={() => setSqlQuery("SELECT * FROM public.queue_tickets;")}
                      className="text-[0.65rem] px-2 py-1 rounded bg-[var(--surface-2)] hover:bg-[var(--line)] font-mono"
                    >
                      SELECT queue
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <textarea
                    rows={4}
                    value={sqlQuery}
                    onChange={(e) => setSqlQuery(e.target.value)}
                    className="w-full text-xs font-mono p-3 rounded-xl border border-[var(--line)] bg-slate-900 text-emerald-400 focus:outline-hidden"
                    placeholder="e.g. SELECT * FROM public.patients;"
                  />
                  <button
                    onClick={handleRunSql}
                    disabled={sqlLoading}
                    className="absolute bottom-3 right-3 btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    {sqlLoading ? "Executing..." : "Run Query"}
                  </button>
                </div>
              </div>

              {/* SQL Result or Error */}
              <div className="flex-1 overflow-auto border border-[var(--line)] rounded-xl bg-[var(--surface)] p-2">
                {sqlError ? (
                  <div className="p-4 bg-red-50 text-red-700 rounded-lg text-xs font-mono flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                    <div>
                      <div className="font-bold">Query Error:</div>
                      <div>{sqlError}</div>
                    </div>
                  </div>
                ) : sqlResult ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span>
                        Query returned <strong className="text-[var(--ink)]">{sqlResult.rowCount} rows</strong> in{" "}
                        <strong className="text-[var(--ink)]">{sqlResult.durationMs}ms</strong>
                      </span>
                    </div>

                    <div className="overflow-x-auto border border-[var(--line)] rounded-lg">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-[var(--surface-2)] border-b border-[var(--line)] text-[var(--ink)] font-bold">
                          <tr>
                            {sqlResult.columns.map((c) => (
                              <th key={c} className="p-2 border-r border-[var(--line)] whitespace-nowrap">
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--line)] text-[0.7rem]">
                          {sqlResult.rows.map((r, i) => (
                            <tr key={i} className="hover:bg-[var(--surface-2)]">
                              {sqlResult.columns.map((col) => (
                                <td key={col} className="p-2 border-r border-[var(--line)] max-w-xs truncate">
                                  {r[col] === null || r[col] === undefined
                                    ? "NULL"
                                    : typeof r[col] === "object"
                                    ? JSON.stringify(r[col])
                                    : String(r[col])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-[var(--muted)]">
                    Press "Run Query" to execute the SQL statement above.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
